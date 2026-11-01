/** Review one drafted change: what it was before, the editable draft, confirm or discard. */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePreferences } from "@/lib/preferences";
import { workbench, type Proposal } from "@/lib/workbench";
import { useAction } from "./store";
const failure = (error: string | undefined, t: (zh: string, en: string) => string) =>
  !error ? "" :
  /AUTH/.test(error) ? t("Codex 没有登录。", "Codex is not signed in.") :
  /NETWORK/.test(error) ? t("网络连接失败。", "Network connection failed.") :
  /TIMEOUT|CANCELLED/.test(error) ? t("超时或被停止。", "Timed out or stopped.") :
  /RESTARTED/.test(error) ? t("管理网站重启时中断了。", "Interrupted when the admin site restarted.") :
  t("没能生成草稿。", "Could not produce a draft.");
export function ProposalReview({ proposal, prompt }: { proposal: Proposal; prompt?: string }) {
  const { t } = usePreferences(),
    { busy, error, run } = useAction();
  const [text, setText] = useState(proposal.content);
  useEffect(() => {
    if (proposal.status !== "running") setText(proposal.content);
  }, [proposal.id, proposal.status]);
  if (proposal.status === "running")
    return (
      <div className="adm-proposal" role="status">
        <p>{t("AI 正在起草，通常一两分钟。草稿不会自动生效。", "The AI is drafting, usually a minute or two. Nothing applies automatically.")}</p>
        <Button variant="outline" disabled={busy} onClick={() => void run(() => workbench("proposal-cancel", { id: proposal.id }))}>
          {t("停止", "Stop")}
        </Button>
      </div>
    );
  return (
    <div className="adm-proposal">
      {proposal.status === "failed" && (
        <p className="adm-warn">
          {failure(proposal.error, t)} {t("你可以直接在右边写好草稿再确认，或放弃。", "You can write the draft yourself and confirm, or discard it.")}
        </p>
      )}
      {proposal.instruction && (
        <details>
          <summary>{t("这次要改什么", "What was asked")}</summary>
          <p className="wb-text">{proposal.instruction.split("\n以下为待审核对话数据")[0]}</p>
        </details>
      )}
      <div className="wb-compare">
        <section>
          <h3>{t("现在的内容", "Current")}</h3>
          <pre>{proposal.before.content || t("（新条目）", "(new entry)")}</pre>
        </section>
        <section>
          <h3>{t("修改后", "After")}</h3>
          <Textarea className="wb-editor" aria-label={t("草稿正文", "Draft text")} value={text} onChange={(e) => setText(e.target.value)} />
        </section>
      </div>
      {proposal.metrics && (
        <details>
          <summary>{t("详情", "Details")}</summary>
          <p className="wb-meta">
            {t("模型", "Model")}: {proposal.metrics.model ?? proposal.metrics.requestedModel ?? "—"} · {((proposal.metrics.durationMs ?? 0) / 1000).toFixed(1)} s · tokens {proposal.metrics.usage?.input_tokens ?? "—"} / {proposal.metrics.usage?.output_tokens ?? "—"}
          </p>
        </details>
      )}
      {prompt && (
        <details open>
          <summary>{t("复制给其他 AI 助手", "Copy for another AI assistant")}</summary>
          <p className="wb-meta">{t("把下面的任务交给 Grok 或其他助手，再把它给出的完整正文粘到「修改后」。", "Give this task to another assistant, then paste its full text into “After”.")}</p>
          <Textarea readOnly className="wb-editor" aria-label={t("可复制的任务", "Copyable task")} value={prompt} />
        </details>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="toolbar">
        <Button
          disabled={busy || !text.trim()}
          onClick={() =>
            void run(async () => {
              await workbench("proposal-edit", { id: proposal.id, content: text });
              await workbench("proposal-apply", { id: proposal.id });
              toast.success(t("修改已生效，发布后访客可见", "Change applied; visitors see it after publishing"));
            })
          }
        >
          {t("确认修改", "Apply change")}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void run(() => workbench("proposal-cancel", { id: proposal.id }))}>
          {t("放弃这份草稿", "Discard draft")}
        </Button>
      </div>
    </div>
  );
}
