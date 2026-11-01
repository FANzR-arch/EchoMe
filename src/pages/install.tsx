import { useState } from "react";
import { Check, Copy, ArrowUpRight } from "lucide-react";
import { usePreferences } from "@/lib/preferences";
import { owner, assistantName } from "@/lib/owner";
import "../install.css";

/** Public setup page for a fresh deployment: this site's own embed code, nothing private. */
export default function InstallPage() {
  const { t } = usePreferences();
  const snippet = `<script src="${location.origin}/embed.js" data-label="${t("和我的 AI 聊聊", "Talk to my AI")}" defer></script>`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(snippet); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* Select the code manually. */ }
  };
  const allowed = owner.embedOrigins.filter(o => o.startsWith("https://"));
  return (
    <main className="install-page">
      <p className="install-eyebrow">PersonalAI</p>
      <h1>{t(`${assistantName.zh}已经上线`, `${assistantName.en} is live`)}</h1>
      <p className="install-lead">{t("把下面这一行放进你网站的页面里，右下角就会出现聊天按钮。", "Paste this line into your site's pages and a chat button appears in the corner.")}</p>
      <div className="install-code">
        <code>{snippet}</code>
        <button type="button" onClick={copy} aria-label={t("复制嵌入代码", "Copy embed code")}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? t("已复制", "Copied") : t("复制", "Copy")}
        </button>
      </div>
      <ol className="install-steps">
        <li>
          <strong>{t("允许你的网站嵌入", "Allow your site")}</strong>
          {allowed.length
            ? t(`当前允许：${allowed.join("、")}。要换成别的网站，改 owner.config.json 的 embedOrigins。`, `Allowed now: ${allowed.join(", ")}. To use another site, edit embedOrigins in owner.config.json.`)
            : t("在 owner.config.json 的 embedOrigins 里填上你网站的地址，例如 https://your-site.com。", "Add your site's origin, such as https://your-site.com, to embedOrigins in owner.config.json.")}
        </li>
        <li>
          <strong>{t("换成你的资料", "Make it yours")}</strong>
          {t("在你的仓库里改 owner.config.json 和 knowledge/ 文件夹，提交后 Vercel 会自动重新部署。", "Edit owner.config.json and the knowledge/ folder in your repository. Vercel redeploys on every commit.")}
        </li>
        <li>
          <strong>{t("先试一试", "Try it first")}</strong>
          <a href="/chat">{t("打开完整聊天页", "Open the full chat")} <ArrowUpRight size={14} /></a>
        </li>
      </ol>
      <p className="install-note">{t("可选属性：data-theme=\"auto|light|dark\"、data-position=\"right|left\"、data-open=\"true\"。", "Optional attributes: data-theme=\"auto|light|dark\", data-position=\"right|left\", data-open=\"true\".")}</p>
    </main>
  );
}
