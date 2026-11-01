import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {createApi,type AuditStore} from './api.ts';
const provider={mode:'real',baseUrl:'https://provider.invalid',model:'test',key:'test-key',toolsVerified:false,intentRouting:false,audit:true,publicOrigin:'https://chat.example.com'};
async function run(auditStore:AuditStore,fetcher:typeof fetch,host='chat.example.com',origin='https://chat.example.com',path='/api/chat'){
 const api=createApi({...provider,auditStore},fetcher);
 const server=createServer((req,res)=>{void api(req,res,()=>res.writeHead(404).end());});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try{return await new Promise<{status:number;text:string}>((resolve,reject)=>{
  const req=request({hostname:'127.0.0.1',port:(server.address() as any).port,path,method:'POST',headers:{host,origin,'Content-Type':'application/json'}},res=>{let text='';res.on('data',d=>text+=d);res.on('end',()=>resolve({status:res.statusCode!,text}));});req.on('error',reject);req.end(JSON.stringify({conversation:'cloud-test',messages:[{role:'user',content:'你好'}]}));
 });}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
}
test('cloud host/origin boundary and admin routes never access provider or store',async()=>{
 const store={startRun:()=>{throw Error('should not call');},finishRun:()=>{throw Error('should not call');}};
 const fetcher=async()=>{throw Error('should not call');};
 assert.equal((await run(store,fetcher,'evil.example')).status,403);
 assert.equal((await run(store,fetcher,'chat.example.com','https://evil.example')).status,403);
 assert.equal((await run(store,fetcher,'chat.example.com','https://chat.example.com','/api/workbench/state')).status,404);
});
test('shared quota and storage failures prevent all paid calls',async()=>{
 let called=0;
 for(const code of ['DAILY_LIMIT','CLOUD_UNAVAILABLE']){
  const store={startRun:async()=>{throw Error(code);},finishRun:async()=>{}};
  const result=await run(store,async()=>{called++;return new Response();});
  assert.equal(result.status,code==='DAILY_LIMIT'?429:502);assert.match(result.text,new RegExp(code));
 }
 assert.equal(called,0);
});
test('cloud response remains streaming and waits for final audit before ending',async()=>{
 let saved:any;
 const store={startRun:async()=> 'run',finishRun:async(_id:string,value:unknown)=>{await new Promise(r=>setTimeout(r,10));saved=structuredClone(value);}};
 const result=await run(store,async()=>new Response('data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
 assert.equal(result.status,200);assert.match(result.text,/snapshot/);assert.equal(saved.response,'Hello');assert.equal(saved.status,'complete');
});
