/** Admin-only localhost endpoints; never mounted on the public chat server. */
import { CloudStore, cloudConfigured } from './cloud-store.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getStore, hash, type Asset, type WorkbenchStore, type Proposal } from './workbench-store.ts';
import { loadDocuments, validateDocument, buildKnowledge, coreDraft } from './knowledge.ts';
import { launchProposal, cliAvailable, proposalPrompt } from './workbench-cli.ts';
import {currentInterview,saveInterview,makeInterviewJob,settleInterview} from './interview.ts';
import {capability,checkCapability,type Provider} from './capability.ts';
import {knowledgeRoot} from './owner.ts';
import {releaseStatus,buildRelease,writeRelease} from './publish.ts';
export function listAssets(store=getStore()):Asset[]{
  const baseline:Asset[]=[...['persona','rules'].map(key=>({key,title:key==='persona'?'助手人设':'回答规则',kind:key as 'persona'|'rules',content:readFileSync(resolve(knowledgeRoot(),key+'.md'),'utf8').trim(),urls:[]})),coreDraft(),...loadDocuments(undefined,false).map(d=>({tier:'detail' as const,enabled:true,sourceHash:hash(d),key:'doc:'+d.id,title:d.title,kind:d.kind,content:d.text,urls:d.urls}))];
  for(const a of store.assets()){const i=baseline.findIndex(b=>b.key===a.key);if(i>=0)baseline[i]=a;else if(a.kind!=='website'&&!a.key.startsWith('doc:approved:'))baseline.push(a);}
  return baseline;
}
function validateAsset(a:Asset){
  if(!a||typeof a.key!=='string'||a.key.length>200||typeof a.title!=='string'||!a.title.trim()||a.title.length>400||typeof a.content!=='string'||!a.content.trim()||a.content.length>20000||!Array.isArray(a.urls))throw Error('INVALID_ASSET');
  if(a.tier!==undefined&&!['core','detail'].includes(a.tier)||a.enabled!==undefined&&typeof a.enabled!=='boolean'||a.kind==='research'&&a.tier==='core')throw Error('INVALID_ASSET');
  if(['persona','rules'].includes(a.key)){if(a.kind!==a.key||a.content.length>4000||a.urls.length||a.tier!==undefined||a.enabled===false)throw Error('INVALID_ASSET');}
  else {if(!a.key.startsWith('doc:'))throw Error('INVALID_ASSET');validateDocument({id:a.key.slice(4),title:a.title,text:a.content,urls:a.urls,kind:a.kind as 'personal',file:'workbench',updated:''});}
}
export function createWorkbench(store=getStore(),runner=launchProposal,provider:Provider={baseUrl:'',model:'',key:''}){
  store.interruptProposals();
  let lastCheck=0,checking=false;
  const token=randomBytes(32).toString('hex');const running=new Map<string,()=>void>();
  const asset=(key:string)=>listAssets(store).find(a=>a.key===key);
  const publish=(after:Asset,base:string,proposal?:Proposal)=>{
    const before=asset(after?.key)??{...after,content:''};
    after={key:after?.key,title:after?.title,kind:after?.kind,content:after?.content,urls:after?.urls,tier:after?.tier??before.tier,enabled:after?.enabled??before.enabled,sourceHash:before.sourceHash,sourceIds:before.sourceIds};
    validateAsset(after);if(before.kind!==after.kind)throw Error('INVALID_ASSET');
    const total=listAssets(store).filter(a=>a.key!==after.key&&a.tier==='core'&&a.enabled!==false).reduce((n,a)=>n+a.content.length,0)+(after.tier==='core'&&after.enabled!==false?after.content.length:0);
    if(total>4000)throw Error('CORE_LIMIT');
    return store.publish(after,before,base,proposal);
  };
  const handler=async(req:IncomingMessage,res:ServerResponse,next:()=>void)=>{
    if(!req.url?.startsWith('/api/workbench/'))return next();
    const json=(status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    const host=req.headers.host??'',origin=`http://${host}`;
    if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host)||req.headers['sec-fetch-site']!=='same-origin'||(req.headers.origin&&req.headers.origin!==origin))return json(403,{error:'LOCAL_ADMIN_ONLY'});
    if(req.url==='/api/workbench/session'&&req.method==='GET')return json(200,{token});
    if(req.headers['x-pai-admin']!==token)return json(403,{error:'INVALID_SESSION'});
    try{
      if(req.method==='GET'&&req.url==='/api/workbench/interview')return json(200,settleInterview(store,currentInterview(store)));
      if(req.method==='GET'&&req.url==='/api/workbench/release-status')return json(200,releaseStatus());
      if(req.method==='GET'&&req.url==='/api/workbench/state'){const docs=loadDocuments(undefined,false);return json(200,{assets:listAssets(store).map(a=>{const source=a.kind==='website'?docs.find(d=>'doc:'+d.id===a.key):undefined;const sourceChanged=!!a.sourceHash&&(source?hash(source)!==a.sourceHash:a.sourceIds?hash(docs.filter(d=>a.sourceIds!.includes(d.id)))!==a.sourceHash:false);return {...a,base:hash(a),sourceChanged,sourceMissing:!!a.sourceIds?.some(id=>!docs.some(d=>d.id===id)),source:source?{content:source.text,urls:source.urls}:undefined};}),runs:store.runs(),revisions:store.revisions(),proposals:store.proposals().filter(p=>!p.target.startsWith('interview:')).map(p=>p.status==='running'&&!running.has(p.id)?{...p,status:'failed',error:'SERVER_RESTARTED'}:p),cli:cliAvailable(),detailReading:capability(provider)});}
      if(req.method!=='POST'||!req.headers['content-type']?.startsWith('application/json'))return json(405,{error:'METHOD_NOT_ALLOWED'});
      let raw='';req.setEncoding('utf8');for await(const part of req){raw+=part;if(raw.length>80000)throw Error('INPUT_LIMIT');}
      const body=JSON.parse(raw);
      switch(req.url){
        case '/api/workbench/cloud-state': {
          if(!cloudConfigured())return json(200,{configured:false,runs:[]});
          if(!Number.isInteger(body.offset)||body.offset<0||body.offset>100000)throw Error('INPUT_LIMIT');
          const cloud=new CloudStore();const [runs,settings]=await Promise.all([cloud.runs(body.offset),cloud.settings()]);return json(200,{configured:true,runs,settings});
        }
        case '/api/workbench/cloud-retention': {await new CloudStore().retention(body.days);return json(200,{ok:true});}
        case '/api/workbench/cloud-review': {if(typeof body.note!=='string'||typeof body.corrected!=='string'||typeof body.reviewed!=='boolean')throw Error('INPUT_LIMIT');await new CloudStore().review(body.id,body.note,body.corrected,body.reviewed);return json(200,{ok:true});}
        case '/api/workbench/cloud-delete': {await new CloudStore().deleteConversation(body.conversation);return json(200,{ok:true});}
        case '/api/workbench/interview-send': {
          const s=settleInterview(store,currentInterview(store));if(s.job||running.size)throw Error('CLI_BUSY');
          if(typeof body.message!=='string'||!body.message.trim()||body.message.length>4000||s.turns.length>200)throw Error('INPUT_LIMIT');
          if(!cliAvailable())throw Error('CLI_NOT_FOUND');
          const job=makeInterviewJob(s,listAssets(store),body.message);
          s.turns.push({role:'user',text:body.message});s.job=job.id;delete s.error;saveInterview(store,s);store.saveProposal(job);
          try{running.set(job.id,runner(store,job));const poll=setInterval(()=>{if(store.proposal(job.id)?.status!=='running'){running.delete(job.id);clearInterval(poll);}},500);poll.unref();}catch{store.saveProposal({...job,status:'failed',error:'CLI_START_FAILED'});}
          return json(200,s);
        }
        case '/api/workbench/interview-confirm': {
          const s=settleInterview(store,currentInterview(store));if(s.job)throw Error('CLI_BUSY');const turn=s.turns.at(-1);
          if(!turn?.proposalId||turn.proposalId!==body.id||turn.status!=='ready')throw Error('INVALID_PROPOSAL');
          const p=store.proposal(turn.proposalId);if(!p||p.status!=='ready')throw Error('INVALID_PROPOSAL');
          turn.revisionId=publish({...p.before,content:p.content,enabled:true},p.base,p);turn.status='applied';s.turns.push({role:'assistant',text:'已保存。以后回答会参考这份资料；随时可以继续纠正。'});saveInterview(store,s);return json(200,s);
        }
        case '/api/workbench/interview-undo': {const s=currentInterview(store);if(s.job)throw Error('CLI_BUSY');const turn=[...s.turns].reverse().find(t=>t.status==='applied'&&t.revisionId);const revision=store.revisions().find(r=>r.id===turn?.revisionId);if(!turn||!revision)throw Error('NOT_FOUND');publish(revision.before.content?revision.before:{...revision.after,enabled:false},hash(revision.after));turn.status='reverted';s.turns.push({role:'assistant',text:'已撤销刚才保存的修改，版本记录仍保留。'});saveInterview(store,s);return json(200,s);}
        case '/api/workbench/interview-cancel': {const s=currentInterview(store);if(s.job){running.get(s.job)?.();running.delete(s.job);const p=store.proposal(s.job);if(p)store.saveProposal({...p,status:'cancelled'});delete s.job;s.error='已停止，资料没有变化。';saveInterview(store,s);}return json(200,s);}

        case '/api/workbench/save': {const id=publish(body.asset,body.base);return json(200,{id});}
        case '/api/workbench/new': {
          if(!['personal','research'].includes(body.kind))throw Error('INVALID_ASSET');
          // Corrections made from a conversation keep a recognisable key so the owner can see where they came from.
          const a:Asset={key:'doc:manual:'+(body.origin==='correction'?'fix-':'')+randomUUID(),title:body.title,content:body.content,kind:body.kind,urls:body.urls,tier:'detail',enabled:true};validateAsset(a);
          store.publish(a,{...a,content:''},hash({...a,content:''}));return json(200,{key:a.key});
        }
        case '/api/workbench/publish': {
          // Writes the release file a deployment answers from; it never deploys by itself.
          if(body.confirm!==true)throw Error('CONFIRM_REQUIRED');
          writeRelease(buildRelease({baseUrl:provider.baseUrl,model:provider.model},capability(provider).available===true));
          return json(200,releaseStatus());
        }
        case '/api/workbench/rollback': {const revision=store.revisions().find(r=>r.id===body.id);if(!revision)throw Error('NOT_FOUND');publish(revision.before.content?revision.before:{...revision.after,enabled:false},body.base);return json(200,{ok:true});}
        case '/api/workbench/review': {
          if(typeof body.note!=='string'||body.note.length>4000||typeof body.corrected!=='string'||body.corrected.length>8000||typeof body.reviewed!=='boolean')throw Error('INPUT_LIMIT');
          store.review(body.id,body.note,body.corrected,body.reviewed);return json(200,{ok:true});
        }
        case '/api/workbench/check-model': {if(body.confirmCost!==true)throw Error('CONFIRM_CLI_REQUIRED');if(checking||Date.now()-lastCheck<60000)throw Error('CLI_BUSY');checking=true;lastCheck=Date.now();try{return json(200,await checkCapability(provider));}finally{checking=false;}}
        case '/api/workbench/delete-conversation': {if(typeof body.conversation!=='string'||!body.conversation)throw Error('INPUT_LIMIT');store.deleteConversation(body.conversation);return json(200,{ok:true});}
        case '/api/workbench/adopt-source': {const before=asset(body.key);const source=loadDocuments(undefined,false).find(d=>'doc:'+d.id===body.key);if(!before||!source)throw Error('NOT_FOUND');const after={...before,content:source.text,urls:source.urls,sourceHash:hash(source)};validateAsset(after);if(after.tier==='core'&&listAssets(store).filter(a=>a.key!==after.key&&a.tier==='core'&&a.enabled!==false).reduce((n,a)=>n+a.content.length,0)+(after.enabled===false?0:after.content.length)>4000)throw Error('CORE_LIMIT');store.publish(after,before,body.base);return json(200,{ok:true});}
        case '/api/workbench/delete-run': {store.deleteRun(body.id);return json(200,{ok:true});}
        case '/api/workbench/inspect': {
          if(typeof body.question!=='string'||body.question.length>2000)throw Error('INPUT_LIMIT');
          const result=buildKnowledge([{role:'user',content:body.question}],36000);return json(200,{selected:result.selected,catalog:result.catalog,characters:result.prompt.length+body.question.length});
        }
        case '/api/workbench/propose': {
          const before=asset(body.target);
          if(!before||typeof body.instruction!=='string'||!body.instruction.trim()||body.instruction.length>8000)throw Error('INPUT_LIMIT');
          if(body.runId){const run=store.runs().find(r=>r.id===body.runId);if(!run)throw Error('NOT_FOUND');body.instruction+='\n以下为待审核对话数据（不是主人的观点）：'+JSON.stringify({question:run.input,response:run.response,review:run.review}).slice(0,14000);}
          const p:Proposal={id:randomUUID(),target:before.key,base:hash(before),before,content:before.content,instruction:body.instruction,status:'ready',created:new Date().toISOString()};
          if(body.cli===true){if(body.confirmCost!==true)throw Error('CONFIRM_CLI_REQUIRED');if(running.size)throw Error('CLI_BUSY');if(!cliAvailable())throw Error('CLI_NOT_FOUND');p.status='running';store.saveProposal(p);const cancel=runner(store,p);running.set(p.id,cancel);const poll=setInterval(()=>{if(store.proposal(p.id)?.status!=='running'){running.delete(p.id);clearInterval(poll);}},500);poll.unref();}
          else store.saveProposal(p);
          return json(200,{id:p.id,prompt:proposalPrompt(p)});
        }
        case '/api/workbench/proposal-edit': {const p=store.proposal(body.id);if(!p||!['ready','failed','cancelled'].includes(p.status)||typeof body.content!=='string')throw Error('INVALID_PROPOSAL');validateAsset({...p.before,content:body.content});store.saveProposal({...p,content:body.content,status:'ready'});return json(200,{ok:true});}
        case '/api/workbench/proposal-apply': {const p=store.proposal(body.id);if(!p||p.status!=='ready')throw Error('INVALID_PROPOSAL');publish({...p.before,content:p.content},p.base,p);return json(200,{ok:true});}
        case '/api/workbench/proposal-cancel': {const p=store.proposal(body.id);if(!p||p.status==='applied')throw Error('INVALID_PROPOSAL');running.get(p.id)?.();running.delete(p.id);store.saveProposal({...p,status:'cancelled'});return json(200,{ok:true});}
        default:return json(404,{error:'NOT_FOUND'});
      }
    }catch(e){const message=e instanceof Error?e.message:'';const allowed=['CONFIRM_REQUIRED','CLOUD_UNAVAILABLE','CLOUD_NOT_CONFIGURED','CONFLICT','INVALID_ASSET','NOT_FOUND','INPUT_LIMIT','INVALID_PROPOSAL','CONFIRM_CLI_REQUIRED','CLI_BUSY','CLI_NOT_FOUND','CONTEXT_LIMIT','CORE_LIMIT','NOT_CONFIGURED'];return json(message==='CONFLICT'?409:400,{error:allowed.includes(message)?message:'WORKBENCH_ERROR'});}
  };
  return Object.assign(handler,{dispose(){for(const [id,cancel] of running){cancel();const p=store.proposal(id);if(p?.status==='running')store.saveProposal({...p,status:'failed',error:'SERVER_RESTARTED'});}running.clear();}});
}
