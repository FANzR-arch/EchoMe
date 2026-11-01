/** Public host bridge. Never exports conversation contents or drafts to the parent. */
import { useSyncExternalStore } from "react";
import { trustedParentOrigin } from "./site";
import type { SavedMessage } from "./data";
const params = new URLSearchParams(location.search);
export const hostOrigin = trustedParentOrigin();
export const portfolio = params.get("embed") === "1" && params.get("host") === "portfolio" && !!hostOrigin;
export const immersive = portfolio && params.get("surface") === "immersive";
type HostState = { active: boolean; reducedMotion: boolean; locale: "zh" | "en"; recoveryWarning: boolean; links: {path:string;label:string}[] };
let state: HostState = { active: !portfolio, reducedMotion: false, locale: "zh", recoveryWarning: false, links: [] };
const listeners = new Set<() => void>();
let persist: (() => Promise<boolean>) | undefined;
export const tellHost = (message: Record<string, unknown>) => {
  if (portfolio && hostOrigin) window.parent.postMessage(message, hostOrigin);
};
if (portfolio) {
  document.documentElement.dataset.portfolio = immersive ? "immersive" : "panel";
  document.documentElement.dataset.hostActive = "false";
  window.addEventListener("message", async e => {
    if (e.origin !== hostOrigin || e.source !== window.parent || !e.data || typeof e.data !== "object") return;
    const m = e.data;
    if (m.type === "pai:host-state" && typeof m.requestId === "string" && typeof m.active === "boolean") {
      state = { active:m.active, reducedMotion:m.reducedMotion === true, locale:m.locale === "en" ? "en" : "zh",
        recoveryWarning:m.recoveryWarning === true,
        links:Array.isArray(m.links) ? m.links.filter((l: {path?:unknown;label?:unknown}) => typeof l?.path === "string" && /^\/(en\/)?(projects|blog)$/.test(l.path) && typeof l.label === "string").slice(0,2) : [] };
      document.documentElement.dataset.hostActive = String(state.active);
      listeners.forEach(fn => fn());
    } else if (m.type === "pai:prepare-navigation" && typeof m.requestId === "string") {
      let ok = false;
      try { ok = await persist?.() ?? false; } catch { /* host shows recovery warning */ }
      tellHost({ type: "pai:saved", requestId:m.requestId, ok });
    }
  });
}
export function useHost() { return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state); }
export function registerPersistence(fn: () => Promise<boolean>) {
  if (!portfolio) return () => {};
  persist = fn;
  tellHost({ type:"pai:ready" });
  return () => { if (persist === fn) persist = undefined; };
}
type Session = { draft?:string; greeted?:boolean; messages?:SavedMessage[]; savedAt?:number };
export function readSession(id: string): Session {
  try { return JSON.parse(sessionStorage.getItem("pai-session:" + id) || "{}"); } catch { return {}; }
}
export function writeSession(id: string, patch: Session) {
  try { sessionStorage.setItem("pai-session:" + id, JSON.stringify({ ...readSession(id), ...patch })); } catch { /* IndexedDB remains the primary message store. */ }
}


// Keep the portfolio cursor in the host; no chat content crosses this bridge.
if (portfolio) {
  let enabled = false;
  let pressed = false;
  let tick = 0;
  let pendingPointer: Record<string, unknown> | undefined;
  const flushPointer = () => { tick = 0; if (pendingPointer) tellHost(pendingPointer); pendingPointer = undefined; };
  const pointer = (e: PointerEvent) => {
    if (!enabled) return;
    if (e.pointerType !== "mouse") { delete document.documentElement.dataset.hostCursor; tellHost({type:"pai:pointer",visible:false}); return; }
    document.documentElement.dataset.hostCursor = "true";
    const target = e.target instanceof Element ? e.target : null;
    const state = target?.closest('input, textarea, [contenteditable="true"]') ? "text" : target?.closest('button, a[href], select, [role="button"]') ? "interactive" : "default";
    pendingPointer = {type:"pai:pointer",visible:true,x:e.clientX,y:e.clientY,state,pressed};
    if (!tick) tick = requestAnimationFrame(flushPointer);
  };
  window.addEventListener("message", e => {
    if (e.origin !== hostOrigin || e.source !== window.parent || e.data?.type !== "pai:cursor-enable" || typeof e.data.enabled !== "boolean") return;
    enabled = e.data.enabled;
    if (enabled) document.documentElement.dataset.hostCursor = "true";
    else delete document.documentElement.dataset.hostCursor;
  });
  document.addEventListener("pointermove", pointer, {passive:true});
  document.addEventListener("pointerover", pointer, {passive:true});
  document.addEventListener("pointerdown", e => { pressed = true; pointer(e); }, {passive:true});
  document.addEventListener("pointerup", e => { pressed = false; pointer(e); }, {passive:true});
  const leave = () => {
    cancelAnimationFrame(tick); tick = 0; pendingPointer = undefined; pressed = false;
    if (enabled) tellHost({type:"pai:pointer",visible:false});
  };
  document.addEventListener("pointerout", e => { if (!e.relatedTarget) leave(); }, {passive:true});
  window.addEventListener("blur", leave);
}
