import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
const directory=mkdtempSync(join(tmpdir(),'pai-workbench-'));
process.env.PAI_DATA_DIR=directory;
// Never touch the real deploy/knowledge-release.json.
process.env.PAI_RELEASE_PATH=join(directory,'release','knowledge-release.json');
const {getStore,hash}=await import('./workbench-store.ts');
const {createWorkbench,listAssets}=await import('./workbench-api.ts');
const {loadDocuments}=await import('./knowledge.ts');
const {getSystemRules}=await import('./prompts.ts');
const store=getStore();
after(()=>{store.close();assert.ok(directory.startsWith(join(tmpdir(),'pai-workbench-')));rmSync(directory,{recursive:true,force:true});});
async function fixture(fn:(base:string,token:string)=>Promise<void>){
 const handler=createWorkbench(store);const server=createServer((req,res)=>void handler(req,res,()=>{res.writeHead(404).end();}));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+(server.address() as {port:number}).port;
 try{const r=await fetch(base+'/api/workbench/session',{headers:{'Sec-Fetch-Site':'same-origin'}});const {token}=await r.json();await fn(base,token);}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
}
const post=(base:string,token:string,path:string,body:unknown)=>fetch(base+'/api/workbench/'+path,{method:'POST',headers:{'Sec-Fetch-Site':'same-origin','X-PAI-Admin':token,'Content-Type':'application/json'},body:JSON.stringify(body)});
test('admin requires same-origin and token; public caller cannot mutate',async()=>fixture(async(base,token)=>{
 assert.equal((await fetch(base+'/api/workbench/state')).status,403);
 assert.equal((await fetch(base+'/api/workbench/state',{headers:{'Sec-Fetch-Site':'same-origin'}})).status,403);
 assert.equal((await fetch(base+'/api/workbench/state',{headers:{'Sec-Fetch-Site':'same-origin','Origin':'https://evil.invalid','X-PAI-Admin':token}})).status,403);
 assert.equal((await fetch(base+'/api/workbench/state',{headers:{'Sec-Fetch-Site':'same-origin','X-PAI-Admin':token}})).status,200);
}));
test('publish, conflict and rollback affect runtime without rewriting source files',async()=>fixture(async(base,token)=>{
 const a=listAssets(store).find(a=>a.key==='doc:profile')!;
 const changed={...a,content:a.content+'\n主人确认的测试补充。'};
 const r=await post(base,token,'save',{asset:changed,base:hash(a)});assert.equal(r.status,200);const {id}=await r.json();
 assert.match(loadDocuments().find(d=>d.id==='profile')!.text,/测试补充/);
 assert.equal((await post(base,token,'save',{asset:changed,base:hash(a)})).status,409);
 const current=listAssets(store).find(a=>a.key===changed.key)!;
 assert.equal((await post(base,token,'rollback',{id,base:hash(current)})).status,200);
 assert.equal(loadDocuments().find(d=>d.id==='profile')!.text,a.content);
 const persona=listAssets(store).find(a=>a.key==='persona')!;
 await post(base,token,'save',{asset:{...persona,content:persona.content+'\n回答优先简短。'},base:hash(persona)});
 assert.match(getSystemRules(),/回答优先简短/);
}));
test('review never changes original answer; manual proposal does not publish until approved',async()=>fixture(async(base,token)=>{
 const runId=store.startRun({input:[{role:'user',content:'Phil 做什么？'}],response:'原始回答',status:'complete',selected:[]},'visitor-one');
 assert.equal((await post(base,token,'review',{id:runId,note:'待纠正',corrected:'已确认的说法',reviewed:true})).status,200);
 assert.equal(store.runs()[0].response,'原始回答');assert.equal(store.runs()[0].review.corrected,'已确认的说法');
 const a=listAssets(store).find(a=>a.key==='doc:profile')!;
 const result=await(await post(base,token,'propose',{target:a.key,instruction:'整理语句',runId,cli:false})).json();
 assert.equal(listAssets(store).find(x=>x.key===a.key)!.content,a.content);
 assert.equal((await post(base,token,'proposal-edit',{id:result.id,content:'已确认的个人介绍。'})).status,200);
 assert.equal((await post(base,token,'proposal-apply',{id:result.id})).status,200);
 assert.equal(loadDocuments().find(d=>d.id==='profile')!.text,'已确认的个人介绍。');
 assert.equal((await post(base,token,'proposal-apply',{id:result.id})).status,400);
}));
test('CLI usage requires explicit confirmation and accepts no executable from browser',async()=>fixture(async(base,token)=>{
 const a=listAssets(store)[0];
 assert.equal((await post(base,token,'propose',{target:a.key,instruction:'edit',cli:true,confirmCost:false,command:'anything'})).status,400);
}));

