/** Builds the release a deployment answers from: enabled knowledge, persona, rules and owner. Never conversations or drafts. */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { loadDocuments, buildKnowledge, type Document } from './knowledge.ts';
import { getStore, hash } from './workbench-store.ts';
import { owner, knowledgeRoot } from './owner.ts';
import type { Release } from './release.ts';
import { releaseFile } from './release.ts';
export const releasePath = releaseFile;
const prompt = (name: 'persona' | 'rules') => getStore().asset(name)?.content ?? readFileSync(resolve(knowledgeRoot(), name + '.md'), 'utf8');
export function buildRelease(provider: { baseUrl: string; model: string }, toolsVerified: boolean): Release {
  const documents = loadDocuments().filter(d => d.enabled !== false);
  buildKnowledge([{ role: 'user', content: '介绍一下' + owner().name.zh }], 36000, documents); // Fails on core or context overflow.
  return { schema: 1, created: new Date().toISOString(), owner: owner(), persona: prompt('persona'), rules: prompt('rules'), documents, provider: { baseUrl: provider.baseUrl, model: provider.model, toolsVerified } };
}
export function writeRelease(release: Release) {
  mkdirSync(dirname(releasePath()), { recursive: true });
  writeFileSync(releasePath(), JSON.stringify(release, null, 2) + '\n');
}
export function readRelease(): Release | undefined {
  return existsSync(releasePath()) ? JSON.parse(readFileSync(releasePath(), 'utf8')) : undefined;
}
export type ChangeState = 'live' | 'changed' | 'new' | 'removed';
/** What the next publish would change, compared with the last exported release. */
export function releaseStatus() {
  const published = readRelease();
  const current = loadDocuments().filter(d => d.enabled !== false);
  const version = (d: Document) => hash({ title: d.title, text: d.text, urls: d.urls, tier: d.tier ?? 'detail' });
  const before = new Map((published?.documents ?? []).map(d => [d.id, version(d)]));
  const documents: { id: string; title: string; state: ChangeState }[] = current.map(d => ({ id: d.id, title: d.title, state: !published ? 'new' : !before.has(d.id) ? 'new' : before.get(d.id) === version(d) ? 'live' : 'changed' }));
  for (const d of published?.documents ?? []) if (!current.some(c => c.id === d.id)) documents.push({ id: d.id, title: d.title, state: 'removed' });
  const persona = !published || published.persona.trim() !== prompt('persona').trim();
  const rules = !published || published.rules.trim() !== prompt('rules').trim();
  const ownerChanged = !published || JSON.stringify(published.owner) !== JSON.stringify(owner());
  return { publishedAt: published?.created, documents, personaChanged: persona, rulesChanged: rules, ownerChanged, pending: documents.filter(d => d.state !== 'live').length + Number(persona) + Number(rules) + Number(ownerChanged) };
}
