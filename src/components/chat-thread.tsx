import { MarkdownText } from "./markdown-text";
/** Adapted from assistant-ui MIT minimal thread template; see THIRD_PARTY_NOTICES.md. */
import { useEffect, useMemo, useRef } from "react";
import { portfolio, immersive, registerPersistence, readSession, writeSession, useHost, tellHost } from "@/lib/host-bridge";
import { HostGreeting } from "./host-greeting";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
  ErrorPrimitive,
  AuiIf,
  useAuiState,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import {
  ArrowUp,
  Square,
  Copy,
  Check,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  ArrowDown,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "./ui/button";
import { usePreferences } from "@/lib/preferences";
import { mockAdapter } from "@/lib/mock";
import { realAdapter, type ModelState } from "@/lib/model";
import { owner, ownerName as N, siteOrigin, sameUrl } from "@/lib/owner";
import {
  event,
  getData,
  safeUrl,
  saveMessages,
  getStorageError,
  updateData,
  useData,
  type Conversation,
  type Rules,
  type Scenario,
  type SavedMessage,
} from "@/lib/data";
import { createContext, useContext } from "react";
const ConversationContext = createContext<string | undefined>(undefined);
export function ChatRuntime({
  conversation,
  scenario,
  draft,
  modelState = { mode: "mock" },
}: {
  conversation?: Conversation;
  scenario: Scenario;
  draft?: Rules;
  modelState?: ModelState;
}) {
  const { locale } = usePreferences();
  const options = useRef({ locale, scenario, draft });
  options.current = { locale, scenario, draft };
  const adapter = useMemo(
    () =>
      !draft && modelState.mode === "real" ? realAdapter(() => options.current.locale, conversation?.id) : !draft && modelState.mode !== "mock" ? { async *run() { throw new Error("本机模型服务不可用。Local model service unavailable."); } } : mockAdapter({
        conversation: conversation?.id,
        locale: () => options.current.locale,
        scenario: () => options.current.scenario,
        ...(draft ? { rules: () => options.current.draft! } : {}),
      }),
    [conversation?.id, !!draft, modelState.mode],
  );
  const initialMessages = useMemo<ThreadMessageLike[]>(
    () =>
      (conversation ? (((readSession(conversation.id).savedAt ?? 0) > Date.parse(conversation.updated) ? readSession(conversation.id).messages : undefined) ?? conversation.messages) : undefined)?.map((m) => ({
        id: m.id,
        role: m.role,
        content: [{ type: "text", text: m.text }],
        createdAt: new Date(m.time),
        ...(m.role === "assistant"
          ? {
              status:
                m.state === "stopped"
                  ? {
                      type: "incomplete" as const,
                      reason: "cancelled" as const,
                    }
                  : m.state === "error"
                    ? {
                        type: "incomplete" as const,
                        reason: "error" as const,
                        error: m.error ?? "AI request failed",
                      }
                    : { type: "complete" as const, reason: "stop" as const },
              metadata: { custom: { sources: m.sources ?? [], mode: m.mode ?? "mock", metrics: m.metrics, sig: m.sig } },
            }
          : {}),
      })) ?? [],
    [conversation?.id],
  );
  const runtime = useLocalRuntime(adapter, { initialMessages });
  // Report activity only, never messages, through the validated portfolio bridge.
  useEffect(() => {
    if (!portfolio) return;
    let previous: boolean | undefined;
    const publish = () => {
      const responding = runtime.thread.getState().isRunning;
      if (responding === previous) return;
      previous = responding;
      tellHost({ type: "pai:activity", responding });
    };
    publish();
    const unsubscribe = runtime.thread.subscribe(publish);
    return () => { unsubscribe(); tellHost({ type: "pai:activity", responding: false }); };
  }, [runtime]);
  useEffect(() => {
    if (!conversation) return () => runtime.thread.cancelRun();
    let timer: ReturnType<typeof setTimeout> | undefined,
      last = "";
    runtime.thread.composer.setText(readSession(conversation.id).draft ?? "");
    const save = () => {
      timer = undefined;
      const messages: SavedMessage[] = runtime.thread
        .getState()
        .messages.filter((m) => m.role !== "system")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          text: m.content
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join(""),
          time: m.createdAt.toISOString(),
          state:
            m.role === "assistant"
              ? m.status.type === "complete"
                ? "complete"
                : m.status.type === "incomplete" && m.status.reason === "error"
                  ? "error"
                  : "stopped"
              : undefined,
          sources: (m.metadata.custom?.sources as string[] | undefined) ?? [],
          mode: (m.metadata.custom?.mode as "real" | "mock" | undefined) ?? "mock",
          metrics: m.metadata.custom?.metrics as SavedMessage["metrics"],
          sig: m.metadata.custom?.sig as string | undefined,
          error:
            m.role === "assistant" &&
            m.status.type === "incomplete" &&
            m.status.reason === "error"
              ? typeof m.status.error === "object" &&
                m.status.error !== null &&
                "message" in m.status.error
                ? String(m.status.error.message)
                : String(m.status.error ?? "AI request failed")
              : undefined,
        }));
      writeSession(conversation.id, { messages, savedAt: Date.now(), draft: runtime.thread.composer.getState().text });
      const serialized = JSON.stringify(messages);
      if (last !== serialized) {
        last = serialized;
        return saveMessages(conversation.id, messages);
      }
    };
    const saveDraft = () => { writeSession(conversation.id, { draft: runtime.thread.composer.getState().text }); };
    const unsubDraft = runtime.thread.composer.subscribe(saveDraft);
    const unregister = registerPersistence(async () => {
      await runtime.thread.cancelRun();
      clearTimeout(timer);
      await save();
      // updateData serializes writes; wait for any pending save before acknowledging.
      await updateData(() => {});
      return !getStorageError();
    });
    const leaving = () => { runtime.thread.cancelRun(); void save(); saveDraft(); };
    window.addEventListener("pagehide", leaving);
    const unsub = runtime.thread.subscribe(() => {
      if (!runtime.thread.getState().isRunning) {
        clearTimeout(timer);
        save();
      } else if (!timer) timer = setTimeout(save, 180);
    });
    return () => {
      runtime.thread.cancelRun();
      clearTimeout(timer);
      save();
      unsub();
      unsubDraft();
      unregister();
      window.removeEventListener("pagehide", leaving);
    };
  }, [runtime, conversation?.id]);
  return (
    <ConversationContext.Provider value={conversation?.id}>
      <AssistantRuntimeProvider runtime={runtime}>
        <ChatThread mode={draft ? "mock" : modelState.mode} />
      </AssistantRuntimeProvider>
    </ConversationContext.Provider>
  );
}
function ChatThread({ mode }: { mode: ModelState["mode"] }) {
  const { t } = usePreferences();
  const id = useContext(ConversationContext);
  return (
    <ThreadPrimitive.Root className="chat-thread">
      <ThreadPrimitive.Viewport className="thread-viewport">
        <div className="thread-body">
          {immersive && id && <HostGreeting id={id} />}
          {portfolio && !immersive && <AuiIf condition={(s) => s.thread.messages.length === 0}><div className="panel-welcome"><h1>{t("想聊些什么？", "What would you like to discuss?")}</h1></div></AuiIf>}{!portfolio && <AuiIf condition={(s) => s.thread.messages.length === 0}>
            <div className="chat-welcome">
              <p className="eyebrow">A CONVERSATION, A CONNECTION</p>
              <h1>
                {t("从一句你好，", "A little conversation.")}
                <br />
                <em>{t("开始了解我。", "A closer connection.")}</em>
              </h1>
              <p>
                {t(
                  "关于作品、设计，或一个还没成形的想法。\n让我的 AI 助手陪你聊聊。",
                  `Work, design, or an idea still taking shape.\nMeet ${N.en} through this AI assistant.`,
                )}
              </p>
              <div className="suggestions">
                {[
                  [
                    t(`认识${N.zh}`, `Meet ${N.en}`),
                    t(`介绍一下${N.zh}`, `Tell me about ${N.en}`),
                  ],
                  [
                    t(`看看${N.zh}的作品`, "Explore the work"),
                    t("有哪些代表作品？", `What has ${N.en} worked on?`),
                  ],
                  [
                    t("聊聊合作", "Start a collaboration"),
                    t(
                      `怎么联系${N.zh}合作？`,
                      `How can I collaborate with ${N.en}?`,
                    ),
                  ],
                ].map(([label, prompt]) => (
                  <ThreadPrimitive.Suggestion
                    key={prompt}
                    prompt={prompt}
                    send
                    className="suggestion"
                  >
                    {label}
                    <ArrowUpRight size={15} />
                  </ThreadPrimitive.Suggestion>
                ))}
              </div>
            </div>
          </AuiIf>}
          <div className="message-list">
            <ThreadPrimitive.Messages
              components={{ UserMessage, AssistantMessage }}
            />
          </div>
        </div>
      </ThreadPrimitive.Viewport>
      <div className="composer-area">
        <ThreadPrimitive.ScrollToBottom
          className="scroll-bottom"
          aria-label={t("回到底部", "Scroll to bottom")}
        >
          <ArrowDown size={16} />
        </ThreadPrimitive.ScrollToBottom>
        <ComposerPrimitive.Root className="composer">
          <ComposerPrimitive.Input
            rows={2}
            maxLength={2000}
            aria-label={t("输入消息", "Message input")}
            placeholder={t("想了解什么？", "What would you like to know?")}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229)
                e.stopPropagation();
            }}
          />
          <div className="composer-bottom">
