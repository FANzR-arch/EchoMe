/** "试一试": the owner's own test chat. Answers from the local draft knowledge, recorded as 我的测试. */
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ErrorPrimitive,
  AuiIf,
  useAuiState,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { ArrowUp, Square, Check, PencilLine, RotateCcw, X, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { MarkdownText } from "@/components/markdown-text";
import { usePreferences } from "@/lib/preferences";
import { realAdapter, useModelState, type ModelState } from "@/lib/model";
import { mockAdapter } from "@/lib/mock";
import { activeRules } from "@/lib/data";
import { ownerName as N } from "@/lib/owner";
import { workbench, ownerTestPrefix, type Run } from "@/lib/workbench";
import { useWorkbench } from "./store";
import { CorrectionDialog, type CorrectionTarget } from "./correction";
type Actions = { conversation: string; correct: (target: CorrectionTarget) => void; findRun: (answer: string) => Run | undefined };
const ActionsContext = createContext<Actions>(null!);
const newId = () => ownerTestPrefix + crypto.randomUUID();
export function TestChat({ onClose }: { onClose: () => void }) {
  const { t } = usePreferences(),
    model = useModelState(),
    { state, refresh } = useWorkbench();
  const [conversation, setConversation] = useState(newId),
    [target, setTarget] = useState<CorrectionTarget>();
  const runs = useRef<Run[]>([]);
  runs.current = state?.runs ?? [];
  const actions = useMemo<Actions>(
    () => ({
      conversation,
      correct: setTarget,
      findRun: (answer) => {
        const mine = runs.current.filter((r) => r.conversation === conversation);
        return mine.find((r) => r.response?.trim() === answer.trim()) ?? mine[0];
      },
    }),
    [conversation],
  );
  return (
    <section className="tc" aria-labelledby="tc-title">
      <header className="tc-head">
        <div>
          <h2 id="tc-title">{t("试一试", "Try it")}</h2>
          <p>
            {model.mode === "real"
              ? t("用你现在的资料回答，包括还没发布的改动。", "Answers from your current knowledge, including unpublished changes.")
              : model.mode === "loading"
                ? t("正在连接…", "Connecting…")
                : t("还没连接模型：现在是模拟回答。", "No model connected: answers are simulated.")}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={t("新的测试对话", "New test chat")} title={t("新的测试对话", "New test chat")} onClick={() => setConversation(newId())}>
          <RotateCcw />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={t("收起试一试", "Close Try it")} title={t("收起", "Close")} onClick={onClose}>
          <X />
        </Button>
      </header>
      {model.mode === "loading" ? (
        <p className="tc-status" role="status">
          {t("正在读取模型设置…", "Loading model settings…")}
        </p>
      ) : (
        <ActionsContext.Provider value={actions}>
          <Thread key={conversation + model.mode} conversation={conversation} mode={model.mode} onDone={() => void refresh().catch(() => {})} />
        </ActionsContext.Provider>
      )}
      <CorrectionDialog target={target} onClose={() => setTarget(undefined)} />
    </section>
  );
}
function Thread({ conversation, mode, onDone }: { conversation: string; mode: ModelState["mode"]; onDone: () => void }) {
  const { t, locale } = usePreferences();
  const current = useRef(locale);
  current.current = locale;
  const adapter = useMemo<ChatModelAdapter>(
    () =>
      mode === "real"
        ? realAdapter(() => current.current, conversation)
        : mode === "mock"
          ? mockAdapter({ locale: () => current.current, scenario: () => "normal", rules: () => activeRules() })
          : { async *run() { throw new Error("本机模型服务不可用。Local model service unavailable."); } },
    [conversation, mode],
  );
  const runtime = useLocalRuntime(adapter);
  // Refresh the workspace after each answer, so the recorded run appears in 对话 and can be corrected.
  useEffect(() => {
    let running = false;
    return runtime.thread.subscribe(() => {
      const now = runtime.thread.getState().isRunning;
      if (running && !now) onDone();
      running = now;
    });
  }, [runtime]);
  const prompts = [t(`介绍一下${N.zh}`, `Tell me about ${N.en}`), t("有哪些代表作品？", "What are the main projects?"), t(`怎么联系${N.zh}合作？`, `How can I work with ${N.en}?`)];
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="tc-thread">
        <ThreadPrimitive.Viewport className="tc-viewport">
          <AuiIf condition={(s) => s.thread.messages.length === 0}>
            <div className="tc-empty">
              <p>{t("像访客一样问它一个问题，看看它怎么回答。答得不对，就地纠正。", "Ask it something a visitor would. If the answer is wrong, correct it right here.")}</p>
              <div className="tc-suggestions">
                {prompts.map((prompt) => (
                  <ThreadPrimitive.Suggestion key={prompt} prompt={prompt} send className="tc-suggestion">
                    {prompt}
                  </ThreadPrimitive.Suggestion>
                ))}
              </div>
            </div>
          </AuiIf>
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        </ThreadPrimitive.Viewport>
        <ComposerPrimitive.Root className="tc-composer">
          <ComposerPrimitive.Input
            rows={2}
            maxLength={2000}
            aria-label={t("测试问题", "Test question")}
            placeholder={t("问一个访客可能会问的问题…", "Ask what a visitor might ask…")}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) e.stopPropagation();
            }}
          />
          <AuiIf condition={(s) => !s.thread.isRunning}>
            <ComposerPrimitive.Send aria-label={t("发送测试问题", "Send test question")} className="tc-send">
              <ArrowUp size={17} />
            </ComposerPrimitive.Send>
          </AuiIf>
          <AuiIf condition={(s) => s.thread.isRunning}>
            <ComposerPrimitive.Cancel aria-label={t("停止生成", "Stop generating")} className="tc-send">
              <Square size={14} />
            </ComposerPrimitive.Cancel>
          </AuiIf>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
