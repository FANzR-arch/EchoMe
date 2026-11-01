/** Writes vercel.local.json: vercel.json with frame-ancestors taken from your owner config. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const owner = JSON.parse(readFileSync(resolve(process.env.PAI_OWNER_CONFIG || 'owner.config.json'), 'utf8'));
const origins = (owner.embedOrigins ?? []).filter(o => { try { return new URL(o).protocol === 'https:' && new URL(o).origin === o; } catch { return false; } });
const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
const csp = config.headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy');
if (!csp) throw Error('vercel.json has no Content-Security-Policy header');
csp.value = ["frame-ancestors 'self'", ...origins].join(' ');
writeFileSync('vercel.local.json', JSON.stringify(config, null, 2) + '\n');
console.log(`vercel.local.json: ${csp.value}`);
