/** 待处理: everything that needs the owner, each with one clear next step. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading } from "@/components/shared";
import { usePreferences } from "@/lib/preferences";
import { workbench, questionOf, unanswered, isOwnerTest } from "@/lib/workbench";
import { useWorkbench, useAction, type Item } from "@/components/admin/store";
import { ProposalReview } from "@/components/admin/proposal";
import { CorrectionDialog, type CorrectionTarget } from "@/components/admin/correction";
import { when } from "@/components/admin/labels";
const SHOWN = 8;
export default function InboxPage() {
  const { t, locale } = usePreferences(),
    { state, error, inbox, release } = useWorkbench(),
    { busy, error: actionError, run } = useAction();
  const [openId, setOpenId] = useState(""),
    [target, setTarget] = useState<CorrectionTarget>();
  const heading = <PageHeading eyebrow="INBOX" title={t("待处理", "Inbox")} description={t("需要你看一眼的事都在这里。处理一件，它就更懂你一点。", "Everything that needs you is here. Each one makes your AI a little better.")} />;
  if (!state)
    return (
      <>
        {heading}
        <p role={error ? "alert" : "status"}>{error || t("正在读取…", "Loading…")}</p>
      </>
    );
  const dismiss = (r: Item) => run(() => workbench(r.origin === "cloud" ? "cloud-review" : "review", { id: r.id, note: r.review.note ?? "", corrected: r.review.corrected ?? "", reviewed: true }));
  const titleOf = (key: string) => state.assets.find((a) => a.key === key)?.title ?? key;
  return (
    <>
      {heading}
      {actionError && <p role="alert">{actionError}</p>}
      {inbox.count === 0 && (
        <div className="adm-empty">
          <h2>{t("都处理完了", "All caught up")}</h2>
          <p>{t("现在没有需要你处理的事。在右边「试一试」问它几个访客会问的问题，看看答得怎么样。", "Nothing needs you right now. Ask a few visitor-style questions in “Try it” to see how it answers.")}</p>
          <Link className="adm-text-link" to="/admin/knowledge">
            {t("看看它知道什么", "See what it knows")}
            <ArrowRight size={14} />
          </Link>
        </div>
      )}
      {inbox.proposals.length > 0 && (
        <section className="adm-section" aria-labelledby="inbox-drafts">
          <h2 id="inbox-drafts">{t("等你确认的修改", "Changes waiting for you")}</h2>
          <ul className="adm-cards">
            {inbox.proposals.map((p) => (
              <li key={p.id} className="adm-card" data-open={openId === p.id}>
                <div className="adm-card-row">
                  <div>
                    <h3>{p.before.title || t("新条目", "New entry")}</h3>
                    <p className="adm-sub">
                      {p.status === "running" ? t("AI 正在起草", "AI is drafting") : p.status === "failed" ? t("起草没成功", "Drafting failed") : p.instruction.startsWith("主人纠正") ? t("来自你的纠正 · 等你确认", "From your correction · waiting for you") : t("草稿已就绪 · 等你确认", "Draft ready · waiting for you")}
                      {" · "}
                      {when(p.created, locale)}
                    </p>
                  </div>
                  <Button variant={openId === p.id ? "ghost" : "outline"} aria-expanded={openId === p.id} onClick={() => setOpenId(openId === p.id ? "" : p.id)}>
                    {openId === p.id ? t("收起", "Close") : t("查看并确认", "Review")}
                  </Button>
                </div>
                {openId === p.id && <ProposalReview proposal={p} />}
              </li>
            ))}
          </ul>
        </section>
      )}
      {inbox.questions.length > 0 && (
        <section className="adm-section" aria-labelledby="inbox-questions">
          <h2 id="inbox-questions">{t("它没答好的问题", "Questions it struggled with")}</h2>
          <ul className="adm-cards">
            {inbox.questions.slice(0, SHOWN).map((r) => (
              <li key={r.origin + r.id} className="adm-card">
                <div className="adm-card-row">
                  <div>
                    <p className="adm-sub">
                      {r.review.note || r.review.corrected ? t("你标记过", "You flagged this") : unanswered(r) ? t("它没答上来", "It could not answer") : ""}
                      {" · "}
                      {isOwnerTest(r.conversation) ? t("我的测试", "My test") : t("访客", "Visitor")}
                      {" · "}
                      {when(r.created, locale)}
                    </p>
                    <h3 className="adm-question">{questionOf(r) || t("（没有问题文本）", "(no question text)")}</h3>
                    <p className="adm-snippet">{r.response || r.error || t("没有生成回答", "No answer was produced")}</p>
                  </div>
                </div>
                <div className="toolbar">
                  <Button variant="outline" onClick={() => setTarget({ question: questionOf(r), answer: r.response ?? "", runId: r.id, origin: r.origin, sources: r.selected?.map((s) => s.title), note: r.review.note, corrected: r.review.corrected })}>{t("纠正这个回答", "Correct this answer")}</Button>
                  <Button variant="ghost" disabled={busy} onClick={() => void dismiss(r)}>
                    {t("没问题，忽略", "It’s fine, dismiss")}
                  </Button>
                  <Link className="adm-text-link" to={`/admin/conversations?c=${encodeURIComponent(r.conversation)}`}>
                    {t("看整段对话", "Open conversation")}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          {inbox.questions.length > SHOWN && (
            <p className="adm-more">
              {t(`还有 ${inbox.questions.length - SHOWN} 条，`, `${inbox.questions.length - SHOWN} more, `)}
              <Link className="adm-text-link" to="/admin/conversations">
                {t("在「对话」里查看", "see Conversations")}
              </Link>
            </p>
          )}
        </section>
      )}
      {(inbox.sourceUpdates.length > 0 || inbox.pending > 0 || inbox.modelUnchecked) && (
        <section className="adm-section" aria-labelledby="inbox-other">
          <h2 id="inbox-other">{t("其他", "Other")}</h2>
          <ul className="adm-cards">
            {inbox.sourceUpdates.map((a) => (
              <li key={a.key} className="adm-card adm-card-row">
                <div>
                  <h3>{t(`网站上的「${a.title}」有更新`, `“${a.title}” changed on your site`)}</h3>
                  <p className="adm-sub">{t("你改过的版本还在用。对照一下，决定要不要换成网站的新内容。", "Your edited version is still in use. Compare and decide whether to adopt the site’s version.")}</p>
                </div>
                <Link className="adm-button adm-button-outline" to={`/admin/knowledge?item=${encodeURIComponent(a.key)}`}>
                  {t("去对照", "Compare")}
                </Link>
              </li>
            ))}
            {inbox.pending > 0 && (
              <li className="adm-card adm-card-row">
                <div>
                  <h3>{t(`${inbox.pending} 处改动未发布`, `${inbox.pending} unpublished changes`)}</h3>
                  <p className="adm-sub">
                    {release?.publishedAt ? t("测试对话已经在用；访客要等发布后才能看到。", "The test chat already uses them; visitors see them after you publish.") : t("还没发布过。发布后，线上的 AI 才会用这些资料回答。", "Never published. Publish so the online AI answers from this knowledge.")}
                    {release && release.documents.filter((d) => d.state !== "live").length > 0 && (
                      <>
                        {" "}
                        {release.documents.filter((d) => d.state !== "live").slice(0, 3).map((d) => d.title || titleOf("doc:" + d.id)).join("、")}
                        {release.documents.filter((d) => d.state !== "live").length > 3 ? t(" 等", " and more") : ""}
                      </>
                    )}
                  </p>
                </div>
                <Link className="adm-button adm-button-outline" to="/admin/publish">
                  {t("去发布", "Publish")}
                </Link>
              </li>
            )}
            {inbox.modelUnchecked && (
              <li className="adm-card adm-card-row">
                <div>
                  <h3>{t("确认模型能查阅详细资料", "Check the model can read detailed knowledge")}</h3>
                  <p className="adm-sub">{t("确认后，它能在需要时打开作品和文章的全文来回答。只需检查一次。", "Once confirmed, it can open full project and article texts when needed. One-time check.")}</p>
                </div>
                <Link className="adm-button adm-button-outline" to="/admin/publish#model">
                  {t("去检查", "Check")}
                </Link>
              </li>
            )}
          </ul>
        </section>
      )}
      <CorrectionDialog target={target} onClose={() => setTarget(undefined)} />
    </>
  );
}
