/** Public Vercel entry. Never mounts the private workbench or CLI. */
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
export const config={maxDuration:60};
type Handler=(req:IncomingMessage,res:ServerResponse,next:()=>void)=>Promise<void>;
let handler:Handler|undefined;
/** Explicit origin first; otherwise Vercel's production domain, so a one-click deploy works without extra settings. */
export function publicOrigin(env=process.env){
  const value=env.PAI_PUBLIC_ORIGIN||(env.VERCEL_PROJECT_PRODUCTION_URL?'https://'+env.VERCEL_PROJECT_PRODUCTION_URL:'');
  const origin=new URL(value);
  if(origin.protocol!=='https:'||origin.origin!==value.replace(/\/$/,''))throw Error('INVALID_ORIGIN');
  return origin.origin;
}
/** Readable reason for a setting that stops the function; names variables, never their values. */
const setting=(name:string,fix:string)=>(e:unknown):never=>{throw Error(`${name}: ${fix}${e instanceof Error&&!/^[A-Z_]+$/.test(e.message)?' ('+e.message+')':''}`);};
/** Everything the function needs before its first request. The Vercel build runs it too, so a bad setting fails the deploy. */
export async function startup(env=process.env):Promise<Handler>{
  env.PAI_RUNTIME='cloud';
  const [{createApi,limitsFromEnv},{CloudStore,CloudHandoff,CloudKnowledgeEdits,cloudConfigured},{cloudRelease},{createNotifier,notifyConfig}]=await Promise.all([import('../server/api.ts'),import('../server/cloud-store.ts'),import('../server/release.ts'),import('../server/handoff.ts')]);
  let origin='';try{origin=publicOrigin(env);}catch(e){setting('PAI_PUBLIC_ORIGIN','set it to the exact https:// address of this chat site, no path')(e);}
  const release=cloudRelease()!;
  const baseUrl=env.PAI_API_BASE_URL||'',model=env.PAI_MODEL||'',key=env.PAI_API_KEY||'';
  if(!baseUrl||!model||!key)throw Error(`${['PAI_API_BASE_URL','PAI_MODEL','PAI_API_KEY'].filter(n=>!env[n]).join(', ')}: not set in the Vercel environment variables`);
  // An exported release records the provider it was checked against; a repository release follows the environment.
  if(release.source==='export'&&(baseUrl!==release.provider.baseUrl||model!==release.provider.model))throw Error('PAI_API_BASE_URL / PAI_MODEL differ from deploy/knowledge-release.json: re-run npm run knowledge:export with the same model');
  const policy=limitsFromEnv(env);
  // Supabase is optional: without it there is no cloud archive and limits are per function instance.
  const audit=cloudConfigured();
  let cloud;if(audit){try{cloud=new CloudStore(undefined,undefined,fetch,policy);}catch(e){setting('PAI_SUPABASE_URL','use the project URL https://<project>.supabase.co, and the service_role key in PAI_SUPABASE_SECRET_KEY')(e);}}
  // Owner replies and the MCP endpoint need shared storage; notices only need a webhook URL.
  const mcpToken=(env.PAI_MCP_TOKEN?.length??0)>=24?env.PAI_MCP_TOKEN:undefined;
  const ownerPassword=env.PAI_OWNER_PASSWORD||undefined;
  if(ownerPassword&&ownerPassword.length<12)throw Error('PAI_OWNER_PASSWORD: use at least 12 characters; the owner page is on the open internet');
  let notify;try{notify=notifyConfig(env,origin);}catch(e){setting('PAI_NOTIFY_WEBHOOK_URL','use the full https:// webhook address')(e);}
  return createApi({mode:'real',baseUrl,model,key,historySecret:env.PAI_HISTORY_SECRET||undefined,audit,...(cloud?{auditStore:cloud,handoff:new CloudHandoff(cloud),knowledgeEdits:new CloudKnowledgeEdits(cloud)}:{}),...(notify?{notify:createNotifier(notify)}:{}),mcpToken,ownerPassword,publicOrigin:origin,toolsVerified:release.provider.toolsVerified},fetch,policy);
}
export default async function entry(req:IncomingMessage,res:ServerResponse){
  res.setHeader('Cache-Control','no-store');
  if(!handler){
    try{handler=await startup();}
    catch(e){
      // Shows in Vercel's function logs; the message names the file or variable, never a secret.
      console.error('EchoMe could not start: '+(e instanceof Error?e.message:String(e)));
      res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'CLOUD_UNAVAILABLE'}));return;
    }
  }
  try {
    const url=new URL(req.url||'/', 'https://local.invalid'),route=url.searchParams.get('route');
    url.searchParams.delete('route');
    if(['chat','config','replies','handoff','mcp'].includes(route??'')||/^owner\/[a-z-]+$/.test(route??''))req.url='/api/'+route+url.search;
    const parsed=(req as IncomingMessage & {body?:unknown}).body;
    const incoming=parsed===undefined?req:Object.assign(Readable.from([typeof parsed==='string'?Buffer.from(parsed):Buffer.from(JSON.stringify(parsed))]),{headers:req.headers,method:req.method,url:req.url,complete:true}) as IncomingMessage;
    await handler(incoming,res,()=>{res.writeHead(404);res.end();});
  }catch{
    if(!res.headersSent){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'CLOUD_UNAVAILABLE'}));}
    else if(!res.writableEnded)res.end();
  }
}
