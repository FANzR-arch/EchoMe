import { cleanSourceLinks } from './source-links.ts';
import { publicContactUrl } from './response-style.ts';
/** Local-only API: fixed upstream, bounded requests, cancellation and sanitized errors. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { getStore } from "./workbench-store.ts";
import { getSystemRules } from "./prompts.ts";
import { buildKnowledge, readKnowledge, readKnowledgeTool, loadDocuments, type Document } from "./knowledge.ts";
import { readCompletion } from "./completion.ts";
import { capability } from "./capability.ts";
import { classifyIntent,clarificationReply,routePolicy,type Routing } from "./intent.ts";
import { providerOptions } from "./provider.ts";
import { hash } from "./workbench-store.ts";
import { historySigner, historySecret, neutralize, visitorReminder, leakCoverage, leakThreshold, guardedReply, unverifiedReply } from "./guard.ts";
import { guardRules } from "./prompts.ts";
import { responseStyle } from "./response-style.ts";
import { notifyReason, conversationId, type HandoffStore, type Reason, type SavedAnswer } from "./handoff.ts";
import { createMcp, tokenMatches } from "./mcp.ts";
import { owner } from "./owner.ts";
export const limits = { input: 2000, context: 36000, messages: 24, output: 600, perMinute: 6, concurrent: 2, daily: 30, timeoutMs: 45000, idleMs: 12000 };
export type AuditStore = { startRun(value:Record<string,unknown>,conversation:string):string|Promise<string>; finishRun(id:string,value:unknown):void|Promise<void> };
export type Config = { mode: string; baseUrl: string; model: string; key: string; historySecret?: string; audit?: boolean; toolsVerified?: boolean; intentRouting?:boolean; publicOrigin?:string; auditStore?:AuditStore;
  /** Owner hand-off: replies from the owner's agent, notices to it, and the MCP endpoint it calls. */
  handoff?:HandoffStore; notify?:(notice:{reason:Reason;conversation:string;visitor:string;assistant?:string;contact?:string})=>Promise<boolean>; mcpToken?:string };
/** Prefix the visitor sees on the owner's own words; it is also what the model reads back as history. */
export const ownerLabel=(locale:string)=>locale==='en'?`[${owner().name.en}, in person] `:`【${owner().name.zh}本人回复】`;
/** A saved owner answer as a detail document: listed in the catalog, read in full on demand. */
export const savedAnswerDocument=(a:SavedAnswer):Document=>({id:'saved:'+a.id,title:'主人亲自回答过：'+a.question.slice(0,160),kind:'personal',urls:[],updated:a.created.slice(0,10),file:'saved-answers',tier:'detail',summary:a.answer.slice(0,100),
  text:`问：${a.question}\n答（${owner().name.zh}本人确认，${a.created.slice(0,10)}）：${a.answer}`});
