/** Public Vercel entry. Never mounts the private workbench or CLI. */
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
export const config={maxDuration:60};
let handler:((req:IncomingMessage,res:ServerResponse,next:()=>void)=>Promise<void>)|undefined;
export default async function entry(req:IncomingMessage,res:ServerResponse){
  res.setHeader('Cache-Control','no-store');
  try {
    if(!handler){
      process.env.PAI_RUNTIME='cloud';
      const origin=new URL(process.env.PAI_PUBLIC_ORIGIN||'');
      if(origin.protocol!=='https:'||origin.origin!==process.env.PAI_PUBLIC_ORIGIN)throw Error('INVALID_ORIGIN');
      const [{createApi},{CloudStore},{cloudRelease}]=await Promise.all([import('../server/api.ts'),import('../server/cloud-store.ts'),import('../server/release.ts')]);
      const release=cloudRelease()!;
      const baseUrl=process.env.PAI_API_BASE_URL||'',model=process.env.PAI_MODEL||'',key=process.env.PAI_API_KEY||'';
      if(!key||baseUrl!==release.provider.baseUrl||model!==release.provider.model)throw Error('PROVIDER_RELEASE_MISMATCH');
      handler=createApi({mode:'real',baseUrl,model,key,historySecret:process.env.PAI_HISTORY_SECRET||undefined,audit:true,auditStore:new CloudStore(),publicOrigin:origin.origin,toolsVerified:release.provider.toolsVerified});
    }
    const route=new URL(req.url||'/', 'https://local.invalid').searchParams.get('route');
    if(route==='chat'||route==='config')req.url='/api/'+route;
    const parsed=(req as IncomingMessage & {body?:unknown}).body;
    const incoming=parsed===undefined?req:Object.assign(Readable.from([typeof parsed==='string'?Buffer.from(parsed):Buffer.from(JSON.stringify(parsed))]),{headers:req.headers,method:req.method,url:req.url,complete:true}) as IncomingMessage;
    await handler(incoming,res,()=>{res.writeHead(404);res.end();});
  }catch{
    if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'CLOUD_UNAVAILABLE'}));}
    else if(!res.writableEnded)res.end();
  }
}
