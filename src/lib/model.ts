import { useEffect, useState } from "react";
import type { ChatModelAdapter } from "@assistant-ui/react";
import type { Locale } from "./data";
export type ModelState = { mode: "real" | "mock" | "unavailable" | "loading"; configured?: boolean; model?: string; handoff?: boolean; contact?: boolean };
export function useModelState() {
  const [state, setState] = useState<ModelState>({ mode: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    fetch("/api/config", { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error();
      const data = await r.json();
      if (!["real", "mock"].includes(data.mode)) throw new Error();
      setState(data);
    }).catch(() => setState({ mode: "unavailable" })).finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, []);
  return state;
}
const errors: Record<string, [string, string]> = {
  OUTPUT_LIMIT: ["本次思考达到额度上限，请缩小问题范围后重试。", "This response reached its budget. Narrow the question and retry."],
  INTENT_FAILED: ["这次没能理解你的问题，请重试或换个说法。", "I could not interpret the question this time. Please retry or rephrase."],
  CORE_LIMIT: ["有效核心资料超过 4,000 字符，请在工作台精简。", "Active core knowledge exceeds 4,000 characters. Edit it in the workspace."],
  INVALID_TOOL_CALL: ["模型申请读取的资料无效或超出限制，本次回答已停止。", "The model requested invalid or excessive knowledge access. This response was stopped."],
  KNOWLEDGE_UNAVAILABLE: ["本机资料未准备好，请运行资料检查命令。", "Local knowledge is unavailable. Run the knowledge check command."],
  NOT_CONFIGURED: ["真实模式尚未配置。请在本机填写服务端环境变量并重启。", "Real mode is not configured. Set server environment variables and restart."],
  AUTH_FAILED: ["模型认证失败，请检查本机 API 密钥。", "Model authentication failed. Check the local API key."],
  QUOTA_EXCEEDED: ["服务商余额或额度不足。", "Provider balance or quota exhausted."],
  UPSTREAM_RATE: ["服务商限流，请稍后重试。", "Provider rate limit reached. Try later."],
  RATE_LIMIT: ["请求过于频繁，请一分钟后重试。", "Too many requests. Try again in a minute."],
  CONCURRENCY_LIMIT: ["正在处理其他请求，请稍后重试。", "Other requests are running. Try later."],
  DAILY_LIMIT: ["本机每日测试额度已达上限。", "Local daily test limit reached."],
  INPUT_LIMIT: ["输入过长或格式无效，请缩短到 2,000 字以内。", "Invalid or oversized input. Keep messages within 2,000 characters."],
  CONTEXT_LIMIT: ["对话上下文已达上限，请新建对话。", "Context limit reached. Start a new chat."],
  TIMEOUT: ["回答超时，已保留收到的内容，可重试。", "Response timed out. Received text is preserved; you can retry."],
  STREAM_INTERRUPTED: ["连接中断，已保留收到的内容，可重试。", "Connection interrupted. Received text is preserved; you can retry."],
};
export function realAdapter(locale: () => Locale, conversation?: string): ChatModelAdapter {
  return { async *run({ messages, abortSignal }) {
    const error = (code: string) => new Error((errors[code] ?? ["模型请求失败，请检查服务端配置后重试。", "Model request failed. Check server configuration and retry."])[locale() === "en" ? 1 : 0]);
    let text = "", buffer = "", completed = false;
    // Assistant turns carry the server signature back; unsigned ones are replaced server-side.
    const context = messages.filter(m => m.role !== "system").map(m => { const sig = m.role === "assistant" ? m.metadata?.custom?.sig : undefined; return { role: m.role, content: m.content.filter(p => p.type === "text").map(p => p.text).join(""), ...(typeof sig === "string" ? { sig } : {}) }; }).filter(m => m.content.trim());
    yield { content: [{ type: "text", text: "" }], metadata: { custom: { mode: "real" } } };
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch("/api/chat", { method: "POST", signal: abortSignal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: context, locale: locale(), conversation }) });
      if (!response.ok) throw error((await response.json().catch(() => ({}))).error);
      if (!response.body) throw error("STREAM_INTERRUPTED");
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        let index;
        while ((index = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.type === "error") throw error(event.error);
          if (event.type === "snapshot") { text = event.text; yield { content: [{ type: "text", text }], metadata: { custom: { mode: "real" } } }; }
          if (event.type === "done") {
            completed = true;
            yield { content: [{ type: "text", text }], metadata: { custom: { mode: "real", sig: typeof event.signature === "string" ? event.signature : undefined, sources: event.sources, metrics: { model: event.model, requestedModel: event.requestedModel, durationMs: event.durationMs, firstTokenMs: event.firstTokenMs, usage: event.usage, finish: event.finish, routing:event.routing,responseKind:event.responseKind } } } };
            // Final at "done": don't wait while the server finishes owner notices before closing.
            return;
          }
        }
        if (done) break;
      }
      if (!completed) throw error("STREAM_INTERRUPTED");
    } catch (e) {
      if (abortSignal.aborted) throw new DOMException("Cancelled", "AbortError");
      const failure = e instanceof TypeError || !(e instanceof Error) ? error("STREAM_INTERRUPTED") : e;
      yield { content: [{ type: "text", text }], metadata: { custom: { mode: "real" } }, status: { type: "incomplete", reason: "error", error: { message: failure.message } } };
    } finally { await reader?.cancel().catch(() => {}); }
  } };
}
