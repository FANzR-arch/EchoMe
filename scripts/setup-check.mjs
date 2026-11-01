/** Checks a deployed Echome step by step, for people and for AI agents following AGENT-SETUP.md. Never prints secrets. */
import { randomUUID } from 'node:crypto';
const args = process.argv.slice(2), flag = n => args.includes(n), value = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const site = (value('--site') ?? process.env.PAI_PUBLIC_ORIGIN ?? '').replace(/\/$/, '');
const token = value('--mcp-token') ?? process.env.PAI_MCP_TOKEN;
if (!/^https?:\/\//.test(site)) { console.error('Usage: npm run setup:check -- --site https://your-chat-site [--send-test] [--mcp-token TOKEN] [--json]'); process.exit(2); }
const results = [];
const check = (step, ok, detail, fix) => results.push({ step, ok, detail, ...(ok ? {} : { fix }) });
const get = async (path, init) => { try { const r = await fetch(site + path, { ...init, signal: AbortSignal.timeout(15000) }); return { status: r.status, body: await r.text() }; } catch (e) { return { status: 0, body: String(e?.message ?? e) }; } };

const install = await get('/install');
check('聊天站', install.status === 200, `GET /install → ${install.status}`, '确认 Vercel 部署成功、地址正确');
const configRes = await get('/api/config');
let config = {};
try { config = JSON.parse(configRes.body); } catch { /* reported below */ }
check('接口', configRes.status === 200, `GET /api/config → ${configRes.status}`, configRes.status === 403 ? '访问地址和生产域名不一致：设 PAI_PUBLIC_ORIGIN 后重新部署' : configRes.status === 503 ? '服务端没启动：检查模型三个变量，以及 owner.config.json 是否合法' : '检查部署日志');
check('模型', config.mode === 'real' && config.configured === true, `mode=${config.mode ?? '?'} configured=${config.configured ?? '?'}`, '检查 PAI_API_BASE_URL（https）、PAI_MODEL、PAI_API_KEY');
check('本人回复（Supabase）', config.handoff === true, `handoff=${config.handoff ?? '?'}`, '填 PAI_SUPABASE_URL 和 PAI_SUPABASE_SECRET_KEY，运行 npm run setup:sql 的输出，再重新部署');
if (config.handoff) { const r = await get('/api/replies?conversation=echome-setup-check'); check('本人回复的数据表', r.status === 200, `GET /api/replies → ${r.status}`, '在 Supabase SQL Editor 运行 npm run setup:sql 的输出（需要 pai_owner_messages 表）'); }
check('访客提醒（webhook）', config.contact === true, `contact=${config.contact ?? '?'}`, '填 PAI_NOTIFY_WEBHOOK_URL 和 PAI_NOTIFY_WEBHOOK_KEY 后重新部署');

if (flag('--send-test') && config.contact) {
  const r = await get('/api/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversation: 'echome-setup-' + randomUUID(), name: 'Echome 安装测试', contact: 'setup-test', message: '这是一条安装测试消息，用来确认访客提醒已接通。' }) });
  let notified = false; try { notified = JSON.parse(r.body).notified === true; } catch { /* reported below */ }
  check('发送测试提醒', notified, `POST /api/handoff → ${r.status}, notified=${notified}`, notified ? '' : '服务端调用 webhook 失败：检查网址和密钥是否来自同一个任务；同一类测试 10 分钟内只发一次');
}
if (token) {
  const rpc = body => get('/api/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body) });
  const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  let tools = []; try { tools = JSON.parse(list.body).result.tools.map(t => t.name); } catch { /* reported below */ }
  check('MCP 工具', init.status === 200 && tools.includes('reply_to_visitor'), `initialize → ${init.status}, tools=${tools.join(',') || '无'}`, init.status === 404 ? '口令不对、少于 24 位，或需要 Supabase；改完要重新部署' : '检查部署日志');
}

if (flag('--json')) console.log(JSON.stringify({ site, ok: results.every(r => r.ok), results }, null, 2));
else for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.step}  ${r.detail}${r.ok ? '' : '\n    → ' + r.fix}`);
process.exitCode = results.every(r => r.ok) ? 0 : 1;
