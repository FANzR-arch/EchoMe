/** 对话: one inbox for this computer's and the online conversations, with a correction on every answer. */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, PencilLine, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeading } from "@/components/shared";
import { usePreferences } from "@/lib/preferences";
import { workbench, questionOf, isOwnerTest, needsOwner } from "@/lib/workbench";
import { useWorkbench, useAction, type Item, type Origin } from "@/components/admin/store";
import { CorrectionDialog, type CorrectionTarget } from "@/components/admin/correction";
import { ConfirmButton, Hint } from "@/components/admin/ui";
import { when } from "@/components/admin/labels";
import { MarkdownText } from "@/components/markdown-text";
type Thread = { key: string; conversation: string; origin: Origin; runs: Item[]; test: boolean; updated: string; flagged: boolean };
type Filter = "visitor" | "test" | "all";
const statusText = (r: Item, t: (zh: string, en: string) => string) =>
  r.status === "complete" ? "" : r.status === "running" ? t("回答中断或仍在进行", "Interrupted or still running") : t("这次没有答完", "This answer did not finish") + (r.error ? ` (${r.error})` : "");
export default function ConversationsPage() {
  const { t, locale } = usePreferences(),
    { state, cloud, runs, error, loadMoreCloud, cloudOffset } = useWorkbench(),
    { busy, error: actionError, run } = useAction();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(""),
    [target, setTarget] = useState<CorrectionTarget>();
  const filter = (["visitor", "test", "all"].includes(params.get("filter") ?? "") ? params.get("filter") : "all") as Filter;
  const threads = useMemo<Thread[]>(() => {
    const map = new Map<string, Thread>();
    for (const r of runs) {
      const key = r.origin + ":" + r.conversation;
      const thread = map.get(key) ?? { key, conversation: r.conversation, origin: r.origin, runs: [], test: isOwnerTest(r.conversation), updated: r.created, flagged: false };
      thread.runs.push(r);
      if (r.created > thread.updated) thread.updated = r.created;
      if (needsOwner(r)) thread.flagged = true;
      map.set(key, thread);
    }
    for (const thread of map.values()) thread.runs.sort((a, b) => a.created.localeCompare(b.created));
    return [...map.values()].sort((a, b) => b.updated.localeCompare(a.updated));
  }, [runs]);
  const visible = threads.filter((c) => (filter === "all" || (filter === "test") === c.test) && (!query.trim() || c.runs.some((r) => (questionOf(r) + "\n" + (r.response ?? "")).toLowerCase().includes(query.trim().toLowerCase()))));
  const selectedKey = params.get("c") ? (params.get("o") === "cloud" ? "cloud" : "local") + ":" + params.get("c") : "";
  const selected = threads.find((c) => c.key === selectedKey);
  const select = (c?: Thread) => {
    const next = new URLSearchParams(params);
    if (c) {
      next.set("c", c.conversation);
      if (c.origin === "cloud") next.set("o", "cloud");
      else next.delete("o");
    } else {
      next.delete("c");
      next.delete("o");
    }
    setParams(next);
  };
  const setFilter = (value: Filter) => {
    const next = new URLSearchParams(params);
    next.set("filter", value);
    setParams(next, { replace: true });
  };
  const heading = <PageHeading eyebrow="CONVERSATIONS" title={t("对话", "Conversations")} description={t("访客和你自己的测试对话都在这里。答得不对的，点「纠正这个回答」。", "Visitor and test conversations in one place. When an answer is wrong, correct it.")} />;
  if (!state)
    return (
      <>
        {heading}
        <p role={error ? "alert" : "status"}>{error || t("正在读取…", "Loading…")}</p>
      </>
    );
  return (
    <>
      {heading}
      <div className="adm-split" data-detail={!!selected}>
        <aside className="adm-list-pane">
          <div className="adm-filter" role="group" aria-label={t("显示哪些对话", "Which conversations")}>
            {(
              [
                ["visitor", "访客", "Visitors"],
                ["test", "我的测试", "My tests"],
                ["all", "全部", "All"],
              ] as const
            ).map(([value, zh, en]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {t(zh, en)}
              </button>
            ))}
          </div>
          <Input type="search" aria-label={t("搜索对话", "Search conversations")} placeholder={t("搜索问题或回答", "Search questions or answers")} value={query} onChange={(e) => setQuery(e.target.value)} />
          <ul className="adm-list" aria-label={t("对话列表", "Conversation list")}>
            {visible.map((c) => (
              <li key={c.key}>
                <button type="button" aria-current={c.key === selectedKey ? "true" : undefined} onClick={() => select(c)}>
                  <strong>{questionOf(c.runs[0]) || t("（没有问题文本）", "(no question text)")}</strong>
                  <span className="adm-list-meta">
                    {c.test ? t("我的测试", "My test") : t("访客", "Visitor")} · {c.origin === "cloud" ? t("线上", "Online") : t("本机", "This computer")} · {t(`${c.runs.length} 次回答`, `${c.runs.length} answers`)} · {when(c.updated, locale)}
                    {c.flagged && <span className="adm-dot" aria-label={t("需要处理", "Needs attention")} />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {!visible.length && (
            <div className="adm-empty adm-empty-small">
              <p>{query ? t("没有找到匹配的对话。", "No matching conversations.") : filter === "test" ? t("还没有测试对话。在右边「试一试」问它一个问题。", "No test chats yet. Ask something in “Try it”.") : t("还没有对话。访客聊过之后会出现在这里。", "No conversations yet. They appear here after visitors chat.")}</p>
            </div>
          )}
          {cloud?.configured && cloud.runs.length >= cloudOffset + 100 && (
            <Button variant="outline" disabled={busy} onClick={() => void run(loadMoreCloud, { reload: false })}>
              {t("加载更早的线上对话", "Load older online conversations")}
            </Button>
          )}
          {cloud && !cloud.configured && <Hint>{t("没有连接线上存档，这里只显示这台电脑上的对话。", "Online archive not connected; only this computer’s conversations are shown.")}</Hint>}
        </aside>
        <section className="adm-detail-pane" aria-label={t("对话内容", "Conversation")}>
          {!selected ? (
            <div className="adm-empty adm-placeholder">
              <p>{visible.length ? t("从左边选一段对话来看。", "Pick a conversation to read it.") : t("有对话时，选中后在这里查看和纠正。", "Pick a conversation here to read and correct it.")}</p>
            </div>
          ) : (
            <>
              <div className="adm-detail-head">
                <Button variant="ghost" size="sm" className="adm-back" onClick={() => select()}>
                  <ArrowLeft />
                  {t("返回列表", "Back to list")}
                </Button>
                <div>
                  <h2>{selected.test ? t("我的测试对话", "My test chat") : t("访客对话", "Visitor conversation")}</h2>
                  <p className="adm-sub">
                    {selected.origin === "cloud" ? t("线上", "Online") : t("本机", "This computer")} · {when(selected.runs[0].created, locale)}
                  </p>
                </div>
              </div>
              {actionError && <p role="alert">{actionError}</p>}
              <ol className="adm-transcript">
                {selected.runs.map((r, i) => {
                  const question = questionOf(r);
                  const attempt = selected.runs.slice(0, i).filter((x) => (x.questionId ?? x.id) === (r.questionId ?? r.id)).length;
                  return (
                    <li key={r.id}>
                      {attempt === 0 ? <p className="adm-bubble-user">{question}</p> : <p className="adm-sub">{t(`同一个问题的第 ${attempt + 1} 次回答`, `Answer ${attempt + 1} to the same question`)}</p>}
                      <div className="adm-bubble-ai">
                        {r.response ? <MarkdownText type="text" text={r.response} status={{ type: "complete" }} /> : <p className="adm-sub">{t("（没有生成回答）", "(no answer)")}</p>}
                        {statusText(r, t) && <p className="adm-warn">{statusText(r, t)}</p>}
                        {!!r.selected?.length && (
                          <p className="adm-used">
                            <span>{t("用到的资料", "Knowledge used")}</span>
                            {r.selected.map((s) => s.title).join("、")}
                          </p>
                        )}
                        {r.review.corrected && (
                          <p className="adm-corrected">
                            <span>{t("你纠正过", "You corrected")}</span>
                            {r.review.corrected}
                          </p>
                        )}
                        <div className="toolbar">
                          <Button variant="outline" size="sm" onClick={() => setTarget({ question, answer: r.response ?? "", runId: r.id, origin: r.origin, sources: r.selected?.map((s) => s.title), note: r.review.note, corrected: r.review.corrected })}>
                            <PencilLine />
                            {t("纠正这个回答", "Correct this answer")}
                          </Button>
                          {!needsOwner(r) && !r.review.reviewed && (
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void run(() => workbench(r.origin === "cloud" ? "cloud-review" : "review", { id: r.id, note: r.review.note || "稍后处理", corrected: r.review.corrected ?? "", reviewed: false }))}>
                              <Flag />
                              {t("稍后处理", "Flag for later")}
                            </Button>
                          )}
                        </div>
                        <details className="adm-details">
                          <summary>{t("详情", "Details")}</summary>
                          <dl>
                            <dt>{t("时间", "Time")}</dt>
                            <dd>{new Date(r.created).toLocaleString()}</dd>
                            <dt>{t("模型", "Model")}</dt>
                            <dd>{r.model || "—"}</dd>
                            <dt>{t("用时", "Duration")}</dt>
                            <dd>{r.durationMs ? (r.durationMs / 1000).toFixed(1) + " s" : "—"}</dd>
                            <dt>{t("用量", "Usage")}</dt>
                            <dd>{r.usage ? JSON.stringify(r.usage) : "—"}</dd>
                            {r.routing && (
                              <>
                                <dt>{t("回答方式", "Response route")}</dt>
                                <dd>
                                  {r.routing.intent} · {r.routing.mode === "thinking" ? t("思考回答", "Thinking") : t("直接回答", "Direct")}
                                </dd>
                              </>
                            )}
                            <dt>{t("对话编号", "Conversation ID")}</dt>
                            <dd>{r.conversation}</dd>
                          </dl>
                          {!!r.selected?.length && (
                            <div className="adm-excerpts">
                              {r.selected.map((s, j) => (
                                <details key={j}>
                                  <summary>{s.title}</summary>
                                  <p className="wb-text">{s.excerpt}</p>
                                </details>
                              ))}
                            </div>
                          )}
                        </details>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="adm-danger-zone">
                <ConfirmButton
                  title={t("删除这段对话？", "Delete this conversation?")}
                  description={selected.origin === "cloud" ? t("会永久删除这段线上对话和你的所有批注，无法恢复。", "Permanently deletes this online conversation and all your notes. This cannot be undone.") : t("会删除这台电脑上这段对话的所有记录和批注。访客浏览器里的历史不受影响。", "Deletes every record and note of this conversation on this computer. Visitors’ browser history is unaffected.")}
                  confirmLabel={t("删除", "Delete")}
                  onConfirm={() =>
                    run(async () => {
                      await workbench(selected.origin === "cloud" ? "cloud-delete" : "delete-conversation", { conversation: selected.conversation });
                      select();
                    })
                  }
                >
                  {t("删除这段对话", "Delete this conversation")}
                </ConfirmButton>
              </div>
            </>
          )}
        </section>
      </div>
      <CorrectionDialog target={target} onClose={() => setTarget(undefined)} />
    </>
  );
}
