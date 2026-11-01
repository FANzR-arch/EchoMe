/** 它知道什么: every piece of knowledge in one list, with a plain editor, AI help and history per entry. */
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, MessagesSquare, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { PageHeading } from "@/components/shared";
import { usePreferences } from "@/lib/preferences";
import { workbench, type Asset } from "@/lib/workbench";
import { useWorkbench, useAction, openProposals } from "@/components/admin/store";
import { ProposalReview } from "@/components/admin/proposal";
import { ConfirmButton, CoreMeter, PublishPill, Hint } from "@/components/admin/ui";
import { groups, groupOf, sourceOf, publishOf, tierLabel, coreUsed, when } from "@/components/admin/labels";
import Interview from "@/pages/interview";
export default function KnowledgePage() {
  const [params] = useSearchParams();
  const item = params.get("item");
  if (item) return <Editor key={item} assetKey={item} />;
  if (params.get("add") === "1") return <AddForm />;
  return <KnowledgeList />;
}
export function KnowledgeInterview() {
  const { t } = usePreferences();
  return (
    <>
      <Link className="adm-back-link" to="/admin/knowledge">
        <ArrowLeft size={15} />
        {t("返回它知道什么", "Back to What it knows")}
      </Link>
      <Interview />
    </>
  );
}
function KnowledgeList() {
  const { t } = usePreferences(),
    { state, release, error } = useWorkbench();
  const [query, setQuery] = useState("");
  const entries = useMemo(() => (state?.assets ?? []).filter((a) => a.key.startsWith("doc:")), [state?.assets]);
  const heading = (
    <PageHeading
      eyebrow="WHAT IT KNOWS"
      title={t("它知道什么", "What it knows")}
      description={t("你的 AI 回答时用到的资料。改动会先在「试一试」里生效，发布后访客才能看到。", "The knowledge your AI answers from. Changes work in “Try it” first; visitors see them after you publish.")}
      actions={
        <div className="toolbar">
          <Link className="adm-button adm-button-outline" to="/admin/knowledge/interview">
            <MessagesSquare size={15} />
            {t("让 AI 采访我", "Let the AI interview me")}
          </Link>
          <Link className="adm-button" to="/admin/knowledge?add=1">
            <Plus size={15} />
            {t("教它一件事", "Teach it something")}
          </Link>
        </div>
      }
    />
  );
  if (!state)
    return (
      <>
        {heading}
        <p role={error ? "alert" : "status"}>{error || t("正在读取…", "Loading…")}</p>
      </>
    );
  const q = query.trim().toLowerCase();
  const matches = entries.filter((a) => !q || (a.title + "\n" + a.content).toLowerCase().includes(q));
  const drafts = openProposals(state).length;
  return (
    <>
      {heading}
      <div className="adm-knowledge-tools">
        <Input type="search" aria-label={t("搜索资料", "Search knowledge")} placeholder={t("搜索标题或内容", "Search titles or content")} value={query} onChange={(e) => setQuery(e.target.value)} />
        <CoreMeter used={coreUsed(state.assets)} />
      </div>
      {drafts > 0 && (
        <Hint>
          {t(`有 ${drafts} 处修改等你确认，`, `${drafts} drafted changes are waiting, `)}
          <Link className="adm-text-link" to="/admin/inbox">
            {t("去待处理", "open Inbox")}
          </Link>
        </Hint>
      )}
      {groups.map(([group, zh, en]) => {
        const items = matches.filter((a) => groupOf(a) === group);
        if (!items.length) return null;
        return (
          <section key={group} className="adm-section" aria-labelledby={"group-" + group}>
            <h2 id={"group-" + group}>
              {t(zh, en)} <span className="adm-count">{items.length}</span>
            </h2>
            <ul className="adm-rows">
              {items.map((a) => (
                <li key={a.key}>
                  <Link to={`/admin/knowledge?item=${encodeURIComponent(a.key)}`} className="adm-row" data-off={a.enabled === false}>
                    <span className="adm-row-main">
                      <strong>{a.title}</strong>
                      <span className="adm-row-meta">
                        {sourceOf(a, t)} · {tierLabel(a, t)}
                        {a.sourceChanged ? " · " + t("网站有更新", "Site updated") : ""}
                      </span>
                    </span>
                    <PublishPill state={publishOf(a, release)} />
                    <ChevronRight size={16} className="adm-row-chevron" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {!matches.length && (
        <div className="adm-empty">
          <p>{q ? t("没有找到相关资料。要不要教它？", "Nothing found. Want to teach it?") : t("它还什么都不知道。先教它一件事吧。", "It knows nothing yet. Teach it something.")}</p>
          <Link className="adm-text-link" to="/admin/knowledge?add=1">
            {t("教它一件事", "Teach it something")}
          </Link>
        </div>
      )}
    </>
  );
}
function BackToList({ dirty }: { dirty?: boolean }) {
  const { t } = usePreferences(),
    navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="adm-back"
      onClick={() => {
        if (dirty && !window.confirm(t("有没保存的修改，确定离开？", "Discard unsaved edits?"))) return;
        navigate("/admin/knowledge");
      }}
    >
      <ArrowLeft />
      {t("返回它知道什么", "Back to What it knows")}
    </Button>
  );
}
function AddForm() {
  const { t } = usePreferences(),
    navigate = useNavigate(),
    { busy, error, run } = useAction();
  const [title, setTitle] = useState(""),
    [content, setContent] = useState(""),
    [urls, setUrls] = useState(""),
    [research, setResearch] = useState(false);
  const links = urls.split("\n").map((s) => s.trim()).filter(Boolean);
  return (
    <>
      <BackToList dirty={!!(title || content)} />
      <PageHeading eyebrow="TEACH IT" title={t("教它一件事", "Teach it something")} description={t("写下你希望它知道的事，就像告诉一位新同事。保存后马上能在「试一试」里用。", "Write what you want it to know, as you would tell a new colleague. It works in “Try it” right after saving.")} />
      <form
        className="form-stack adm-form"
        onSubmit={(e) => {
          e.preventDefault();
          let key = "";
          void run(async () => {
            key = (await workbench<{ key: string }>("new", { title: title.trim(), content: content.trim(), kind: research ? "research" : "personal", urls: links })).key;
          }).then((ok) => {
            if (!ok) return;
            toast.success(t("已记下。发布后访客才能看到。", "Saved. Visitors see it after you publish."));
            navigate(`/admin/knowledge?item=${encodeURIComponent(key)}`);
          });
        }}
      >
        <label>
          {t("标题", "Title")}
          <Input aria-label={t("新资料标题", "New entry title")} value={title} maxLength={400} onChange={(e) => setTitle(e.target.value)} placeholder={t("例如：我现在接哪些合作", "For example: what work I take on now")} />
        </label>
        <label>
          {t("内容", "Content")}
          <Textarea className="wb-editor" aria-label={t("新资料内容", "New entry content")} value={content} onChange={(e) => setContent(e.target.value)} placeholder={t("用你自己的话写，写清楚事实。", "Use your own words; state the facts plainly.")} />
        </label>
        <label>
          {t("相关链接（可选，每行一个 https 地址）", "Links (optional, one https URL per line)")}
          <Textarea aria-label={t("相关链接", "Links")} value={urls} onChange={(e) => setUrls(e.target.value)} />
        </label>
        <label className="wb-check">
          <input type="checkbox" checked={research} onChange={(e) => setResearch(e.target.checked)} />
          <span>
            {t("这是外部参考资料，不代表我的观点", "This is an external reference, not my own view")}
            {research && !links.length && <small className="adm-sub"> · {t("外部参考需要至少一个链接", "References need at least one link")}</small>}
          </span>
        </label>
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={busy || !title.trim() || !content.trim() || (research && !links.length)}>
          {t("保存", "Save")}
        </Button>
      </form>
    </>
  );
}
function Editor({ assetKey }: { assetKey: string }) {
  const { t, locale } = usePreferences(),
    { state, release, error: loadError } = useWorkbench(),
    { busy, error, setError, run } = useAction();
  const asset = state?.assets.find((a) => a.key === assetKey);
  const [draft, setDraft] = useState<Asset>(),
    [dirty, setDirty] = useState(false),
    [instruction, setInstruction] = useState(""),
    [cost, setCost] = useState(false),
    [prompt, setPrompt] = useState<{ id: string; text: string }>();
  // Follow the saved version unless the owner is mid-edit; a stale base then surfaces as a conflict on save.
  useEffect(() => {
    if (asset && !dirty) setDraft(asset);
  }, [asset?.base]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  if (!state)
    return (
      <>
        <BackToList />
        <p role={loadError ? "alert" : "status"}>{loadError || t("正在读取…", "Loading…")}</p>
      </>
    );
  if (!asset || !draft)
    return (
      <>
        <BackToList />
        <div className="adm-empty">
          <p>{t("找不到这条资料，可能已被删除。", "This entry was not found; it may have been removed.")}</p>
        </div>
      </>
    );
  const edit = (patch: Partial<Asset>) => {
    setDirty(true);
    setDraft({ ...draft, ...patch });
  };
  const isDoc = draft.key.startsWith("doc:");
  const proposals = openProposals(state).filter((p) => p.target === asset.key);
  const history = state.revisions.filter((r) => r.target === asset.key);
  const save = () =>
    run(async () => {
      await workbench("save", { asset: draft, base: draft.base });
      setDirty(false);
      toast.success(t("已保存。测试对话马上会用到；发布后访客才能看到。", "Saved. The test chat uses it now; visitors see it after publishing."));
    });
  const requestProposal = (cli: boolean) =>
    run(async () => {
      const result = await workbench<{ id: string; prompt: string }>("propose", { target: asset.key, instruction, cli, confirmCost: cost });
      setPrompt(cli ? undefined : { id: result.id, text: result.prompt });
      setInstruction("");
      setCost(false);
    });
  return (
    <>
      <BackToList dirty={dirty} />
      <header className="adm-editor-head">
        <h1>{asset.title}</h1>
        <p className="adm-sub">
          {sourceOf(asset, t)}
          {asset.updated ? " · " + t("更新于 ", "Updated ") + when(asset.updated, locale) : ""} <PublishPill state={publishOf(asset, release)} />
        </p>
      </header>
      {asset.sourceMissing && <p className="adm-warn">{t("网站上的原文已经删除，这条资料不会再被用到。", "The original was removed from your site; this entry is no longer used.")}</p>}
      {asset.sourceChanged && (
        <div className="adm-notice">
          <p>{t("网站上的原文有更新。你改过的版本还在用，对照后再决定是否换成网站的新内容。", "The original changed on your site. Your edited version is still used; compare before adopting.")}</p>
          {asset.source && (
            <>
              <details>
                <summary>{t("查看网站的新内容", "View the site’s new content")}</summary>
                <pre className="wb-text">{asset.source.content}</pre>
              </details>
              <Button variant="outline" disabled={busy} onClick={() => void run(async () => { await workbench("adopt-source", { key: asset.key, base: asset.base }); setDirty(false); })}>
                {t("换成网站的新内容", "Adopt the site’s version")}
              </Button>
            </>
          )}
        </div>
      )}
      <form
        className="form-stack adm-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          {t("标题", "Title")}
          <Input aria-label={t("资料标题", "Entry title")} value={draft.title} maxLength={400} onChange={(e) => edit({ title: e.target.value })} />
        </label>
        <label>
          {t("内容", "Content")}
          <Textarea className="wb-editor" aria-label={t("资料正文", "Entry content")} value={draft.content} onChange={(e) => edit({ content: e.target.value })} />
        </label>
        {isDoc && (
          <>
            <div className="adm-toggles">
              <div className="adm-toggle">
                <span>
                  <strong id="toggle-enabled">{t("启用", "Enabled")}</strong>
                  <small id="toggle-enabled-help">{t("关掉后，它回答时不会再用到这条资料。", "When off, it will not use this entry.")}</small>
                </span>
                <Switch aria-labelledby="toggle-enabled" aria-describedby="toggle-enabled-help" checked={draft.enabled !== false} onCheckedChange={(checked) => edit({ enabled: checked })} />
              </div>
              <div className="adm-toggle">
                <span>
                  <strong id="toggle-core">{t("每次都带上", "Always include")}</strong>
                  <small id="toggle-core-help">{draft.kind === "research" ? t("外部参考只能在需要时读取。", "References are only read when needed.") : t("适合最重要的简短介绍。关掉则「需要时读取」：相关问题才会打开它。", "For the most important short facts. Off means it is read only when a question needs it.")}</small>
                </span>
                <Switch aria-labelledby="toggle-core" aria-describedby="toggle-core-help" disabled={draft.kind === "research"} checked={draft.tier === "core"} onCheckedChange={(checked) => edit({ tier: checked ? "core" : "detail" })} />
              </div>
            </div>
            <CoreMeter used={coreUsed(state.assets, draft)} />
            <label>
              {t("来源链接（每行一个 https 地址）", "Source links (one https URL per line)")}
              <Textarea aria-label={t("来源链接", "Source links")} value={draft.urls.join("\n")} onChange={(e) => edit({ urls: e.target.value.split("\n").filter(Boolean) })} />
            </label>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="toolbar">
          <Button type="submit" disabled={busy || !dirty || !draft.content.trim()}>
            {t("保存", "Save")}
          </Button>
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(asset);
                setDirty(false);
                setError("");
              }}
            >
              {t("撤销未保存的修改", "Discard edits")}
            </Button>
          )}
        </div>
      </form>
      {proposals.length > 0 && (
        <section className="adm-section" aria-labelledby="entry-drafts">
          <h2 id="entry-drafts">{t("等你确认的修改", "Changes waiting for you")}</h2>
          {proposals.map((p) => (
            <div className="adm-card" key={p.id}>
              <ProposalReview proposal={p} prompt={prompt?.id === p.id ? prompt.text : undefined} />
            </div>
          ))}
        </section>
      )}
      <details className="adm-disclosure">
        <summary>{t("让 AI 帮我改", "Let the AI rewrite it")}</summary>
        <div className="form-stack">
          <p className="adm-sub">{t("说说要怎么改，AI 会起草一份新版本，你看过再确认。", "Say what to change. The AI drafts a new version for you to review.")}</p>
          <Textarea aria-label={t("修改要求", "What to change")} value={instruction} maxLength={8000} onChange={(e) => setInstruction(e.target.value)} placeholder={t("例如：补上我现在的工作室名字，删掉过时的项目。", "For example: add my current studio name and remove outdated projects.")} />
          <label className="wb-check">
            <input type="checkbox" checked={cost} onChange={(e) => setCost(e.target.checked)} />
            {t("允许这次用本机 Codex 起草：会使用你的 Codex 账户额度，并把这条资料发给它的服务商；最多 2 分钟。", "Allow local Codex to draft this: uses your Codex quota and sends this entry to its provider; up to 2 minutes.")}
          </label>
          <div className="toolbar">
            <Button variant="outline" disabled={busy || !cost || !state.cli || !instruction.trim()} onClick={() => void requestProposal(true)}>
              {t("用 Codex 起草", "Draft with Codex")}
            </Button>
            <Button variant="ghost" disabled={busy || !instruction.trim()} onClick={() => void requestProposal(false)}>
              {t("交给其他 AI 助手", "Use another assistant")}
            </Button>
          </div>
          {!state.cli && <p className="adm-sub">{t("这台电脑上没找到 Codex，可以把任务复制给其他 AI 助手。", "Codex was not found on this computer; copy the task to another assistant instead.")}</p>}
        </div>
      </details>
      <details className="adm-disclosure">
        <summary>
          {t("历史版本", "History")} <span className="adm-count">{history.length}</span>
        </summary>
        {!history.length ? (
          <p className="adm-sub">{t("还没有改过。", "No changes yet.")}</p>
        ) : (
          <ol className="adm-history">
            {history.map((r) => (
              <li key={r.id}>
                <details>
                  <summary>{when(r.created, locale)}</summary>
                  <div className="wb-compare">
                    <section>
                      <h3>{t("改之前", "Before")}</h3>
                      <pre>{r.before.content || t("（新增）", "(added)")}</pre>
                    </section>
                    <section>
                      <h3>{t("改之后", "After")}</h3>
                      <pre>{r.after.content}</pre>
                    </section>
                  </div>
                  <ConfirmButton
                    destructive={false}
                    variant="outline"
                    className=""
                    title={t("恢复到这次修改之前？", "Restore the version before this change?")}
                    description={t("内容会变回「改之前」的样子，同时新增一条历史记录，随时可以再改回来。", "The content returns to “Before”. A new history entry is added, so you can always change it back.")}
                    confirmLabel={t("恢复", "Restore")}
                    onConfirm={() =>
                      run(async () => {
                        await workbench("rollback", { id: r.id, base: asset.base });
                        setDirty(false);
                        toast.success(t("已恢复先前版本", "Previous version restored"));
                      })
                    }
                  >
                    {t("恢复到这次修改之前", "Restore the earlier version")}
                  </ConfirmButton>
                </details>
              </li>
            ))}
          </ol>
        )}
      </details>
    </>
  );
}
