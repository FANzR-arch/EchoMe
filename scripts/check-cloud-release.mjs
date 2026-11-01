import {readFileSync} from 'node:fs';
const r=JSON.parse(readFileSync('deploy/knowledge-release.json','utf8'));
if(r.schema!==1||!r.provider?.model||!r.provider?.baseUrl||!r.documents?.length||!r.persona||!r.rules)throw Error('Run npm run knowledge:export locally and review the release first.');
if(!r.owner?.name?.zh||!r.owner?.contact?.url)throw Error('Release has no owner identity. Re-run npm run knowledge:export.');
if(r.documents.some(d=>d.enabled===false))throw Error('Disabled knowledge in release');
if(r.documents.filter(d=>d.tier==='core').reduce((n,d)=>n+d.text.length,0)>4000)throw Error('Core exceeds 4000 characters');
console.log(`Cloud knowledge release: ${r.documents.length} documents, ${r.created}`);