function UserMessage() {
  return (
    <MessagePrimitive.Root className="tc-user" data-testid="test-user-message">
      <MessagePrimitive.Parts />
    </MessagePrimitive.Root>
  );
}
const textOf = (m: { content: readonly { type: string; text?: string }[] }) => m.content.filter((p) => p.type === "text").map((p) => p.text ?? "").join("");
function AssistantMessage() {
  const { t } = usePreferences(),
    actions = useContext(ActionsContext);
  const message = useAuiState((s) => s.message);
  const messages = useAuiState((s) => s.thread.messages);
  const [good, setGood] = useState(false);
  const index = messages.findIndex((m) => m.id === message.id);
  const previous = index > 0 ? messages[index - 1] : undefined;
  const question = previous?.role === "user" ? textOf(previous) : "";
  const answer = textOf(message);
  const sources = ((message.metadata.custom?.sources as string[] | undefined) ?? []).filter((s) => /^https:\/\//.test(s));
  const done = message.status?.type !== "running";
  return (
    <MessagePrimitive.Root className="tc-assistant" data-testid="test-assistant-message">
      <div className="tc-answer">
        <MessagePrimitive.Parts components={{ Text: MarkdownText }} />
      </div>
      <AuiIf condition={(s) => s.message.status?.type === "running"}>
        <span className="tc-working" role="status">
          {t("正在回答…", "Answering…")}
        </span>
      </AuiIf>
      <MessagePrimitive.Error>
        <ErrorPrimitive.Root className="tc-error">
          <ErrorPrimitive.Message />
        </ErrorPrimitive.Root>
      </MessagePrimitive.Error>
      {sources.length > 0 && (
        <div className="tc-sources">
          <span>{t("用到的来源", "Sources used")}</span>
          {sources.map((s) => (
            <a key={s} href={s} target="_blank" rel="noopener noreferrer">
              {new URL(s).pathname.replace(/\/$/, "") || new URL(s).hostname}
              <ArrowUpRight size={12} />
            </a>
          ))}
        </div>
      )}
      {done && answer.trim() && (
        <div className="tc-actions">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={good}
            onClick={() => {
              setGood(true);
              const run = actions.findRun(answer);
              if (run) void workbench("review", { id: run.id, note: run.review.note ?? "", corrected: run.review.corrected ?? "", reviewed: true }).catch(() => {});
              toast.success(t("好的，记下这个回答没问题。", "Noted: this answer is right."));
            }}
          >
            <Check />
            {t("对", "Right")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const run = actions.findRun(answer);
              actions.correct({ question, answer, runId: run?.id, origin: "local", sources: run?.selected?.map((s) => s.title) });
            }}
          >
            <PencilLine />
            {t("纠正这个回答", "Correct this answer")}
          </Button>
        </div>
      )}
    </MessagePrimitive.Root>
  );
}
