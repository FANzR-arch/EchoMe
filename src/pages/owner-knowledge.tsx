import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowLeft, Plus, Trash2, Upload } from "lucide-react";
import { usePreferences } from "@/lib/preferences";
import { call, when } from "@/lib/owner-client";

/** The knowledge tab of the owner page: what the assistant answers from, the review queue and saved answers, all editable online. */
type Entry = { id: string; title: string; text: string; urls: string[]; tier: "core" | "detail"; origin: "base" | "edited" | "added"; hidden: boolean; updated: string };
type Draft = { id: string; target: string; title: string; text: string; urls: string[]; tier: "core" | "detail"; source: "owner" | "agent" | "upload"; note?: string | null; updated: string; replaces?: string };
type View = { entries: Entry[]; persona: { text: string; edited: boolean }; rules: { text: string; edited: boolean }; drafts: Draft[]; coreUsed: number; coreLimit: number };
type Answer = { id: string; created: string; question: string; answer: string };
/** List previews read as plain text: Markdown heading and list marks dropped. */
const plain = (text: string) => text.replace(/^\s*(#+|[-*]|\d+\.)\s+/gm, "");
type Editing = { kind: "entry"; entry?: Entry; prefill?: Partial<Entry> } | { kind: "prompt"; name: "persona" | "rules" } | { kind: "draft"; draft: Draft };

/** A Markdown file of "## title" sections becomes drafts; anything else is one new entry. See README for the format. */
export function parseUpload(name: string, text: string): { title: string; text: string; urls: string[]; tier: "core" | "detail"; note?: string }[] {
  const body = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const sections = body.split(/^## /m).slice(1);
  if (!sections.length) return [{ title: name.replace(/\.(md|txt)$/i, ""), text: body.trim(), urls: [], tier: "detail" }];
  return sections.map(section => {
    const [first, ...lines] = section.split("\n"), urls: string[] = [], rest: string[] = [];
    let tier: "core" | "detail" = "detail", note: string | undefined;
    for (const line of lines) {
      const link = /^(链接|Links?)[:：]\s*(.+)$/i.exec(line.trim()), remark = /^(备注|Note)[:：]\s*(.+)$/i.exec(line.trim());
      if (link) urls.push(...link[2].split(/[\s,，]+/).filter(Boolean));
      else if (/^(每次都带上|core)$/i.test(line.trim())) tier = "core";
      else if (remark) note = remark[2];
      else rest.push(line);
    }
    return { title: first.trim(), text: rest.join("\n").trim(), urls, tier, ...(note ? { note } : {}) };
  }).filter(e => e.title && e.text && !e.title.startsWith("待你确认"));
}

export default function Knowledge({ signOut }: { signOut: () => void }) {
  const { t, locale } = usePreferences();
  const [view, setView] = useState<View | null>(null), [answers, setAnswers] = useState<Answer[]>([]);
  const [problem, setProblem] = useState(""), [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    const [k, a] = await Promise.all([call<View>("knowledge"), call<{ answers: Answer[] }>("answers")]);
    if (k.status === 401) return signOut();
    if (k.ok) { setView(k.data); setProblem(""); }
    else setProblem(k.data.error === "UPGRADE_NEEDED" ? t("数据库需要更新：在 Supabase 的 SQL Editor 里运行一次最新的 supabase/setup.sql。", "The database needs an update: run the latest supabase/setup.sql in the Supabase SQL Editor.") : t("资料读取失败，稍后再试。", "Couldn't load knowledge. Try again later."));
    if (a.ok) setAnswers(a.data.answers);
  }, [signOut, t]);
  useEffect(() => { void refresh(); }, [refresh]);
  const done = (message: string) => { setEditing(null); setNotice(message); void refresh(); };

  const upload = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 1_000_000) return setNotice(t("文件太大了，请控制在 1 MB 以内。", "That file is too large; keep it under 1 MB."));
    const content = await f.text(), entries = parseUpload(f.name, content);
    if (entries.length === 1 && !/^## /m.test(content)) return setEditing({ kind: "entry", prefill: entries[0] });
    if (!entries.length) return setNotice(t("文件里没有找到资料。格式见 README 的「资料文件格式」。", "No entries found. See the file format in the README."));
    const r = await call<{ drafted: number; message?: string }>("knowledge-import", { entries });
    if (r.status === 401) return signOut();
    setNotice(r.ok ? t(`已导入 ${r.data.drafted} 条，放在「待确认」里，逐条确认后才会上线。`, `Imported ${r.data.drafted} entries into "To review". Nothing is live until you approve it.`) : r.data.message ?? t("导入失败，稍后再试。", "Import failed. Try again later."));
    void refresh();
  };
  const forget = async (a: Answer) => {
    if (!confirm(t(`删除这条回答？网站 AI 以后不会再用它。\n\n${a.question}`, `Delete this answer? The site assistant will stop using it.\n\n${a.question}`))) return;
    await call("forget", { id: a.id });
    void refresh();
  };

  if (editing && view) return <Editor editing={editing} view={view} back={() => setEditing(null)} done={done} signOut={signOut} />;
  const groups = view ? [
    { key: "core", title: t("每次都带上", "Sent with every question"), hint: t(`合计 ${view.coreUsed.toLocaleString()} / ${view.coreLimit.toLocaleString()} 字`, `${view.coreUsed.toLocaleString()} / ${view.coreLimit.toLocaleString()} characters`), rows: view.entries.filter(e => !e.hidden && e.tier === "core") },
    { key: "detail", title: t("需要时读取", "Read when relevant"), hint: "", rows: view.entries.filter(e => !e.hidden && e.tier === "detail") },
    { key: "hidden", title: t("已隐藏", "Hidden"), hint: t("网站 AI 不会用这些", "Not used by the assistant"), rows: view.entries.filter(e => e.hidden) },
  ] : [];
  const tag = (e: Entry) => e.origin === "edited" ? t("线上改过", "Edited online") : e.origin === "added" ? t("线上新增", "Added online") : "";
  return (
    <section aria-label={t("资料", "Knowledge")} className="owner-knowledge">
      <div className="owner-toolbar">
        <span className="owner-muted">{t("网站 AI 只根据这里的资料回答访客。", "The assistant answers visitors only from this.")}</span>
      </div>
      <div className="owner-actions">
        <button type="button" className="owner-ghost" onClick={() => setEditing({ kind: "entry" })}><Plus size={16} />{t("新增资料", "Add entry")}</button>
        <button type="button" className="owner-ghost" onClick={() => file.current?.click()}><Upload size={16} />{t("上传文件", "Upload file")}</button>
        <input ref={file} type="file" accept=".md,.txt,text/plain,text/markdown" hidden onChange={e => void upload(e)} />
      </div>
      {notice && <p className="owner-notice" role="status">{notice}</p>}
      {problem && <p className="owner-error" role="alert">{problem}</p>}
      {!view && !problem && <p className="owner-muted" role="status">{t("读取中…", "Loading…")}</p>}
      {view && view.drafts.length > 0 && (
        <div className="owner-group owner-review">
          <h2>{t(`待确认 · ${view.drafts.length}`, `To review · ${view.drafts.length}`)}</h2>
          <p className="owner-muted">{t("AI 助手整理或你上传的资料，确认后才会被网站 AI 使用。", "Collected by your agent or uploaded. Used only after you approve.")}</p>
          <ul className="owner-list">
            {view.drafts.map(d => (
              <li key={d.id}><button type="button" onClick={() => setEditing({ kind: "draft", draft: d })}>
                <span className="owner-question">{d.title}</span>
                <span className="owner-preview">{plain(d.text)}</span>
                <span className="owner-meta">{d.source === "agent" ? t("AI 助手", "Agent") : d.source === "upload" ? t("上传", "Upload") : t("你", "You")} · {when(d.updated, locale)}<span className="owner-tag">{d.replaces ? t("修改已有资料", "Changes an entry") : t("新增", "New")}</span></span>
              </button></li>
            ))}
          </ul>
        </div>
      )}
      {view && (
        <div className="owner-group">
          <h2>{t("语气与规则", "Tone and rules")}</h2>
          <ul className="owner-list">
            {(["persona", "rules"] as const).map(name => (
              <li key={name}><button type="button" onClick={() => setEditing({ kind: "prompt", name })}>
                <span className="owner-question">{name === "persona" ? t("语气：它怎么说话", "Tone: how it talks") : t("规则：它必须遵守的", "Rules: what it must follow")}</span>
                <span className="owner-preview">{plain(view[name].text)}</span>
                {view[name].edited && <span className="owner-meta"><span className="owner-tag">{t("线上改过", "Edited online")}</span></span>}
              </button></li>
            ))}
          </ul>
        </div>
      )}
      {groups.filter(g => g.rows.length || g.key !== "hidden").map(g => (
        <div className="owner-group" key={g.key}>
          <h2>{g.title}{g.hint && <small>{g.hint}</small>}</h2>
          {!g.rows.length && <p className="owner-muted">{t("还没有。", "None yet.")}</p>}
          <ul className="owner-list">
            {g.rows.map(e => (
              <li key={e.id}><button type="button" onClick={() => setEditing({ kind: "entry", entry: e })}>
                <span className="owner-question">{e.title}</span>
                <span className="owner-preview">{plain(e.text)}</span>
                {tag(e) && <span className="owner-meta"><span className="owner-tag">{tag(e)}</span></span>}
              </button></li>
            ))}
          </ul>
        </div>
      ))}
      {view && (
        <div className="owner-group">
          <h2>{t("你确认过的回答", "Answers you approved")}</h2>
          <p className="owner-muted">{t("通过 AI 助手保存的通用回答，网站 AI 会用它们回答类似问题。", "General answers saved through your agent; the assistant reuses them.")}</p>
          {!answers.length && <p className="owner-muted">{t("还没有。", "None yet.")}</p>}
          <ul className="owner-list owner-answers">
            {answers.map(a => (
              <li key={a.id}>
                <div><span className="owner-question">{a.question}</span><p>{a.answer}</p><span className="owner-meta">{when(a.created, locale)}</span></div>
                <button type="button" className="owner-ghost" aria-label={t("删除", "Delete")} onClick={() => void forget(a)}><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Editor({ editing, view, back, done, signOut }: { editing: Editing; view: View; back: () => void; done: (message: string) => void; signOut: () => void }) {
  const { t } = usePreferences();
  const start = editing.kind === "draft" ? editing.draft : editing.kind === "entry" ? editing.entry ?? editing.prefill : undefined;
  const [title, setTitle] = useState(start?.title ?? ""), [text, setText] = useState(editing.kind === "prompt" ? view[editing.name].text : start?.text ?? "");
  const [urls, setUrls] = useState((start?.urls ?? []).join("\n")), [tier, setTier] = useState<"core" | "detail">(start?.tier ?? "detail");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const entry = editing.kind === "entry" ? editing.entry : undefined;
  const run = async (path: string, body: unknown, message: string) => {
    setBusy(true); setError("");
    const r = await call<{ message?: string }>(path, body);
    setBusy(false);
    if (r.status === 401) return signOut();
    if (r.ok) return done(message);
    setError(r.data.message ?? (r.data.error === "UPGRADE_NEEDED" ? t("数据库需要更新：运行一次最新的 supabase/setup.sql。", "Run the latest supabase/setup.sql first.") : t("没保存成功，稍后再试。", "Not saved. Try again later.")));
  };
  const fields = editing.kind === "prompt" ? { text } : { title, text, urls: urls.split(/\s+/).filter(Boolean), tier };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (editing.kind === "draft") return void run("knowledge-approve", { id: editing.draft.id, edited: true, ...fields }, t("已确认上线。", "Approved and live."));
    const id = editing.kind === "prompt" ? editing.name : entry?.id;
    void run("knowledge-save", { ...(id ? { id } : {}), ...fields }, t("已保存，新的提问马上按这个回答。", "Saved. New questions use it right away."));
  };
  const heading = editing.kind === "prompt" ? (editing.name === "persona" ? t("语气", "Tone") : t("规则", "Rules")) : editing.kind === "draft" ? t("待确认", "To review") : entry ? t("编辑资料", "Edit entry") : t("新增资料", "New entry");
  const edited = editing.kind === "prompt" ? view[editing.name].edited : entry && entry.origin !== "base";
  return (
    <section aria-label={heading}>
      <div className="owner-toolbar"><button type="button" className="owner-ghost" onClick={back}><ArrowLeft size={16} />{t("返回", "Back")}</button><strong>{heading}</strong></div>
      {editing.kind === "draft" && (editing.draft.note || editing.draft.replaces) && (
        <p className="owner-notice">{editing.draft.replaces ? t(`这是对「${view.entries.find(e => e.id === editing.draft.replaces)?.title ?? editing.draft.replaces}」的修改建议。`, "Suggested change to an existing entry. ") : ""}{editing.draft.note}</p>
      )}
      <form className="owner-form" onSubmit={save}>
        {editing.kind !== "prompt" && (<>
          <label htmlFor="k-title">{t("标题", "Title")}</label>
          <input id="k-title" value={title} maxLength={400} onChange={e => setTitle(e.target.value)} required />
        </>)}
        <label htmlFor="k-text">{editing.kind === "prompt" ? t("全文（最多 4000 字）", "Full text (up to 4,000 characters)") : t("正文", "Text")}</label>
        <textarea id="k-text" rows={editing.kind === "prompt" ? 14 : 10} value={text} onChange={e => setText(e.target.value)} required />
        {editing.kind !== "prompt" && (<>
          <label htmlFor="k-urls">{t("来源链接（每行一个，完整的 https:// 地址，可不填）", "Source links (one per line, full https://, optional)")}</label>
          <textarea id="k-urls" rows={2} value={urls} onChange={e => setUrls(e.target.value)} />
          <span className="owner-label">{t("怎么用这条", "How it is used")}</span>
          <div className="owner-tabs owner-choice" role="radiogroup">
            <button type="button" role="radio" aria-checked={tier === "core"} aria-selected={tier === "core"} onClick={() => setTier("core")}>{t("每次都带上", "Every question")}</button>
            <button type="button" role="radio" aria-checked={tier === "detail"} aria-selected={tier === "detail"} onClick={() => setTier("detail")}>{t("需要时读取", "When relevant")}</button>
          </div>
          <p className="owner-muted owner-small">{t(`「每次都带上」的资料每个问题都会参考，合计不能超过 ${view.coreLimit} 字，适合简介和联系方式；作品、文章用「需要时读取」。`, `Every-question entries are used for every answer and share a ${view.coreLimit}-character budget; use it for your bio and contact.`)}</p>
        </>)}
        {error && <p className="owner-error" role="alert">{error}</p>}
        <div className="owner-buttons">
          <button type="submit" className="owner-primary" disabled={busy}>{editing.kind === "draft" ? t("确认上线", "Approve") : t("保存", "Save")}</button>
          {editing.kind === "draft" && <button type="button" className="owner-ghost" disabled={busy} onClick={() => { if (confirm(t("丢弃这条待确认的资料？", "Discard this draft?"))) void run("knowledge-discard", { id: editing.draft.id }, t("已丢弃。", "Discarded.")); }}>{t("丢弃", "Discard")}</button>}
          {entry && <button type="button" className="owner-ghost" disabled={busy} onClick={() => void run("knowledge-save", { id: entry.id, hidden: !entry.hidden }, entry.hidden ? t("已恢复使用。", "In use again.") : t("已隐藏，网站 AI 不会再用这条。", "Hidden from the assistant."))}>{entry.hidden ? t("取消隐藏", "Unhide") : t("隐藏", "Hide")}</button>}
          {edited && <button type="button" className="owner-ghost" disabled={busy} onClick={() => {
            const id = editing.kind === "prompt" ? editing.name : entry!.id, added = entry?.origin === "added";
            if (confirm(added ? t("删除这条线上新增的资料？", "Delete this entry added online?") : t("恢复成发布时的原文？线上的修改会丢掉。", "Restore the published text? The online change is lost."))) void run("knowledge-restore", { id }, added ? t("已删除。", "Deleted.") : t("已恢复原文。", "Restored."));
          }}>{entry?.origin === "added" ? t("删除这条", "Delete") : t("恢复原文", "Restore original")}</button>}
        </div>
      </form>
    </section>
  );
}
