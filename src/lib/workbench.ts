/** Local admin transport. The session token is never persisted or shared with chat. */
let token='';
const labels:Record<string,string>={
 CONFLICT:'资料已被更新，请刷新后重新审核，未覆盖他人的修改。 / Conflict: refresh before editing.',
 CLI_NOT_FOUND:'未找到 Codex CLI / Codex CLI not found',
 CONFIRM_CLI_REQUIRED:'请确认 CLI 可能消耗额度 / Confirm CLI account usage',
 CONFIRM_REQUIRED:'请先确认再发布 / Confirm before publishing',
 CLI_BUSY:'已有任务正在运行，请稍后再试 / Another task is running',
 INVALID_ASSET:'请检查正文长度、资料类型及 HTTPS 来源链接。 / Check content, type and HTTPS source URLs.',
 CORE_LIMIT:'「每次都带上」的资料合计超过 4,000 字，请精简或改成「需要时读取」。 / Always-included knowledge exceeds 4,000 characters.',
 CONTEXT_LIMIT:'资料总量超过模型一次能读的上限，请精简后再试。 / Knowledge exceeds the model context limit.',
 INVALID_PROPOSAL:'这份草稿已经处理过或已失效，请刷新。 / This draft is no longer pending; refresh.',
 NOT_FOUND:'找不到这条记录，可能已被删除。 / Not found; it may have been deleted.',
 INPUT_LIMIT:'内容过长或格式不对。 / Input too long or invalid.',
 NOT_CONFIGURED:'还没有配置模型服务。 / Model provider not configured.',
 CLOUD_UNAVAILABLE:'暂时连不上线上存档，请稍后重试。 / Cloud archive unavailable.',
 CLOUD_NOT_CONFIGURED:'还没有连接线上存档。 / Cloud archive not configured.',
};
export async function workbench<T=any>(action='state',body?:unknown):Promise<T>{
 if(!token){const response=await fetch('/api/workbench/session');if(!response.ok)throw Error('仅本机管理站可访问 / Local admin only');token=(await response.json()).token;}
 const response=await fetch('/api/workbench/'+action,{method:body===undefined?'GET':'POST',headers:{'X-PAI-Admin':token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
 if(response.status===403){token='';throw Error('管理会话已过期，请刷新 / Session expired; refresh');}
 const result=await response.json();
 if(!response.ok)throw Error(labels[result.error]??result.error??'Request failed');
 return result;
}

export type Asset={key:string;title:string;content:string;kind:string;urls:string[];base:string;tier?:'core'|'detail';enabled?:boolean;updated?:string;sourceChanged?:boolean;sourceMissing?:boolean;source?:{content:string;urls:string[]}};
export type Proposal={metrics?:{requestedModel?:string;model?:string;durationMs?:number;usage?:{input_tokens?:number;output_tokens?:number;cached_input_tokens?:number}};id:string;target:string;before:Asset;content:string;instruction:string;status:string;created:string;error?:string};
export type Review={note?:string;corrected?:string;reviewed?:boolean};
export type Run={routing?:{intent:string;method:string;mode?:string};questionId?:string;id:string;conversation:string;created:string;input?:{role:string;content:string}[];response?:string;status:string;model:string;error?:string;durationMs?:number;usage?:unknown;selected?:{title:string;excerpt:string;urls?:string[]}[];review:Review};
export type Revision={id:string;target:string;created:string;before:Asset;after:Asset};
export type State={assets:Asset[];runs:Run[];proposals:Proposal[];revisions:Revision[];cli:boolean;detailReading:{available:boolean;reason?:string;checkedAt?:string}};
export type ReleaseStatus={publishedAt?:string;documents:{id:string;title:string;state:'live'|'changed'|'new'|'removed'}[];personaChanged:boolean;rulesChanged:boolean;ownerChanged:boolean;pending:number};
export type CloudState={configured:boolean;runs:Run[];settings?:{retention_days:number}};

/** Owner test chats from the admin "试一试" panel. */
export const ownerTestPrefix='owner-test-';
export const isOwnerTest=(conversation:string)=>conversation.startsWith(ownerTestPrefix);
/** Last visitor question of a recorded request. */
export const questionOf=(run:Run)=>[...(run.input??[])].reverse().find(m=>m.role==='user')?.content??'';
/** Answers where the AI said it could not help. A heuristic for the inbox, never shown as a verdict. */
export function unanswered(run:Run){
 if(run.status!=='complete'&&run.status!=='running')return true;
 return /无法确认|不能确认|不确定|没有(找到)?(相关|足够)?的?(资料|依据|信息|记录)|暂时没有|不清楚|I (don't|do not) know|cannot confirm|can't confirm|no (information|record)/i.test(run.response??'');
}
export const needsOwner=(run:Run)=>!run.review.reviewed&&(unanswered(run)||!!run.review.note||!!run.review.corrected);
