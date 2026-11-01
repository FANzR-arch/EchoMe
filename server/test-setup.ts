/** Loaded before every server test: example owner and knowledge, throwaway local store. */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
delete process.env.PAI_OWNER_CONFIG;
delete process.env.PAI_KNOWLEDGE_DIR;
delete process.env.PAI_RUNTIME;
process.env.PAI_DATA_DIR = mkdtempSync(join(tmpdir(), 'pai-test-store-'));
