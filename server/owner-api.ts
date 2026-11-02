/** Owner page on the public site: one password from the environment, a signed cookie, then conversations, replies
 * and the knowledge the assistant answers from (online edits, uploads and the review queue). */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { conversationId, sendOwnerReply, type HandoffStore } from './handoff.ts';
import { ownerMessage, type KnowledgeService } from './knowledge-edits.ts';

export const ownerPasswordMin = 12;
export type OwnerConfig = {
  password?: string; secret: string; handoff?: HandoffStore; knowledge?: KnowledgeService; secure: boolean;
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
  const readJson = async (req: IncomingMessage, max = 8192) => {
    let raw = ''; req.setEncoding('utf8');
    for await (const chunk of req) { raw += chunk; if (raw.length > max) throw Error('INPUT_LIMIT'); }
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
      if (route.split(' ')[1].startsWith('knowledge')) {
        const service = config.knowledge;
        if (!service) return json(503, { error: 'NO_STORAGE' });
        if (route === 'GET knowledge') return json(200, await service.view());
        const body = await readJson(req, 262144), input = { title: body?.title, text: body?.text, urls: body?.urls, tier: body?.tier, hidden: body?.hidden };
        if (route === 'POST knowledge-save') return json(200, { saved: await service.save(body?.id, input, 'owner') });
        if (route === 'POST knowledge-restore') { await service.restore(body?.id); return json(200, { ok: true }); }
        if (route === 'POST knowledge-approve') return json(200, { saved: await service.approve(body?.id, body?.edited ? input : undefined) });
        if (route === 'POST knowledge-discard') { await service.discard(body?.id); return json(200, { ok: true }); }
        if (route === 'POST knowledge-import') {
          // An uploaded file of several entries: each becomes a draft for review, none goes live here.
          const entries = Array.isArray(body?.entries) && body.entries.length && body.entries.length <= 50 ? body.entries : undefined;
          if (!entries) return json(400, { error: 'INVALID', message: '一次可以导入 1–50 条资料' });
          const drafted = [];
          for (const e of entries) drafted.push(await service.draft(undefined, { title: e?.title, text: e?.text, urls: e?.urls, tier: e?.tier }, 'upload', e?.note));
          return json(200, { drafted: drafted.length });
        }
      }
      const store = config.handoff;
      if (!store) return json(503, { error: 'NO_STORAGE' });
      if (route === 'GET conversations') return json(200, { conversations: await store.recent(50) });
      if (route === 'GET inbox') return json(200, store.inbox ? await store.inbox() : { questions: [], notes: [] });
      if (route === 'POST dismiss') {
        const body = await readJson(req);
        return typeof body?.id === 'string' && await store.dismiss?.(body.id) ? json(200, { ok: true }) : json(404, { error: 'NOT_FOUND' });
      }
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
      const message = ownerMessage(e);
      if (message) return json(400, { error: 'INVALID', message });
      if (e instanceof Error && ['TABLE_MISSING', 'FUNCTION_MISSING'].includes(e.message)) return json(503, { error: 'UPGRADE_NEEDED' });
      return json(e instanceof Error && e.message === 'INPUT_LIMIT' ? 400 : 503, { error: e instanceof Error && e.message === 'INPUT_LIMIT' ? 'INPUT_LIMIT' : 'CLOUD_UNAVAILABLE' });
    }
  };
}
