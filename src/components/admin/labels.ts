/** Plain-language names for how knowledge is stored. Internal kinds and tiers never reach the owner directly. */
import type { Asset, ReleaseStatus } from "@/lib/workbench";
type T = (zh: string, en: string) => string;
export const CORE_LIMIT = 4000;
export type Group = "about" | "work" | "writing" | "contact" | "research" | "other";
export const groups: [Group, string, string][] = [
  ["about", "关于我", "About me"],
  ["work", "作品", "Work"],
  ["writing", "文章", "Writing"],
  ["contact", "联系", "Contact"],
  ["other", "其他", "Other"],
  ["research", "外部参考", "External references"],
];
export function groupOf(a: Asset): Group {
  const id = a.key.replace(/^doc:/, "");
  if (a.kind === "research") return "research";
  if (/^profile|^practice$|^core-draft$/.test(id)) return "about";
  if (/^project/.test(id)) return "work";
  if (/^article/.test(id)) return "writing";
  if (/^contact/.test(id)) return "contact";
  return "other";
}
export function sourceOf(a: Asset, t: T) {
  if (a.kind === "research") return t("外部参考", "External reference");
  if (a.key.startsWith("doc:manual:fix-")) return t("你在对话里纠正的", "Your correction");
  if (a.key.startsWith("doc:manual:") || a.key.startsWith("doc:approved:")) return t("你写的", "Written by you");
  if (a.key === "doc:core-draft") return t("根据网站整理", "Summarised from your site");
  return t("来自网站", "From your site");
}
export type Publish = "live" | "draft" | "off";
export function publishOf(a: Asset, release?: ReleaseStatus): Publish | undefined {
  if (a.key === "persona") return release ? (release.personaChanged ? "draft" : "live") : undefined;
  if (a.key === "rules") return release ? (release.rulesChanged ? "draft" : "live") : undefined;
  if (a.enabled === false) return "off";
  if (!release) return undefined;
  const state = release.documents.find((d) => "doc:" + d.id === a.key)?.state;
  return state === "live" ? "live" : "draft";
}
export const publishLabel = (p: Publish, t: T) => ({ live: t("已上线", "Live"), draft: t("未发布", "Not published"), off: t("已停用", "Turned off") })[p];
export const tierLabel = (a: Asset, t: T) => (a.tier === "core" ? t("每次都带上", "Always included") : t("需要时读取", "Read when needed"));
export const coreUsed = (assets: Asset[], except?: Asset) =>
  assets.filter((a) => a.key !== except?.key && a.tier === "core" && a.enabled !== false).reduce((n, a) => n + a.content.length, 0) +
  (except && except.tier === "core" && except.enabled !== false ? except.content.length : 0);
export const changeLabel = (state: "live" | "changed" | "new" | "removed", t: T) => ({ live: t("已上线", "Live"), changed: t("已修改", "Changed"), new: t("新增", "New"), removed: t("将下线", "Will be removed") })[state];
export function when(value: string | undefined, locale: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale === "en" ? "en" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
