import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  MessagesSquare,
  BookOpen,
  ShieldCheck,
  Bell,
  ArrowUpRight,
} from "lucide-react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Brand,
  DemoBadge,
  PreferencesControls,
  PageHeading,
  Empty,
} from "@/components/shared";
import { useData } from "@/lib/data";
import { usePreferences } from "@/lib/preferences";
import { Badge } from "@/components/ui/badge";
import { chatSiteUrl } from "@/lib/site";
const navigation = [
  ["overview", "概览", "Overview", LayoutDashboard],
  ["conversations", "会话", "Conversations", MessagesSquare],
  ["knowledge", "知识与规则", "Knowledge & rules", BookOpen],
  ["security", "安全与用量", "Safety & usage", ShieldCheck],
  ["notifications", "通知", "Notifications", Bell],
] as const;
function AdminNavigation() {
  const { t } = usePreferences(),
    { setOpenMobile } = useSidebar(),
    location = useLocation();
  return (
    <Sidebar>
      <SidebarHeader>
        <Brand />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("工作空间", "WORKSPACE")}</SidebarGroupLabel>
          <SidebarMenu>
            {navigation.map(([path, zh, en, Icon]) => (
              <SidebarMenuItem key={path}>
                <SidebarMenuButton
                  isActive={location.pathname.endsWith(path)}
                  render={<NavLink to={`/admin/${path}`} />}
                  onClick={() => setOpenMobile(false)}
                >
                  <Icon />
                  <span>{t(zh, en)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <a
          href={new URL("/chat", chatSiteUrl).href}
          target="_blank"
          rel="noopener noreferrer"
          className="sidebar-link"
        >
          {t("打开聊天", "Open chat")}
          <ArrowUpRight size={15} />
        </a>
        <Link to="/embed-preview" className="sidebar-link">
          {t("嵌入预览", "Embed preview")}
          <ArrowUpRight size={15} />
        </Link>
        <div className="sidebar-note">
          <span className="status-dot" />
          {t("仅本地 · 不调用模型", "LOCAL ONLY · NO MODEL CALLS")}
          <p>{t("演示数据不跨设备同步", "No cross-device sync")}</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
export default function AdminLayout() {
  const { t } = usePreferences();
  return (
    <SidebarProvider className="admin-shell">
      <AdminNavigation />
      <SidebarInset>
        <header className="admin-topbar">
          <SidebarTrigger />
          <span>{t("个人助手工作台", "Personal assistant workspace")}</span>
          <div className="header-spacer" />
          <DemoBadge />
          <PreferencesControls />
        </header>
        <div className="admin-demo-note">
          {t(
            "本机工作台 · 资料与审核实际保存。安全设置、留言和通知页面仍是演示，不控制服务端。尚无管理员登录，不可公开部署。",
            "Local admin demo · Authentication and shared database not connected. Do not deploy publicly or enter private data.",
          )}
        </div>
        <div className="admin-main">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
export function Overview() {
  const data = useData(),
    { t } = usePreferences();
  const chats = data.conversations.filter(
    (c) => c.messages.length || c.contact,
  );
  const visitors = new Set(chats.map((c) => c.visitor)).size;
  const bad = chats.filter((c) => Object.values(c.feedback).includes("bad"));
  const contacts = chats.filter((c) => c.contact);
  const stats = [
    [t("访客", "Visitors"), visitors, "all"],
    [t("会话", "Conversations"), chats.length, "all"],
    [
      t("提问", "Questions"),
      chats.reduce(
        (n, c) => n + c.messages.filter((m) => m.role === "user").length,
        0,
      ),
      "all",
    ],
    [t("联系线索", "Contact leads"), contacts.length, "contact"],
  ];
  return (
    <>
      <PageHeading
        eyebrow="YOUR PERSONAL AI, AT A GLANCE"
        title={t("每一次交流，都有回响。", "Every conversation matters.")}
        description={t(
          "了解大家在问什么，也让下一次回答更准确。",
          "See what people ask, and make the next answer better.",
        )}
      />
      <section className="stats-strip">
        {stats.map(([label, value, filter]) => (
          <Link key={label} to={`/admin/conversations?filter=${filter}`}>
            <span>{label}</span>
            <strong>{value}</strong>
            <ArrowUpRight size={16} />
          </Link>
        ))}
      </section>
      <p className="subtle-note">
        {t(
          "含 2 条初始示例会话；计数来自当前浏览器的记录。",
          "Includes 2 initial sample conversations. Counts come from this browser’s records.",
        )}
      </p>
      <div className="overview-grid">
        <section>
          <div className="section-heading">
            <h2>{t("最近的对话", "Recent conversations")}</h2>
            <Link to="/admin/conversations">
              {t("查看全部", "View all")}
              <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="recent-list">
            {chats.slice(0, 6).map((c) => (
              <Link to={`/admin/conversations?id=${c.id}`} key={c.id}>
                <span className="visitor-circle">{c.sample ? "S" : "V"}</span>
                <div>
                  <strong>{c.title || t("一条新留言", "A new message")}</strong>
                  <p>
                    {c.sample ? t("示例访客", "Sample visitor") : c.visitor} ·{" "}
                    {new Date(c.updated).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="outline">
                  {c.contact ? t("联系意向", "Contact") : t("对话", "Chat")}
                </Badge>
              </Link>
            ))}
          </div>
        </section>
        <aside className="review-aside">
          <p className="eyebrow">MAKE IT MORE YOU</p>
          <h2>
            {t(
              "留一点时间，\n给更好的回答。",
              "A little review.\nA better answer.",
            )}
          </h2>
          <p>
            {t(
              "访客对话不会自动成为你的观点。每条修正，都由你决定是否启用。",
              "Visitor messages never become your views automatically. You choose which corrections to publish.",
            )}
          </p>
          <Link to="/admin/conversations?filter=issue" className="review-line">
            {t("待纠正的会话", "Conversations to correct")}
            <strong>{bad.length}</strong>
          </Link>
          <Link to="/admin/knowledge" className="text-link">
            {t("管理回答规则", "Manage response rules")}
            <ArrowUpRight size={15} />
          </Link>
        </aside>
      </div>
      <section className="overview-bottom">
        <div>
          <h2>{t("大家关心什么", "What people ask")}</h2>
          {chats.length ? (
            <ul className="questions-list">
              {Object.entries(
                chats
                  .flatMap((c) => c.messages.filter((m) => m.role === "user"))
                  .reduce<Record<string, number>>((counts, m) => {
                    counts[m.text] = (counts[m.text] ?? 0) + 1;
                    return counts;
                  }, {}),
              )
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4)
                .map(([q, n]) => (
                  <li key={q}>
                    <span>{q}</span>
                    <span>{n}</span>
                  </li>
                ))}
            </ul>
          ) : (
            <Empty>{t("还没有提问", "No questions yet")}</Empty>
          )}
        </div>
        <div>
          <h2>{t("使用与反馈", "Usage & feedback")}</h2>
          <p className="subtle-note">
            {t("调用次数", "Demo runs")}:{" "}
            {data.events.filter((e) => e.type === "model-run").length} ·{" "}
            {t("有帮助", "Helpful")}:{" "}
            {chats.reduce(
              (n, c) =>
                n +
                Object.values(c.feedback).filter((v) => v === "good").length,
              0,
            )}
          </p>
          <p className="subtle-note">
            {t(
              "模拟费用 ¥0.00 · 无真实账单",
              "Simulated cost ¥0.00 · No real charges",
            )}
          </p>
          <p className="subtle-note">
            {t("打开窗口", "Widget opens")}:{" "}
            {data.events.filter((e) => e.type === "chat-open").length} ·{" "}
            {t("来源点击", "Source clicks")}:{" "}
            {data.events.filter((e) => e.type === "source-click").length}
          </p>
        </div>
      </section>
    </>
  );
}
