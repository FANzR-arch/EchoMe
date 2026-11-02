/** Supabase service-role REST client; used only by server functions and localhost admin. */
import { summarize, runsToTurns, type HandoffStore, type OwnerMessage, type SavedAnswer } from "./handoff.ts";
/** Site-wide chat limits passed to pai_start, so every function instance enforces the same numbers. */
type ChatLimits={daily:number;perMinute:number;concurrent:number};
export function cloudConfigured(){return !!process.env.PAI_SUPABASE_URL&&!!process.env.PAI_SUPABASE_SECRET_KEY;}
export class CloudStore {
  private base:string;private key:string;private fetcher:typeof fetch;private policy?:ChatLimits;private legacyStart=false;
  constructor(base=process.env.PAI_SUPABASE_URL||'',key=process.env.PAI_SUPABASE_SECRET_KEY||'',fetcher:typeof fetch=fetch,policy?:ChatLimits){
    this.base=base;this.key=key;this.fetcher=fetcher;this.policy=policy;
    const u=new URL(base);
    if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co')||u.pathname!=='/'||u.search||u.hash||u.username||u.password||!key)throw Error('CLOUD_NOT_CONFIGURED');
  }
  async request(path:string,method='GET',body?:unknown):Promise<any>{
    const response=await this.fetcher(this.base.replace(/\/$/,'')+'/rest/v1/'+path,{method,redirect:'error',signal:AbortSignal.timeout(8000),headers:{apikey:this.key,Authorization:'Bearer '+this.key,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
    if(!response.ok){
      let message='',code='';try{({message,code}=await response.json());}catch{}
      if(['DAILY_LIMIT','RATE_LIMIT','CONCURRENCY_LIMIT','INPUT_LIMIT'].includes(message))throw Error(message);
      if(code==='PGRST202')throw Error('FUNCTION_MISSING');
      throw Error('CLOUD_UNAVAILABLE'); // Never expose provider response, keys or SQL.
    }
    const text=await response.text();return text?JSON.parse(text):null;
  }
  async startRun(value:Record<string,unknown>,conversation:string):Promise<string>{
    const run={p_conversation:conversation,p_value:value};
    if(!this.policy||this.legacyStart)return this.request('rpc/pai_start','POST',run);
    try{return await this.request('rpc/pai_start','POST',{...run,p_daily:this.policy.daily,p_per_minute:this.policy.perMinute,p_concurrent:this.policy.concurrent});}
    catch(e){
      if(!(e instanceof Error&&e.message==='FUNCTION_MISSING'))throw e;
      // Database from before configurable limits: keep chatting under its built-in limits until the SQL is re-run.
      console.warn('EchoMe: Supabase still has the old pai_start. Run supabase/setup.sql again in the Supabase SQL Editor to apply PAI_*_LIMIT.');
      this.legacyStart=true;return this.request('rpc/pai_start','POST',run);
    }
  }
  async usageToday(){const day=new Date().toISOString().slice(0,10);return Number((await this.request('pai_usage?select=requests&day=eq.'+day))[0]?.requests??0);}
  async finishRun(id:string,value:unknown){await this.request('rpc/pai_finish','POST',{p_id:id,p_value:value});}
  async runs(offset=0){
    const rows=await this.request('pai_runs?select=id,conversation,created,value,review&order=created.desc,id.desc&limit=100&offset='+offset);
    return rows.map((r:any)=>({...r.value,id:r.id,conversation:r.conversation,created:r.created,review:r.review}));
  }
  async settings(){return (await this.request('pai_settings?select=retention_days,daily_limit&id=eq.true'))[0];}
  async retention(days:number){if(![0,7,30,90].includes(days))throw Error('INPUT_LIMIT');await this.request('pai_settings?id=eq.true','PATCH',{retention_days:days});}
  async review(id:string,note:string,corrected:string,reviewed:boolean){
    if(!/^[0-9a-f-]{36}$/i.test(id)||note.length>4000||corrected.length>8000)throw Error('INPUT_LIMIT');
    const rows=await this.request('pai_runs?id=eq.'+id,'PATCH',{review:{note,corrected,reviewed}});if(!rows.length)throw Error('NOT_FOUND');
  }
  async deleteConversation(id:string){if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw Error('INPUT_LIMIT');await this.request('pai_conversations?id=eq.'+encodeURIComponent(id),'DELETE');}
  async cleanup(){return this.request('rpc/pai_cleanup','POST',{});}
}

/** Owner hand-off on Supabase; same contract as LocalHandoff. */
export class CloudHandoff implements HandoffStore {
  private cloud:CloudStore;
  constructor(cloud=new CloudStore()){this.cloud=cloud;}
  async add(conversation:string,role:OwnerMessage['role'],text:string):Promise<OwnerMessage>{return this.cloud.request('rpc/pai_owner_add','POST',{p_conversation:conversation,p_role:role,p_text:text});}
  async messages(conversation:string,after=''):Promise<OwnerMessage[]>{
    return this.cloud.request('pai_owner_messages?select=id,conversation,created,role,text&conversation=eq.'+encodeURIComponent(conversation)+(after?'&created=gt.'+encodeURIComponent(after):'')+'&order=created.asc&limit=100');
  }
  async repliesSince(since:string){return (await this.cloud.request('pai_owner_messages?select=id&role=eq.owner&created=gt.'+encodeURIComponent(since)+'&limit=1000')).length;}
  private runs(filter=''){return this.cloud.request('pai_runs?select=conversation,created,input:value->input,response:value->>response'+filter);}
  async recent(limit:number){
    const [runs,notes]=await Promise.all([this.runs('&order=created.desc&limit=200'),this.cloud.request('pai_owner_messages?select=id,conversation,created,role,text&order=created.desc&limit=200')]);
    return summarize(runs,notes,limit);
  }
  async saveAnswer(question:string,answer:string,conversation?:string):Promise<SavedAnswer>{return (await this.cloud.request('pai_saved_answers?select=id,created,question,answer','POST',{question,answer,conversation:conversation??null}))[0];}
  async savedAnswers(limit:number):Promise<SavedAnswer[]>{return this.cloud.request('pai_saved_answers?select=id,created,question,answer&order=created.desc&limit='+Math.min(200,Math.max(1,limit)));}
  async forgetAnswer(id:string){if(!/^[0-9a-f-]{36}$/i.test(id))return false;return (await this.cloud.request('pai_saved_answers?id=eq.'+id,'DELETE')).length>0;}
  async transcript(conversation:string){
    const c=encodeURIComponent(conversation);
    const [runs,notes]=await Promise.all([this.runs('&conversation=eq.'+c+'&order=created.asc&limit=100'),this.messages(conversation)]);
    return runs.length||notes.length?runsToTurns(runs,notes):undefined;
  }
}
