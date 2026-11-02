/** Online owner page shell: the same sidebar, top bar and "试一试" panel as the local workbench, on the deployed site. */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Inbox, MessagesSquare, BookOpen, IdCard, Gauge, ArrowUpRight, MessageCircle, LogOut, RotateCcw, X, ArrowUp } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Brand, PreferencesControls } from "@/components/shared";
import { usePreferences } from "@/lib/preferences";
import { call } from "@/lib/owner-client";
import { useOwner } from "./state";

const navigation = [
  ["inbox", "待处理", "Inbox", Inbox],
  ["conversations", "对话", "Conversations", MessagesSquare],
  ["knowledge", "它知道什么", "What it knows", BookOpen],
  ["profile", "语气与规则", "Tone & rules", IdCard],
  ["settings", "用量与嵌入", "Usage & embed", Gauge],
] as const;

function Navigation() {
  const { t } = usePreferences(), { setOpenMobile } = useSidebar(), location = useLocation(), { count, signOut } = useOwner();
  return (
    <Sidebar>
      <SidebarHeader><Brand /></SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navigation.map(([path, zh, en, Icon]) => (
              <SidebarMenuItem key={path}>
                <SidebarMenuButton isActive={location.pathname.startsWith("/owner/" + path)} render={<NavLink to={`/owner/${path}`} />} onClick={() => setOpenMobile(false)}>
                  <Icon />
                  <span>{t(zh, en)}</span>
                </SidebarMenuButton>
                {path === "inbox" && count > 0 && <SidebarMenuBadge aria-label={t(`${count} 件待处理`, `${count} to do`)}>{count > 99 ? "99+" : count}</SidebarMenuBadge>}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <a href="/chat" target="_blank" rel="noopener noreferrer" className="sidebar-link">{t("打开访客聊天页", "Open visitor chat")}<ArrowUpRight size={15} /></a>
        <button type="button" className="sidebar-link" onClick={async () => { await call("logout", {}); signOut(); }}>{t("退出登录", "Sign out")}<LogOut size={15} /></button>
        <div className="sidebar-note">
          <span className="status-dot" />
          {t("线上后台", "Online owner page")}
          <p>{t("只有知道密码的人能进。改动对访客马上生效。", "Only people with the password can enter. Changes reach visitors right away.")}</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

const wide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1180px)").matches;
export const ownerTestPrefix = "owner-test-";
type Line = { role: "user" | "assistant"; content: string; sig?: string; error?: boolean };

/** Asks the live site assistant like a visitor would; marked as the owner's test so it never shows up as visitor work. */
function TryPanel({ onClose }: { onClose: () => void }) {
  const { t, locale } = usePreferences(), { refresh } = useOwner();
  const [lines, setLines] = useState<Line[]>([]), [draft, setDraft] = useState(""), [busy, setBusy] = useState(false);
  const conversation = useRef(ownerTestPrefix + crypto.randomUUID());
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [lines]);
  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const history = [...lines.filter(l => !l.error), { role: "user" as const, content: text.trim() }];
    setLines([...history, { role: "assistant", content: "" }]); setDraft(""); setBusy(true);
    const show = (line: Line) => setLines([...history, line]);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.map(({ role, content, sig }) => ({ role, content, ...(sig ? { sig } : {}) })), locale, conversation: conversation.current }) });
      if (!r.ok || !r.body) throw Error((await r.json().catch(() => ({}))).error ?? "FAILED");
      const reader = r.body.getReader(), decoder = new TextDecoder();
      let buffer = "", answer = "";
      for (;;) {
        const { value, done } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        let i;
        while ((i = buffer.indexOf("\n")) >= 0) {
          const event = JSON.parse(buffer.slice(0, i) || "{}"); buffer = buffer.slice(i + 1);
          if (event.type === "snapshot") { answer = event.text; show({ role: "assistant", content: answer }); }
          if (event.type === "done") show({ role: "assistant", content: answer, sig: event.signature });
          if (event.type === "error") throw Error(event.error);
        }
        if (done) break;
      }
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      show({ role: "assistant", error: true, content: code === "DAILY_LIMIT" ? t("今天的额度用完了，测试也会计入额度。", "Today's limit is used up; tests count too.") : code === "RATE_LIMIT" ? t("问得太快了，一分钟后再试。", "Too fast; try again in a minute.") : t("这次没有回答成功，稍后再试。", "That didn't work; try again later.") });
    } finally { setBusy(false); void refresh(); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void send(draft); };
  return (
    <section className="tc" aria-labelledby="tc-title">
      <header className="tc-head">
        <div>
          <h2 id="tc-title">{t("试一试", "Try it")}</h2>
          <p>{t("用线上的资料回答，和访客看到的一样。会计入今天的用量。", "Answers from live knowledge, exactly as visitors see it. Counts toward today's usage.")}</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={t("重新开始", "Start over")} title={t("重新开始", "Start over")} onClick={() => { setLines([]); conversation.current = ownerTestPrefix + crypto.randomUUID(); }}><RotateCcw /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={t("收起试一试", "Close Try it")} title={t("收起", "Close")} onClick={onClose}><X /></Button>
      </header>
      <div className="tc-thread">
        <div className="tc-viewport">
          {!lines.length && (
            <div className="tc-empty">
              <p>{t("像访客一样问它一个问题，看看它怎么回答。答得不对，就去「它知道什么」改资料。", "Ask like a visitor would. If the answer is off, fix it in “What it knows”.")}</p>
              <div className="tc-suggestions">
                {[t("介绍一下你自己", "Introduce yourself"), t("有哪些代表作品？", "What are your best projects?"), t("怎么联系合作？", "How can I work with you?")].map(q => <button key={q} type="button" className="tc-suggestion" onClick={() => void send(q)}>{q}</button>)}
              </div>
            </div>
          )}
          {lines.map((l, i) => l.role === "user"
            ? <div key={i} className="tc-user">{l.content}</div>
            : <div key={i} className="tc-assistant">
                {l.error ? <div className="tc-error">{l.content}</div> : <div className="tc-answer owner-try-answer">{l.content}</div>}
                {busy && i === lines.length - 1 && <span className="tc-working" role="status">{t("正在回答…", "Answering…")}</span>}
              </div>)}
          <div ref={end} />
        </div>
        <form className="tc-composer" onSubmit={submit}>
          <Textarea className="tc-input" value={draft} rows={1} placeholder={t("问一个访客可能会问的问题…", "Ask what a visitor might ask…")} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft); } }} />
          <Button type="submit" size="icon-sm" className="tc-send" disabled={busy || !draft.trim()} aria-label={t("发送", "Send")}><ArrowUp /></Button>
        </form>
      </div>
    </section>
  );
}

export default function OwnerShell() {
  const { t } = usePreferences(), location = useLocation();
  const [open, setOpen] = useState(wide);
  useEffect(() => { if (!wide()) setOpen(false); }, [location.pathname]);
  return (
    <SidebarProvider className="admin-shell adm-shell">
      <Navigation />
      <SidebarInset>
        <header className="admin-topbar">
          <SidebarTrigger aria-label={t("打开或收起菜单", "Toggle menu")} />
          <span>{t("我的 AI 助手", "My AI assistant")}</span>
          <div className="header-spacer" />
          <Button variant={open ? "secondary" : "outline"} size="sm" className="adm-try-toggle" aria-expanded={open} aria-controls="adm-try" onClick={() => setOpen(!open)}>
            <MessageCircle />
            {t("试一试", "Try it")}
          </Button>
          <PreferencesControls />
        </header>
        <div className="adm-body" data-try={open}>
          <div className="admin-main"><Outlet /></div>
          <aside id="adm-try" className="adm-try" hidden={!open} aria-label={t("试一试", "Try it")}><TryPanel onClose={() => setOpen(false)} /></aside>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
