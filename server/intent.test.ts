import {test} from 'node:test';
import assert from 'node:assert/strict';
import {quickIntent,classifyIntent,routePolicy} from './intent.ts';
import {providerOptions,usageNumbers} from './provider.ts';
const cfg={baseUrl:'https://api.deepseek.com',model:'fixed-model',key:'unit-secret'};
test('precise quick routes do not swallow substantive questions',()=>{
 for(const [s,r] of [['你好！','greeting'],['你吃了吗？','smalltalk'],['今天天气怎么样','realtime'],['???','clarify']])assert.equal(quickIntent(s),r);
 for(const s of ['你好，介绍一下作品','做过天气应用吗','how are you building this?'])assert.equal(quickIntent(s),undefined);
});
test('model routing sends bounded context, fixed config, disables thinking and records usage',async()=>{
 const messages=[{role:'user',content:'做过哪些时间管理工具？'},{role:'assistant',content:'种子时间'},{role:'user',content:'它是怎么做的？'}];
 const r=await classifyIntent(messages,cfg,(async(_url,init)=>{
 const p=JSON.parse(String(init?.body));assert.equal(p.model,cfg.model);assert.equal(p.max_tokens,96);assert.equal(p.thinking.type,'disabled');assert.deepEqual(p.messages.slice(1),messages);
 return Response.json({model:'actual-model',choices:[{finish_reason:'stop',message:{content:'{"intent":"project","mode":"direct"}'}}],usage:{prompt_tokens:12,completion_tokens:6,total_tokens:18,prompt_cache_hit_tokens:4}});
 }) as typeof fetch,new AbortController().signal);
 assert.equal(r.intent,'project');assert.equal(r.usage?.total_tokens,18);assert.equal(r.model,'actual-model');assert.ok(routePolicy()[r.intent].knowledge);
});
test('malformed classification and provider errors fall through to normal answering',async()=>{
 for(const content of ['not json','{"intent":"execute_shell"}','null'])assert.equal((await classifyIntent([{role:'user',content:'你最近在做什么？'}],cfg,(async()=>Response.json({choices:[{finish_reason:'stop',message:{content}}]})) as typeof fetch,new AbortController().signal)).intent,'fallback');
 for(const status of [401,402,429,500])assert.equal((await classifyIntent([{role:'user',content:'test request'}],cfg,(async()=>Response.json({},{status})) as typeof fetch,new AbortController().signal)).method,'fallback');
});
test('classifier timeout releases answer signal, user cancellation never falls through',async()=>{
 const stalled=(async(_u,init)=>new Promise((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>reject(Error('abort')));})) as typeof fetch;
 const c=new AbortController();const result=await classifyIntent([{role:'user',content:'你最近在做什么？'}],cfg,stalled,c.signal,20);assert.equal(result.fallbackReason,'CLASSIFIER_TIMEOUT');assert.equal(c.signal.aborted,false);
 const pending=classifyIntent([{role:'user',content:'正常问题'}],cfg,stalled,c.signal);c.abort();await assert.rejects(pending);
});
test('quick routes skip classifier; provider extensions do not leak to other hosts',async()=>{
 assert.equal((await classifyIntent([{role:'user',content:'你好'}],cfg,(async()=>{throw Error('must not call')}) as typeof fetch,new AbortController().signal)).method,'rule');
 assert.deepEqual(providerOptions('https://other.invalid'),{});assert.deepEqual(usageNumbers({prompt_tokens:3,secret:'bad'}),{prompt_tokens:3});
});
