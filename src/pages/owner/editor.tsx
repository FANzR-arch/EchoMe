/** One editor for every knowledge change on the owner page: edit, add, review a draft, correct an answer. */
import { useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmButton } from "@/components/admin/ui";
import { usePreferences } from "@/lib/preferences";
import { call } from "@/lib/owner-client";
import { useOwner, type Draft, type Entry } from "./state";

export type Editing =
  | { kind: "entry"; entry?: Entry; prefill?: Partial<Entry> }
  | { kind: "draft"; draft: Draft }
  /** A visitor question the assistant got wrong: the owner writes the right answer, which becomes an entry. */
  | { kind: "correction"; question: string; answer: string; runId?: string };

export function EditorDialog({ editing, onClose, onSaved }: { editing: Editing | null; onClose: () => void; onSaved: (message: string) => void }) {
  return (
    <Dialog open={!!editing} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="adm-dialog adm-dialog-wide owner-editor">
        {editing && <Editor key={JSON.stringify(editing).slice(0, 200)} editing={editing} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function Editor({ editing, onClose, onSaved }: { editing: Editing; onClose: () => void; onSaved: (message: string) => void }) {
  const { t } = usePreferences(), { knowledge, refresh, signOut } = useOwner();
  const start = editing.kind === "draft" ? editing.draft : editing.kind === "entry" ? editing.entry ?? editing.prefill : { title: editing.question.slice(0, 80) };
  const [title, setTitle] = useState(start?.title ?? ""), [text, setText] = useState(start?.text ?? "");
  const [urls, setUrls] = useState((start?.urls ?? []).join("\n")), [tier, setTier] = useState<"core" | "detail">(start?.tier ?? "detail");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [rows] = useState(() => Math.min(10, Math.max(4, Math.ceil((start?.text ?? "").length / 26) + 1)));
  const entry = editing.kind === "entry" ? editing.entry : undefined;
  const run = async (path: string, body: unknown, message: string, after?: () => Promise<unknown>) => {
    setBusy(true); setError("");
    const r = await call<{ message?: string }>(path, body);
    if (r.status === 401) return signOut();
    if (!r.ok) { setBusy(false); return setError(r.data.message ?? (r.data.error === "UPGRADE_NEEDED" ? t("数据库需要更新：在 Supabase 运行一次最新的 supabase/setup.sql。", "Run the latest supabase/setup.sql in Supabase first.") : t("没保存成功，稍后再试。", "Not saved. Try again later."))); }
    await after?.();
    await refresh(); setBusy(false); onSaved(message);
  };
  const fields = { title, text, urls: urls.split(/\s+/).filter(Boolean), tier };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (editing.kind === "draft") return void run("knowledge-approve", { id: editing.draft.id, edited: true, ...fields }, t("已确认上线。", "Approved and live."));
    const after = editing.kind === "correction" && editing.runId ? () => call("dismiss", { id: editing.runId }) : undefined;
    void run("knowledge-save", { ...(entry ? { id: entry.id } : {}), ...fields }, editing.kind === "correction" ? t("已记下，之后类似的问题会按这个回答。", "Saved. Similar questions will use it.") : t("已保存，新的提问马上按这个回答。", "Saved. New questions use it right away."), after);
  };
  const heading = editing.kind === "draft" ? t("待确认的资料", "Draft to review") : editing.kind === "correction" ? t("纠正这个回答", "Correct this answer") : entry ? t("编辑资料", "Edit entry") : t("新增资料", "New entry");
  const replaced = editing.kind === "draft" && editing.draft.replaces ? knowledge?.entries.find(e => e.id === editing.draft.replaces)?.title ?? editing.draft.replaces : "";
  return (
    <form className="owner-form" onSubmit={save}>
      <DialogTitle>{heading}</DialogTitle>
      <DialogDescription>
        {editing.kind === "correction" ? t("写出正确的说法，存成一条资料。以后访客问类似的问题，网站 AI 会按它回答。", "Write the right answer; it becomes an entry the assistant uses for similar questions.")
          : editing.kind === "draft" ? t("确认后网站 AI 才会使用它。可以先改几个字再确认。", "The assistant uses it only after you approve. Edit first if needed.")
          : t("改完点保存，新的提问马上按新内容回答。", "Save, and new questions use it right away.")}
      </DialogDescription>
      {editing.kind === "correction" && (
        <div className="adm-quote">
          <p><span>{t("访客问", "Visitor asked")}</span>{editing.question}</p>
          <p><span>{t("它答的", "It answered")}</span>{editing.answer}</p>
        </div>
      )}
      {editing.kind === "draft" && (replaced || editing.draft.note) && <p className="adm-notice">{replaced ? t(`这是对「${replaced}」的修改建议。`, `Suggested change to “${replaced}”. `) : ""}{editing.draft.note}</p>}
      <label htmlFor="k-title">{t("标题", "Title")}</label>
      <Input id="k-title" value={title} maxLength={400} onChange={e => setTitle(e.target.value)} required />
      <label htmlFor="k-text">{editing.kind === "correction" ? t("正确的说法", "The right answer") : t("正文", "Text")}</label>
      <Textarea id="k-text" rows={rows} value={text} onChange={e => setText(e.target.value)} required autoFocus={editing.kind === "correction"} />
      <label htmlFor="k-urls">{t("来源链接（每行一个，完整的 https:// 地址，可不填）", "Source links (one per line, full https://, optional)")}</label>
      <Textarea id="k-urls" rows={2} value={urls} onChange={e => setUrls(e.target.value)} />
      <span className="owner-label">{t("怎么用这条", "How it is used")}</span>
      <div className="adm-filter" role="group" aria-label={t("怎么用这条", "How it is used")}>
        <button type="button" aria-pressed={tier === "core"} onClick={() => setTier("core")}>{t("每次都带上", "Every question")}</button>
        <button type="button" aria-pressed={tier === "detail"} onClick={() => setTier("detail")}>{t("需要时读取", "When relevant")}</button>
      </div>
      <p className="adm-hint">{t(`「每次都带上」每个问题都会参考，合计不能超过 ${knowledge?.coreLimit ?? 4000} 字（现在 ${knowledge?.coreUsed ?? 0} 字），适合简介和联系方式；作品、文章用「需要时读取」。`, `Every-question entries share a ${knowledge?.coreLimit ?? 4000}-character budget (${knowledge?.coreUsed ?? 0} used); use it for your bio and contact.`)}</p>
      {error && <p className="adm-warn" role="alert">{error}</p>}
      <div className="owner-buttons">
        <Button type="submit" disabled={busy}>{editing.kind === "draft" ? t("确认上线", "Approve") : t("保存", "Save")}</Button>
        {editing.kind === "draft" && <ConfirmButton disabled={busy} title={t("丢弃这条待确认的资料？", "Discard this draft?")} description={t("丢弃后网站 AI 不会用它，也找不回来。", "The assistant won't use it, and it can't be recovered.")} confirmLabel={t("丢弃", "Discard")} onConfirm={() => run("knowledge-discard", { id: editing.draft.id }, t("已丢弃。", "Discarded."))}>{t("丢弃", "Discard")}</ConfirmButton>}
        {entry && <Button type="button" variant="outline" disabled={busy} onClick={() => void run("knowledge-save", { id: entry.id, hidden: !entry.hidden }, entry.hidden ? t("已恢复使用。", "In use again.") : t("已隐藏，网站 AI 不会再用这条。", "Hidden from the assistant."))}>{entry.hidden ? t("取消隐藏", "Unhide") : t("隐藏", "Hide")}</Button>}
        {entry && entry.origin !== "base" && <ConfirmButton disabled={busy} title={entry.origin === "added" ? t("删除这条资料？", "Delete this entry?") : t("恢复成发布时的原文？", "Restore the published text?")} description={entry.origin === "added" ? t("这条是在线上新增的，删除后网站 AI 不会再用它。", "It was added online; the assistant will stop using it.") : t("线上的修改会丢掉，回到发布时的版本。", "The online change is dropped and the published version comes back.")} confirmLabel={entry.origin === "added" ? t("删除", "Delete") : t("恢复原文", "Restore")} onConfirm={() => run("knowledge-restore", { id: entry.id }, entry.origin === "added" ? t("已删除。", "Deleted.") : t("已恢复原文。", "Restored."))}>{entry.origin === "added" ? t("删除这条", "Delete") : t("恢复原文", "Restore original")}</ConfirmButton>}
        <Button type="button" variant="ghost" onClick={onClose}>{t("取消", "Cancel")}</Button>
      </div>
    </form>
  );
}
