import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Brand, DemoBadge, PreferencesControls } from "@/components/shared";
import { usePreferences } from "@/lib/preferences";
import { event } from "@/lib/data";
import { chatSiteUrl, embeddedChatUrl, isDemoWorkspace } from "@/lib/site";
import { assistantName } from "@/lib/owner";
export default function EmbedPage() {
  const [open, setOpen] = useState(false),
    iframe = useRef<HTMLIFrameElement>(null);
  const { t, theme } = usePreferences();
  const chatOrigin = new URL(chatSiteUrl).origin;
  useEffect(() => {
    const receive = (e: MessageEvent) => {
      if (e.origin !== chatOrigin || e.source !== iframe.current?.contentWindow)
        return;
      if (e.data?.type === "pai:close") setOpen(false);
      if (e.data?.type === "pai:ready")
        iframe.current?.contentWindow?.postMessage(
          { type: "pai:theme", theme },
          chatOrigin,
        );
    };
    window.addEventListener("message", receive);
    iframe.current?.contentWindow?.postMessage(
      { type: "pai:theme", theme },
      chatOrigin,
    );
    return () => window.removeEventListener("message", receive);
  }, [theme, open, chatOrigin]);
  return (
    <div className="embed-page">
      <header className="chat-header">
        <Brand />
        <div className="header-spacer" />
        <PreferencesControls />
        <Link to="/admin" className="admin-link">
          {t("返回管理网站", "Back to admin")}
          <ArrowUpRight size={14} />
        </Link>
      </header>
      <main className="embed-main">
        <DemoBadge />
        <p className="eyebrow">INDEPENDENT BUILDER & DESIGNER</p>
        <h1>
          {t("一些想法，", "Ideas,")}
          <br />
          <em>{t("值得继续聊。", "worth a conversation.")}</em>
        </h1>
        <p className="embed-description">
          {t(
            "这里是独立的嵌入预览。点击右下角，看看 AI 助手如何成为网站的一部分。",
            "An independent embed preview. Open the assistant in the corner and see how a conversation fits into a website.",
          )}
        </p>
        <div className="embed-rule" />
        <div className="embed-caption">
          <span>{t("设计 · 构建 · 记录", "DESIGN · BUILD · DOCUMENT")}</span>
          <span>
            {t(
              "示例外壳，原网站未修改",
              "Sample shell. Original site untouched.",
            )}
          </span>
        </div>
        <a
          href={new URL("/chat", chatSiteUrl).href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link"
        >
          {t("打开完整聊天页", "Open full chat")}
          <ArrowUpRight size={16} />
        </a>
      </main>
      <Sheet
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (value) void event("chat-open");
        }}
      >
        <SheetTrigger render={<Button className="launcher" />}>
          <MessageCircle size={20} />
          {t("和我的 AI 聊聊", "Talk to my AI")}
        </SheetTrigger>
        <SheetContent className="embed-sheet" showCloseButton={false}>
          <SheetTitle className="sr-only">
            {t(assistantName.zh, assistantName.en)}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {t("独立嵌入聊天窗口", "Independent embedded chat")}
          </SheetDescription>
          <iframe
            ref={iframe}
            src={embeddedChatUrl()}
            title={t(assistantName.zh, assistantName.en)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
