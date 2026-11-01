import {providerOptions} from './provider.ts';
import {hash,getStore} from './workbench-store.ts';
import {readCompletion} from './completion.ts';
import {readKnowledgeTool,readKnowledge} from './knowledge.ts';
export type Provider={baseUrl:string;model:string;key:string};
const id=(c:Provider)=>hash({baseUrl:c.baseUrl,model:c.model,key:c.key});
function table(){getStore().db.exec('CREATE TABLE IF NOT EXISTS capabilities (id TEXT PRIMARY KEY,value TEXT NOT NULL)');}
export function capability(c:Provider){table();const r=getStore().db.prepare('SELECT value FROM capabilities WHERE id=?').get(id(c));return r?JSON.parse(String(r.value)):{available:false,reason:'NOT_CHECKED'};}
export async function checkCapability(c:Provider){
 const u=new URL(c.baseUrl);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!c.key||!c.model)throw Error('NOT_CONFIGURED');
 const signal=AbortSignal.timeout(20000);const messages:unknown[]=[{role:'system',content:'Compatibility check. Call read_knowledge with ids ["probe"], then reply OK after reading the result.'},{role:'user',content:'Read probe.'}];
 const rounds=[];let result;
 try{
  for(let round=0;round<2;round++){
   const response=await fetch(c.baseUrl.replace(/\/$/,'')+'/chat/completions',{method:'POST',redirect:'error',signal,headers:{Authorization:'Bearer '+c.key,'Content-Type':'application/json'},body:JSON.stringify({model:c.model,...providerOptions(c.baseUrl),messages,stream:true,stream_options:{include_usage:true},max_tokens:64,...(!round?{tools:[readKnowledgeTool],tool_choice:{type:'function',function:{name:'read_knowledge'}}}:{})})});
   const r=await readCompletion(response,signal,()=>{},()=>{});rounds.push({model:r.model,usage:r.usage});
   if(!round){if(r.calls.length!==1)throw Error('TOOLS_UNSUPPORTED');const call=r.calls[0];readKnowledge(call.function.arguments,[{id:'probe',title:'probe',text:'OK',kind:'personal',urls:[],file:'probe',updated:''}]);messages.push({role:'assistant',content:r.text||null,tool_calls:r.calls},{role:'tool',tool_call_id:call.id,content:'OK'});}else if(r.calls.length)throw Error('TOOLS_UNSUPPORTED');
  }
  result={available:true,checkedAt:new Date().toISOString(),model:c.model,rounds};
 }catch{result={available:false,reason:'COMPATIBILITY_CHECK_FAILED',checkedAt:new Date().toISOString(),rounds};}
 table();getStore().db.prepare('INSERT OR REPLACE INTO capabilities VALUES (?,?)').run(id(c),JSON.stringify(result));return result;
}
