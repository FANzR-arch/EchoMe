/** Calls to the owner page API (/api/owner/*); the session cookie travels on its own. */
export async function call<T>(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  try {
    const r = await fetch("/api/owner/" + path, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, status: 0, data: {} as T & { error?: string } };
  }
}

export const when = (iso: string, locale: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(locale === "en" ? "en" : "zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};
