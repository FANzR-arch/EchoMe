/** Public deployment values only. Never place credentials in VITE_* variables. */
import { owner } from "./owner";
export const siteTarget = import.meta.env.VITE_SITE_TARGET as
  | "chat"
  | "admin"
  | "demo";
export const isDemoWorkspace = siteTarget === "demo";
export const chatSiteUrl =
  import.meta.env.VITE_CHAT_SITE_URL ||
  (siteTarget === "demo" ? location.origin : "http://127.0.0.1:5174");
const configuredParents = (
  import.meta.env.VITE_EMBED_ALLOWED_ORIGINS ||
  ["http://127.0.0.1:5175", ...owner.embedOrigins].join(",")
)
  .split(",")
  .map((origin: string) => origin.trim())
  .filter(Boolean);
export function trustedParentOrigin() {
  const requested = new URLSearchParams(location.search).get("parentOrigin");
  let candidate: string;
  try {
    candidate = requested
      ? new URL(requested).origin
      : document.referrer
        ? new URL(document.referrer).origin
        : location.origin;
  } catch {
    return undefined;
  }
  return candidate === location.origin || configuredParents.includes(candidate)
    ? candidate
    : undefined;
}
export function embeddedChatUrl() {
  const url = new URL("/chat", chatSiteUrl);
  url.searchParams.set("embed", "1");
  url.searchParams.set("parentOrigin", location.origin);
  return url.href;
}
