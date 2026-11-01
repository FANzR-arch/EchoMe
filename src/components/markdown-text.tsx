import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TextMessagePartProps } from '@assistant-ui/react';
import { portfolio,tellHost,useHost } from '@/lib/host-bridge';
import { siteOrigin } from '@/lib/owner';
/** Text only Markdown: no raw HTML or remote images. Preserve the host navigation bridge. */
export function MarkdownText({text}:TextMessagePartProps){
 const host=useHost();
 const clean=text.replace(/[（(]?\[来源未核实\s*\/\s*unverified source\][）)]?/g,'');
 return <div className="chat-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
  img:({alt})=><span>{alt}</span>,
  a:({href,children})=>{
   if(!href||!/^https?:\/\/|^mailto:/i.test(href))return <span>{children}</span>;
   return <a href={href} target="_blank" rel="noopener noreferrer" onClick={e=>{
    const u=new URL(href);const link=portfolio&&u.origin===siteOrigin?host.links.find(l=>l.path.replace(/^\/en(?=\/)/,'')===u.pathname):undefined;
    if(link&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&!e.altKey){e.preventDefault();tellHost({type:'pai:navigate',path:link.path});}
   }}>{children}</a>;
  },
  table:({children})=><div className="chat-table-scroll"><table>{children}</table></div>,
 }}>{clean}</ReactMarkdown></div>;
}
