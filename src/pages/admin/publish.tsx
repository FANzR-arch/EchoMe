/** 发布与嵌入: put reviewed knowledge online, put the chat on your site, and the few settings that affect both. */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { PageHeading } from "@/components/shared";
import { usePreferences } from "@/lib/preferences";
import { chatSiteUrl } from "@/lib/site";
import { workbench, type ReleaseStatus } from "@/lib/workbench";
import { useWorkbench, useAction } from "@/components/admin/store";
import { ConfirmButton, CopyBlock, Hint } from "@/components/admin/ui";
import { changeLabel, when } from "@/components/admin/labels";
export default function PublishPage() {
  const { t, locale } = usePreferences(),
    { state, release, cloud, error } = useWorkbench(),
    publishing = useAction(),
    checking = useAction(),
    retention = useAction();
  const [justPublished, setJustPublished] = useState(false);
  const location = useLocation();
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [location.hash, !!state]);
  const chatUrl = new URL("/chat", chatSiteUrl).href;
  const snippet = `<script src="${new URL("/embed.js", chatSiteUrl).href}" data-label="和我的 AI 聊聊" defer></script>`;
  const changes = release
    ? [
        ...(release.personaChanged ? [[t("助手人设", "Assistant persona"), t("已修改", "Changed")]] : []),
        ...(release.rulesChanged ? [[t("回答规则", "Answer rules"), t("已修改", "Changed")]] : []),
        ...(release.ownerChanged ? [[t("名片信息", "Business card"), t("已修改", "Changed")]] : []),
        ...release.documents.filter((d) => d.state !== "live").map((d) => [d.title, changeLabel(d.state, t)]),
      ]
    : [];
  return (
    <>
      <PageHeading eyebrow="PUBLISH & EMBED" title={t("发布与嵌入", "Publish & embed")} description={t("把确认好的资料发布到线上，再把聊天窗口放到你的网站上。", "Put reviewed knowledge online, then add the chat to your website.")} />
      {error && <p role="alert">{error}</p>}
      <section className="adm-card form-stack" aria-labelledby="publish-title">
        <div className="adm-card-row">
          <div>
            <h2 id="publish-title">{t("发布", "Publish")}</h2>
            <p className="adm-sub">{release?.publishedAt ? t("上次发布：", "Last published: ") + when(release.publishedAt, locale) : t("还没有发布过", "Never published")}</p>
          </div>
          <ConfirmButton
            destructive={false}
            variant="default"
            className=""
            disabled={!release || publishing.busy || release.pending === 0}
            title={t("发布这些改动？", "Publish these changes?")}
            description={t(
              "会把现在启用的资料、人设和规则写进发布文件 deploy/knowledge-release.json。不包含任何对话记录和未确认的草稿。写好后还要部署一次，线上才会更新。",
              "Writes the enabled knowledge, persona and rules to deploy/knowledge-release.json. No conversations or unconfirmed drafts are included. Deploy afterwards to update the live site.",
            )}
            confirmLabel={t("发布", "Publish")}
            onConfirm={() =>
              publishing.run(async () => {
                await workbench<ReleaseStatus>("publish", { confirm: true });
                setJustPublished(true);
                toast.success(t("已写好发布文件。最后一步：部署到线上。", "Release written. Last step: deploy."));
              })
            }
          >
            {t("发布", "Publish")}
          </ConfirmButton>
        </div>
        {publishing.error && <p role="alert">{publishing.error}</p>}
        {!release ? (
          <p role="status">{t("正在检查改动…", "Checking changes…")}</p>
        ) : changes.length ? (
          <>
            <p>{t(`${changes.length} 处改动还没发布：`, `${changes.length} changes not yet published:`)}</p>
            <ul className="adm-changes">
              {changes.map(([title, label], i) => (
                <li key={i}>
                  <span>{title}</span>
                  <span className="adm-pill" data-state="draft">
                    {label}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="adm-sub">{t("所有改动都已发布。", "Everything is published.")}</p>
        )}
        <details className="adm-disclosure" open={justPublished || undefined}>
          <summary>{t("下一步：部署到线上", "Next: deploy")}</summary>
          <p className="adm-sub">{t("发布只是在本机写好文件。在项目文件夹打开终端，运行下面的命令，线上的 AI 就会换成新资料：", "Publishing writes a file on this computer. Open a terminal in the project folder and run this to update the live AI:")}</p>
          <CopyBlock value="npm run deploy:vercel" label={t("部署命令", "Deploy command")} />
        </details>
      </section>
      <section className="adm-card form-stack" aria-labelledby="embed-title">
        <h2 id="embed-title">{t("放到你的网站上", "Add it to your website")}</h2>
        <p className="adm-sub">{t("把这一行粘贴到你网站页面的 </body> 前面，右下角就会出现「和我的 AI 聊聊」按钮。", "Paste this line before </body> on your site. A “Talk to my AI” button appears in the corner.")}</p>
        <CopyBlock value={snippet} label={t("嵌入代码", "Embed code")} />
        <details className="adm-disclosure">
          <summary>{t("可选设置", "Optional settings")}</summary>
          <dl className="adm-attrs">
            <dt>
              <code>data-theme</code>
            </dt>
            <dd>{t("auto（默认，跟随访客系统）、light 或 dark", "auto (default, follows the visitor), light or dark")}</dd>
            <dt>
              <code>data-position</code>
            </dt>
            <dd>{t("right（默认）或 left：按钮放在哪一侧", "right (default) or left: which corner")}</dd>
            <dt>
              <code>data-open</code>
            </dt>
            <dd>{t("true：页面打开时就展开聊天窗口", "true: open the chat when the page loads")}</dd>
            <dt>
              <code>data-label</code>
            </dt>
            <dd>{t("按钮上的文字", "The button text")}</dd>
          </dl>
          <p className="adm-sub">{t("嵌入的网站需要在 owner.config 的 embedOrigins 里。", "The embedding site must be listed in embedOrigins in owner.config.")}</p>
        </details>
        <div className="toolbar">
          <a className="adm-text-link" href={chatUrl} target="_blank" rel="noopener noreferrer">
            {t("打开完整聊天页", "Open the full chat page")}
            <ArrowUpRight size={14} />
          </a>
          <a className="adm-text-link" href="/embed-preview" target="_blank" rel="noopener noreferrer">
            {t("预览嵌入效果", "Preview the embed")}
            <ArrowUpRight size={14} />
          </a>
        </div>
      </section>
      <section className="adm-card form-stack" id="model" aria-labelledby="model-title">
        <h2 id="model-title">{t("模型检查", "Model check")}</h2>
        {!state ? (
          <p role="status">{t("正在读取…", "Loading…")}</p>
        ) : (
          <>
            <p className="adm-status" data-ok={state.detailReading.available}>
              {state.detailReading.available ? t("已确认：模型能在需要时查阅作品和文章的全文。", "Confirmed: the model can open full project and article texts when needed.") : t("还没确认模型能查阅详细资料。没确认前，它只用「每次都带上」的资料和目录回答。", "Not confirmed yet. Until then it answers only from always-included knowledge and the catalog.")}
            </p>
            {checking.error && <p role="alert">{checking.error}</p>}
            <ConfirmButton
              destructive={false}
              variant="outline"
              className=""
              disabled={checking.busy}
              title={t("检查模型？", "Check the model?")}
              description={t("会向你配置的模型服务发 2 次很短的请求（每次最多 64 tokens），会用掉一点额度。", "Sends 2 very short requests (up to 64 output tokens each) to your provider. Uses a little quota.")}
              confirmLabel={t("开始检查", "Run check")}
              onConfirm={() => checking.run(() => workbench("check-model", { confirmCost: true }))}
            >
              {state.detailReading.available ? t("重新检查", "Check again") : t("检查模型", "Check model")}
            </ConfirmButton>
          </>
        )}
      </section>
      <section className="adm-card form-stack" aria-labelledby="retention-title">
        <h2 id="retention-title">{t("线上对话保存多久", "How long online conversations are kept")}</h2>
        {!cloud ? (
          <p role="status">{t("正在读取…", "Loading…")}</p>
        ) : !cloud.configured || !cloud.settings ? (
          <Hint>{t("还没有连接线上存档。连接后，访客在线上的对话会保存下来，供你在「对话」里查看。", "The online archive is not connected. Once connected, online conversations are kept for you to review in Conversations.")}</Hint>
        ) : (
          <>
            <label className="cloud-retention">
              {t("超过这么久没有新消息的对话，自动删除：", "Delete conversations inactive for:")}
              <select
                aria-label={t("线上对话保存期限", "Online retention period")}
                value={cloud.settings.retention_days}
                disabled={retention.busy}
                onChange={(e) => {
                  const days = Number(e.target.value);
                  if (days !== 0 && !window.confirm(t("保存后，超过所选天数没有新消息的整段对话和批注会在下次清理时永久删除。继续？", "Expired conversations and notes will be permanently deleted at the next cleanup. Continue?"))) return;
                  void retention.run(() => workbench("cloud-retention", { days }));
                }}
              >
                {[7, 30, 90, 0].map((d) => (
                  <option key={d} value={d}>
                    {d ? t(`${d} 天`, `${d} days`) : t("不自动删除", "Keep until I delete")}
                  </option>
                ))}
              </select>
            </label>
            {retention.error && <p role="alert">{retention.error}</p>}
            <p className="adm-sub">{t("每小时清理一次，只删除线上对话和批注；资料、本机记录和访客浏览器里的历史不受影响。", "Cleanup runs hourly and removes online conversations and notes only; knowledge, local records and visitors’ browser history stay.")}</p>
          </>
        )}
      </section>
    </>
  );
}
