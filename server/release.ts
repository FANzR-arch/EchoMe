/** Immutable knowledge for cloud deployments: an exported release, or the repository's own files. No local DB or drafts. */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDocuments, type Document } from './knowledge.ts';
import { validateOwner, ownerConfigPath, knowledgeRoot, type Owner } from './owner.ts';
export type Release = { schema:1; created:string; source?:'export'|'repository'; owner:Owner; persona:string; rules:string; documents:Document[]; provider:{baseUrl:string;model:string;toolsVerified:boolean} };
export const releaseFile = () => resolve(process.env.PAI_RELEASE_PATH || 'deploy/knowledge-release.json');
let cached:Release|undefined;
export function resetReleaseCache(){cached=undefined;}
/** One-click deployments have no exported release: answer from owner.config.json and knowledge/ as committed. */
function repositoryRelease():Release {
  const text=(name:string)=>readFileSync(resolve(knowledgeRoot(),name),'utf8').trim();
  return {schema:1,created:'repository',source:'repository',owner:validateOwner(JSON.parse(readFileSync(ownerConfigPath(),'utf8'))),persona:text('persona.md'),rules:text('rules.md'),
    documents:loadDocuments(knowledgeRoot(),false,false).filter(d=>d.enabled!==false),
    provider:{baseUrl:process.env.PAI_API_BASE_URL||'',model:process.env.PAI_MODEL||'',toolsVerified:process.env.PAI_TOOLS!=='off'}};
}
export function cloudRelease():Release|undefined {
  if(process.env.PAI_RUNTIME!=='cloud')return undefined;
  if(!cached){
    if(!existsSync(releaseFile()))cached=repositoryRelease();
    else {
      const value=JSON.parse(readFileSync(releaseFile(),'utf8')) as Release;
      if(value.schema!==1||!Array.isArray(value.documents)||!value.owner||!value.persona||!value.rules||!value.provider)throw Error('INVALID_RELEASE');
      cached={...value,source:'export'};
    }
  }
  return cached;
}
