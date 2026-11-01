/** OpenAI-compatible stream reader. Tool requests remain data and never execute commands. */
import {usageNumbers} from './provider.ts';
import {sseData} from './sse.ts';
export type Call={id:string;type:'function';function:{name:string;arguments:string}};
export async function readCompletion(response:Response, signal:AbortSignal,onText:(text:string)=>void,onActivity:()=>void){
 if(!response.ok){let quota=false;if(response.status===429){const data=await response.json().catch(()=>null);quota=/quota|balance|credit/i.test(String(data?.error?.code??data?.error?.type??''));}await response.body?.cancel().catch(()=>{});throw Error([401,403].includes(response.status)?'AUTH_FAILED':response.status===402||quota?'QUOTA_EXCEEDED':response.status===429?'UPSTREAM_RATE':'UPSTREAM_FAILED');}
 if(!response.body)throw Error('STREAM_INTERRUPTED');
 let text='',reasoning='',finish='',done=false,model='',usage:Record<string,number>|undefined;
 const calls=new Map<number,Call>();
 for await(const data of sseData(response.body,signal)){
  onActivity();if(data==='[DONE]'){done=true;break;}const c=JSON.parse(data);if(c.error)throw Error('UPSTREAM_FAILED');
  if(typeof c.model==='string'&&c.model.length<200)model=c.model;
  const delta=c.choices?.[0]?.delta;
  if(typeof delta?.reasoning_content==='string'){reasoning+=delta.reasoning_content;if(reasoning.length>24000)throw Error('OUTPUT_LIMIT');}
  if(typeof delta?.content==='string'){text+=delta.content;if(text.length>16000)throw Error('OUTPUT_LIMIT');onText(text);}
  for(const part of delta?.tool_calls??[]){if(!Number.isInteger(part.index)||part.index<0||part.index>0)throw Error('INVALID_TOOL_CALL');const call=calls.get(part.index)??{id:'',type:'function' as const,function:{name:'',arguments:''}};if(part.id)call.id+=part.id;if(part.function?.name)call.function.name+=part.function.name;if(part.function?.arguments)call.function.arguments+=part.function.arguments;if(call.function.arguments.length>2000||call.id.length>200||call.function.name.length>80)throw Error('INVALID_TOOL_CALL');calls.set(part.index,call);}
  if(c.choices?.[0]?.finish_reason)finish=c.choices[0].finish_reason;
  if(c.usage)usage=usageNumbers(c.usage);
 }
 if(!done||!finish)throw Error('STREAM_INTERRUPTED');
 const tools=[...calls.values()];if(tools.length){if(finish!=='tool_calls'||tools.some(c=>!c.id||c.function.name!=='read_knowledge'))throw Error('INVALID_TOOL_CALL');}else if(finish==='length'&&!text)throw Error('OUTPUT_LIMIT');else if(!['stop','length'].includes(finish)||!text)throw Error('STREAM_INTERRUPTED');
 return {text,reasoning,finish,model,usage,calls:tools};
}
