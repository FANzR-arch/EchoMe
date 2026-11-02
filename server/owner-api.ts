/** Owner page on the public site: one password from the environment, a signed cookie, and access to stored conversations.
 * Read and reply only: knowledge stays in the repository or the local workbench. */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { conversationId, sendOwnerReply, type HandoffStore } from './handoff.ts';

export const ownerPasswordMin = 12;
export type OwnerConfig = {
  password?: string; secret: string; handoff?: HandoffStore; secure: boolean;
  limits: { daily: number; perMinute: number; concurrent: number }; usageToday: () => Promise<number | undefined>;
  /** Login attempts per client and in total, per 15 minutes and per instance. */
  attempts?: { perClient: number; total: number };
};
const cookie = 'echome_owner', sessionDays = 30, windowMs = 15 * 60_000;
const digest = (value: string) => createHash('sha256').update(value).digest();
const same = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
/** Short passwords are refused outright: the page is on the open internet. */
export const ownerEnabled = (password?: string) => (password?.length ?? 0) >= ownerPasswordMin;

export function createOwnerApi(config: OwnerConfig) {
  const enabled = ownerEnabled(config.password), attempts = config.attempts ?? { perClient: 5, total: 30 };
  // Changing the password signs out every session.
  const key = digest('echome-owner\0' + config.password + '\0' + config.secret);
  const sign = (expires: number) => expires + '.' + createHmac('sha256', key).update('owner:' + expires).digest('base64url');
  const signedIn = (req: IncomingMessage) => {
    if (!enabled) return false;
    const value = (req.headers.cookie ?? '').split(';').map(c => c.trim()).find(c => c.startsWith(cookie + '='))?.slice(cookie.length + 1) ?? '';
    const expires = Number(value.split('.')[0]);
    return Number.isInteger(expires) && expires > Date.now() && same(value, sign(expires));
  };
  const setCookie = (res: ServerResponse, value: string, maxAge: number) =>
    res.setHeader('Set-Cookie', `${cookie}=${value}; Path=/api/owner; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.secure ? '; Secure' : ''}`);
  let failures: { at: number; client: string }[] = [];
  const client = (req: IncomingMessage) => String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || '?';
  const readJson = async (req: IncomingMessage) => {
    let raw = ''; req.setEncoding('utf8');
    for await (const chunk of req) { raw += chunk; if (raw.length > 8192) throw Error('INPUT_LIMIT'); }
    try { return JSON.parse(raw); } catch { throw Error('INPUT_LIMIT'); }
  };

  return async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const json = (status: number, value: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'X-Robots-Tag': 'noindex' }); res.end(JSON.stringify(value)); };
    const route = req.method + ' ' + url.pathname.slice('/api/owner/'.length);
    try {
      if (route === 'GET session') return json(200, { enabled, storage: !!config.handoff, signedIn: signedIn(req) });
      if (!enabled) return json(404, { error: 'NOT_FOUND' });
      if (route === 'POST login') {
        const now = Date.now(), who = client(req);
        failures = failures.filter(f => f.at > now - windowMs);
        if (failures.length >= attempts.total || failures.filter(f => f.client === who).length >= attempts.perClient) return json(429, { error: 'TOO_MANY_ATTEMPTS' });
        const body = await readJson(req);
        if (typeof body?.password !== 'string' || !same(body.password, config.password!)) { failures.push({ at: now, client: who }); return json(401, { error: 'WRONG_PASSWORD' }); }
        setCookie(res, sign(now + sessionDays * 86400_000), sessionDays * 86400);
        return json(200, { ok: true });
      }
      if (route === 'POST logout') { setCookie(res, '', 0); return json(200, { ok: true }); }
      if (!signedIn(req)) return json(401, { error: 'SIGNED_OUT' });
      if (route === 'GET usage') return json(200, { today: await config.usageToday().catch(() => undefined), limits: config.limits });
      const store = config.handoff;
      if (!store) return json(503, { error: 'NO_STORAGE' });
      if (route === 'GET conversations') return json(200, { conversations: await store.recent(50) });
      if (route === 'GET conversation') {
        const id = url.searchParams.get('id');
        const turns = conversationId(id) ? await store.transcript(id) : undefined;
        return turns ? json(200, { conversation: id, turns: turns.slice(-200) }) : json(404, { error: 'NOT_FOUND' });
      }
      if (route === 'POST reply') {
        const body = await readJson(req);
        const sent = await sendOwnerReply(store, body?.conversation, body?.text);
        return 'error' in sent ? json(400, { error: sent.error }) : json(200, { message: sent.message });
      }
      if (route === 'GET answers') return json(200, { answers: await store.savedAnswers(100) });
      if (route === 'POST forget') {
        const body = await readJson(req);
        return typeof body?.id === 'string' && await store.forgetAnswer(body.id) ? json(200, { ok: true }) : json(404, { error: 'NOT_FOUND' });
      }
      return json(404, { error: 'NOT_FOUND' });
    } catch (e) {
      return json(e instanceof Error && e.message === 'INPUT_LIMIT' ? 400 : 503, { error: e instanceof Error && e.message === 'INPUT_LIMIT' ? 'INPUT_LIMIT' : 'CLOUD_UNAVAILABLE' });
    }
  };
}
