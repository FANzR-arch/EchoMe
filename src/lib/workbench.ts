/** Local admin transport. The session token is never persisted or shared with chat. */
let token='';
export async function workbench<T=any>(action='state',body?:unknown):Promise<T>{
 if(!token){const response=await fetch('/api/workbench/session');if(!response.ok)throw Error('仅本机管理站可访问 / Local admin only');token=(await response.json()).token;}
 const response=await fetch('/api/workbench/'+action,{method:body===undefined?'GET':'POST',headers:{'X-PAI-Admin':token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
 if(response.status===403){token='';throw Error('管理会话已过期，请刷新 / Session expired; refresh');}
 const result=await response.json();
 if(!response.ok){const labels:Record<string,string>={CONFLICT:'资料已被更新，请刷新后重新审核，未覆盖他人的修改。 / Conflict: refresh before editing.',CLI_NOT_FOUND:'未找到 Codex CLI / Codex CLI not found',CONFIRM_CLI_REQUIRED:'请确认 CLI 可能消耗额度 / Confirm CLI account usage',CLI_BUSY:'已有 CLI 任务正在运行 / CLI is busy',INVALID_ASSET:'请检查正文长度、资料类型及 HTTPS 来源链接。 / Check content, type and HTTPS source URLs.'};throw Error(labels[result.error]??result.error??'Request failed');}
 return result;
}
