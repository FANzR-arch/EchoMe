/** 待处理: drafts to review, questions the assistant could not answer, visitors waiting for you. One clear next step each. */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/shared";
import { usePreferences } from "@/lib/preferences";
import { call, when } from "@/lib/owner-client";
import { useOwner } from "./state";
import { EditorDialog, type Editing } from "./editor";
import { Problem } from "./knowledge";

export default function OwnerInbox() {
  const { t, locale } = usePreferences(), { knowledge, inbox, problem, count, refresh } = useOwner(), navigate = useNavigate();
  const [editing, setEditing] = useState<Editing | null>(null), [notice, setNotice] = useState("");
  const drafts = knowledge?.drafts ?? [], questions = inbox?.questions ?? [], notes = inbox?.notes ?? [];
  const source = (s: string) => s === "agent" ? t("AI 助手整理", "From your agent") : s === "upload" ? t("你上传的", "Uploaded") : t("你写的", "Yours");
  return (
    <>
      <PageHeading eyebrow="INBOX" title={t("待处理", "Inbox")} description={t("需要你看一眼的事都在这里。处理一件，它就更懂你一点。", "Everything that needs you is here. Each one makes your AI a little better.")} />
      {notice && <p className="adm-notice" role="status">{notice}</p>}
      <Problem problem={problem} />
      {!inbox && !problem && <p role="status">{t("正在读取…", "Loading…")}</p>}
      {inbox && count === 0 && (
        <div className="adm-empty">
          <h2>{t("都处理完了", "All caught up")}</h2>
          <p>{t("现在没有需要你处理的事。在右上角「试一试」问它几个访客会问的问题，看看答得怎么样。", "Nothing needs you right now. Ask a few visitor-style questions in “Try it”.")}</p>
          <Link className="adm-text-link" to="/owner/knowledge">{t("看看它知道什么", "See what it knows")}<ArrowRight size={14} /></Link>
        </div>
      )}
      {drafts.length > 0 && (
        <section className="adm-section" aria-labelledby="inbox-drafts">
          <h2 id="inbox-drafts">{t("等你确认的资料", "Knowledge waiting for you")}<span className="adm-count">{drafts.length}</span></h2>
          <ul className="adm-cards">
            {drafts.map(d => (
              <li key={d.id} className="adm-card">
                <div className="adm-card-row">
                  <div>
                    <h3>{d.title}</h3>
                    <p className="adm-sub">{source(d.source)} · {d.replaces ? t("修改已有资料", "Changes an entry") : t("新增", "New")} · {when(d.updated, locale)}</p>
                    <p className="adm-snippet">{d.text}</p>
                  </div>
                  <Button variant="outline" onClick={() => setEditing({ kind: "draft", draft: d })}>{t("查看并确认", "Review")}</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {notes.length > 0 && (
        <section className="adm-section" aria-labelledby="inbox-notes">
          <h2 id="inbox-notes">{t("想找你本人的访客", "Visitors asking for you")}<span className="adm-count">{notes.length}</span></h2>
          <ul className="adm-cards">
            {notes.map(n => (
              <li key={n.id} className="adm-card">
                <div className="adm-card-row">
                  <div>
                    <p className="adm-sub">{t("访客留言", "Visitor note")} · {when(n.created, locale)}</p>
                    <p className="adm-question owner-note">{n.text}</p>
                  </div>
                  <Button variant="outline" onClick={() => navigate(`/owner/conversations?c=${encodeURIComponent(n.conversation)}`)}>{t("去回复", "Reply")}</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {questions.length > 0 && (
        <section className="adm-section" aria-labelledby="inbox-questions">
          <h2 id="inbox-questions">{t("它没答上来的问题", "Questions it couldn't answer")}<span className="adm-count">{questions.length}</span></h2>
          <ul className="adm-cards">
            {questions.map(q => (
              <li key={q.id} className="adm-card">
                <p className="adm-sub">{t("访客", "Visitor")} · {when(q.created, locale)}</p>
                <p className="adm-question">{q.question}</p>
                <p className="adm-snippet">{q.answer}</p>
                <div className="toolbar">
                  <Button size="sm" onClick={() => setEditing({ kind: "correction", question: q.question, answer: q.answer, runId: q.id })}>{t("写一条资料", "Add the answer")}</Button>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/owner/conversations?c=${encodeURIComponent(q.conversation)}`)}>{t("看对话", "Open chat")}</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { await call("dismiss", { id: q.id }); await refresh(); setNotice(t("已忽略。", "Dismissed.")); }}>{t("忽略", "Dismiss")}</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <EditorDialog editing={editing} onClose={() => setEditing(null)} onSaved={m => { setEditing(null); setNotice(m); }} />
    </>
  );
}
