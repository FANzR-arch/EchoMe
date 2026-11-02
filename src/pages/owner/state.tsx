/** Shared data for the online owner pages: knowledge, inbox and usage, loaded once and refreshed after each change. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { call } from "@/lib/owner-client";

export type Entry = { id: string; title: string; text: string; urls: string[]; tier: "core" | "detail"; origin: "base" | "edited" | "added"; hidden: boolean; updated: string };
export type Draft = { id: string; target: string; title: string; text: string; urls: string[]; tier: "core" | "detail"; source: "owner" | "agent" | "upload"; note?: string | null; updated: string; replaces?: string };
export type KnowledgeView = { entries: Entry[]; persona: { text: string; edited: boolean }; rules: { text: string; edited: boolean }; drafts: Draft[]; coreUsed: number; coreLimit: number };
export type Question = { id: string; conversation: string; created: string; question: string; answer: string };
export type Note = { id: string; conversation: string; created: string; text: string };
export type Usage = { today?: number; limits: { daily: number; perMinute: number; concurrent: number } };
type State = {
  knowledge?: KnowledgeView; inbox?: { questions: Question[]; notes: Note[] }; usage?: Usage;
  /** Readable reason the knowledge could not load (e.g. the database needs the latest SQL). */
  problem: string; count: number; refresh: () => Promise<void>; signOut: () => void;
};
const Context = createContext<State | null>(null);
export const useOwner = () => useContext(Context)!;

export function OwnerProvider({ signOut, children }: { signOut: () => void; children: ReactNode }) {
  const [knowledge, setKnowledge] = useState<KnowledgeView>(), [inbox, setInbox] = useState<State["inbox"]>(), [usage, setUsage] = useState<Usage>();
  const [problem, setProblem] = useState("");
  const refresh = useCallback(async () => {
    const [k, i, u] = await Promise.all([call<KnowledgeView>("knowledge"), call<NonNullable<State["inbox"]>>("inbox"), call<Usage>("usage")]);
    if ([k, i, u].some(r => r.status === 401)) return signOut();
    if (k.ok) { setKnowledge(k.data); setProblem(""); } else setProblem(k.data.error === "UPGRADE_NEEDED" ? "UPGRADE_NEEDED" : "UNAVAILABLE");
    if (i.ok) setInbox(i.data);
    if (u.ok) setUsage(u.data);
  }, [signOut]);
  useEffect(() => { void refresh(); }, [refresh]);
  const count = (knowledge?.drafts.length ?? 0) + (inbox?.questions.length ?? 0) + (inbox?.notes.length ?? 0);
  return <Context.Provider value={{ knowledge, inbox, usage, problem, count, refresh, signOut }}>{children}</Context.Provider>;
}
