/** Supabase service-role REST client; used only by server functions and localhost admin. */
export function cloudConfigured(){return !!process.env.PAI_SUPABASE_URL&&!!process.env.PAI_SUPABASE_SECRET_KEY;}
export class CloudStore {
  private base:string;private key:string;private fetcher:typeof fetch;
  constructor(base=process.env.PAI_SUPABASE_URL||'',key=process.env.PAI_SUPABASE_SECRET_KEY||'',fetcher:typeof fetch=fetch){
    this.base=base;this.key=key;this.fetcher=fetcher;
    const u=new URL(base);
    if(u.protocol!=='https:'||!u.hostname.endsWith('.supabase.co')||u.pathname!=='/'||u.search||u.hash||u.username||u.password||!key)throw Error('CLOUD_NOT_CONFIGURED');
  }
  async request(path:string,method='GET',body?:unknown):Promise<any>{
    const response=await this.fetcher(this.base.replace(/\/$/,'')+'/rest/v1/'+path,{method,redirect:'error',signal:AbortSignal.timeout(8000),headers:{apikey:this.key,Authorization:'Bearer '+this.key,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
    if(!response.ok){
      let message='';try{message=(await response.json()).message;}catch{}
      if(['DAILY_LIMIT','RATE_LIMIT','CONCURRENCY_LIMIT','INPUT_LIMIT'].includes(message))throw Error(message);
      throw Error('CLOUD_UNAVAILABLE'); // Never expose provider response, keys or SQL.
    }
    const text=await response.text();return text?JSON.parse(text):null;
  }
  startRun(value:Record<string,unknown>,conversation:string):Promise<string>{return this.request('rpc/pai_start','POST',{p_conversation:conversation,p_value:value});}
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
