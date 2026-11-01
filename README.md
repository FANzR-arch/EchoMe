# PersonalAI

给个人网站用的 AI 助手：只依据你公开发布、亲自审核过的资料回答访客，一行脚本嵌入任何网站。带本机私人工作台，用来维护资料、审核对话、让 AI 起草修改。

*An embeddable AI assistant for your personal website. It answers visitors only from content you published and reviewed, ships a local owner workbench, and is hardened against prompt injection. MIT licensed.*

- **公开聊天站**：React + assistant-ui，流式回答，中英双语，明暗主题，手机全屏。可单独访问，也可嵌入。
- **私人工作台**：只跑在本机 `127.0.0.1`，管理人设、规则、资料、版本、对话审核和 AI 修改提案。
- **资料而非向量库**：核心资料每次完整提供，详细资料由模型按目录编号读取（一轮、最多两份）。不爬网、不做嵌入。
- **防提示词注入**：见下文「安全设计」。
- **可选云端**：Vercel 部署公开聊天，Supabase 存审核记录并自动清理。

## 一键部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FFANzR-arch%2Fpersonal-ai&project-name=personal-ai&repository-name=personal-ai&env=PAI_API_BASE_URL,PAI_MODEL,PAI_API_KEY&envDescription=OpenAI-compatible%20API%20base%20URL%2C%20model%20name%20and%20key%20for%20your%20assistant&envLink=https%3A%2F%2Fgithub.com%2FFANzR-arch%2Fpersonal-ai%23%E4%B8%80%E9%94%AE%E9%83%A8%E7%BD%B2)

1. 点上面的按钮。Vercel 会把仓库复制到你的 GitHub，并让你填三项：
   - `PAI_API_BASE_URL`：任何兼容 OpenAI Chat Completions 的接口地址，例如 `https://api.deepseek.com`
   - `PAI_MODEL`：模型名，例如 `deepseek-flash`
   - `PAI_API_KEY`：你的密钥，只存在 Vercel 的服务端环境变量里
2. 部署完成后打开 `https://你的项目.vercel.app/install`，那里有为你这个站点生成好的嵌入代码，复制即可。
3. 在你的 GitHub 仓库里改 `owner.config.json`（称呼、联系方式、允许嵌入的网站 `embedOrigins`）和 `knowledge/` 文件夹。每次提交，Vercel 自动重新部署。

不需要数据库，也不需要在本机运行任何东西。可选项：

- `PAI_HISTORY_SECRET`：一串长随机字符，用来给回复签名。不填会从 API 密钥派生。
- `PAI_TOOLS=off`：你的模型不支持工具调用（function calling）时填。之后只依据“每次都带上”的资料回答。
- `PAI_PUBLIC_ORIGIN`：用自定义域名或非生产地址访问时填完整 https 地址。默认用 Vercel 的生产域名，用别的地址访问会被拒绝。
- Supabase（`PAI_SUPABASE_URL`、`PAI_SUPABASE_SECRET_KEY`）：想在线查看访客对话、跨实例共享额度时再接，见 [部署说明](docs/VERCEL-SUPABASE.md)。不接时，限流按单个函数实例计算。

## 本机运行和私人工作台

想在本机维护资料、审核对话、测试草稿，就在本机运行。需要 Node.js 24（使用内置 SQLite）。

```bash
npm ci
cp .env.example .env.local
npm run dev:chat    # 访客聊天 http://127.0.0.1:5174/chat
npm run dev:admin   # 私人工作台 http://127.0.0.1:5175（另开终端）
```

默认 `PAI_MODE=mock`，不调用任何模型，界面明确标记“模拟回答”。仓库自带的“阿哲”是虚构示例主人。

私人工作台分五页：

- **待处理**：AI 没答好的问题、等你确认的修改、未发布的改动，每条一个按钮处理。
- **对话**：本机和线上（接了 Supabase 时）的对话合在一起，可筛“访客 / 我的测试”。每条回答都能“纠正这个回答”。
- **它知道什么**：所有资料按关于我、作品、文章、联系分组，标明“每次都带上 / 需要时读取”和“已上线 / 未发布”。可以手动教它，也可以“让 AI 采访我”。
- **名片与语气**：人设和回答规则。
- **发布与嵌入**：把本机草稿发布成资料包（和 `npm run knowledge:export` 是同一件事），再 `npm run deploy:vercel` 上线；复制嵌入代码。在 `.env.local` 设 `VITE_CHAT_SITE_URL=https://你的聊天站`，这里显示的嵌入代码才是线上地址。

右侧“试一试”用本机草稿资料回答，改完马上能测，不影响线上。纠正的内容先在本机生效，发布后才上线。

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

部署聊天站后（一键部署的话，`/install` 页面已经替你填好地址），在你的网站任意页面加一行：

```html
<script src="https://YOUR-CHAT-SITE/embed.js" data-label="和我的 AI 聊聊" defer></script>
```

右下角出现按钮，点开是聊天面板，手机上全屏，Esc 关闭。可选属性：`data-theme="auto|light|dark"`、`data-position="right|left"`、`data-open="true"`。页面脚本可以调用 `PersonalAI.open()` / `PersonalAI.close()`。

两处必须允许你的网站来源，否则浏览器会拒绝嵌入：

- `owner.config.json` 的 `embedOrigins`（聊天页据此信任父窗口消息）；
- 页面会核对真正嵌入它的网站（浏览器的 `ancestorOrigins` 或来源页），不在名单里就不显示聊天。仓库默认的响应头是 `frame-ancestors *`，靠这道页面检查把关；想在浏览器层面也锁死，运行 `npm run deploy:vercel`，它会按 `embedOrigins` 生成更严格的 `vercel.local.json` 再部署。

聊天内容只留在聊天站自己的源里，从不通过窗口消息传给宿主页面。需要自己控制面板或做更深的转场集成，见 [双站与嵌入协议](docs/SEPARATE-SITES.md)。

## 部署

- 只要公开聊天：`npm run build:chat`，`dist/chat` 是静态站，但需要一个运行 `server/api.ts` 的 Node 服务提供 `/api/chat`。
- 一键部署：见本文开头。线上直接读取仓库里的 `owner.config.json` 和 `knowledge/`。
- 本机审核后发布：在私人工作台「发布与嵌入」点发布（或运行 `npm run knowledge:export`）生成资料包，再 `npm run deploy:vercel`。有资料包时线上以它为准，你的私人资料不必进 Git。环境变量、SQL 和清理任务见 [Vercel + Supabase 部署说明](docs/VERCEL-SUPABASE.md)。
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
