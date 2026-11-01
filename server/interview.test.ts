import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {WorkbenchStore,hash,type Asset} from './workbench-store.ts';
import {currentInterview,saveInterview,makeInterviewJob,settleInterview} from './interview.ts';
const profile:Asset={key:'doc:profile',title:'Profile',kind:'website',urls:['https://example.org/'],content:'Phil 是设计师。',tier:'detail',enabled:true};
function fixture(fn:(s:WorkbenchStore)=>void){const dir=mkdtempSync(join(tmpdir(),'pai-interview-'));const store=new WorkbenchStore(dir);try{fn(store);}finally{store.close();assert.ok(dir.startsWith(join(tmpdir(),'pai-interview-')));rmSync(dir,{recursive:true,force:true});}}
test('interview drafts persist but never publish; publication uses original version',()=>fixture(store=>{
 const s=currentInterview(store);const job=makeInterviewJob(s,[profile],'请先问并拟答');assert.match(job.instruction,/模拟内容/);s.job=job.id;s.turns.push({role:'user',text:'请先问并拟答'});saveInterview(store,s);
 // Deterministic parser fixture, not a CLI integration test.
 store.saveProposal({...job,status:'ready',content:JSON.stringify({question:'Phil 做什么？',answer:'Phil 是设计师。',target:profile.key,content:'Phil 是设计师。',note:'根据公开介绍。',sources:[profile.key]})});
 const ready=settleInterview(store,s);assert.equal(ready.turns.length,2);assert.equal(store.assets().length,0);const p=store.proposal(ready.turns[1].proposalId!)!;assert.equal(p.base,hash(profile));assert.equal(p.status,'ready');assert.equal(currentInterview(store).turns[1].answer,'Phil 是设计师。');
 store.publish({...profile,content:'新版资料'},profile,hash(profile));assert.throws(()=>store.publish({...p.before,content:p.content},p.before,p.base,p),/CONFLICT/);assert.equal(store.proposal(p.id)?.status,'ready');
}));
test('invalid or invented target/source fails closed',()=>fixture(store=>{
 for(const result of [{target:'../../secret',sources:[profile.key]},{target:profile.key,sources:['not-provided']}]){const s=currentInterview(store),job=makeInterviewJob(s,[profile],'拟答');s.job=job.id;store.saveProposal({...job,status:'ready',content:JSON.stringify({question:'问题',answer:'回答',content:'正文',note:'',...result})});const r=settleInterview(store,s);assert.ok(r.error);assert.equal(r.job,undefined);assert.equal(store.assets().length,0);}
}));
test('new FAQ only becomes an enabled asset after explicit publication',()=>fixture(store=>{
 const s=currentInterview(store),job=makeInterviewJob(s,[profile],'拟答');s.job=job.id;store.saveProposal({...job,status:'ready',content:JSON.stringify({question:'Phil 做什么？',answer:'设计师。',content:'Phil 是设计师。',target:'',note:'公开介绍',sources:[profile.key]})});const ready=settleInterview(store,s);const p=store.proposal(ready.turns.at(-1)!.proposalId!)!;assert.equal(store.assets().length,0);store.publish({...p.before,content:p.content},p.before,p.base,p);assert.equal(store.asset(p.target)?.content,'Phil 是设计师。');assert.equal(store.proposal(p.id)?.status,'applied');
}));
