import { useEffect, useState } from "react";
import { useAuiState } from "@assistant-ui/react";
import { usePreferences } from "@/lib/preferences";
import { readSession, writeSession, useHost } from "@/lib/host-bridge";
import { ownerName as N } from "@/lib/owner";
export function HostGreeting({ id }: { id: string }) {
  const host = useHost(), { t } = usePreferences();
  const hasMessages = useAuiState(s => s.thread.messages.length > 0);
  const text = t(`你好，我是${N.zh}的 AI。\n想了解${N.zh}的作品，还是聊聊你的想法？`, `Hello, I’m ${N.en}’s AI.\nWould you like to explore the work, or talk about your ideas?`);
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!host.active) { if (readSession(id).greeted) setCount(text.length); return; }
    if (hasMessages || host.reducedMotion || readSession(id).greeted) { setCount(text.length); return; }
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      writeSession(id, { greeted:true });
      let n = 0;
      interval = setInterval(() => { setCount(++n); if (n >= text.length) clearInterval(interval); }, 45);
    }, 220);
    return () => { clearTimeout(start); clearInterval(interval); };
  }, [host.active, host.reducedMotion, id, text, hasMessages]);
  return <div className="host-greeting"><p aria-hidden="true">{text.slice(0,count)}</p><span className="sr-only">{host.active ? text : ""}</span></div>;
}

