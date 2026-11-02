import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, LogOut, RefreshCw, Send } from "lucide-react";
import { usePreferences } from "@/lib/preferences";
import { owner } from "@/lib/owner";
import { call, when } from "@/lib/owner-client";
import Knowledge from "./owner-knowledge";
import "../owner.css";

/** Owner page on the deployed site: password sign-in, then visitor conversations and the knowledge the assistant answers from. */
type Session = { enabled: boolean; storage: boolean; signedIn: boolean };
type Summary = { conversation: string; lastActive: string; lastQuestion: string; turns: number; ownerReplies: number };
type Turn = { role: "visitor" | "assistant" | "owner" | "visitor_note"; text: string; created: string };
type Usage = { today?: number; limits: { daily: number } };

export default function OwnerPage() {
  const { t, locale } = usePreferences();
  const [session, setSession] = useState<Session | null | "offline">(null);
  const load = useCallback(async () => {
    const r = await call<Session>("session");
    setSession(r.ok ? r.data : "offline");
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { document.title = locale === "en" ? `Conversations · ${owner.name.en}` : `对话记录 · ${owner.name.zh}`; }, [locale]);

  if (session === null) return <main className="owner-page"><p className="owner-muted" role="status">{t("正在打开…", "Opening…")}</p></main>;
  if (session === "offline") return <Notice title={t("连不上服务器", "Can't reach the server")} body={t("检查网络后刷新页面。", "Check your connection and reload.")} />;
  if (!session.enabled) return <Notice title={t("主人页还没开启", "The owner page is off")} body={t("在 Vercel 的环境变量里加 PAI_OWNER_PASSWORD（至少 12 个字符），重新部署后用这个密码登录。", "Add PAI_OWNER_PASSWORD (at least 12 characters) to your Vercel environment variables, redeploy, then sign in with it.")} />;
  if (!session.signedIn) return <SignIn onDone={load} />;
  if (!session.storage) return <Notice title={t("还没有对话存档", "No conversation archive yet")} body={t("对话存在 Supabase 里。按 README 第四步建好 Supabase，在 Vercel 加上 PAI_SUPABASE_URL 和 PAI_SUPABASE_SECRET_KEY 后重新部署。", "Conversations are stored in Supabase. Connect it (PAI_SUPABASE_URL, PAI_SUPABASE_SECRET_KEY) and redeploy.")} signOut={load} />;
  return <Workspace signOut={load} />;
}

function Notice({ title, body, signOut }: { title: string; body: string; signOut?: () => void }) {
  return (
    <main className="owner-page">
      <h1>{title}</h1>
      <p className="owner-muted">{body}</p>
      {signOut && <SignOutButton onDone={signOut} />}
    </main>
  );
}

function SignIn({ onDone }: { onDone: () => void }) {
  const { t } = usePreferences();
  const [password, setPassword] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await call("login", { password });
    setBusy(false);
    if (r.ok) return onDone();
    setError(r.status === 429 ? t("试错太多次了，15 分钟后再试。", "Too many attempts. Try again in 15 minutes.") : r.status === 401 ? t("密码不对。", "Wrong password.") : t("登录失败，稍后再试。", "Sign-in failed. Try again later."));
  };
  return (
    <main className="owner-page owner-signin">
      <p className="owner-eyebrow">{t(`${owner.name.zh}的主人页`, `${owner.name.en}'s owner page`)}</p>
      <h1>{t("登录查看访客对话", "Sign in to see visitor chats")}</h1>
      <form onSubmit={submit}>
        <label htmlFor="owner-password">{t("密码（PAI_OWNER_PASSWORD）", "Password (PAI_OWNER_PASSWORD)")}</label>
        <input id="owner-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
        {error && <p className="owner-error" role="alert">{error}</p>}
        <button type="submit" className="owner-primary" disabled={busy || !password}>{busy ? t("登录中…", "Signing in…") : t("登录", "Sign in")}</button>
      </form>
    </main>
  );
}

function SignOutButton({ onDone }: { onDone: () => void }) {
  const { t } = usePreferences();
  return <button type="button" className="owner-ghost" onClick={async () => { await call("logout", {}); onDone(); }}><LogOut size={16} />{t("退出", "Sign out")}</button>;
}

function Workspace({ signOut }: { signOut: () => void }) {
  const { t } = usePreferences();
  const [tab, setTab] = useState<"chats" | "knowledge">("chats");
  const [open, setOpen] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => { void call<Usage>("usage").then(r => { if (r.ok) setUsage(r.data); else if (r.status === 401) signOut(); }); }, [signOut]);
  return (
    <main className="owner-page owner-workspace">
      <header className="owner-header">
        <div>
          <p className="owner-eyebrow">{t(`${owner.name.zh}的主人页`, `${owner.name.en}'s owner page`)}</p>
          {usage && usage.today !== undefined && <p className="owner-muted owner-usage">{t(`今天 ${usage.today} / ${usage.limits.daily} 条访客消息`, `Today ${usage.today} / ${usage.limits.daily} visitor messages`)}</p>}
        </div>
        <SignOutButton onDone={signOut} />
      </header>
      {open ? <Conversation id={open} back={() => setOpen(null)} signOut={signOut} /> : (
        <>
          <nav className="owner-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "chats"} onClick={() => setTab("chats")}>{t("对话", "Chats")}</button>
            <button role="tab" aria-selected={tab === "knowledge"} onClick={() => setTab("knowledge")}>{t("资料", "Knowledge")}</button>
          </nav>
          {tab === "chats" ? <Conversations openChat={setOpen} signOut={signOut} /> : <Knowledge signOut={signOut} />}
        </>
      )}
    </main>
  );
}

