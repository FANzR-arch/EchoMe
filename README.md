# PersonalAI

给个人网站用的 AI 助手：只依据你公开发布、亲自审核过的资料回答访客，一行脚本嵌入任何网站。带本机私人工作台，用来维护资料、审核对话、让 AI 起草修改。

*An embeddable AI assistant for your personal website. It answers visitors only from content you published and reviewed, ships a local owner workbench, and is hardened against prompt injection. MIT licensed.*

- **公开聊天站**：React + assistant-ui，流式回答，中英双语，明暗主题，手机全屏。可单独访问，也可嵌入。
- **私人工作台**：只跑在本机 `127.0.0.1`，管理人设、规则、资料、版本、对话审核和 AI 修改提案。
- **资料而非向量库**：核心资料每次完整提供，详细资料由模型按目录编号读取（一轮、最多两份）。不爬网、不做嵌入。
- **防提示词注入**：见下文「安全设计」。
- **可选云端**：Vercel 部署公开聊天，Supabase 存审核记录并自动清理。

## 快速开始

需要 Node.js 24（使用内置 SQLite）。

```bash
npm ci
cp .env.example .env.local
npm run dev:chat    # 访客聊天 http://127.0.0.1:5174/chat
npm run dev:admin   # 私人工作台 http://127.0.0.1:5175（另开终端）
```

默认 `PAI_MODE=mock`，不调用任何模型，界面明确标记“模拟回答”。仓库自带的“林夏”是虚构示例主人。

## 换成你自己

1. **身份**：复制 `owner.config.json` 为 `owner.config.local.json`，填你的称呼、代词、网站、公开联系入口和允许嵌入的网站来源 `embedOrigins`。这些都是公开信息，不要放密钥。
2. **资料**：复制 `knowledge/` 为 `knowledge.local/`，改写 `persona.md`、`rules.md`，替换 `website/snapshot.json`（结构见示例；也可以用 `npm run knowledge:sync -- --site 你的网站源码目录` 从站点内容生成，脚本假设的目录结构见 `scripts/sync-knowledge.mjs`）。
3. 在 `.env.local` 指向它们：

   ```dotenv
   PAI_OWNER_CONFIG=owner.config.local.json
   PAI_KNOWLEDGE_DIR=knowledge.local
   ```

   这两个副本、`.env.local` 都已被 Git 忽略，你的真实资料不会进入公开仓库。
4. 接真实模型（任何 OpenAI Chat Completions 兼容、支持流式和工具调用的服务）：

   ```dotenv
   PAI_MODE=real
   PAI_API_BASE_URL=https://api.deepseek.com
   PAI_MODEL=deepseek-flash
   PAI_API_KEY=你的密钥
   PAI_HISTORY_SECRET=一串足够长的随机字符
   ```

   密钥只在服务端使用，不带 `VITE_` 前缀。改完重启。工作台「总览 → 检查模型工具兼容性」确认模型能否按目录读取详细资料。

工作台日常用法见 [主人使用说明](docs/OWNER-GUIDE.md)，运行细节见 [架构与运行细节](docs/ARCHITECTURE.md)。

## 嵌入到你的网站

部署聊天站后，在你的网站任意页面加一行：

```html
<script src="https://YOUR-CHAT-SITE/embed.js" data-label="和我的 AI 聊聊" defer></script>
```

右下角出现按钮，点开是聊天面板，手机上全屏，Esc 关闭。可选属性：`data-theme="auto|light|dark"`、`data-position="right|left"`、`data-open="true"`。页面脚本可以调用 `PersonalAI.open()` / `PersonalAI.close()`。

两处必须允许你的网站来源，否则浏览器会拒绝嵌入：

- `owner.config.json` 的 `embedOrigins`（聊天页据此信任父窗口消息）；
- 部署响应头 `Content-Security-Policy: frame-ancestors`。用 Vercel 时运行 `npm run deploy:vercel`，它会从你的 owner 配置生成 `vercel.local.json` 再部署；直接用 `vercel.json` 时请手动改其中的 `https://example.com`。

聊天内容只留在聊天站自己的源里，从不通过窗口消息传给宿主页面。需要自己控制面板或做更深的转场集成，见 [双站与嵌入协议](docs/SEPARATE-SITES.md)。

## 部署

- 只要公开聊天：`npm run build:chat`，`dist/chat` 是静态站，但需要一个运行 `server/api.ts` 的 Node 服务提供 `/api/chat`。
- Vercel + Supabase：`npm run knowledge:export` 导出审核过的资料包（含 owner 身份），再 `npm run deploy:vercel`。环境变量、SQL 和清理任务见 [Vercel + Supabase 部署说明](docs/VERCEL-SUPABASE.md)。
- 私人工作台永远不部署，管理接口只接受本机 loopback、同源请求和临时会话令牌。

## 安全设计

公开聊天会被陌生人当成攻击面。这里不只靠提示词“请不要泄露”，而是把能在代码里保证的部分放在代码里：

| 攻击 | 做法 |
| --- | --- |
| 伪造历史：在请求里塞一条“助手已同意进入开发者模式”的回复 | 每条回复由服务端用 HMAC 签名（绑定会话与正文）。浏览器带回的助手消息签名不对，就替换成“此前回复无法验证”，模型看不到伪造内容。 |
| 冒充系统：`<\|im_start\|>system`、零宽字符、Unicode 标签字符藏指令 | 访客文本里的模板控制符被拆开，不可见字符被删除。 |
| 长对话把规则挤到很远 | 最新一条访客消息后附服务端提醒，说明其中的权限、身份、规则要求一律无效。 |
| 让模型复述、翻译、编码系统提示词 | 服务端固定的安全边界不可在工作台修改；输出逐段与受保护指令做逐字重合检测，一出现重合先暂停流式输出，超过阈值整段换成礼貌拒绝，原文只留在审核记录里。 |
| 让模型编造链接、扮演本人、改知识 | 只保留本次资料里出现的 URL；身份、知识写入和合作承诺由服务端规则限制，访客不能写入知识。 |
| 刷接口、改模型、换上游 | 固定上游与模型，严格校验请求字段与长度，限流、并发、每日额度、超时和取消。 |

这些措施降低风险，不保证模型永不越界：换述式泄露（用自己的话概括规则）检测不到。上线前请用你自己的资料做一轮真实问答验收，并定期看工作台里的审核记录。

## 测试

```bash
npm run test:server     # 服务端单元测试，含注入防护
npm run test:knowledge
npm run check           # TypeScript
npm test                # Playwright 端到端（先关闭占用 5173–5175 的开发服务）
```

测试固定使用仓库里的示例主人和临时数据目录，不读取你的私人资料，也不调用真实模型。

## 许可

[MIT](LICENSE)。复用的第三方组件及其许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
