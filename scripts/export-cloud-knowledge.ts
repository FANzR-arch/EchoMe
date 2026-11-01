/** Run locally; exports only published knowledge and prompts, never conversations or CLI drafts. */
import { capability } from '../server/capability.ts';
import { buildRelease, writeRelease, releasePath } from '../server/publish.ts';
const provider={baseUrl:process.env.PAI_API_BASE_URL||'',model:process.env.PAI_MODEL||'',key:process.env.PAI_API_KEY||''};
const release=buildRelease(provider,capability(provider).available===true);
writeRelease(release);
console.log(`Exported ${release.documents.length} enabled documents to ${releasePath()}. Review it before deployment. No keys or conversations included.`);