test('core draft requires approval, core overflow is rejected, disable excludes runtime',async()=>fixture(async(base,token)=>{
 const draft=listAssets(store).find(a=>a.key==='doc:core-draft')!;assert.equal(draft.enabled,false);assert.ok(draft.content.length<=4000);
 assert.equal(loadDocuments().some(d=>d.id==='core-draft'),false);
 assert.equal((await post(base,token,'save',{asset:{...draft,enabled:true,content:'x'.repeat(4001)},base:hash(draft)})).status,400);
 assert.equal(store.asset(draft.key),undefined);
 assert.equal((await post(base,token,'save',{asset:{...draft,enabled:true},base:hash(draft)})).status,200);
 const {buildKnowledge}=await import('./knowledge.ts');const built=buildKnowledge([],36000);assert.equal(built.selected.find(d=>d.id==='core-draft')?.excerpt,draft.content);
 const active=listAssets(store).find(a=>a.key===draft.key)!;await post(base,token,'save',{asset:{...active,enabled:false},base:hash(active)});assert.equal(buildKnowledge([],36000).selected.some(d=>d.id==='core-draft'),false);
}));
test('proposal conflict preserves ready state; approved status and publication roll back together',async()=>fixture(async(base,token)=>{
 const a=listAssets(store).find(a=>a.key==='doc:profile')!;
 const {id}=await(await post(base,token,'propose',{target:a.key,instruction:'modify',cli:false})).json();
 await post(base,token,'save',{asset:{...a,content:a.content+' newer'},base:hash(a)});
 assert.equal((await post(base,token,'proposal-apply',{id})).status,409);assert.equal(store.proposal(id)?.status,'ready');
 const current=listAssets(store).find(x=>x.key===a.key)!;
 const beforeRevisions=store.revisions().length;
 assert.throws(()=>store.publish({...current,content:'must not commit'},current,hash(current),{...store.proposal(id)!,id:'absent'}),/INVALID_PROPOSAL/);
 assert.equal(store.asset(a.key)?.content,current.content);assert.equal(store.revisions().length,beforeRevisions);
}));
test('whole conversation deletion removes attempts and notes but preserves other conversations',async()=>fixture(async(base,token)=>{
 const a=store.startRun({response:'a'},'delete-me');store.review(a,'note','correction',true);store.startRun({response:'b'},'delete-me');const other=store.startRun({response:'c'},'keep-me');
 assert.equal((await post(base,token,'delete-conversation',{conversation:'delete-me'})).status,200);assert.equal(store.runs().some(r=>r.conversation==='delete-me'),false);assert.ok(store.runs().some(r=>r.id===other));
}));
test('restart persists interrupted proposal state without relaunching CLI',()=>{
 const before=listAssets(store)[0];store.saveProposal({id:'restart-probe',target:before.key,base:hash(before),before,content:before.content,instruction:'never run',status:'running',created:new Date().toISOString()});createWorkbench(store);assert.equal(store.proposal('restart-probe')?.status,'failed');assert.equal(store.proposal('restart-probe')?.error,'SERVER_RESTARTED');
});

