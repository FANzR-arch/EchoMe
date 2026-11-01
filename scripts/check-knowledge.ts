/** No provider access: inspect selection and prompt size locally. */
import { loadDocuments, buildKnowledge } from '../server/knowledge.ts';
import { getSystemRules } from '../server/prompts.ts';
import { owner } from '../server/owner.ts';
const docs = loadDocuments();
const args = process.argv.slice(2);
if (args.length && args[0] !== '--query') throw Error('Usage: npm run knowledge:check -- [--query YOUR_QUESTION]');
const query = args[0] === '--query' ? args.slice(1).join(' ') : '介绍' + owner().name.zh + '的作品和文章';
if (!query || query.length > 2000) throw Error('Question must have 1–2000 characters');
const result = buildKnowledge([{role:'user',content:query}],36000,docs);
console.log(JSON.stringify({documents:docs.length, kinds:docs.reduce<Record<string,number>>((acc,d)=>(acc[d.kind]=(acc[d.kind]??0)+1,acc),{}),question:query,systemCharacters:getSystemRules().length,totalContextCharacters:result.prompt.length+query.length,catalog:result.catalog,selected:result.selected.map(d=>({title:d.title,kind:d.kind,updated:d.updated,sources:d.urls})),note:'Full core and catalog preview only; no model calls. Empty approved folder is valid.'},null,2));
