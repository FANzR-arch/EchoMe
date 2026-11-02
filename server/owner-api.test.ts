import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createOwnerApi } from './owner-api.ts';
import { createApi, limits } from './api.ts';
import type { HandoffStore, OwnerMessage } from './handoff.ts';

const password = 'correct horse battery';
function memoryStore(): HandoffStore & { sent: OwnerMessage[] } {
  const sent: OwnerMessage[] = [];
  return {
    sent,
    async add(conversation, role, text) { const m = { id: String(sent.length + 1), conversation, created: new Date().toISOString(), role, text }; sent.push(m); return m; },
    async messages() { return []; },
    async repliesSince() { return sent.length; },
    async recent() { return [{ conversation: 'visitor-0001', lastActive: '2026-11-01T00:00:00Z', lastQuestion: '你好', turns: 1, ownerReplies: 0 }]; },
    async transcript(c) { return c === 'visitor-0001' ? [{ role: 'visitor' as const, text: '你好', created: '2026-11-01T00:00:00Z' }] : undefined; },
    async saveAnswer() { throw Error('unused'); },
    async savedAnswers() { return []; },
    async forgetAnswer() { return false; },
  };
}
async function serve(api: (req: any, res: any, url: URL) => Promise<void>, fn: (call: (path: string, init?: { body?: unknown; cookie?: string; ip?: string }) => Promise<Response>) => Promise<void>) {
  const server = createServer((req, res) => void api(req, res, new URL(req.url!, 'http://local.invalid'))).listen(0);
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/owner/`;
  try {
    await fn((path, init = {}) => fetch(base + path, { method: init.body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(init.cookie ? { Cookie: init.cookie } : {}), ...(init.ip ? { 'X-Forwarded-For': init.ip } : {}) }, body: init.body === undefined ? undefined : JSON.stringify(init.body) }));
  } finally { server.close(); }
}
const config = (extra = {}) => ({ password, secret: 'history-secret', handoff: memoryStore(), secure: true, limits, usageToday: async () => 3, ...extra });
const cookieOf = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0];

test('owner page stays off without a password of at least 12 characters', async () => {
  for (const p of [undefined, 'short-pass']) await serve(createOwnerApi(config({ password: p })), async call => {
    assert.deepEqual(await (await call('session')).json(), { enabled: false, storage: true, signedIn: false });
    assert.equal((await call('login', { body: { password: p ?? '' } })).status, 404);
    assert.equal((await call('conversations')).status, 404);
  });
});

test('sign-in sets a strict, http-only cookie that opens conversations; forged or foreign cookies do not', async () => {
  const store = memoryStore();
  await serve(createOwnerApi(config({ handoff: store })), async call => {
    assert.equal((await call('conversations')).status, 401);
    const login = await call('login', { body: { password } });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie')!, /HttpOnly; SameSite=Strict; Max-Age=2592000; Secure/);
    const cookie = cookieOf(login);
    assert.equal((await (await call('session', { cookie })).json()).signedIn, true);
    assert.equal((await (await call('conversations', { cookie })).json()).conversations[0].lastQuestion, '你好');
    assert.equal((await (await call('conversation?id=visitor-0001', { cookie })).json()).turns.length, 1);
    assert.equal((await call('conversation?id=missing-0001', { cookie })).status, 404);
    assert.deepEqual(await (await call('usage', { cookie })).json(), { today: 3, limits });
    // A later expiry with the old signature, or a signature from another password, is rejected.
    const [expires, sig] = cookie.split('=')[1].split('.');
    assert.equal((await call('conversations', { cookie: `echome_owner=${Number(expires) + 1}.${sig}` })).status, 401);
    await serve(createOwnerApi(config({ password: 'another long password' })), async other => assert.equal((await other('conversations', { cookie })).status, 401));
    // Replies go through the shared checks.
    assert.equal((await call('reply', { cookie, body: { conversation: 'visitor-0001', text: '  谢谢，明天邮件联系你  ' } })).status, 200);
    assert.equal(store.sent[0].text, '谢谢，明天邮件联系你');
    assert.equal(store.sent[0].role, 'owner');
    assert.equal((await call('reply', { cookie, body: { conversation: 'missing-0001', text: 'hi' } })).status, 400);
    const out = await call('logout', { cookie, body: {} });
    assert.match(out.headers.get('set-cookie')!, /echome_owner=; .*Max-Age=0/);
  });
});

test('guessing is capped per client and in total', async () => {
  await serve(createOwnerApi(config({ attempts: { perClient: 3, total: 5 } })), async call => {
    for (let i = 0; i < 3; i++) assert.equal((await call('login', { body: { password: 'guess' + i }, ip: '1.1.1.1' })).status, 401);
    assert.equal((await call('login', { body: { password }, ip: '1.1.1.1' })).status, 429);
    assert.equal((await call('login', { body: { password }, ip: '2.2.2.2' })).status, 200);
    for (let i = 0; i < 2; i++) await call('login', { body: { password: 'guess' }, ip: '3.3.3.' + i });
    assert.equal((await call('login', { body: { password }, ip: '4.4.4.4' })).status, 429);
  });
});

test('without stored conversations the signed-in owner is told why', async () => {
  await serve(createOwnerApi(config({ handoff: undefined })), async call => {
    const cookie = cookieOf(await call('login', { body: { password } }));
    assert.equal((await (await call('session', { cookie })).json()).storage, false);
    assert.equal((await call('conversations', { cookie })).status, 503);
  });
});

test('the public API mounts the owner routes behind its same-origin checks', async () => {
  const api = createApi({ mode: 'real', baseUrl: 'https://p.invalid', model: 'm', key: 'k', ownerPassword: password, handoff: memoryStore() });
  const server = createServer((req, res) => void api(req, res, () => { res.writeHead(404); res.end(); })).listen(0);
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/owner/`;
  try {
    assert.equal((await (await fetch(base + 'session')).json()).enabled, true);
    const cross = await fetch(base + 'login', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    assert.equal(cross.status, 403);
    // Plain http locally, so no Secure flag there.
    const login = await fetch(base + 'login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    assert.doesNotMatch(login.headers.get('set-cookie')!, /Secure/);
  } finally { server.close(); }
});
