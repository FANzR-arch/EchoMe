/** Immutable, explicitly exported knowledge for cloud deployments. No local DB or drafts. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Document } from './knowledge.ts';
import type { Owner } from './owner.ts';
export type Release = { schema:1; created:string; owner:Owner; persona:string; rules:string; documents:Document[]; provider:{baseUrl:string;model:string;toolsVerified:boolean} };
let cached:Release|undefined;
export function cloudRelease():Release|undefined {
  if(process.env.PAI_RUNTIME!=='cloud')return undefined;
  if(!cached){
    const value=JSON.parse(readFileSync(resolve('deploy/knowledge-release.json'),'utf8')) as Release;
    if(value.schema!==1||!Array.isArray(value.documents)||!value.owner||!value.persona||!value.rules||!value.provider)throw Error('INVALID_RELEASE');
    cached=value;
  }
  return cached;
}
