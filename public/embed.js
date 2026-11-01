/*! Echome embed · MIT License
 * Usage, on any page of a site listed in owner.config.json "embedOrigins":
 *   <script src="https://YOUR-CHAT-SITE/embed.js" data-label="Talk to my AI" defer></script>
 * Optional: data-theme="auto|light|dark", data-position="right|left", data-open="true".
 * No cookies, no tracking, no chat content ever reaches the host page.
 */
(() => {
  const script = document.currentScript;
  if (!script || window.__echomeEmbed) return;
  window.__echomeEmbed = true;
  const chatOrigin = new URL(script.src).origin;
  const opt = (name, fallback) => script.getAttribute("data-" + name) || fallback;
  const label = opt("label", document.documentElement.lang.startsWith("zh") ? "和我的 AI 聊聊" : "Talk to my AI");
  const side = opt("position", "right") === "left" ? "left" : "right";
  const themeOption = opt("theme", "auto");
  const dark = matchMedia("(prefers-color-scheme: dark)");
  const theme = () => (themeOption === "light" || themeOption === "dark" ? themeOption : dark.matches ? "dark" : "light");

  const host = document.createElement("div");
  host.setAttribute("data-echome", "");
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    :host { all: initial; }
    .launcher { position: fixed; ${side}: 20px; bottom: 20px; z-index: 2147483000; display: inline-flex; align-items: center; gap: 8px;
      min-height: 48px; padding: 0 18px; border: 0; border-radius: 999px; cursor: pointer; font: 600 15px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
      color: #fff; background: #1f1e1b; box-shadow: 0 8px 24px rgb(0 0 0 / .18); transition: transform .2s ease, opacity .2s ease; }
    .launcher.dark { color: #1f1e1b; background: #f5f3ee; }
    .launcher:hover { transform: translateY(-1px); }
    .launcher:focus-visible { outline: 3px solid #4b7bec; outline-offset: 3px; }
    .launcher[aria-expanded="true"] { opacity: 0; pointer-events: none; }
    .panel { position: fixed; ${side}: 20px; bottom: 20px; z-index: 2147483001; width: min(420px, calc(100vw - 40px)); height: min(680px, calc(100vh - 40px));
      border-radius: 18px; overflow: hidden; background: #f5f3ee; box-shadow: 0 24px 64px rgb(0 0 0 / .28);
      opacity: 0; transform: translateY(12px) scale(.98); pointer-events: none; transition: opacity .2s ease, transform .2s ease; }
    .panel.dark { background: #191816; }
    .panel.open { opacity: 1; transform: none; pointer-events: auto; }
    .panel[hidden] { display: none; }
    iframe { display: block; width: 100%; height: 100%; border: 0; }
    @media (max-width: 640px) { .panel { inset: 0; width: 100%; height: 100%; border-radius: 0; } }
    @media (prefers-reduced-motion: reduce) { .launcher, .panel { transition: none; } }
  </style>
  <button class="launcher" type="button" aria-haspopup="dialog" aria-expanded="false">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>
    <span></span>
  </button>
  <div class="panel" role="dialog" aria-modal="false" hidden></div>`;
  const button = root.querySelector(".launcher"), panel = root.querySelector(".panel");
  button.querySelector("span").textContent = label;
  panel.setAttribute("aria-label", label);
  let frame, open = false;

  const paint = () => { button.classList.toggle("dark", theme() === "dark"); panel.classList.toggle("dark", theme() === "dark"); };
  const sendTheme = () => frame?.contentWindow?.postMessage({ type: "pai:theme", theme: theme() }, chatOrigin);
  const show = () => {
    if (open) return;
    open = true;
    if (!frame) {
      frame = document.createElement("iframe");
      const url = new URL("/chat", chatOrigin);
      url.searchParams.set("embed", "1");
      url.searchParams.set("parentOrigin", location.origin);
      frame.src = url.href;
      frame.title = label;
      frame.referrerPolicy = "strict-origin";
      panel.append(frame);
    }
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add("open"));
    button.setAttribute("aria-expanded", "true");
    frame.focus();
  };
  const hide = () => {
    if (!open) return;
    open = false;
    panel.classList.remove("open");
    button.setAttribute("aria-expanded", "false");
    setTimeout(() => { if (!open) panel.hidden = true; }, 220);
    button.focus();
  };
  button.addEventListener("click", show);
  addEventListener("keydown", e => { if (e.key === "Escape" && open) hide(); });
  addEventListener("message", e => {
    if (e.origin !== chatOrigin || !frame || e.source !== frame.contentWindow) return;
    if (e.data?.type === "pai:close") hide();
    if (e.data?.type === "pai:ready") sendTheme();
  });
  dark.addEventListener?.("change", () => { paint(); sendTheme(); });
  paint();
  (document.body ? Promise.resolve() : new Promise(r => addEventListener("DOMContentLoaded", r, { once: true }))).then(() => {
    document.body.append(host);
    if (opt("open", "") === "true") show();
  });
  window.Echome = { open: show, close: hide };
})();
