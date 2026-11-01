/** Prints every migration in order as one SQL script for the Supabase SQL editor. Safe to run again. */
import { readdirSync, readFileSync } from 'node:fs';
const dir = new URL('../supabase/migrations/', import.meta.url);
for (const name of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) process.stdout.write(`-- ${name}\n${readFileSync(new URL(name, dir), 'utf8').trim()}\n\n`);
