/** Public owner identity injected at build time from owner.config.json. */
export type Owner = { name:{zh:string;en:string}; pronoun:{zh:string;en:string}; site:string; contact:{url:string;label:{zh:string;en:string}}; embedOrigins:string[] };
export const owner = __PAI_OWNER__ as Owner;
export const ownerName = owner.name;
/** The product name: shown in the owner admin, never to visitors. */
export const productName = "Echome";
export const assistantName = { zh: `${owner.name.zh}的 AI 助手`, en: `${owner.name.en}’s AI assistant` };
export const siteOrigin = new URL(owner.site).origin;
/** Same URL ignoring a trailing slash. */
export const sameUrl = (a: string, b: string) => a.replace(/\/$/, "") === b.replace(/\/$/, "");
