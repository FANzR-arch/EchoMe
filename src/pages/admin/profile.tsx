/** 名片与语气: who the assistant speaks for (read-only, from owner config) and how it speaks. */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeading } from "@/components/shared";
import { usePreferences } from "@/lib/preferences";
import { owner } from "@/lib/owner";
import { workbench, type Asset } from "@/lib/workbench";
import { useWorkbench, useAction } from "@/components/admin/store";
import { PublishPill } from "@/components/admin/ui";
import { publishOf } from "@/components/admin/labels";
export default function ProfilePage() {
  const { t } = usePreferences(),
    { state, error } = useWorkbench();
  return (
    <>
      <PageHeading eyebrow="PROFILE & TONE" title={t("名片与语气", "Profile & tone")} description={t("它代表谁，以及它怎么说话。", "Who it speaks for, and how it speaks.")} />
      <section className="adm-card adm-owner" aria-labelledby="owner-card">
        <h2 id="owner-card">{t("名片", "Business card")}</h2>
        <dl>
          <dt>{t("名字", "Name")}</dt>
          <dd>
            {owner.name.zh} · {owner.name.en}
          </dd>
          <dt>{t("称呼", "Pronoun")}</dt>
          <dd>
            {owner.pronoun.zh} · {owner.pronoun.en}
          </dd>
          <dt>{t("个人网站", "Website")}</dt>
          <dd>
            <a href={owner.site} target="_blank" rel="noopener noreferrer">
              {owner.site}
            </a>
          </dd>
          <dt>{t("联系方式", "Contact")}</dt>
          <dd>
            <a href={owner.contact.url} target="_blank" rel="noopener noreferrer">
              {t(owner.contact.label.zh, owner.contact.label.en)}
            </a>
          </dd>
          <dt>{t("允许嵌入的网站", "Sites allowed to embed")}</dt>
          <dd>{owner.embedOrigins.length ? owner.embedOrigins.join("、") : t("还没有设置", "None yet")}</dd>
        </dl>
        <p className="adm-sub">{t("这些信息在项目里的 owner.config.json（或你自己的 owner.config.local.json）中修改，改完重启管理网站。", "Edit these in owner.config.json (or your owner.config.local.json), then restart the admin site.")}</p>
      </section>
      {!state ? (
        <p role={error ? "alert" : "status"}>{error || t("正在读取…", "Loading…")}</p>
      ) : (
        <>
          <PromptEditor asset={state.assets.find((a) => a.key === "persona")} title={t("助手人设", "Assistant persona")} hint={t("它是谁、用什么口吻说话。例如：亲切、简洁，用第三人称介绍我。", "Who it is and its tone. For example: warm and concise, introduces me in the third person.")} />
          <PromptEditor asset={state.assets.find((a) => a.key === "rules")} title={t("回答规则", "Answer rules")} hint={t("它必须遵守的规矩。例如：不确定就直说，不替我答应合作。", "Rules it must follow. For example: say so when unsure; never commit to work on my behalf.")} />
        </>
      )}
    </>
  );
}
function PromptEditor({ asset, title, hint }: { asset?: Asset; title: string; hint: string }) {
  const { t } = usePreferences(),
    { release } = useWorkbench(),
    { busy, error, run } = useAction();
  const [text, setText] = useState(asset?.content ?? ""),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (asset && !dirty) setText(asset.content);
  }, [asset?.base]);
  if (!asset) return null;
  const id = "prompt-" + asset.key;
  return (
    <section className="adm-card form-stack" aria-labelledby={id}>
      <div className="adm-card-row">
        <h2 id={id}>{title}</h2>
        <PublishPill state={publishOf(asset, release)} />
      </div>
      <p className="adm-sub">{hint}</p>
      <Textarea
        className="wb-editor"
        aria-label={title}
        value={text}
        maxLength={4000}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
      />
      <p className="adm-sub">{t(`${text.length.toLocaleString()} / 4,000 字`, `${text.length.toLocaleString()} / 4,000 characters`)}</p>
      {error && <p role="alert">{error}</p>}
      <Button
        variant={dirty ? "default" : "outline"}
        disabled={busy || !dirty || !text.trim()}
        onClick={() =>
          void run(async () => {
            await workbench("save", { asset: { ...asset, content: text }, base: asset.base });
            setDirty(false);
            toast.success(t("已保存。测试对话马上会用到；发布后访客才能看到。", "Saved. The test chat uses it now; visitors see it after publishing."));
          })
        }
      >
        {t(`保存${title}`, `Save ${title.toLowerCase()}`)}
      </Button>
    </section>
  );
}
