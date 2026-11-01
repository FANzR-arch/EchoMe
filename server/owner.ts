/** Public owner identity: one file drives prompts, UI copy and embed origins. Never put secrets here. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cloudRelease } from './release.ts';
export type Owner = { name:{zh:string;en:string}; pronoun:{zh:string;en:string}; site:string; contact:{url:string;label:{zh:string;en:string}}; embedOrigins:string[] };
const text = (v: unknown, max = 60) => typeof v === 'string' && !!v.trim() && v.length <= max && !/[\u0000-\u001f<>`]/.test(v);
const pair = (v: any, max?: number) => !!v && text(v.zh, max) && text(v.en, max);
const https = (v: unknown) => { try { const u = new URL(String(v)); return typeof v === 'string' && u.protocol === 'https:' && !u.username && !u.password && u.href.replace(/\/$/, '') === v.replace(/\/$/, ''); } catch { return false; } };
const origin = (v: unknown) => { try { const u = new URL(String(v)); return ['https:', 'http:'].includes(u.protocol) && u.origin === v; } catch { return false; } };
export function validateOwner(v: any): Owner {
  if (!v || !pair(v.name, 40) || !pair(v.pronoun, 12) || !https(v.site) || !v.contact || !https(v.contact.url) || !pair(v.contact.label) || !Array.isArray(v.embedOrigins) || v.embedOrigins.length > 16 || !v.embedOrigins.every(origin)) throw Error('Invalid owner config: check owner.config.json');
  return { name: v.name, pronoun: v.pronoun, site: v.site, contact: { url: v.contact.url, label: v.contact.label }, embedOrigins: v.embedOrigins };
}
export const ownerConfigPath = () => resolve(process.env.PAI_OWNER_CONFIG || 'owner.config.json');
export const knowledgeRoot = () => resolve(process.cwd(), process.env.PAI_KNOWLEDGE_DIR || 'knowledge');
let cached: { path: string; owner: Owner } | undefined;
export function owner(): Owner {
  const release = cloudRelease();
  if (release) return validateOwner(release.owner);
  const path = ownerConfigPath();
  if (cached?.path !== path) cached = { path, owner: validateOwner(JSON.parse(readFileSync(path, 'utf8'))) };
  return cached.owner;
}
