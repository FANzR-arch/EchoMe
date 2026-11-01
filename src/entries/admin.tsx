/** Private-site build: dashboard and internal preview, never public visitor routes. */
import { lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { mountApp } from "../app-shell";
const Interview = lazy(() => import("../pages/interview"));
const Workbench = lazy(() => import("../pages/workbench"));
const Admin = lazy(() => import("../pages/admin"));
const Security = lazy(() =>
  import("../pages/settings").then((m) => ({ default: m.Security })),
);
const Notifications = lazy(() =>
  import("../pages/settings").then((m) => ({ default: m.Notifications })),
);
const Embed = lazy(() => import("../pages/embed"));
mountApp(
  <Routes>
    <Route path="/" element={<Navigate to="/admin/interview" replace />} />
    <Route path="/admin" element={<Admin />}>
      <Route index element={<Navigate to="interview" replace />} />
      <Route path="interview" element={<Interview />} />
      <Route path="overview" element={<Workbench />} />
      <Route path="conversations" element={<Workbench />} />
      <Route path="knowledge" element={<Workbench />} />
      <Route path="security" element={<Security />} />
      <Route path="notifications" element={<Notifications />} />
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
