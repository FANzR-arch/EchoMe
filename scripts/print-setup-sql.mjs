/** Every migration in order as one SQL script for the Supabase SQL editor. Safe to run again.
 * Prints it; with --write, refreshes supabase/setup.sql, the copy people without a local checkout paste from GitHub. */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir = new URL('../supabase/migrations/', import.meta.url);
export const setupFile = new URL('../supabase/setup.sql', import.meta.url);
export function setupSql() {
  const header = '-- EchoMe database setup: paste all of this into the Supabase SQL Editor and click Run. Safe to run again.\n-- Generated from supabase/migrations by `npm run setup:sql -- --write`; edit the migrations, not this file.\n\n';
  return header + readdirSync(dir).filter(f => f.endsWith('.sql')).sort().map(name => `-- ${name}\n${readFileSync(new URL(name, dir), 'utf8').replace(/\r\n/g, '\n').trim()}\n`).join('\n');
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) { writeFileSync(setupFile, setupSql()); console.log('Wrote supabase/setup.sql'); }
  else process.stdout.write(setupSql());
}
