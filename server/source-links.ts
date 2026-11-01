/** Only supplied sources become outbound links; unsupported links keep their label. */
import { publicContactUrl } from './response-style.ts';
export function cleanSourceLinks(text:string,sources:string[]){
 const allowed=new Set([...sources,publicContactUrl()].map(s=>s.replace(/\/$/,'')));
 const known=(url:string)=>allowed.has(url.replace(/\/$/,''));
 return text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,(_all,label,url)=>known(url)?`[${label}](${url})`:label)
 .replace(/https?:\/\/[^\s<>"'`)\]，。；！？：）】]+/g,raw=>{const url=raw.replace(/[.,;!?:]+$/,'');return known(url)?raw:raw.slice(url.length);});
}
