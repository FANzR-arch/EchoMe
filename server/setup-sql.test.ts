import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupFile, setupSql } from '../scripts/print-setup-sql.mjs';

test('supabase/setup.sql matches the migrations', () => {
  assert.equal(readFileSync(setupFile, 'utf8').replace(/\r\n/g, '\n'), setupSql(), 'Run npm run setup:sql -- --write after changing a migration');
});
