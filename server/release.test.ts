import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cloudRelease, resetReleaseCache } from './release.ts';
import { publicOrigin } from '../api/index.ts';
import { owner } from './owner.ts';
import { buildKnowledge } from './knowledge.ts';
const dir = mkdtempSync(join(tmpdir(), 'pai-release-'));
function withCloud(env: Record<string, string>, fn: () => void) {
  const saved = { ...process.env };
  Object.assign(process.env, { PAI_RUNTIME: 'cloud', ...env });
  resetReleaseCache();
  try { fn(); } finally { process.env = saved; resetReleaseCache(); }
}
test('without an exported release, the cloud answers from repository files', () => withCloud({ PAI_RELEASE_PATH: join(dir, 'missing.json'), PAI_API_BASE_URL: 'https://provider.invalid', PAI_MODEL: 'm' }, () => {
  const r = cloudRelease()!;
  assert.equal(r.source, 'repository');
  assert.equal(r.owner.name.en, 'Phil');
  assert.equal(owner().name.zh, '阿哲');
  assert.equal(r.provider.model, 'm');
  assert.equal(r.provider.toolsVerified, true);
  // Example core knowledge exists, so answers have something to stand on even before tools run.
  const k = buildKnowledge([{ role: 'user', content: 'hi' }], 36000);
  assert.ok(k.selected.some(d => d.id === 'profile'));
}));
test('an exported release wins and keeps its provider', () => {
  const path = join(dir, 'release.json');
  writeFileSync(path, JSON.stringify({ schema: 1, created: 'x', owner: { name: { zh: '甲', en: 'A' }, pronoun: { zh: '他', en: 'he' }, site: 'https://a.example', contact: { url: 'https://a.example/c', label: { zh: '联系', en: 'Contact' } }, embedOrigins: [] }, persona: 'p', rules: 'r', documents: [], provider: { baseUrl: 'https://p.invalid', model: 'x', toolsVerified: false } }));
  withCloud({ PAI_RELEASE_PATH: path }, () => { const r = cloudRelease()!; assert.equal(r.source, 'export'); assert.equal(owner().name.en, 'A'); });
});
test('tools can be switched off for providers without function calling', () => withCloud({ PAI_RELEASE_PATH: join(dir, 'missing.json'), PAI_TOOLS: 'off' }, () => {
  assert.equal(cloudRelease()!.provider.toolsVerified, false);
}));
test('public origin: explicit value, then Vercel production domain, never http', () => {
  assert.equal(publicOrigin({ PAI_PUBLIC_ORIGIN: 'https://chat.example.com' }), 'https://chat.example.com');
  assert.equal(publicOrigin({ VERCEL_PROJECT_PRODUCTION_URL: 'my-ai.vercel.app' }), 'https://my-ai.vercel.app');
  for (const env of [{}, { PAI_PUBLIC_ORIGIN: 'http://chat.example.com' }, { PAI_PUBLIC_ORIGIN: 'https://chat.example.com/path' }]) assert.throws(() => publicOrigin(env));
});
test('startup names the missing setting instead of failing silently', async () => {
  const saved = { ...process.env };
  resetReleaseCache();
  try {
    const { startup } = await import('../api/index.ts');
    const base = { PAI_RELEASE_PATH: join(dir, 'missing.json'), PAI_PUBLIC_ORIGIN: 'https://chat.example.com', PAI_API_BASE_URL: 'https://p.invalid', PAI_MODEL: 'm' };
    process.env = { ...saved, ...base };
    await assert.rejects(startup(), /PAI_API_KEY: not set/);
    process.env = { ...saved, ...base, PAI_API_KEY: 'k', PAI_DAILY_LIMIT: 'lots' };
    await assert.rejects(startup(), /PAI_DAILY_LIMIT: must be a whole number/);
    process.env = { ...saved, ...base, PAI_API_KEY: 'k', PAI_SUPABASE_URL: 'https://example.com', PAI_SUPABASE_SECRET_KEY: 's' };
    await assert.rejects(startup(), /PAI_SUPABASE_URL: use the project URL/);
    process.env = { ...saved, ...base, PAI_API_KEY: 'k' };
    assert.equal(typeof await startup(), 'function');
  } finally { process.env = saved; resetReleaseCache(); }
});
