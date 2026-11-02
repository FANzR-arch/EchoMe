/** 它知道什么: every entry the assistant answers from, grouped like the local workbench, editable and uploadable online. */
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Plus, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeading } from "@/components/shared";
import { ConfirmButton, CoreMeter } from "@/components/admin/ui";
import { usePreferences } from "@/lib/preferences";
import { call, when } from "@/lib/owner-client";
import { useOwner, type Entry } from "./state";
import { EditorDialog, type Editing } from "./editor";

/** A Markdown file of "## title" sections becomes drafts; anything else is one new entry. README describes the format. */
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

export function Problem({ problem }: { problem: string }) {
  const { t } = usePreferences();
  if (!problem) return null;
  return <p className="adm-warn" role="alert">{problem === "UPGRADE_NEEDED" ? t("数据库需要更新：在 Supabase 的 SQL Editor 里运行一次最新的 supabase/setup.sql，再刷新这一页。", "The database needs an update: run the latest supabase/setup.sql in the Supabase SQL Editor, then reload.") : t("资料读取失败，稍后刷新再试。", "Couldn't load knowledge. Reload later.")}</p>;
}

type Answer = { id: string; created: string; question: string; answer: string };
const groupOf = (e: Entry) => e.hidden ? "hidden" : e.id.startsWith("project:") || e.id === "projects-index" ? "work" : e.id.startsWith("article:") ? "writing" : e.id.startsWith("note:") ? "added" : "about";

export default function OwnerKnowledge() {
  const { t, locale } = usePreferences(), { knowledge, problem, refresh, signOut } = useOwner();
  const [editing, setEditing] = useState<Editing | null>(null), [notice, setNotice] = useState(""), [query, setQuery] = useState("");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const loadAnswers = async () => { const r = await call<{ answers: Answer[] }>("answers"); if (r.ok) setAnswers(r.data.answers); };
  useEffect(() => { void loadAnswers(); }, []);
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
    setNotice(r.ok ? t(`已导入 ${r.data.drafted} 条，放在「待处理」里，逐条确认后才会上线。`, `Imported ${r.data.drafted} entries into the inbox. Nothing is live until you approve it.`) : r.data.message ?? t("导入失败，稍后再试。", "Import failed."));
    void refresh();
  };
  const tag = (e: Entry): [string, string] => e.hidden ? [t("已隐藏", "Hidden"), "plain"] : e.origin === "edited" ? [t("线上改过", "Edited online"), "mist"] : e.origin === "added" ? [t("线上新增", "Added online"), "sage"] : [t("已上线", "Live"), "live"];
  const match = (e: Entry) => !query || (e.title + e.text).toLowerCase().includes(query.toLowerCase());
  const groups: [string, string, string][] = [["about", "关于我", "About me"], ["work", "作品", "Work"], ["writing", "文章", "Writing"], ["added", "线上新增", "Added online"], ["hidden", "已隐藏", "Hidden"]];
  const drafts = knowledge?.drafts.length ?? 0;
  return (
    <>
      <PageHeading eyebrow="WHAT IT KNOWS" title={t("它知道什么", "What it knows")} description={t("网站 AI 回答访客时只用这里的资料。改完马上生效，不用重新部署。", "The assistant answers visitors only from this. Changes apply right away.")}
        actions={<div className="toolbar">
          <Button variant="outline" onClick={() => file.current?.click()}><Upload />{t("上传文件", "Upload file")}</Button>
          <Button onClick={() => setEditing({ kind: "entry" })}><Plus />{t("新增一条", "Add entry")}</Button>
          <input ref={file} type="file" accept=".md,.txt,text/plain,text/markdown" hidden onChange={e => void upload(e)} />
        </div>} />
      {notice && <p className="adm-notice" role="status">{notice}</p>}
      <Problem problem={problem} />
      {!knowledge && !problem && <p role="status">{t("正在读取…", "Loading…")}</p>}
      {knowledge && (
        <>
          <div className="adm-knowledge-tools">
            <Input type="search" aria-label={t("搜索资料", "Search knowledge")} placeholder={t("搜索标题或内容", "Search titles or text")} value={query} onChange={e => setQuery(e.target.value)} />
            <CoreMeter used={knowledge.coreUsed} />
            {drafts > 0 && <p className="adm-hint">{t(`有 ${drafts} 条资料等你确认，`, `${drafts} entries wait for you; `)}<Link className="adm-text-link" to="/owner/inbox">{t("去待处理", "open the inbox")}</Link></p>}
          </div>
          {groups.map(([key, zh, en]) => {
            const items = knowledge.entries.filter(e => groupOf(e) === key && match(e));
            if (!items.length) return null;
            return (
              <section key={key} className="adm-section" aria-label={t(zh, en)}>
                <h2>{t(zh, en)}<span className="adm-count">{items.length}</span></h2>
                <ul className="adm-rows">
                  {items.map(e => {
                    const [label, tone] = tag(e);
                    return (
                      <li key={e.id}>
                        <button type="button" className="adm-row" data-off={e.hidden} onClick={() => setEditing({ kind: "entry", entry: e })}>
                          <span className="adm-row-main">
                            <strong>{e.title}</strong>
                            <span className="adm-row-meta">{e.tier === "core" ? t("每次都带上", "Every question") : t("需要时读取", "When relevant")}{e.origin !== "base" ? " · " + when(e.updated, locale) : ""}</span>
                          </span>
                          <span className="adm-pill" {...(tone === "live" ? { "data-state": "live" } : tone === "plain" ? {} : { "data-tone": tone })}>{label}</span>
                          <ChevronRight size={16} className="adm-row-chevron" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          <section className="adm-section" aria-labelledby="owner-answers">
            <h2 id="owner-answers">{t("你确认过的回答", "Answers you approved")}<span className="adm-count">{answers.length}</span></h2>
            <p className="adm-hint">{t("通过 AI 助手（例如 Grok Bot）保存的通用回答，网站 AI 会用它们回答类似问题。", "General answers saved through your agent; the assistant reuses them.")}</p>
            {!!answers.length && (
              <ul className="adm-cards">
                {answers.map(a => (
                  <li key={a.id} className="adm-card">
                    <div className="adm-card-row">
                      <div><h3>{a.question}</h3><p className="adm-snippet owner-pre">{a.answer}</p><p className="adm-sub">{when(a.created, locale)}</p></div>
                      <ConfirmButton variant="ghost" title={t("删除这条回答？", "Delete this answer?")} description={t("网站 AI 以后不会再用它。", "The assistant will stop using it.")} confirmLabel={t("删除", "Delete")} onConfirm={async () => { await call("forget", { id: a.id }); await loadAnswers(); }}><Trash2 /></ConfirmButton>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      <EditorDialog editing={editing} onClose={() => setEditing(null)} onSaved={m => { setEditing(null); setNotice(m); }} />
    </>
  );
}
