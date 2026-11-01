/** Public build: never imports admin routes or the integration playground. */
import { Routes, Route } from "react-router-dom";
import { lazy } from "react";
import { mountApp } from "../app-shell";
const ChatPage = lazy(() => import("../pages/chat"));
mountApp(
  <Routes>
    <Route path="/" element={<ChatPage />} />
    <Route path="/chat" element={<ChatPage />} />
    <Route
      path="*"
      element={
        <div className="empty-state">
          <h1>404</h1>
          <p>此站点仅提供聊天窗口。This site only serves the chat widget.</p>
        </div>
      }
    />
  </Routes>,
);