<AuiIf condition={(s) => !s.thread.isRunning}>
              <ComposerPrimitive.Send
                aria-label={t("发送消息", "Send message")}
                className="send-button"
              >
                <ArrowUp size={19} />
              </ComposerPrimitive.Send>
            </AuiIf>
            <AuiIf condition={(s) => s.thread.isRunning}>
              <ComposerPrimitive.Cancel
                aria-label={t("停止生成", "Stop generating")}
                className="send-button"
              >
                <Square size={15} />
              </ComposerPrimitive.Cancel>
            </AuiIf>
          </div>
        </ComposerPrimitive.Root>
</div>
    </ThreadPrimitive.Root>
  );
}
function UserMessage() {
  return (
    <MessagePrimitive.Root className="user-message" data-testid="user-message">
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}
function AssistantMessage() {
  const { t } = usePreferences(),
    id = useContext(ConversationContext),
    data = useData();
  const host = useHost();
  const message = useAuiState((s) => s.message);
  const sources =
    (message.metadata.custom?.sources as string[] | undefined) ?? [];
  const feedback = data.conversations.find((c) => c.id === id)?.feedback[
    message.id
  ];
  const setFeedback = (kind: "good" | "bad") => {
    if (!id) return;
    void updateData((d) => {
      const c = d.conversations.find((c) => c.id === id);
      if (c) c.feedback[message.id] = kind;
    });
    void event("feedback", id, kind);
  };
  return (
    <MessagePrimitive.Root
      className="assistant-message"
      data-testid="assistant-message"
    >
      <div className="assistant-label">
        <span className="mini-mark">{N.en.slice(0, 1).toUpperCase()}</span> {N.en.toUpperCase()}’S AI
        <span>{message.metadata.custom?.mode === "real" ? t(" · AI 生成", " · AI generated") : t(" · 模拟回答", " · Simulated")}</span>
      </div>
      <div className="message-text">
        <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
      </div>
      <AuiIf condition={(s) => s.message.status?.type === "running"}>
        <span className="working" role="status">
          {t("正在整理回答…", "Composing…")}
        </span>
      </AuiIf>
      <MessagePrimitive.Error>
        <ErrorPrimitive.Root className="error-message">
          <ErrorPrimitive.Message />
        </ErrorPrimitive.Root>
      </MessagePrimitive.Error>
      {sources.length > 0 && (
        <div className="source-links">
          {sources
            .filter((s) => safeUrl(s))
            .map((s) => (
              <a
                key={s}
                href={safeUrl(s)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  if (id) void event("source-click", id, s);
                  const path = new URL(s).pathname;
                  const link = portfolio && new URL(s).origin === siteOrigin ? host.links.find(l => l.path.replace(/^\/en(?=\/)/, "") === path) : undefined;
                  if (link && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) { e.preventDefault(); tellHost({ type:"pai:navigate", path:link.path }); }
                }}
              >
                {sameUrl(s, owner.contact.url) ? t(owner.contact.label.zh, owner.contact.label.en) : s.endsWith("projects")
                  ? t("作品档案", "Projects")
                  : t("文章与想法", "Writing")}
                <ArrowUpRight size={13} />
              </a>
            ))}
        </div>
      )}
      {portfolio && message.status?.type === "incomplete" && message.status.reason !== "error" && <p className="host-stopped">{t("回答已暂停，可以继续提问。", "Response paused. You can continue the conversation.")}</p>}
      {!!message.metadata.custom?.metrics && (message.metadata.custom.metrics as SavedMessage["metrics"])?.finish === "length" && <p className="host-stopped">{t("已达到本次输出上限，可继续追问。", "Output limit reached. You can ask a follow-up.")}</p>}
      <ActionBarPrimitive.Root hideWhenRunning className="message-actions">
        <ActionBarPrimitive.Copy aria-label={t("复制回答", "Copy response")}>
          {message.isCopied ? <Check size={14} /> : <Copy size={14} />}{portfolio && <span>{message.isCopied ? t("已复制", "Copied") : t("复制", "Copy")}</span>}
        </ActionBarPrimitive.Copy>
        <ActionBarPrimitive.Reload aria-label={t("重试回答", "Retry response")}>
          <RefreshCw size={14} />{portfolio && <span>{t("重试", "Retry")}</span>}
        </ActionBarPrimitive.Reload>
        {id && (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("有帮助", "Helpful")}
              title={t("有帮助", "Helpful")}
              aria-pressed={feedback === "good"}
              onClick={() => setFeedback("good")}
            >
              <ThumbsUp size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("有问题", "Needs correction")}
              title={t("有问题", "Needs correction")}
              aria-pressed={feedback === "bad"}
              onClick={() => setFeedback("bad")}
            >
              <ThumbsDown size={14} />
            </Button>
          </>
        )}
      </ActionBarPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

