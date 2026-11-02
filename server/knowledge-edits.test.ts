import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { WorkbenchStore } from './workbench-store.ts';
import { LocalKnowledgeEdits, applyEdits, createKnowledgeService, promptOverrides } from './knowledge-edits.ts';
import { createMcp } from './mcp.ts';
import { createApi, limits } from './api.ts';
import { getSystemRules, setPromptOverrides } from './prompts.ts';
import type { Document } from './knowledge.ts';
import type { HandoffStore } from './handoff.ts';

const base: Document[] = [
  { id: 'profile', title: '介绍', kind: 'website', urls: ['https://a.example/'], text: '原来的介绍', updated: '', file: 'x', tier: 'core' },
  { id: 'project:old', title: '旧作品', kind: 'website', urls: ['https://a.example/old'], text: '旧作品介绍', updated: '', file: 'x', tier: 'detail' },
];
const fresh = () => new LocalKnowledgeEdits(new WorkbenchStore(mkdtempSync(join(tmpdir(), 'pai-edits-'))));
const service = (edits = fresh(), onChange = () => {}) => ({ edits, s: createKnowledgeService({ edits, base: () => base, basePrompt: name => name === 'persona' ? '原来的语气' : '原来的规则', contextLimit: limits.context, onChange }) });

test('live edits replace, hide and add on top of the published knowledge; restore undoes them', async () => {
  const { edits, s } = service();
  await s.save('profile', { text: '新的介绍' }, 'owner');
  await s.save('project:old', { hidden: true }, 'owner');
  const added = await s.save(undefined, { title: '新作品', text: '一个新作品', urls: ['https://a.example/new'] }, 'owner');
  const docs = applyEdits(base, await edits.list());
  assert.deepEqual(docs.map(d => [d.id, d.text]), [['profile', '新的介绍'], [added.target, '一个新作品']]);
  assert.equal(docs[0].urls[0], 'https://a.example/', 'unchanged fields keep the published value');
  const view = await s.view();
  assert.deepEqual(view.entries.map(e => [e.id, e.origin, e.hidden]), [['profile', 'edited', false], ['project:old', 'edited', true], [added.target, 'added', false]]);
  await s.restore('project:old'); await s.restore(added.target);
  assert.deepEqual(applyEdits(base, await edits.list()).map(d => d.id), ['profile', 'project:old'], 'the hidden entry is back, the added one gone');
  await assert.rejects(s.restore('project:old'), /没有在线修改/);
});

test('mistakes are refused with a readable reason and nothing is saved', async () => {
  const { edits, s } = service();
  await assert.rejects(s.save('profile', { urls: ['a.example/about'] }, 'owner'), /链接 "a.example\/about" 不是完整的 https:\/\/ 地址/);
  await assert.rejects(s.save('profile', { text: 'x'.repeat(4001) }, 'owner'), /超过 4000 字/);
  await assert.rejects(s.save(undefined, { title: '只有标题' }, 'owner'), /新资料需要标题和正文/);
  await assert.rejects(s.save('nope', { text: 'x' }, 'owner'), /找不到这条资料/);
  await assert.rejects(s.save('persona', { text: '' }, 'owner'), /语气需要/);
  assert.equal((await edits.list()).length, 0);
});

test('drafts wait for approval; approving with changes makes them live', async () => {
  const changes: string[] = [];
  const { edits, s } = service(fresh(), () => changes.push('x'));
  const d = await s.draft(undefined, { title: '服务', text: '承接品牌短片' }, 'agent', '来源：https://a.example/services');
  const fix = await s.draft('profile', { text: '调研后的介绍' }, 'agent');
  assert.equal(applyEdits(base, await edits.list()).length, 2, 'drafts are not live');
  const view = await s.view();
  assert.deepEqual(view.drafts.map(x => [x.title, x.replaces ?? null]).sort(), [['介绍', 'profile'], ['服务', null]]);
  assert.equal(view.drafts.find(x => x.id === d.id)?.note, '来源：https://a.example/services');
  await s.approve(d.id, { text: '承接品牌短片和产品短片' });
  await s.discard(fix.id);
  const docs = applyEdits(base, await edits.list());
  assert.deepEqual(docs.map(x => x.text), ['原来的介绍', '旧作品介绍', '承接品牌短片和产品短片']);
  assert.equal(changes.length, 1, 'only the approval changes live knowledge');
  await assert.rejects(s.approve(d.id), /已经处理过了/);
});