test('interview confirmation is explicit, bound to the visible latest proposal and idempotent',async()=>fixture(async(base,token)=>{
 const {currentInterview,makeInterviewJob,saveInterview,settleInterview}=await import('./interview.ts');const session=currentInterview(store);const job=makeInterviewJob(session,listAssets(store),'拟答');session.job=job.id;saveInterview(store,session);
 store.saveProposal({...job,status:'ready',content:JSON.stringify({question:'测试资料确认',answer:'主人确认的测试内容。',target:'',content:'主人确认的测试内容。',note:'仅程序测试',sources:[]})});
 const ready=settleInterview(store,session);const id=ready.turns.at(-1)!.proposalId!;const p=store.proposal(id)!;assert.equal(store.asset(p.target),undefined);
 assert.equal((await post(base,token,'interview-confirm',{id:'wrong'})).status,400);assert.equal(store.asset(p.target),undefined);
 assert.equal((await post(base,token,'interview-confirm',{id})).status,200);assert.equal(store.asset(p.target)?.content,p.content);
 assert.equal((await post(base,token,'interview-confirm',{id})).status,400);
}));

test('release status lists unpublished changes; publish needs confirmation and writes only the release file',async()=>fixture(async(base,token)=>{
 const file=process.env.PAI_RELEASE_PATH!;assert.ok(file.startsWith(directory));
 const get=async(path:string)=>(await fetch(base+'/api/workbench/'+path,{headers:{'Sec-Fetch-Site':'same-origin','X-PAI-Admin':token}})).json();
 const initial=await get('release-status');
 assert.equal(initial.publishedAt,undefined);assert.ok(initial.pending>0);assert.ok(initial.documents.every((d:{state:string})=>d.state==='new'));
 assert.equal((await post(base,token,'publish',{})).status,400);assert.equal(existsSync(file),false);
 const published=await post(base,token,'publish',{confirm:true});assert.equal(published.status,200);
 const status=await published.json();assert.ok(status.publishedAt);assert.equal(status.pending,0);
 const release=JSON.parse(readFileSync(file,'utf8'));assert.equal(release.schema,1);assert.equal(release.provider.toolsVerified,false);
 assert.ok(release.documents.some((d:{id:string})=>d.id==='profile'));
 // An over-budget core blocks publishing and leaves the previous release in place.
 const big={key:'doc:manual:core-overflow',title:'超限',kind:'personal' as const,content:'x'.repeat(4100),urls:[],tier:'core' as const,enabled:true};
 store.publish(big,{...big,content:''},hash({...big,content:''}));
 const before=readFileSync(file,'utf8');
 const over=await post(base,token,'publish',{confirm:true});assert.equal(over.status,400);assert.equal((await over.json()).error,'CORE_LIMIT');
 assert.equal(readFileSync(file,'utf8'),before);
 const current=store.asset(big.key)!;store.publish({...current,enabled:false},current,hash(current));
 const a=listAssets(store).find(a=>a.key==='doc:profile')!;
 assert.equal((await post(base,token,'save',{asset:{...a,content:a.content+'\n发布后的本机修改'},base:hash(a)})).status,200);
 const changed=await get('release-status');assert.equal(changed.documents.find((d:{id:string})=>d.id==='profile').state,'changed');assert.equal(changed.pending,1);
}));
test('a correction saved as a new answer is marked as coming from a conversation',async()=>fixture(async(base,token)=>{
 const content='问：Phil 做什么？\n答：主人确认的说法。';
 const r=await post(base,token,'new',{title:'纠正：Phil 做什么？',content,kind:'personal',urls:[],origin:'correction'});
 assert.equal(r.status,200);const {key}=await r.json();assert.match(key,/^doc:manual:fix-/);
 assert.equal(loadDocuments().find(d=>'doc:'+d.id===key)?.text,content);
}));
