import { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { Preferences } from "./lib/preferences";
import { getStorageError, initialize, useData } from "./lib/data";
const ChatPage = lazy(() => import("./pages/chat"));
const EmbedPage = lazy(() => import("./pages/embed"));
const AdminLayout = lazy(() => import("./pages/admin"));
const Overview = lazy(() =>
  import("./pages/admin").then((m) => ({ default: m.Overview })),
);
const Conversations = lazy(() => import("./pages/conversations"));
const Knowledge = lazy(() => import("./pages/knowledge"));
const Security = lazy(() =>
  import("./pages/settings").then((m) => ({ default: m.Security })),
);
const Notifications = lazy(() =>
  import("./pages/settings").then((m) => ({ default: m.Notifications })),
);
import "./styles.css";
function App() {
  useData();
  return (
    <Preferences>
      <TooltipProvider>
        <BrowserRouter>
          {getStorageError() && (
            <div role="alert" className="storage-error">
              {getStorageError()}
            </div>
          )}
          <Suspense
            fallback={
              <div className="empty-state" role="status">
                正在打开 · Opening…
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Navigate to="/chat" replace />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/embed-preview" element={<EmbedPage />} />
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Navigate to="overview" replace />} />
                <Route path="overview" element={<Overview />} />
                <Route path="conversations" element={<Conversations />} />
                <Route path="knowledge" element={<Knowledge />} />
                <Route path="security" element={<Security />} />
                <Route path="notifications" element={<Notifications />} />
              </Route>
              <Route path="*" element={<Navigate to="/chat" replace />} />
            </Routes>
          </Suspense>
          <Toaster position="bottom-center" />
        </BrowserRouter>
      </TooltipProvider>
    </Preferences>
  );
}
initialize()
  .then(() =>
    ReactDOM.createRoot(document.getElementById("root")!).render(<App />),
  )
  .catch(() => {
    document.getElementById("root")!.textContent =
      "无法启动本地演示，请检查浏览器是否允许本地存储。Unable to start local demo.";
  });
