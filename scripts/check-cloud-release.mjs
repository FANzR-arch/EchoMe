import {readFileSync,existsSync} from 'node:fs';
// Exported release (reviewed locally) wins; without one the deployment answers from the repository files.
const path=process.env.PAI_RELEASE_PATH||'deploy/knowledge-release.json';
if(!existsSync(path)){
  const owner=JSON.parse(readFileSync(process.env.PAI_OWNER_CONFIG||'owner.config.json','utf8'));
  const dir=process.env.PAI_KNOWLEDGE_DIR||'knowledge';
  for(const f of ['persona.md','rules.md','website/snapshot.json'])if(!existsSync(dir+'/'+f))throw Error('Missing '+dir+'/'+f);
  const docs=JSON.parse(readFileSync(dir+'/website/snapshot.json','utf8')).documents;
  if(docs.filter(d=>d.tier==='core').reduce((n,d)=>n+d.text.length,0)>4000)throw Error('Core exceeds 4000 characters');
  console.log(`No exported release: answering as ${owner.name?.en} from ${dir}/ (${docs.length} documents).`);
} else {
  const r=JSON.parse(readFileSync(path,'utf8'));
  if(r.schema!==1||!r.provider?.model||!r.provider?.baseUrl||!r.documents?.length||!r.persona||!r.rules)throw Error('Run npm run knowledge:export locally and review the release first.');
  if(!r.owner?.name?.zh||!r.owner?.contact?.url)throw Error('Release has no owner identity. Re-run npm run knowledge:export.');
  if(r.documents.some(d=>d.enabled===false))throw Error('Disabled knowledge in release');
  if(r.documents.filter(d=>d.tier==='core').reduce((n,d)=>n+d.text.length,0)>4000)throw Error('Core exceeds 4000 characters');
  console.log(`Cloud knowledge release: ${r.documents.length} documents, ${r.created}`);
}
