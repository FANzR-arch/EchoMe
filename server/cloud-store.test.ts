import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudStore} from './cloud-store.ts';
test('cloud client restricts endpoint and never exposes upstream secrets',async()=>{
 assert.throws(()=>new CloudStore('http://example.com','test'));
 assert.throws(()=>new CloudStore('https://example.com','test'));
 const db=new CloudStore('https://test.supabase.co','private-key',async()=>new Response(JSON.stringify({message:'secret stack private-key'}),{status:500}));
 await assert.rejects(db.settings(),/^Error: CLOUD_UNAVAILABLE$/);
});
test('cloud quota errors survive without leaking SQL or credentials',async()=>{
 const db=new CloudStore('https://test.supabase.co','private-key',async()=>new Response(JSON.stringify({message:'DAILY_LIMIT'}),{status:400}));
 await assert.rejects(db.startRun({},'conversation'),/^Error: DAILY_LIMIT$/);
});
test('retention permits only supported periods and uses server-only credentials',async()=>{
 const requests:{url:string;body:any}[]=[];
 const db=new CloudStore('https://test.supabase.co','test-key',async(url,options)=>{
   assert.equal(new Headers(options?.headers).get('apikey'),'test-key');
   requests.push({url:String(url),body:JSON.parse(String(options?.body))});return Response.json([]);
 });
 for(const days of [7,30,90,0])await db.retention(days);
 await assert.rejects(db.retention(-1));await assert.rejects(db.retention(1));await assert.rejects(db.retention(NaN));
 assert.equal(requests.length,4);assert.deepEqual(requests[0].body,{retention_days:7});
});
test('cloud review updates notes only; whole conversation deletion uses cascade parent',async()=>{
 const requests:{url:string;method:string;body:any}[]=[];
 const db=new CloudStore('https://test.supabase.co','key',async(url,options)=>{
   requests.push({url:String(url),method:String(options?.method),body:options?.body?JSON.parse(String(options.body)):null});return Response.json([{id:'ok'}]);
 });
 await db.review('00000000-0000-0000-0000-000000000001','note','correction',true);
 assert.deepEqual(Object.keys(requests[0].body),['review']);
 await db.deleteConversation('test-123');assert.match(requests[1].url,/pai_conversations\?id=eq.test-123$/);assert.equal(requests[1].method,'DELETE');
 await assert.rejects(db.deleteConversation('other&or=(id.gt.0)'));
});
