/** Build gate for the cloud chat: the checks the function would otherwise fail at its first request, with a readable reason. */
import { readFileSync, existsSync } from 'node:fs';
const fail = message => { console.error(`\n✗ EchoMe build check failed\n  ${message}\n`); process.exit(1); };
const releasePath = process.env.PAI_RELEASE_PATH || 'deploy/knowledge-release.json';
const exported = existsSync(releasePath);
// Name the file on a JSON typo, which JSON.parse alone would not.
const json = path => { try { return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, '')); } catch (e) { fail(`${path} is not valid JSON: ${e.message}`); } };
if (exported) json(releasePath);
else {
  const dir = process.env.PAI_KNOWLEDGE_DIR || 'knowledge';
  for (const f of ['persona.md', 'rules.md', 'website/snapshot.json']) if (!existsSync(dir + '/' + f)) fail('Missing ' + dir + '/' + f);
  json(process.env.PAI_OWNER_CONFIG || 'owner.config.json');
  json(dir + '/website/snapshot.json');
}
process.env.PAI_RUNTIME = 'cloud';
const [{ cloudRelease }, { validateOwner }, { validateDocument, buildKnowledge, coreSize }, { getSystemRules }, { limits }] = await Promise.all([
  import('../server/release.ts'), import('../server/owner.ts'), import('../server/knowledge.ts'), import('../server/prompts.ts'), import('../server/api.ts')]);
let release;
try {
  release = cloudRelease();
  validateOwner(release.owner);
  release.documents.forEach(validateDocument);
  if (new Set(release.documents.map(d => d.id)).size !== release.documents.length) throw Error('Two knowledge entries share the same "id"');
  if (exported && release.documents.some(d => d.enabled === false)) throw Error('Disabled knowledge in release. Re-run npm run knowledge:export.');
  if (coreSize(release.documents) > 4000) throw Error(`Entries marked "tier": "core" have ${coreSize(release.documents)} characters in total; keep them within 4,000`);
  getSystemRules();
  buildKnowledge([{ role: 'user', content: 'check' }], limits.context, release.documents);
} catch (e) {
  fail(e instanceof Error ? e.message.replace(/^CONTEXT_LIMIT$/, 'Knowledge catalog is too large for one request: shorten titles or summaries, or move entries out of knowledge/') : String(e));
}
// On Vercel, also start the function once with this deployment's variables: a missing key or bad URL fails here, not for visitors.
if (process.env.VERCEL) {
  // The production domain is a runtime fact; if the build cannot see it, check the rest against this deployment's URL.
  if (!process.env.PAI_PUBLIC_ORIGIN && !process.env.VERCEL_PROJECT_PRODUCTION_URL && process.env.VERCEL_URL) process.env.VERCEL_PROJECT_PRODUCTION_URL = process.env.VERCEL_URL;
  const { startup } = await import('../api/index.ts');
  try { await startup(); } catch (e) { fail(e instanceof Error ? e.message : String(e)); }
}
console.log(exported ? `Cloud knowledge release: ${release.documents.length} documents, ${release.created}` : `No exported release: answering as ${release.owner.name.en} from ${process.env.PAI_KNOWLEDGE_DIR || 'knowledge'}/ (${release.documents.length} documents).`);
