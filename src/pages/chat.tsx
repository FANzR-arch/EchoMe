import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, History, Mail, X, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Brand,
  Choice,
  DemoBadge,
  Empty,
  PreferencesControls,
} from "@/components/shared";
import { portfolio, useHost } from "@/lib/host-bridge";
import "../host-embed.css";
import { ChatRuntime } from "@/components/chat-thread";
import { useModelState } from "@/lib/model";
import {
  createConversation,
  event,
  getData,
  now,
  uid,
  updateData,
  useData,
  type Scenario,
} from "@/lib/data";
import { usePreferences } from "@/lib/preferences";
import { toast } from "sonner";
import { isDemoWorkspace, trustedParentOrigin, untrustedFrame } from "@/lib/site";
import { ownerName } from "@/lib/owner";
function BlockedFrame() {
  const { t } = usePreferences();
  return (
    <div className="empty-state" role="alert">
      <h1>{t("这里不能嵌入聊天", "Chat can't be embedded here")}</h1>
      <p>{t("把这个网站的地址加入 owner.config.json 的 embedOrigins，重新部署后就能嵌入。", "Add this site's origin to embedOrigins in owner.config.json and redeploy.")}</p>
    </div>
  );
}
export default function ChatPage() {
  // Constant for the life of the page, so the early return never changes hook order.
  if (untrustedFrame()) return <BlockedFrame />;
  return <ChatPageContent />;
}
function ChatPageContent() {
  const modelState = useModelState();
  const data = useData(),
    { t, setTheme, setLocale } = usePreferences();
  const host = useHost();
  useEffect(() => { if (portfolio) setLocale(host.locale); }, [host.locale, setLocale]);
  const [scenario, setScenario] = useState<Scenario>("normal"),
    [history, setHistory] = useState(false),
    [contact, setContact] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(
    data.current,
  );
  const creating = useRef(false);
  const embedded = new URLSearchParams(location.search).get("embed") === "1";
  const parentOrigin = trustedParentOrigin();
  const conversation = data.conversations.find((c) => c.id === conversationId);
  useEffect(() => {
    if (conversation || creating.current) return;
    creating.current = true;
    void createConversation().then((id) => {
      setConversationId(id);
      creating.current = false;
    });
  }, [conversation]);
  useEffect(() => {
    if (!embedded || !parentOrigin) return;
    const receive = (e: MessageEvent) => {
      if (
        e.origin !== parentOrigin ||
        e.source !== window.parent ||
        e.data?.type !== "pai:theme"
      )
        return;
      if (e.data.theme === "dark" || e.data.theme === "light")
        setTheme(e.data.theme);
    };
    // Escape in a cross-origin iframe cannot reach the host dialog.
    // Nested chat dialogs retain their own dismissal behavior.
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return;
      window.parent.postMessage({ type: "pai:close" }, parentOrigin);
    };
    window.addEventListener("keydown", escape);
    window.addEventListener("message", receive);
    if (!portfolio) window.parent.postMessage({ type: "pai:ready" }, parentOrigin);
    return () => {
      window.removeEventListener("keydown", escape);
      window.removeEventListener("message", receive);
    };
  }, [embedded, parentOrigin, setTheme]);
  const startNew = async () => {
    creating.current = true;
    setConversationId(null);
    const id = await createConversation();
    setConversationId(id);
    creating.current = false;
    setHistory(false);
  };
  return (
    <div className={`chat-page ${embedded ? "embedded" : ""}`} inert={portfolio && !host.active}>
      {portfolio && host.recoveryWarning && <p className="host-recovery">{t("上次离开时未确认保存，最近内容可能不完整。", "The last save was not confirmed; recent content may be incomplete.")}</p>}
      <header className="chat-header">
        <Brand compact={embedded} />
        {modelState.mode === "mock" ? <DemoBadge /> : <span className="demo-badge">{modelState.mode === "real" ? (modelState.configured ? t("真实 AI · 本机", "Real AI · local") : t("真实模式 · 待配置", "Real mode · setup needed")) : t("模型服务连接中 / 不可用", "Model service connecting / unavailable")}</span>}
        <div className="header-spacer" />
        <PreferencesControls />
        {embedded && parentOrigin ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("关闭聊天", "Close chat")}
            onClick={() =>
              parent.postMessage({ type: "pai:close" }, parentOrigin)
            }
          >
            <X />
          </Button>
        ) : isDemoWorkspace ? (
          <Link to="/admin" className="admin-link">
            {t("演示后台", "Demo admin")}
            <ArrowUpRight size={14} />
          </Link>
        ) : null}
      </header>
      <div className="chat-subheader">
        <div className="toolbar">
          <Button variant="ghost" onClick={startNew}>
            <Plus />
            {t("新对话", "New chat")}
          </Button>
          <Button variant="ghost" onClick={() => setHistory(true)}>
            <History />
            {t("历史", "History")}
          </Button>
        </div>
        <Button variant="ghost" onClick={() => setContact(true)}>
          <Mail />
          {t(`联系${ownerName.zh}`, "Leave a message")}
        </Button>
      </div>
      <main className="chat-main">
        {conversation && modelState.mode !== "loading" && (
          <ChatRuntime
            key={conversation.id}
            conversation={conversation}
            scenario={scenario}
            modelState={modelState}
          />
        )}
      </main>
      {isDemoWorkspace && modelState.mode === "mock" && (
        <footer className="demo-controls">
          <span>{t("体验场景", "Demo scenario")}</span>
          <Choice
            label={t("体验场景", "Demo scenario")}
            value={scenario}
            onChange={(v) => setScenario(v as Scenario)}
            items={[
              ["normal", t("正常回答", "Normal")],
              ["unknown", t("资料不足", "Unknown")],
              ["injection", t("提示词诱导", "Prompt injection")],
              ["network", t("网络失败", "Connection failure")],
              ["rate", t("请求过频", "Rate limited")],
              ["quota", t("额度耗尽", "Quota reached")],
            ].map(([value, label]) => ({ value, label }))}
          />
          {!embedded && (
            <Link to="/embed-preview">
              {t("查看嵌入效果", "Embed preview")}
              <ArrowUpRight size={13} />
            </Link>
          )}
        </footer>
      )}
      <Sheet open={history} onOpenChange={setHistory}>
        <SheetContent side="left">
          <SheetHeader>
            <SheetTitle>{t("对话历史", "Conversation history")}</SheetTitle>
            <SheetDescription>
              {t(
                "仅当前浏览器中的访客对话，不跨设备同步。",
                "Visitor conversations in this browser only. No device sync.",
              )}
            </SheetDescription>
          </SheetHeader>
          <div className="history-list">
            {data.conversations
              .filter((c) => !c.sample && c.messages.length)
              .map((c) => (
                <Button
                  key={c.id}
                  variant="ghost"
                  onClick={async () => {
                    await updateData((d) => {
                      d.current = c.id;
                    });
                    setConversationId(c.id);
                    setHistory(false);
                  }}
                >
                  {c.title}
                </Button>
              ))}
            {!data.conversations.some(
              (c) => !c.sample && c.messages.length,
            ) && (
              <Empty>
                {t("从第一条消息开始。", "Start with your first message.")}
              </Empty>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={contact} onOpenChange={setContact}>
        <DialogContent>
          <DialogTitle>{t("留下一点想法", "Leave a thought")}</DialogTitle>
          <DialogDescription>
            {t(
              "这是演示留言。不要填写真实私人信息；不会发送通知。",
              "Demo only. Do not enter private information. No notification is sent.",
            )}
          </DialogDescription>
          <form
            className="form-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await updateData((d) => {
                const c = d.conversations.find((c) => c.id === conversationId);
                if (c) {
                  c.contact = {
                    name: String(f.get("name")),
                    address: String(f.get("address")),
                    message: String(f.get("message")),
                  };
                  c.updated = now();
                }
              });
              await event("contact-submitted", conversationId ?? undefined);
              if (getData().notifications.contact)
                await event(
                  "notification-preview",
                  conversationId ?? undefined,
                  "contact",
                );
              setContact(false);
              toast.success(
                t(
                  "演示留言已保存，未发送通知。",
                  "Demo message saved. No notification sent.",
                ),
              );
            }}
          >
            <label>
              {t("称呼（选填）", "Name (optional)")}
              <Input name="name" maxLength={80} />
            </label>
            <label>
              {t("联系方式（选填）", "Contact (optional)")}
              <Input
                name="address"
                maxLength={200}
                placeholder="demo@example.invalid"
              />
            </label>
            <label>
              {t("想聊什么？", "What is on your mind?")}
              <Textarea name="message" required maxLength={2000} />
            </label>
            <Button type="submit">
              {t("保存演示留言", "Save demo message")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
