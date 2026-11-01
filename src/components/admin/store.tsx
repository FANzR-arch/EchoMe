/** One copy of the local workspace for every admin page, so badges and lists never disagree. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { workbench, needsOwner, type State, type ReleaseStatus, type CloudState, type Run, type Proposal, type Asset } from "@/lib/workbench";
export type Origin = "local" | "cloud";
export type Item = Run & { origin: Origin };
export type Inbox = {
  questions: Item[];
  proposals: Proposal[];
  modelUnchecked: boolean;
  pending: number;
  sourceUpdates: Asset[];
  count: number;
};
type Store = {
  state?: State;
  release?: ReleaseStatus;
  cloud?: CloudState;
  error: string;
  refresh: () => Promise<State>;
  loadMoreCloud: () => Promise<void>;
  reloadCloud: () => Promise<void>;
  cloudOffset: number;
  inbox: Inbox;
  runs: Item[];
};
const Context = createContext<Store>(null!);
export const useWorkbench = () => useContext(Context);
/** Drafts the owner still has to look at: ready or failed, never interview jobs. */
export const openProposals = (state?: State) => (state?.proposals ?? []).filter((p) => !p.target.startsWith("interview:") && ["ready", "failed", "running"].includes(p.status));
export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(),
    [release, setRelease] = useState<ReleaseStatus>(),
    [cloud, setCloud] = useState<CloudState>(),
    [cloudOffset, setCloudOffset] = useState(0),
    [error, setError] = useState("");
  const latest = useRef<State>(undefined);
  const refresh = useCallback(async () => {
    const [next, status] = await Promise.all([workbench<State>(), workbench<ReleaseStatus>("release-status").catch(() => undefined)]);
    latest.current = next;
    setState(next);
    if (status) setRelease(status);
    setError("");
    return next;
  }, []);
  const loadCloud = useCallback(async (offset: number) => {
    const page = await workbench<CloudState>("cloud-state", { offset });
    setCloud((previous) => (offset && previous ? { ...page, runs: [...previous.runs, ...page.runs] } : page));
    setCloudOffset(offset);
  }, []);
  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    void loadCloud(0).catch(() => setCloud({ configured: true, runs: [] }));
  }, [refresh, loadCloud]);
  // Codex drafts finish in the background: poll only while one is running.
  const running = state?.proposals.some((p) => p.status === "running");
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void refresh().catch(() => {}), 2000);
    return () => clearInterval(timer);
  }, [running, refresh]);
  const runs = useMemo<Item[]>(
    () => [...(state?.runs ?? []).map((r) => ({ ...r, origin: "local" as const })), ...(cloud?.runs ?? []).map((r) => ({ ...r, origin: "cloud" as const }))].sort((a, b) => b.created.localeCompare(a.created)),
    [state?.runs, cloud?.runs],
  );
  const inbox = useMemo<Inbox>(() => {
    const questions = runs.filter((r) => r.status !== "running" && needsOwner(r));
    const proposals = openProposals(state);
    const modelUnchecked = !!state && !state.detailReading.available;
    const pending = release?.pending ?? 0;
    const sourceUpdates = (state?.assets ?? []).filter((a) => a.sourceChanged);
    return { questions, proposals, modelUnchecked, pending, sourceUpdates, count: questions.length + proposals.length + Number(modelUnchecked) + Number(pending > 0) + sourceUpdates.length };
  }, [runs, state, release]);
  const value = useMemo<Store>(
    () => ({ state, release, cloud, error, refresh, cloudOffset, inbox, runs, loadMoreCloud: () => loadCloud(cloudOffset + 100), reloadCloud: () => (cloud?.configured ? loadCloud(0) : Promise.resolve()) }),
    [state, release, cloud, error, refresh, cloudOffset, inbox, runs, loadCloud],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
/** Wraps one owner action: busy flag, error text, and a refresh afterwards. */
export function useAction() {
  const { refresh, reloadCloud } = useWorkbench();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = useCallback(
    async (fn: () => Promise<unknown>, { reload = true } = {}) => {
      setBusy(true);
      setError("");
      try {
        await fn();
        if (reload) await Promise.all([refresh(), reloadCloud().catch(() => {})]);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh, reloadCloud],
  );
  return { busy, error, setError, run };
}
