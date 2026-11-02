/** Private-site build: dashboard and internal preview, never public visitor routes. */
import { lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { mountApp } from "../app-shell";
// Backends share the light grey + Morandi palette; the visitor chat keeps its own.
document.documentElement.classList.add("backend");
const Layout = lazy(() => import("../pages/admin/layout"));
const Inbox = lazy(() => import("../pages/admin/inbox"));
const Conversations = lazy(() => import("../pages/admin/conversations"));
const Knowledge = lazy(() => import("../pages/admin/knowledge"));
const KnowledgeInterview = lazy(() => import("../pages/admin/knowledge").then((m) => ({ default: m.KnowledgeInterview })));
const Profile = lazy(() => import("../pages/admin/profile"));
const Publish = lazy(() => import("../pages/admin/publish"));
const Embed = lazy(() => import("../pages/embed"));
mountApp(
  <Routes>
    <Route path="/" element={<Navigate to="/admin/inbox" replace />} />
    <Route path="/admin" element={<Layout />}>
      <Route index element={<Navigate to="inbox" replace />} />
      <Route path="inbox" element={<Inbox />} />
      <Route path="conversations" element={<Conversations />} />
      <Route path="knowledge" element={<Knowledge />} />
      <Route path="knowledge/interview" element={<KnowledgeInterview />} />
      <Route path="profile" element={<Profile />} />
      <Route path="publish" element={<Publish />} />
      {/* Earlier addresses keep working. */}
      <Route path="interview" element={<Navigate to="/admin/knowledge/interview" replace />} />
      <Route path="overview" element={<Navigate to="/admin/inbox" replace />} />
      <Route path="security" element={<Navigate to="/admin/publish" replace />} />
      <Route path="notifications" element={<Navigate to="/admin/publish" replace />} />
      <Route path="*" element={<Navigate to="/admin/inbox" replace />} />
    </Route>
    <Route path="/embed-preview" element={<Embed />} />
    <Route
      path="*"
      element={
        <div className="empty-state">
          <h1>404</h1>
          <a href="/">返回管理网站 · Back to admin</a>
        </div>
      }
    />
  </Routes>,
);
