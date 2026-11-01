/** Owner admin shell: five plain-language places, plus the "试一试" test chat beside every page. */
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Inbox, MessagesSquare, BookOpen, IdCard, Rocket, ArrowUpRight, MessageCircle } from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Brand, PreferencesControls } from "@/components/shared";
import { usePreferences } from "@/lib/preferences";
import { chatSiteUrl } from "@/lib/site";
import { WorkbenchProvider, useWorkbench } from "@/components/admin/store";
import { TestChat } from "@/components/admin/test-chat";
const navigation = [
  ["inbox", "待处理", "Inbox", Inbox],
  ["conversations", "对话", "Conversations", MessagesSquare],
  ["knowledge", "它知道什么", "What it knows", BookOpen],
  ["profile", "名片与语气", "Profile & tone", IdCard],
  ["publish", "发布与嵌入", "Publish & embed", Rocket],
] as const;
function Navigation() {
  const { t } = usePreferences(),
    { setOpenMobile } = useSidebar(),
    location = useLocation(),
    { inbox, state } = useWorkbench();
  return (
    <Sidebar>
      <SidebarHeader>
        <Brand />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navigation.map(([path, zh, en, Icon]) => (
              <SidebarMenuItem key={path}>
                <SidebarMenuButton isActive={location.pathname.startsWith("/admin/" + path)} render={<NavLink to={`/admin/${path}`} />} onClick={() => setOpenMobile(false)}>
                  <Icon />
                  <span>{t(zh, en)}</span>
                </SidebarMenuButton>
                {path === "inbox" && state && inbox.count > 0 && <SidebarMenuBadge aria-label={t(`${inbox.count} 件待处理`, `${inbox.count} to do`)}>{inbox.count > 99 ? "99+" : inbox.count}</SidebarMenuBadge>}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <a href={new URL("/chat", chatSiteUrl).href} target="_blank" rel="noopener noreferrer" className="sidebar-link">
          {t("打开访客聊天页", "Open visitor chat")}
          <ArrowUpRight size={15} />
        </a>
        <div className="sidebar-note">
          <span className="status-dot" />
          {t("只在这台电脑上", "This computer only")}
          <p>{t("资料和记录保存在本机。没有登录保护，不要公开这个网址。", "Data stays on this computer. No login: never expose this address.")}</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
const wide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1180px)").matches;
function readPanel() {
  try {
    const value = localStorage.getItem("pai-admin-try");
    return value === null ? wide() : value === "open" && wide();
  } catch {
    return wide();
  }
}
function Shell() {
  const { t } = usePreferences(),
    location = useLocation();
  const [open, setOpen] = useState(readPanel);
  const toggle = (next: boolean) => {
    setOpen(next);
    // Remember the choice only where the panel docks beside the page.
    if (wide())
      try {
        localStorage.setItem("pai-admin-try", next ? "open" : "closed");
      } catch {
        /* Session-only preference. */
      }
  };
  // On narrow screens the panel is an overlay: close it when the page changes, and on Escape.
  useEffect(() => {
    if (!wide()) setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !wide() && !document.querySelector("[data-slot=dialog-content]")) setOpen(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  return (
    <SidebarProvider className="admin-shell adm-shell">
      <Navigation />
      <SidebarInset>
        <header className="admin-topbar">
          <SidebarTrigger aria-label={t("打开或收起菜单", "Toggle menu")} />
          <span>{t("我的 AI 助手", "My AI assistant")}</span>
          <div className="header-spacer" />
          <Button variant={open ? "secondary" : "outline"} size="sm" className="adm-try-toggle" aria-expanded={open} aria-controls="adm-try" onClick={() => toggle(!open)}>
            <MessageCircle />
            {t("试一试", "Try it")}
          </Button>
          <PreferencesControls />
        </header>
        <div className="adm-body" data-try={open}>
          <div className="admin-main">
            <Outlet />
          </div>
          <aside id="adm-try" className="adm-try" hidden={!open} aria-label={t("试一试", "Try it")}>
            <TestChat onClose={() => toggle(false)} />
          </aside>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
export default function OwnerAdmin() {
  return (
    <WorkbenchProvider>
      <Shell />
    </WorkbenchProvider>
  );
}
