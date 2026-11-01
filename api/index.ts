/** Public Vercel entry. Never mounts the private workbench or CLI. */
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
export const config={maxDuration:60};
let handler:((req:IncomingMessage,res:ServerResponse,next:()=>void)=>Promise<void>)|undefined;
/** Explicit origin first; otherwise Vercel's production domain, so a one-click deploy works without extra settings. */
export function publicOrigin(env=process.env){
  const value=env.PAI_PUBLIC_ORIGIN||(env.VERCEL_PROJECT_PRODUCTION_URL?'https://'+env.VERCEL_PROJECT_PRODUCTION_URL:'');
  const origin=new URL(value);
  if(origin.protocol!=='https:'||origin.origin!==value.replace(/\/$/,''))throw Error('INVALID_ORIGIN');
  return origin.origin;
}
export default async function entry(req:IncomingMessage,res:ServerResponse){
  res.setHeader('Cache-Control','no-store');
  try {
    if(!handler){
      process.env.PAI_RUNTIME='cloud';
      const origin=publicOrigin();
      const [{createApi},{CloudStore,cloudConfigured},{cloudRelease}]=await Promise.all([import('../server/api.ts'),import('../server/cloud-store.ts'),import('../server/release.ts')]);
      const release=cloudRelease()!;
      const baseUrl=process.env.PAI_API_BASE_URL||'',model=process.env.PAI_MODEL||'',key=process.env.PAI_API_KEY||'';
      // An exported release records the provider it was checked against; a repository release follows the environment.
      if(!key||(release.source==='export'&&(baseUrl!==release.provider.baseUrl||model!==release.provider.model)))throw Error('PROVIDER_RELEASE_MISMATCH');
      // Supabase is optional: without it there is no cloud archive and limits are per function instance.
      const audit=cloudConfigured();
      handler=createApi({mode:'real',baseUrl,model,key,historySecret:process.env.PAI_HISTORY_SECRET||undefined,audit,...(audit?{auditStore:new CloudStore()}:{}),publicOrigin:origin,toolsVerified:release.provider.toolsVerified});
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
