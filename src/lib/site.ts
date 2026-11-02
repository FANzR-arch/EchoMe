/** Public deployment values only. Never place credentials in VITE_* variables. */
import { owner } from "./owner";
export const siteTarget = import.meta.env.VITE_SITE_TARGET as
  | "chat"
  | "admin"
  | "demo";
export const isDemoWorkspace = siteTarget === "demo";
/** The visitor site on a real domain: visitors get plain wording, never setup hints meant for the owner. */
export const publicVisitorSite =
  siteTarget === "chat" && !["127.0.0.1", "localhost", "[::1]"].includes(location.hostname);
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
const framed = () => { try { return window.top !== window.self; } catch { return true; } };
/** The page that actually frames us, not what the URL claims: ancestorOrigins where supported, else the referrer. */
function actualParent() {
  try {
    const ancestor = location.ancestorOrigins?.[0];
    if (ancestor) return ancestor;
    return document.referrer ? new URL(document.referrer).origin : undefined;
  } catch {
    return undefined;
  }
}
export function trustedParentOrigin() {
  const requested = new URLSearchParams(location.search).get("parentOrigin");
  const actual = framed() ? actualParent() : undefined;
  let candidate: string;
  try {
    candidate = requested ? new URL(requested).origin : actual ?? (document.referrer ? new URL(document.referrer).origin : location.origin);
  } catch {
    return undefined;
  }
  // A forged parentOrigin must not unlock a page framed by someone else.
  if (actual && candidate !== actual) return undefined;
  return candidate === location.origin || configuredParents.includes(candidate)
    ? candidate
    : undefined;
}
/** Framed by a site that is not in embedOrigins: the chat should not run there. */
export const untrustedFrame = () => framed() && !trustedParentOrigin();
export function embeddedChatUrl() {
  const url = new URL("/chat", chatSiteUrl);
  url.searchParams.set("embed", "1");
  url.searchParams.set("parentOrigin", location.origin);
  return url.href;
}
