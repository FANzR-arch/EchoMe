import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSnapshot } from './sync-knowledge.mjs';
function fixture(fn) {
 const dir=mkdtempSync(join(tmpdir(),'pai-website-'));
 const write=(path,data)=>{mkdirSync(join(dir,path,'..'),{recursive:true});writeFileSync(join(dir,path),typeof data==='string'?data:JSON.stringify(data));};
 write('content/site/home.shared.json',{email:'public@example.org',social:{label:'public',url:'https://example.org/social'},private:'DO_NOT_IMPORT'});
 write('content/site/site.json',{siteUrl:'https://example.org'});
 write('content/site/home.json',{name:'Lin',intro:['公开介绍'],privateKey:'DO_NOT_IMPORT'});
 write('content/site/home.en.json',{name:'Lin',intro:['Public profile']});write('content/site/home-keywords.json',{zh:{设计:'设计方法'}});
 write('content/site/catalog.json',{projects:[{presentation:'projects',items:[{id:'work-a',zh:'作品',en:'Work',description:{zh:'公开作品'},year:'2026',role:{zh:'设计'},privateKey:'SECRET_PROJECT'}]}],lab:[]});
 const article=(data,body='Published body')=>'---\n'+JSON.stringify({title:'Title',description:'Summary',slug:'article',pubDate:'2026-09-01',contentStatus:'full',draft:false,...data})+'\n---\n'+body;
 write('content/blog/public/index.md',article({},'Public <!--hidden secret--> ![private image](/private.png) [label](https://elsewhere.invalid)'));
 write('content/blog/draft/index.md',article({slug:'draft',draft:true},'DRAFT_SECRET'));
 write('content/blog/index-only/index.md',article({slug:'index',contentStatus:'index-only'},'UNPUBLISHED_BODY'));
 try {fn(dir,write,article);}finally{assert.ok(dir.startsWith(join(tmpdir(),'pai-website-')));rmSync(dir,{recursive:true,force:true});}
}
test('sync follows publication rules, real routes and explicit public fields',()=>fixture(dir=>{
 const s=buildSnapshot(dir,JSON.parse);const all=JSON.stringify(s.documents);
 assert.equal(s.skipped.length,2);assert.match(all,/https:\/\/example.org\/blog\/article/);assert.match(all,/https:\/\/example.org\/projects\/work-a/);
 for(const secret of ['DO_NOT_IMPORT','SECRET_PROJECT','DRAFT_SECRET','UNPUBLISHED_BODY','hidden secret','private.png','elsewhere.invalid'])assert.ok(!all.includes(secret),secret);
 assert.equal(buildSnapshot(dir,JSON.parse).revision,s.revision);
}));
test('English route, malformed publication flags and removed sources',()=>fixture((dir,write,article)=>{
 write('content/blog/en/index.md',article({contentLanguage:'en',titleEn:'English title',descriptionEn:'English summary',slug:'english'}));
 const first=buildSnapshot(dir,JSON.parse);assert.ok(first.documents.some(d=>d.urls[0]==='https://example.org/en/blog/english'));
 write('content/blog/public/index.md',article({draft:true}));assert.ok(!buildSnapshot(dir,JSON.parse).documents.some(d=>d.id==='article:zh-Hans:article'));
 write('content/blog/bad/index.md',article({draft:'false'}));assert.throws(()=>buildSnapshot(dir,JSON.parse),/draft flag/);
}));