async function readJson(req:IncomingMessage,max=65536){
  let raw='',bytes=0;req.setEncoding('utf8');
  for await(const chunk of req){bytes+=Buffer.byteLength(chunk);if(bytes>max)throw fail('INPUT_LIMIT');raw+=chunk;}
  try{return JSON.parse(raw);}catch{throw fail('INPUT_LIMIT');}
}
const fail = (code: string) => new Error(code);
export function validate(body: unknown) {
  const b = body as { messages?: { role: string; content: string; sig?: string }[]; locale?: string };
  if (!b || Object.keys(b).some(k => !["messages", "locale", "conversation"].includes(k)) || !Array.isArray(b.messages) || !b.messages.length || b.messages.length > limits.messages || (b.locale !== undefined && !["zh", "en"].includes(b.locale))) throw fail("INPUT_LIMIT");
  let length = getSystemRules().length;
  for (const m of b.messages) {
    if (!m || Object.keys(m).some(k => !["role", "content", ...(m.role === "assistant" ? ["sig"] : [])].includes(k)) || (m.sig !== undefined && (typeof m.sig !== "string" || m.sig.length > 64)) || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || !m.content.trim() || m.content.length > (m.role === "user" ? limits.input : limits.context)) throw fail("INPUT_LIMIT");
    length += m.content.length;
  }
  if (length > limits.context || b.messages.at(-1)?.role !== "user") throw fail("CONTEXT_LIMIT");
  return b.messages.map(m => ({ role: m.role, content: m.content, ...(m.sig ? { sig: m.sig } : {}) }));
}
/** Visitors can edit anything their browser sends: only server-signed replies count as history. */
export function trustHistory(messages: { role: string; content: string; sig?: string }[], conversation: string, verify: (c: string, t: string, s: unknown) => boolean) {
  return messages.map(m => m.role === "assistant" ? { role: m.role, content: verify(conversation, m.content, m.sig) ? m.content : unverifiedReply } : { role: m.role, content: neutralize(m.content) });
}
export function createApi(config: Config, fetcher: typeof fetch = fetch, policy = limits) {
  let active = 0, attempts: number[] = [], day = "", daily = 0;
  const signer = historySigner(historySecret(config.historySecret, config.key));
  const mcp = config.handoff && config.mcpToken ? createMcp(config.handoff) : undefined;
  let handoffs: number[] = [];
  // Saved answers change rarely; a short cache spares a database call per question. Failures fall back to the last list.
  let saved: { at: number; docs: Document[] } | undefined;
  const savedDocuments = async () => {
    if (!config.handoff) return [];
    if (saved && Date.now() - saved.at < 60000) return saved.docs;
    try { saved = { at: Date.now(), docs: (await config.handoff.savedAnswers(30)).map(savedAnswerDocument) }; } catch { /* Keep answering without them. */ }
    return saved?.docs ?? [];
  };
  const configured = (() => { try { const u = new URL(config.baseUrl); return u.protocol === "https:" && !u.username && !u.password && !u.search && !u.hash && !!config.model && !!config.key; } catch { return false; } })();
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith("/api/")) return next();
    res.setHeader("Cache-Control", "no-store");
    const json = (status: number, value: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); };
    // Same-origin loopback only. This is not production authentication.
    const host = req.headers.host ?? "";
    const expected=config.publicOrigin??`http://${host}`;
    const allowedHost=config.publicOrigin?host===new URL(config.publicOrigin).host:/^(127\.0\.0\.1|localhost):\d+$/.test(host);
    if (!allowedHost || (req.headers.origin && req.headers.origin !== expected) || req.headers["sec-fetch-site"] === "cross-site") return json(403, { error: "ORIGIN_DENIED" });
    if (req.url === "/api/config" && req.method === "GET") return json(200, { mode: config.mode === "real" ? "real" : "mock", configured, model: config.mode === "real" ? config.model : undefined, detailReading: config.toolsVerified ?? capability(config).available, handoff: !!config.handoff, contact: !!config.notify });
    const url = new URL(req.url, "http://local.invalid");
    if (url.pathname === "/api/mcp") {
      // Called by the owner's agent, never by a browser. Bearer header preferred; ?key= for agents that cannot set headers.
      const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? url.searchParams.get("key") ?? undefined;
      if (!mcp || !tokenMatches(config.mcpToken, bearer)) return json(404, { error: "NOT_FOUND" });
      if (req.method !== "POST") { res.writeHead(405, { Allow: "POST" }); res.end(); return; }
      try {
        const body = await readJson(req);
        const out = Array.isArray(body) ? (await Promise.all(body.map(mcp))).filter(Boolean) : await mcp(body);
        saved = undefined; // A save or forget shows up in the next answer.
        if (!out || (Array.isArray(out) && !out.length)) { res.writeHead(202); res.end(); return; }
        return json(200, out);
      } catch { return json(400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
    }
    if (url.pathname === "/api/replies" && req.method === "GET") {
      const conversation = url.searchParams.get("conversation"), after = url.searchParams.get("after") ?? "", locale = url.searchParams.get("locale") ?? "zh";
      if (!config.handoff) return json(200, { messages: [] });
      if (!conversationId(conversation) || after.length > 40) return json(400, { error: "INPUT_LIMIT" });
      try {
        const rows = (await config.handoff.messages(conversation, after)).filter(m => m.role === "owner");
        return json(200, { messages: rows.map(m => { const text = ownerLabel(locale) + m.text; return { id: m.id, created: m.created, text, signature: signer.sign(conversation, text) }; }) });
      } catch { return json(503, { error: "CLOUD_UNAVAILABLE" }); }
    }
    if (url.pathname === "/api/handoff" && req.method === "POST") {
      // A visitor asks for the owner in person, optionally leaving a way to reach them.
      // Only offered when the owner will actually be told.
      if (!config.notify) return json(404, { error: "NOT_FOUND" });
      const now = Date.now(); handoffs = handoffs.filter(t => t > now - 60000);
      if (handoffs.length >= 5) return json(429, { error: "RATE_LIMIT" });
      handoffs.push(now);
      try {
        const b = await readJson(req, 16384);
        const field = (v: unknown, max: number) => typeof v === "string" && v.length <= max ? neutralize(v.trim()) : undefined;
        const message = field(b?.message, 2000), name = field(b?.name, 80) ?? "", contact = field(b?.contact, 200) ?? "";
        if (!b || Object.keys(b).some(k => !["conversation", "message", "name", "contact"].includes(k)) || !conversationId(b.conversation) || !message) return json(400, { error: "INPUT_LIMIT" });
        const note = [name && "称呼/Name: " + name, contact && "联系方式/Contact: " + contact, message].filter(Boolean).join("\n");
        await config.handoff?.add(b.conversation, "visitor_note", note);
        const notified = await config.notify?.({ reason: contact ? "contact_left" : "asked_for_human", conversation: b.conversation, visitor: message, contact: [name, contact].filter(Boolean).join(" · ") }) ?? false;
        return json(200, { ok: true, notified });
      } catch (e) { return json(e instanceof Error && e.message === "INPUT_LIMIT" ? 400 : 503, { error: e instanceof Error && e.message === "INPUT_LIMIT" ? "INPUT_LIMIT" : "CLOUD_UNAVAILABLE" }); }
    }
    if (req.url !== "/api/chat" || req.method !== "POST") return json(404, { error: "NOT_FOUND" });
    if (config.mode !== "real" || !configured) return json(503, { error: "NOT_CONFIGURED" });
    if (!req.headers["content-type"]?.startsWith("application/json")) return json(415, { error: "INPUT_LIMIT" });
    const now = Date.now();
    if (day !== new Date(now).toISOString().slice(0, 10)) { day = new Date(now).toISOString().slice(0, 10); daily = 0; }
    attempts = attempts.filter(t => t > now - 60000);
    if (active >= policy.concurrent) return json(429, { error: "CONCURRENCY_LIMIT" });
    if (attempts.length >= policy.perMinute) return json(429, { error: "RATE_LIMIT" });
    if (daily >= policy.daily) return json(429, { error: "DAILY_LIMIT" });
    active++; attempts.push(now);
    const controller = new AbortController();
    let timeout = false, idle: ReturnType<typeof setTimeout> | undefined;
    const expire = () => { timeout = true; controller.abort(); };
    const timer = setTimeout(() => { expire(); if (!res.headersSent) json(408, { error: "TIMEOUT" }); if (!req.complete) req.destroy(); }, policy.timeoutMs);
    const cancel = () => controller.abort();
    res.on("close", cancel);
    const emit = (value: unknown) => { if (!res.destroyed) res.write(JSON.stringify(value) + "\n"); };
    let auditSavedAt=0;let auditId:string|undefined; let audit:Record<string,unknown>={};
    let notice:Parameters<NonNullable<Config["notify"]>>[0]|undefined;
    try {
      let raw = "", bytes = 0;
      req.setEncoding("utf8");
      for await (const chunk of req) { bytes += Buffer.byteLength(chunk); if (bytes > 65536) throw fail("INPUT_LIMIT"); raw += chunk.toString(); }
      let body; try { body = JSON.parse(raw); } catch { throw fail("INPUT_LIMIT"); }
      const received = validate(body);
      if(body.conversation !== undefined && (typeof body.conversation !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(body.conversation))) throw fail('INPUT_LIMIT');
      const conversation:string=body.conversation??'';
      const messages = trustHistory(received, conversation, signer.verify);
      if(config.audit){audit={input:messages,response:'',status:'running',model:config.model,selected:[],catalog:[],questionId:hash({conversation:body.conversation,messages})};auditId=await (config.auditStore??getStore()).startRun(audit,body.conversation??crypto.randomUUID());}
      daily++;
      const started=Date.now();
      let routing:Routing={intent:'project',mode:'direct',method:'disabled'};
      if(config.intentRouting!==false)routing=await classifyIntent(messages,config,fetcher,controller.signal,Math.min(4000,policy.idleMs));
      audit.routing=routing;
      if(routing.method==='model')audit.rounds=[{stage:'intent',model:routing.model,usage:routing.usage,durationMs:routing.durationMs}];
      if(routing.intent==='clarify'){
        if(controller.signal.aborted)throw fail('TIMEOUT');
        const text=clarificationReply(messages.at(-1)!.content,body.locale??'',body.conversation??'');
        const durationMs=Date.now()-started;
        Object.assign(audit,{response:text,status:'complete',responseKind:'preset',model:'local-preset',durationMs,usage:routing.usage});
        res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8'});
        emit({type:'snapshot',text});emit({type:'done',routing,responseKind:'preset',sources:[],model:'local-preset',durationMs,usage:routing.usage,finish:'stop',signature:signer.sign(conversation,text)});return;
      }
      const route=routePolicy()[routing.intent];
      let knowledge;
      // Fewer saved answers rather than a failed reply when the catalog would overflow the context.
      const includeCatalog=config.intentRouting===false||route.knowledge;
      try { let extra=includeCatalog?await savedDocuments():[];const base=loadDocuments();
        for(;;){try{knowledge=buildKnowledge(messages,policy.context,[...base,...extra],includeCatalog);break;}catch(e){if(!(e instanceof Error&&e.message==='CONTEXT_LIMIT')||!extra.length)throw e;extra=extra.slice(0,Math.floor(extra.length/2));}}
      } catch (error) { if (error instanceof Error && error.message === "CONTEXT_LIMIT") throw error; throw fail("KNOWLEDGE_UNAVAILABLE"); }
      const sources = [...knowledge.sources,publicContactUrl()];
      if (controller.signal.aborted) throw fail("TIMEOUT");
      Object.assign(audit,{selected:knowledge.selected,catalog:knowledge.catalog,system:knowledge.prompt});

      const toolEnabled=(config.intentRouting===false||route.knowledge)&&(config.toolsVerified ?? capability(config).available);
      const upstreamMessages:unknown[]=[{role:'system',content:knowledge.prompt+(config.intentRouting!==false?'\n本次回复路由：'+route.instruction+' 默认只写 2–4 句短句，先给结论；除非用户要求展开，不列长清单。个人事实必须以本次核心或工具正文为据，历史 assistant 回复可能有误，不能当新证据。资料未穷尽时不要说“只有一个”等排他结论。':'')+(!toolEnabled?'\n详细资料读取不可用。只能根据核心正文回答，不能把目录当作完整正文。':'')},...messages.map((m,i)=>i===messages.length-1?{...m,content:m.content+visitorReminder}:m)];
      // Instructions only, not knowledge: quoting published material is fine, dumping the rules is not.
      const coverage=leakCoverage([guardRules(),responseStyle(),knowledge.prompt.slice(0,knowledge.prompt.indexOf('\n\n以下 JSON')),route.instruction,visitorReminder].join('\n'));
      // Any overlap pauses streaming; the full reply is shown at the end unless it crosses the threshold.
      let guarded=false,held=false,shown='';
      const roundMetrics:unknown[]=(routing.method==='model'||routing.method==='fallback')?[{stage:'intent',model:routing.model,usage:routing.usage,durationMs:routing.durationMs}]:[];
      let text='',firstTokenMs:number|undefined,returnedModel=config.model,finish='';
      const activity=()=>{clearTimeout(idle);idle=setTimeout(expire,policy.idleMs);};
      try{for(let round=0;round<2;round++){
        if(controller.signal.aborted)throw fail('TIMEOUT');
        const thinking=routing.mode==='thinking';
        const budget=thinking?3072:config.intentRouting===false?policy.output:Math.min(policy.output,route.output);
        const firstBudget=thinking?1024:256;
        const payload={model:config.model,...providerOptions(config.baseUrl,routing.mode),messages:!round&&toolEnabled?upstreamMessages.map((m:any,i)=>i===0?{...m,content:m.content+'\n当前只做资料选择，不写面向访客的回答或过程说明。需要资料就调用 read_knowledge；无需资料只输出 READY。下一阶段再回答访客。'}:m):upstreamMessages,stream:true,stream_options:{include_usage:true},max_tokens:round?Math.max(1,budget-firstBudget):toolEnabled?Math.min(firstBudget,budget):budget,...(!round&&toolEnabled?{tools:[readKnowledgeTool],tool_choice:['work','project','contact'].includes(routing.intent)&&config.intentRouting!==false?{type:'function',function:{name:'read_knowledge'}}:'auto'}:{})};
        // Count full serialized request, including tools/results: never silently remove core data.
        if(JSON.stringify(payload).length>policy.context)throw fail('CONTEXT_LIMIT');
        activity();
        const upstream=await fetcher(config.baseUrl.replace(/\/$/,'')+'/chat/completions',{method:'POST',redirect:'error',signal:controller.signal,headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const prefix=text;
        const deliver=(part:string)=>{
          firstTokenMs??=Date.now()-started;text=prefix+part;
          const safeText=cleanSourceLinks(text,sources);
          audit.response=safeText;
          const overlap=coverage(text);
          if(overlap>=leakThreshold)throw fail('GUARDED');
          shown=safeText;if(overlap){held=true;return;}
          if(auditId&&!config.auditStore&&Date.now()-auditSavedAt>1000){getStore().finishRun(auditId,audit);auditSavedAt=Date.now();}
          if(!res.headersSent)res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','X-Accel-Buffering':'no'});
          emit({type:'snapshot',text:safeText});
        };
        const r=await readCompletion(upstream,controller.signal,part=>{if(round||!toolEnabled)deliver(part);},activity);

        returnedModel=r.model||config.model;finish=r.finish;roundMetrics.push({stage:'answer',model:returnedModel,usage:r.usage});audit.rounds=roundMetrics;
        if(!r.calls.length){if(!round&&toolEnabled)continue;break;}
        if(round||!toolEnabled)throw fail('INVALID_TOOL_CALL');
        const call=r.calls[0],selected=readKnowledge(call.function.arguments,knowledge.documents);
        knowledge.selected.push(...selected);sources.push(...selected.flatMap(d=>d.urls));audit.selected=knowledge.selected;
        upstreamMessages.push({role:'assistant',content:r.text||null,...(r.reasoning?{reasoning_content:r.reasoning}:{}),tool_calls:r.calls},{role:'tool',tool_call_id:call.id,content:JSON.stringify(selected)});
      }}catch(e){if(!(e instanceof Error&&e.message==='GUARDED'))throw e;guarded=true;}
      if(guarded){
        // Replace, never append: the client renders the latest snapshot as the whole reply.
        shown=text=guardedReply(body.locale??'',messages.at(-1)!.content);controller.abort();
        if(!res.headersSent)res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8'});
        emit({type:'snapshot',text});
        Object.assign(audit,{responseKind:'guarded',guardedPartial:audit.response,response:text});
      } else if(held)emit({type:'snapshot',text:shown});
      const rows=roundMetrics as {usage?:Record<string,number>}[];
      const usage=rows.every(r=>r.usage&&['prompt_tokens','completion_tokens','total_tokens'].every(k=>typeof r.usage![k]==='number'))?Object.fromEntries(['prompt_tokens','completion_tokens','total_tokens'].map(k=>[k,rows.reduce((n,r)=>n+r.usage![k],0)])):undefined;
      emit({type:'done',routing,...(guarded?{responseKind:'guarded'}:{}),sources:guarded?[]:[...new Set(sources.filter(s=>text.includes(s)))],model:returnedModel,requestedModel:config.model,durationMs:Date.now()-started,firstTokenMs,usage,rounds:roundMetrics,finish:guarded?'stop':finish,signature:signer.sign(conversation,shown)});
      const reason=!guarded&&config.notify?notifyReason(routing.intent,messages.at(-1)!.content,shown):undefined;
      if(reason){notice={reason,conversation,visitor:messages.at(-1)!.content,assistant:shown};audit.notified=reason;}
      audit.status='complete';audit.usage=usage;audit.durationMs=Date.now()-started;audit.firstTokenMs=firstTokenMs;audit.model=returnedModel;
      // End after the final audit write in finally.
    } catch (e) {
      const known = ["DAILY_LIMIT","RATE_LIMIT","CONCURRENCY_LIMIT","CLOUD_UNAVAILABLE","INPUT_LIMIT", "INTENT_FAILED", "CONTEXT_LIMIT", "CORE_LIMIT", "INVALID_TOOL_CALL", "KNOWLEDGE_UNAVAILABLE", "TIMEOUT", "AUTH_FAILED", "QUOTA_EXCEEDED", "UPSTREAM_RATE", "UPSTREAM_FAILED", "STREAM_INTERRUPTED", "OUTPUT_LIMIT"];
      const message = e instanceof Error ? e.message : "";
      const error = timeout ? "TIMEOUT" : known.includes(message) ? message : "STREAM_INTERRUPTED";
      audit.durationMs=Date.now()-now;
      audit.status=controller.signal.aborted&&!timeout?"stopped":"error";audit.error=error;
      if (!res.destroyed && !res.writableEnded) { if (res.headersSent) { emit({ type: "error", error }); res.end(); } else json(["DAILY_LIMIT","RATE_LIMIT","CONCURRENCY_LIMIT"].includes(error)?429:error.endsWith("LIMIT") ? 400 : 502, { error }); }
    } finally { if(notice&&conversationId(notice.conversation)) { try { await config.notify!(notice); } catch { /* A failed notice never affects the visitor. */ } } if(auditId) { try { await (config.auditStore??getStore()).finishRun(auditId,audit); } catch { /* Never log conversation or credentials on a storage error. */ } } clearTimeout(timer); clearTimeout(idle); controller.abort(); res.off("close", cancel); active--; if(!res.writableEnded&&!res.destroyed)res.end(); }
  };
}
