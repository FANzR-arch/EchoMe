/** 对话: visitor and test conversations, the transcript, replies in person and corrections. */
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, PencilLine, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeading } from "@/components/shared";
import { usePreferences } from "@/lib/preferences";
import { call, when } from "@/lib/owner-client";
import { useOwner } from "./state";
import { ownerTestPrefix } from "./shell";
import { EditorDialog, type Editing } from "./editor";

type Summary = { conversation: string; lastActive: string; lastQuestion: string; turns: number; ownerReplies: number };
type Turn = { role: "visitor" | "assistant" | "owner" | "visitor_note"; text: string; created: string };

export default function OwnerConversations() {
  const { t, locale } = usePreferences(), { signOut, refresh: refreshOwner } = useOwner();
  const [rows, setRows] = useState<Summary[] | null>(null), [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<"visitor" | "test" | "all">("visitor"), [query, setQuery] = useState("");
  const [params, setParams] = useSearchParams(), selected = params.get("c");
  const load = useCallback(async () => {
    setFailed(false);
    const r = await call<{ conversations: Summary[] }>("conversations");
    if (r.status === 401) return signOut();
    if (r.ok) setRows(r.data.conversations); else setFailed(true);
  }, [signOut]);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => (rows ?? []).filter(c => {
    const test = c.conversation.startsWith(ownerTestPrefix);
    return (filter === "all" || (filter === "test") === test) && (!query || c.lastQuestion.toLowerCase().includes(query.toLowerCase()));
  }), [rows, filter, query]);
  const select = (id?: string) => setParams(id ? { c: id } : {});
  return (
    <>
      <PageHeading eyebrow="CONVERSATIONS" title={t("对话", "Conversations")} description={t("访客和你自己的测试对话都在这里。答得不对的，点「纠正这个回答」；想亲自回，在下面直接写。", "Visitor and test conversations. Correct a wrong answer, or reply in person.")}
        actions={<div className="toolbar"><Button variant="outline" size="sm" onClick={() => { void load(); void refreshOwner(); }}><RefreshCw />{t("刷新", "Refresh")}</Button></div>} />
      <div className="adm-split" data-detail={!!selected}>
        <aside className="adm-list-pane">
          <div className="adm-filter" role="group" aria-label={t("显示哪些对话", "Which conversations")}>
            {([["visitor", "访客", "Visitors"], ["test", "我的测试", "My tests"], ["all", "全部", "All"]] as const).map(([value, zh, en]) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{t(zh, en)}</button>
            ))}
          </div>
          <Input type="search" aria-label={t("搜索对话", "Search conversations")} placeholder={t("搜索访客的问题", "Search questions")} value={query} onChange={e => setQuery(e.target.value)} />
          {failed && <p className="adm-warn" role="alert">{t("读取失败，点右上角「刷新」再试。", "Couldn't load. Refresh to try again.")}</p>}
          {!rows && !failed && <p role="status">{t("正在读取…", "Loading…")}</p>}
          <ul className="adm-list" aria-label={t("对话列表", "Conversation list")}>
            {visible.map(c => (
              <li key={c.conversation}>
                <button type="button" aria-current={c.conversation === selected ? "true" : undefined} onClick={() => select(c.conversation)}>
                  <strong>{c.lastQuestion || t("（访客留言）", "(Visitor note)")}</strong>
                  <span className="adm-list-meta">
                    {c.conversation.startsWith(ownerTestPrefix) ? t("我的测试", "My test") : t("访客", "Visitor")} · {t(`${c.turns} 次回答`, `${c.turns} answers`)} · {when(c.lastActive, locale)}
                    {c.ownerReplies > 0 && <span className="adm-pill" data-tone="sage">{t("已回复", "Replied")}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {rows && !visible.length && <div className="adm-empty adm-empty-small"><p>{query ? t("没有找到匹配的对话。", "No matching conversations.") : filter === "test" ? t("还没有测试对话。点右上角「试一试」问它一个问题。", "No test chats yet. Ask something in “Try it”.") : t("还没有对话。访客聊过之后会出现在这里。", "No conversations yet.")}</p></div>}
        </aside>
        <section className="adm-detail-pane" aria-label={t("对话内容", "Conversation")}>
          {selected ? <Detail key={selected} id={selected} back={() => select()} reload={load} /> : (
            <div className="adm-empty adm-placeholder"><p>{visible.length ? t("从左边选一段对话来看。", "Pick a conversation to read it.") : t("有对话时，选中后在这里查看和回复。", "Pick a conversation to read and reply.")}</p></div>
          )}
        </section>
      </div>
    </>
  );
}

function Detail({ id, back, reload }: { id: string; back: () => void; reload: () => Promise<void> }) {
  const { t, locale } = usePreferences(), { signOut, refresh } = useOwner();
  const [turns, setTurns] = useState<Turn[] | null>(null), [failed, setFailed] = useState(false);
  const [text, setText] = useState(""), [sending, setSending] = useState(false), [note, setNote] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const load = useCallback(async () => {
    const r = await call<{ turns: Turn[] }>("conversation?id=" + encodeURIComponent(id));
    if (r.status === 401) return signOut();
    if (r.ok) setTurns(r.data.turns); else setFailed(true);
  }, [id, signOut]);
  useEffect(() => { void load(); }, [load]);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true); setNote("");
    const r = await call("reply", { conversation: id, text });
    setSending(false);
    if (r.status === 401) return signOut();
    if (!r.ok) return setNote(r.data.error === "Reply limit reached for this hour." ? t("这个小时回复次数到上限了（20 条）。", "Hourly reply limit reached (20).") : t("没发出去，稍后再试。", "Not sent. Try again later."));
    setText(""); setNote(t("已发出。访客开着页面的话几秒内就能看到。", "Sent. The visitor sees it within seconds if their page is open."));
    void load(); void reload(); void refresh();
  };
  const test = id.startsWith(ownerTestPrefix);
  return (
    <>
      <div className="adm-detail-head">
        <Button variant="ghost" size="sm" className="adm-back" onClick={back}><ArrowLeft />{t("返回列表", "Back to list")}</Button>
        <div>
          <h2>{test ? t("我的测试对话", "My test chat") : t("访客对话", "Visitor conversation")}</h2>
          {turns?.[0] && <p className="adm-sub">{when(turns[0].created, locale)}</p>}
        </div>
      </div>
      {failed && <p className="adm-warn" role="alert">{t("这段对话读不到了，可能已被自动清理。", "This chat can't be loaded; it may have been cleaned up.")}</p>}
      {!turns && !failed && <p role="status">{t("正在读取…", "Loading…")}</p>}
      <ol className="adm-transcript">
        {turns?.map((m, i) => {
          const question = [...turns.slice(0, i)].reverse().find(x => x.role === "visitor")?.text ?? "";
          return (
            <li key={i}>
              {m.role === "visitor" && <p className="adm-bubble-user">{m.text}</p>}
              {m.role === "assistant" && (
                <div className="adm-bubble-ai">
                  <p className="owner-pre">{m.text}</p>
                  <div className="toolbar"><Button variant="outline" size="sm" onClick={() => setEditing({ kind: "correction", question, answer: m.text })}><PencilLine />{t("纠正这个回答", "Correct this answer")}</Button></div>
                </div>
              )}
              {m.role === "owner" && <div className="adm-bubble-ai owner-reply-bubble"><p className="adm-sub">{t("你的回复", "Your reply")} · {when(m.created, locale)}</p><p className="owner-pre">{m.text}</p></div>}
              {m.role === "visitor_note" && <div className="adm-bubble-ai owner-note-bubble"><p className="adm-sub">{t("访客留言", "Visitor note")} · {when(m.created, locale)}</p><p className="owner-pre">{m.text}</p></div>}
            </li>
          );
        })}
      </ol>
      {turns && !test && (
        <form className="owner-reply" onSubmit={send}>
          <label htmlFor="owner-reply-text">{t("以本人身份回复", "Reply in person")}</label>
          <Textarea id="owner-reply-text" rows={3} maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder={t("访客会看到「本人回复」标记", "The visitor sees it marked as your own reply")} />
          {note && <p className="adm-hint" role="status">{note}</p>}
          <div className="owner-buttons"><Button type="submit" disabled={sending || !text.trim()}><Send />{sending ? t("发送中…", "Sending…") : t("发送", "Send")}</Button></div>
        </form>
      )}
      <EditorDialog editing={editing} onClose={() => setEditing(null)} onSaved={m => { setEditing(null); setNote(m); }} />
    </>
  );
}
