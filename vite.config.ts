import { defineConfig, loadEnv } from "vite";
import { createWorkbench } from "./server/workbench-api.ts";
import { createApi } from "./server/api.ts";
import { owner as loadOwner, validateOwner } from "./server/owner.ts";
import { existsSync, readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
export default defineConfig(({ mode }) => {
  const target = mode === "chat" || mode === "admin" ? mode : "demo";
  const env = loadEnv(mode, process.cwd(), "PAI_");
  if (env.PAI_MODE && !["mock", "real"].includes(env.PAI_MODE)) throw new Error("PAI_MODE must be mock or real");
  for(const key of ['PAI_CODEX_PROXY','PAI_CODEX_MODEL','PAI_CODEX_JS','PAI_SUPABASE_URL','PAI_SUPABASE_SECRET_KEY','PAI_OWNER_CONFIG','PAI_KNOWLEDGE_DIR'])if(env[key])process.env[key]=env[key];
  // Vercel builds never see .env.local: an exported release carries the owner; otherwise owner.config.json in the repo.
  const releasePath = process.env.PAI_RELEASE_PATH || "deploy/knowledge-release.json";
  const owner = process.env.VERCEL && existsSync(releasePath) ? validateOwner(JSON.parse(readFileSync(releasePath, "utf8")).owner) : loadOwner();
  // The admin site answers from the local draft knowledge, so owner tests see unpublished changes.
  const api = createApi({ mode: env.PAI_MODE || "mock", baseUrl: env.PAI_API_BASE_URL || "", model: env.PAI_MODEL || "", key: env.PAI_API_KEY || "", historySecret: env.PAI_HISTORY_SECRET || undefined, audit: true,intentRouting:true });
  return {
    plugins: [
      { name: "personal-ai-local-api", configureServer(server) { if(target === "admin") { const workbench=createWorkbench(undefined,undefined,{baseUrl:env.PAI_API_BASE_URL||'',model:env.PAI_MODEL||'',key:env.PAI_API_KEY||''}); server.httpServer?.once('close',()=>workbench.dispose()); server.middlewares.use((req,res,next)=>{res.setHeader("Content-Security-Policy", "frame-ancestors 'none'"); void workbench(req,res,next);}); } server.middlewares.use((req, res, next) => { void api(req, res, next); }); } },
      react(),
      tailwindcss(),
      {
        name: "personal-ai-entry",
        transformIndexHtml: {
          order: "pre",
          handler(html) {
            return html
              .replace(
                "/src/main.tsx",
                target === "demo"
                  ? "/src/main.tsx"
                  : `/src/entries/${target}.tsx`,
              )
              .replace(
                "<title>PersonalAI</title>",
                `<title>${target === "admin" ? `${owner.name.zh} · 私人管理网站` : `PersonalAI · ${owner.name.en}`}</title>`,
              );
          },
        },
      },
    ],
    define: { "import.meta.env.VITE_SITE_TARGET": JSON.stringify(target), __PAI_OWNER__: JSON.stringify(owner) },
    build: { outDir: `dist/${target}` },
    server: { host: "127.0.0.1", strictPort: true, fs: { deny: ["**/api.txt", "api.txt", ".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/knowledge/**", "**/server/**", "**/workbench.sqlite*", "**/.local-data/**", "**/.workbench-test-data/**"] } },
    preview: { host: "127.0.0.1", strictPort: true },
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
  };
});
