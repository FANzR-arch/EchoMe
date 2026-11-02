/** 语气与规则: the public identity (read-only, from owner.config.json) and the tone and rules, editable online. */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeading } from "@/components/shared";
import { ConfirmButton } from "@/components/admin/ui";
import { usePreferences } from "@/lib/preferences";
import { owner } from "@/lib/owner";
import { call } from "@/lib/owner-client";
import { useOwner } from "./state";
import { Problem } from "./knowledge";

function PromptCard({ name }: { name: "persona" | "rules" }) {
  const { t } = usePreferences(), { knowledge, refresh, signOut } = useOwner();
  const current = knowledge?.[name];
  const [text, setText] = useState(current?.text ?? ""), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  useEffect(() => { if (current) setText(current.text); }, [current?.text]);
  const post = async (path: string, body: unknown, done: string) => {
    setBusy(true); setError(""); setMessage("");
    const r = await call<{ message?: string }>(path, body);
    if (r.status === 401) return signOut();
    setBusy(false);
    if (!r.ok) return setError(r.data.message ?? t("没保存成功，稍后再试。", "Not saved. Try again later."));
    await refresh(); setMessage(done);
  };
  if (!current) return null;
  return (
    <section className="adm-card owner-prompt">
      <div className="adm-card-row">
        <div>
          <h3>{name === "persona" ? t("语气：它怎么说话", "Tone: how it talks") : t("规则：它必须遵守的", "Rules: what it must follow")}</h3>
          <p className="adm-sub">{name === "persona" ? t("说话风格、怎么称呼你、回答多长。", "Voice, how it refers to you, answer length.") : t("能说什么、不能说什么、怎么引用来源。", "What it may say, what not, how it cites.")}</p>
        </div>
        {current.edited && <span className="adm-pill" data-tone="mist">{t("线上改过", "Edited online")}</span>}
      </div>
      <Textarea aria-label={name === "persona" ? t("语气", "Tone") : t("规则", "Rules")} rows={12} maxLength={4000} value={text} onChange={e => setText(e.target.value)} />
      <p className="adm-hint">{text.length.toLocaleString()} / 4,000 {t("字", "characters")}</p>
      {error && <p className="adm-warn" role="alert">{error}</p>}
      {message && <p className="adm-hint" role="status">{message}</p>}
      <div className="owner-buttons">
        <Button disabled={busy || text.trim() === current.text.trim()} onClick={() => void post("knowledge-save", { id: name, text }, t("已保存，新的提问马上按这个回答。", "Saved. New questions use it right away."))}>{t("保存", "Save")}</Button>
        {current.edited && <ConfirmButton disabled={busy} title={t("恢复成发布时的原文？", "Restore the published text?")} description={t("线上的修改会丢掉。", "The online change is dropped.")} confirmLabel={t("恢复原文", "Restore")} onConfirm={() => post("knowledge-restore", { id: name }, t("已恢复原文。", "Restored."))}>{t("恢复原文", "Restore original")}</ConfirmButton>}
      </div>
    </section>
  );
}

export default function OwnerProfile() {
  const { t } = usePreferences(), { problem } = useOwner();
  return (
    <>
      <PageHeading eyebrow="PROFILE & TONE" title={t("语气与规则", "Tone & rules")} description={t("它代表你说话的方式。改完马上生效。", "How it speaks for you. Changes apply right away.")} />
      <Problem problem={problem} />
      <section className="adm-section">
        <h2>{t("名片", "Profile")}</h2>
        <dl className="adm-attrs">
          <dt>{t("称呼", "Name")}</dt><dd>{owner.name.zh} / {owner.name.en}</dd>
          <dt>{t("个人网站", "Website")}</dt><dd><a className="adm-text-link" href={owner.site} target="_blank" rel="noopener noreferrer">{owner.site}</a></dd>
          <dt>{t("公开联系入口", "Public contact")}</dt><dd><a className="adm-text-link" href={owner.contact.url} target="_blank" rel="noopener noreferrer">{owner.contact.label.zh}</a></dd>
        </dl>
        <p className="adm-hint">{t("名片来自仓库里的 owner.config.json，改它需要在 GitHub 上编辑后重新部署。", "These come from owner.config.json; edit it on GitHub and redeploy to change them.")}</p>
      </section>
      <section className="adm-section owner-prompts">
        <PromptCard name="persona" />
        <PromptCard name="rules" />
      </section>
    </>
  );
}
