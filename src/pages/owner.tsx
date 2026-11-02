import { lazy, useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Brand, PreferencesControls } from "@/components/shared";
import { usePreferences } from "@/lib/preferences";
import { owner } from "@/lib/owner";
import { call } from "@/lib/owner-client";
import { OwnerProvider } from "./owner/state";
import "../owner.css";

/** Online owner page on the deployed site: password sign-in, then the same backend as the local workbench. */
const Shell = lazy(() => import("./owner/shell"));
const Inbox = lazy(() => import("./owner/inbox"));
const Conversations = lazy(() => import("./owner/conversations"));
const Knowledge = lazy(() => import("./owner/knowledge"));
const Profile = lazy(() => import("./owner/profile"));
const Settings = lazy(() => import("./owner/settings"));
type Session = { enabled: boolean; storage: boolean; signedIn: boolean };

export default function OwnerPage() {
  const { t, locale } = usePreferences();
  const [session, setSession] = useState<Session | null | "offline">(null);
  const load = useCallback(async () => {
    const r = await call<Session>("session");
    setSession(r.ok ? r.data : "offline");
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Backends share the light grey + Morandi palette; the visitor chat on this same site keeps its own.
  useEffect(() => { document.documentElement.classList.add("backend"); return () => document.documentElement.classList.remove("backend"); }, []);
  useEffect(() => { document.title = locale === "en" ? `Owner page · ${owner.name.en}` : `${owner.name.zh}的后台`; }, [locale]);

  if (session === null) return <Card><p className="adm-hint" role="status">{t("正在打开…", "Opening…")}</p></Card>;
  if (session === "offline") return <Card title={t("连不上服务器", "Can't reach the server")}><p className="adm-hint">{t("检查网络后刷新页面。", "Check your connection and reload.")}</p></Card>;
  if (!session.enabled) return <Card title={t("后台还没开启", "The owner page is off")}><p className="adm-hint">{t("在 Vercel 的环境变量里加 PAI_OWNER_PASSWORD（至少 12 个字符），重新部署后用这个密码登录。", "Add PAI_OWNER_PASSWORD (at least 12 characters) in Vercel, redeploy, then sign in with it.")}</p></Card>;
  if (!session.signedIn) return <SignIn onDone={load} />;
  if (!session.storage) return <Card title={t("还没有对话存档", "No conversation archive yet")}><p className="adm-hint">{t("对话和资料修改存在 Supabase 里。请让你的 AI 按 AGENT-SETUP.md 第 4、5 步接好 Supabase（PAI_SUPABASE_URL、PAI_SUPABASE_SECRET_KEY）并重新部署。", "Conversations and knowledge edits live in Supabase. Ask your AI to connect it (AGENT-SETUP.md steps 4–5) and redeploy.")}</p></Card>;
  return (
    <OwnerProvider signOut={load}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Navigate to="inbox" replace />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="conversations" element={<Conversations />} />
          <Route path="knowledge" element={<Knowledge />} />
          <Route path="profile" element={<Profile />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="inbox" replace />} />
        </Route>
      </Routes>
    </OwnerProvider>
  );
}

/** Centered card for sign-in and the states before it. */
function Card({ title, children }: { title?: string; children: ReactNode }) {
  const { t } = usePreferences();
  return (
    <main className="owner-gate">
      <header className="owner-gate-top"><Brand /><PreferencesControls /></header>
      <section className="owner-gate-card">
        <p className="owner-gate-eyebrow">{t(`${owner.name.zh}的后台`, `${owner.name.en}'s owner page`)}</p>
        {title && <h1>{title}</h1>}
        {children}
      </section>
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
    <Card title={t("登录你的后台", "Sign in")}>
      <p className="adm-hint">{t("看访客对话、回复访客、改 AI 用的资料。", "Read visitor chats, reply, and edit what the assistant knows.")}</p>
      <form className="owner-form" onSubmit={submit}>
        <label htmlFor="owner-password">{t("密码（PAI_OWNER_PASSWORD）", "Password (PAI_OWNER_PASSWORD)")}</label>
        <Input id="owner-password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required autoFocus />
        {error && <p className="adm-warn" role="alert">{error}</p>}
        <Button type="submit" disabled={busy || !password}>{busy ? t("登录中…", "Signing in…") : t("登录", "Sign in")}</Button>
      </form>
    </Card>
  );
}