function Conversations({ openChat, signOut }: { openChat: (id: string) => void; signOut: () => void }) {
  const { t, locale } = usePreferences();
  const [rows, setRows] = useState<Summary[] | null>(null), [failed, setFailed] = useState(false);
  const refresh = useCallback(async () => {
    setFailed(false);
    const r = await call<{ conversations: Summary[] }>("conversations");
    if (r.status === 401) return signOut();
    if (r.ok) setRows(r.data.conversations); else setFailed(true);
  }, [signOut]);
  useEffect(() => { void refresh(); }, [refresh]);
  return (
    <section aria-label={t("对话", "Chats")}>
      <div className="owner-toolbar">
        <span className="owner-muted">{rows ? t(`最近 ${rows.length} 段对话`, `${rows.length} recent chats`) : ""}</span>
        <button type="button" className="owner-ghost" onClick={() => void refresh()}><RefreshCw size={16} />{t("刷新", "Refresh")}</button>
      </div>
      {failed && <p className="owner-error" role="alert">{t("读取失败，稍后刷新再试。", "Couldn't load. Refresh to try again.")}</p>}
      {rows === null && !failed && <p className="owner-muted" role="status">{t("读取中…", "Loading…")}</p>}
      {rows?.length === 0 && <p className="owner-muted">{t("还没有访客对话。", "No visitor chats yet.")}</p>}
      <ul className="owner-list">
        {rows?.map(c => (
          <li key={c.conversation}>
            <button type="button" onClick={() => openChat(c.conversation)}>
              <span className="owner-question">{c.lastQuestion || t("（访客留言）", "(Visitor note)")}</span>
              <span className="owner-meta">
                {when(c.lastActive, locale)} · {t(`${c.turns} 次回答`, `${c.turns} answers`)}
                {c.ownerReplies > 0 && <span className="owner-tag">{t(`已回复 ${c.ownerReplies}`, `Replied ${c.ownerReplies}`)}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Conversation({ id, back, signOut }: { id: string; back: () => void; signOut: () => void }) {
  const { t, locale } = usePreferences();
  const [turns, setTurns] = useState<Turn[] | null>(null), [failed, setFailed] = useState(false);
  const [text, setText] = useState(""), [sending, setSending] = useState(false), [note, setNote] = useState("");
  const refresh = useCallback(async () => {
    const r = await call<{ turns: Turn[] }>("conversation?id=" + encodeURIComponent(id));
    if (r.status === 401) return signOut();
    if (r.ok) setTurns(r.data.turns); else setFailed(true);
  }, [id, signOut]);
  useEffect(() => { void refresh(); }, [refresh]);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true); setNote("");
    const r = await call("reply", { conversation: id, text });
    setSending(false);
    if (r.status === 401) return signOut();
    if (!r.ok) return setNote(r.data.error === "Reply limit reached for this hour." ? t("这个小时回复次数到上限了（20 条）。", "Hourly reply limit reached (20).") : t("没发出去，稍后再试。", "Not sent. Try again later."));
    setText(""); setNote(t("已发出。访客开着页面的话几秒内就能看到。", "Sent. The visitor sees it within seconds if their page is open."));
    void refresh();
  };
  const label: Record<Turn["role"], string> = { visitor: t("访客", "Visitor"), assistant: t("AI 助手", "Assistant"), owner: t("你的回复", "Your reply"), visitor_note: t("访客留言", "Visitor note") };
  return (
    <section aria-label={t("对话详情", "Chat")}>
      <div className="owner-toolbar">
        <button type="button" className="owner-ghost" onClick={back}><ArrowLeft size={16} />{t("返回", "Back")}</button>
        <button type="button" className="owner-ghost" onClick={() => void refresh()}><RefreshCw size={16} />{t("刷新", "Refresh")}</button>
      </div>
      {failed && <p className="owner-error" role="alert">{t("这段对话读不到了，可能已被自动清理。", "This chat can't be loaded; it may have been cleaned up.")}</p>}
      {turns === null && !failed && <p className="owner-muted" role="status">{t("读取中…", "Loading…")}</p>}
      <ol className="owner-thread">
        {turns?.map((m, i) => (
          <li key={i} className={"owner-turn owner-turn-" + m.role}>
            <span className="owner-meta">{label[m.role]} · {when(m.created, locale)}</span>
            <p>{m.text}</p>
          </li>
        ))}
      </ol>
      {turns && (
        <form className="owner-reply" onSubmit={send}>
          <label htmlFor="owner-reply-text">{t("以本人身份回复", "Reply in person")}</label>
          <textarea id="owner-reply-text" rows={3} maxLength={2000} value={text} onChange={e => setText(e.target.value)} placeholder={t("访客会看到「本人回复」标记", "The visitor sees it marked as your own reply")} />
          {note && <p className="owner-muted" role="status">{note}</p>}
          <button type="submit" className="owner-primary" disabled={sending || !text.trim()}><Send size={16} />{sending ? t("发送中…", "Sending…") : t("发送", "Send")}</button>
        </form>
      )}
    </section>
  );
}