test('online tone and rules reach the system prompt', async () => {
  const { edits, s } = service();
  await s.save('persona', { text: '说话简短、友好，像朋友一样。' }, 'owner');
  setPromptOverrides(promptOverrides(await edits.list()));
  try { assert.match(getSystemRules(), /说话简短、友好，像朋友一样。/); } finally { setPromptOverrides({}); }
  assert.equal((await s.view()).persona.edited, true);
});

test('the agent gets knowledge tools only when edits are stored online', async () => {
  const store = {} as HandoffStore, { s } = service();
  const call = (mcp: ReturnType<typeof createMcp>, name: string, args: unknown) => mcp({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) as Promise<any>;
  const plain = await createMcp(store)({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) as any;
  assert.ok(!plain.result.tools.some((t: { name: string }) => t.name === 'update_knowledge'));
  const mcp = createMcp(store, { knowledge: s });
  const names = ((await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' })) as any).result.tools.map((t: { name: string }) => t.name);
  for (const n of ['list_knowledge', 'read_knowledge_entry', 'update_knowledge', 'draft_knowledge', 'restore_knowledge']) assert.ok(names.includes(n), n);
  assert.match((await call(mcp, 'update_knowledge', { id: 'profile', text: '经主人确认的新介绍' })).result.content[0].text, /"saved": true/);
  assert.match((await call(mcp, 'read_knowledge_entry', { id: 'profile' })).result.content[0].text, /经主人确认的新介绍/);
  const bad = await call(mcp, 'update_knowledge', { id: 'profile', urls: ['nope'] });
  assert.equal(bad.result.isError, true);
  assert.match(bad.result.content[0].text, /不是完整的 https/);
  assert.match((await call(mcp, 'draft_knowledge', { title: '合作流程', text: '先沟通需求', note: '来自访谈' })).result.content[0].text, /"drafted": true/);
  assert.match((await call(mcp, 'list_knowledge', {})).result.content[0].text, /"draftsWaiting": 1/);
});

test('answers use an edit made on the owner page right away', async () => {
  let system = '';
  const fetcher = (async (_url: string, init: RequestInit) => {
    system = JSON.parse(String(init.body)).messages[0].content;
    const frames = ['data: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}]}', 'data: [DONE]', ''].join(String.fromCharCode(10, 10));
    return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(frames)); c.close(); } }));
  }) as typeof fetch;
  const password = 'owner page password';
  const api = createApi({ mode: 'real', baseUrl: 'https://p.invalid', model: 'm', key: 'k', intentRouting: false, toolsVerified: false, ownerPassword: password, knowledgeEdits: fresh() }, fetcher);
  const server = createServer((req, res) => void api(req, res, () => { res.writeHead(404); res.end(); })).listen(0);
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/`;
  const post = (path: string, body: unknown, cookie = '') => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(body) });
  const ask = async () => { await (await post('chat', { messages: [{ role: 'user', content: '介绍一下' }] })).text(); return system; };
  try {
    assert.doesNotMatch(await ask(), /线上刚改的介绍/);
    const cookie = (await post('owner/login', { password })).headers.get('set-cookie')!.split(';')[0];
    const saved = await post('owner/knowledge-save', { id: 'profile', text: '线上刚改的介绍' }, cookie);
    assert.equal(saved.status, 200);
    assert.match(await ask(), /线上刚改的介绍/);
    const refused = await post('owner/knowledge-save', { id: 'profile', urls: ['not a link'] }, cookie);
    assert.equal(refused.status, 400);
    assert.match((await refused.json()).message, /不是完整的 https/);
  } finally { server.close(); }
});
