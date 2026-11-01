import { Suspense, type ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { Preferences } from "./lib/preferences";
import { getStorageError, initialize, useData } from "./lib/data";
import "./styles.css";

function AppShell({ children }: { children: ReactNode }) {
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
            {children}
          </Suspense>
          <Toaster position="bottom-center" />
        </BrowserRouter>
      </TooltipProvider>
    </Preferences>
  );
}

export function mountApp(routes: ReactNode) {
  initialize()
    .then(() =>
      ReactDOM.createRoot(document.getElementById("root")!).render(
        <AppShell>{routes}</AppShell>,
      ),
    )
    .catch(() => {
      document.getElementById("root")!.textContent =
        "无法启动本地演示，请检查浏览器是否允许本地存储。Unable to start local demo.";
    });
}
