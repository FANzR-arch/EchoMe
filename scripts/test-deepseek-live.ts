/** Manual paid smoke only: 6 questions plus 2 short tool-probe requests. */
import {loadEnv} from 'vite';
import {checkCapability} from '../server/capability.ts';
import {writeFileSync,mkdirSync} from 'node:fs';
if(!process.argv.includes('--run'))throw Error('Explicit --run required: consumes provider quota.');
const env=loadEnv('chat',process.cwd(),'PAI_');
const started=Date.now();
const probe=await checkCapability({baseUrl:env.PAI_API_BASE_URL,model:env.PAI_MODEL,key:env.PAI_API_KEY});
console.log(JSON.stringify({probe,durationMs:Date.now()-started}));
if(!probe.available)process.exit(1);
const results=[];let previous=[];
const questions=['你吃了吗？','今天天气怎么样？','做过哪些时间管理工具？','它适合什么人用？','How can I get in touch?','我想做一个个人 AI 网站，请深入比较直接提供全部资料和向量检索两种方案，从准确性、成本、维护三个角度分析，给一个适合个人起步的建议。用三句话回答。'];
for(let i=0;i<questions.length;i++){
 const messages=i===3?[...previous,{role:'user',content:questions[i]}]:[{role:'user',content:questions[i]}];
 const response=await fetch('http://127.0.0.1:5174/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversation:'deepseek-smoke-'+(i===3?2:i),messages})});
 const raw=await response.text();let events=[];try{events=raw.trim().split('\n').map(s=>JSON.parse(s));}catch{}
 const answer=events.filter(e=>e.type==='snapshot').at(-1)?.text??'';const done=events.find(e=>e.type==='done');const error=events.find(e=>e.error)?.error;
 results.push({question:questions[i],answer,status:response.status,error,...done});console.log(JSON.stringify(results.at(-1)));
 if(i===2)previous=[...messages,{role:'assistant',content:answer}];
 if(error)break;
}
mkdirSync('.local-data',{recursive:true});writeFileSync('.local-data/deepseek-smoke.json',JSON.stringify({at:new Date().toISOString(),probe,results},null,2));
