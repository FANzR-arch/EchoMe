/** 用量与嵌入: today's usage against the limits, the embed code and where to change things that live outside this page. */
import { PageHeading } from "@/components/shared";
import { CopyBlock } from "@/components/admin/ui";
import { usePreferences } from "@/lib/preferences";
import { useOwner } from "./state";

export default function OwnerSettings() {
  const { t } = usePreferences(), { usage } = useOwner();
  const snippet = `<script src="${location.origin}/embed.js" data-label="${t("和我的 AI 聊聊", "Talk to my AI")}" defer></script>`;
  const used = usage?.today ?? 0, daily = usage?.limits.daily ?? 0;
  return (
    <>
      <PageHeading eyebrow="USAGE & EMBED" title={t("用量与嵌入", "Usage & embed")} description={t("今天回答了多少条、上限多少，以及放到你网站上的那一行代码。", "Today's usage, the limits, and the line that puts the chat on your site.")} />
      <section className="adm-section">
        <h2>{t("今天的用量", "Today's usage")}</h2>
        {usage && (
          <div className="adm-meter" data-over={used >= daily}>
            <div className="adm-meter-label"><span>{t("访客消息", "Visitor messages")}</span><span>{used.toLocaleString()} / {daily.toLocaleString()}</span></div>
            <div className="adm-meter-track" role="meter" aria-valuemin={0} aria-valuemax={daily} aria-valuenow={used} aria-label={t("今天的访客消息", "Visitor messages today")}><span style={{ width: Math.min(100, daily ? (used / daily) * 100 : 0) + "%" }} /></div>
          </div>
        )}
        <p className="adm-hint">{usage ? t(`每分钟最多 ${usage.limits.perMinute} 条，同时回答 ${usage.limits.concurrent} 条。用完后访客会看到“今天的对话次数已经用完了”，第二天自动恢复。`, `Up to ${usage.limits.perMinute} per minute and ${usage.limits.concurrent} at once. Resets daily.`) : t("正在读取…", "Loading…")}</p>
        <p className="adm-hint">{t("想调高：在 Vercel 的环境变量里设 PAI_DAILY_LIMIT、PAI_PER_MINUTE_LIMIT、PAI_CONCURRENT_LIMIT，然后 Redeploy。", "To raise them, set PAI_DAILY_LIMIT, PAI_PER_MINUTE_LIMIT or PAI_CONCURRENT_LIMIT in Vercel and redeploy.")}</p>
      </section>
      <section className="adm-section">
        <h2>{t("放到你的网站上", "Put it on your site")}</h2>
        <p className="adm-hint">{t("把这一行放进网站页面的 </body> 前面，右下角会出现聊天按钮。你的网站地址要写在 owner.config.json 的 embedOrigins 里。", "Paste this before </body>. Your site must be listed in embedOrigins in owner.config.json.")}</p>
        <CopyBlock value={snippet} label={t("嵌入代码", "Embed code")} />
        <a className="adm-text-link" href="/chat" target="_blank" rel="noopener noreferrer">{t("打开完整聊天页", "Open the full chat")}</a>
      </section>
      <section className="adm-section">
        <h2>{t("和你的 AI 助手联动", "Connect your own AI")}</h2>
        <p className="adm-hint">{t("接上 Grok Bot 这类助手后，访客想合作、留了联系方式时会提醒你；你对它说一句就能回复访客、改资料。步骤见仓库里的 docs/GROK-BOT.md。", "With an agent like Grok Bot connected, you get alerts for visitors who want you, and can reply or edit knowledge by talking to it. See docs/GROK-BOT.md.")}</p>
      </section>
    </>
  );
}
