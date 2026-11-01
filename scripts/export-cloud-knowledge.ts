/** Run locally; exports only published knowledge and prompts, never conversations or CLI drafts. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadDocuments, buildKnowledge } from '../server/knowledge.ts';
import { getStore } from '../server/workbench-store.ts';
import { readFileSync } from 'node:fs';
import { capability } from '../server/capability.ts';
import type { Release } from '../server/release.ts';
import { owner, knowledgeRoot } from '../server/owner.ts';
import { resolve } from 'node:path';
const provider={baseUrl:process.env.PAI_API_BASE_URL||'',model:process.env.PAI_MODEL||'',key:process.env.PAI_API_KEY||''};
const documents=loadDocuments().filter(d=>d.enabled!==false);
buildKnowledge([{role:'user',content:'介绍一下'+owner().name.zh}],36000,documents);
const prompt=(name:string)=>getStore().asset(name)?.content??readFileSync(resolve(knowledgeRoot(),name+'.md'),'utf8');
const release:Release={schema:1,created:new Date().toISOString(),owner:owner(),persona:prompt('persona'),rules:prompt('rules'),documents,provider:{baseUrl:provider.baseUrl,model:provider.model,toolsVerified:capability(provider).available===true}};
mkdirSync('deploy',{recursive:true});
writeFileSync('deploy/knowledge-release.json',JSON.stringify(release,null,2)+'\n');
console.log(`Exported ${documents.length} enabled documents. Review deploy/knowledge-release.json before deployment. No keys or conversations included.`);
