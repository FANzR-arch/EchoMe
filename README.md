# EchoMe

给你的个人网站加一个 AI 助手。访客问关于你的事，它只根据你公开写过的资料回答，不乱编。一行代码嵌进你的网站。

*EchoMe adds an AI assistant to your personal website. It answers visitors only from what you published, embeds with one line, and is hardened against prompt injection. MIT licensed.*

![EchoMe：为你的网站增加一个 AI 助手](docs/media/echome-cover.jpg)

https://github.com/user-attachments/assets/92dbd220-6ea7-4de6-a63c-1aeebc83cda1

- 访客在网站上直接提问，回答只依据你公开写过的资料；资料之外，明确告知无法确认。
- 提示词注入、伪造的历史消息，由服务端代码拦截。
- 合作咨询经 Grok Bot 推送到手机，回复一句，访客端显示「本人回复」。
- 三步接入：一键部署到 Vercel → 替换为你的资料 → 嵌入一行代码；也可以交给 Claude Code、Codex 等 AI 助手安装。

## 最省事：让你的 AI 帮你装

如果你有 Grok Bot、Claude Code、Codex 这类能操作电脑的 AI 助手，把下面这句话发给它：

```text
请按 https://github.com/FANzR-arch/EchoMe/blob/main/AGENT-SETUP.md 帮我安装 EchoMe，并把你自己接上它的访客提醒和回复。需要我登录、填密钥或确认的时候再叫我。
```

它会帮你复制项目、问你几个问题、照着你的网站起草资料、建数据库、部署、给自己接上访客提醒和回复工具，最后把嵌入代码交给你。你只需要在它叫你的时候登录账号、填密钥、点确认。

想自己动手，就按下面三步。

## 怎么用：三步

你需要准备两样东西：一个 GitHub 账号，一个大模型 API 密钥（DeepSeek、OpenAI 或任何兼容 OpenAI 接口的服务都行）。

### 第一步：部署

点这个按钮：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FFANzR-arch%2FEchoMe&project-name=echome&repository-name=echome&env=PAI_API_BASE_URL,PAI_MODEL,PAI_API_KEY&envDescription=OpenAI-compatible%20API%20base%20URL%2C%20model%20name%20and%20key%20for%20your%20assistant&envLink=https%3A%2F%2Fgithub.com%2FFANzR-arch%2FEchoMe%23%E7%AC%AC%E4%B8%80%E6%AD%A5%E9%83%A8%E7%BD%B2)

Vercel 会把这个项目复制一份到你的 GitHub，然后让你填三项：

| 填什么 | 例子 |
| --- | --- |
| `PAI_API_BASE_URL` 接口地址 | `https://api.deepseek.com` |
| `PAI_MODEL` 模型名 | `deepseek-flash` |
| `PAI_API_KEY` 你的密钥 | `sk-...` |

点 Deploy，等一两分钟就上线了。密钥只存在 Vercel 的服务器上，访客看不到。

### 第二步：换成你自己的资料

在你 GitHub 上那份复制出来的仓库里，直接在网页上编辑这两处：

1. **`owner.config.json`**：你是谁、怎么联系你、哪些网站可以嵌入聊天窗口。

   ```json
   {
     "name": { "zh": "小王", "en": "Wang" },
     "pronoun": { "zh": "他", "en": "he" },
     "site": "https://wang.example.com",
     "contact": {
       "url": "https://wang.example.com/contact",
       "label": { "zh": "小王的联系页", "en": "Contact Wang" }
     },
     "embedOrigins": ["https://wang.example.com"]
   }
   ```

   `embedOrigins` 一定要填你自己网站的地址，否则聊天窗口在你的网站上不会显示。

2. **`knowledge/` 文件夹**：AI 能说的内容全在这里。
   - `website/snapshot.json`：你的介绍、作品、文章、联系方式，一条一条写。照着里面的示例改就行。想让某条每次回答都参考，给它加 `"tier": "core"`（这类内容合计不超过 4,000 字）。
   - `persona.md`：它说话的语气。
   - `rules.md`：它必须遵守的规则。

每次保存（提交），Vercel 会自动重新部署，一两分钟后生效。

### 第三步：放到你的网站上

打开 `https://你的项目.vercel.app/install`，复制页面上那一行代码，粘贴到你网站的页面里（放在 `</body>` 前面就行）：

```html
<script src="https://你的项目.vercel.app/embed.js" data-label="和我的 AI 聊聊" defer></script>
```

刷新你的网站，右下角会出现聊天按钮。

## 和你的私人 AI 联动（Grok Bot）

访客想合作、留了联系方式、或者 AI 答不上来时，Grok Bot 会在你手机上提醒你。你对它说一句“回他：……”，访客的聊天窗口里马上出现「本人回复」。普通问题照常由 AI 回答，不打扰你。

需要接 Supabase，加三个环境变量，在 Grok Bot 里建一个 webhook 任务、接一个 MCP 工具。完整步骤见 [和 Grok Bot 联动](docs/GROK-BOT.md)。用的是通用的 webhook 和 MCP，其他支持这两种接口的助手也能照着接。

## 常见问题

- **按钮出现了，点开却显示“这里不能嵌入聊天”？** 把你网站的地址加进 `owner.config.json` 的 `embedOrigins`，提交后等重新部署完。
- **回答里说“无法确认”？** 说明资料里没写这件事。把它写进 `knowledge/`。
- **模型报错，说不支持工具？** 在 Vercel 的环境变量里加 `PAI_TOOLS=off`。之后它只参考标了 `"tier": "core"` 的资料。
- **用了自己的域名打不开？** 在 Vercel 环境变量里加 `PAI_PUBLIC_ORIGIN=https://你的聊天域名`。
- **想看访客都问了什么？** 接上 Supabase（免费），见 [部署说明](docs/VERCEL-SUPABASE.md)。不接也能正常聊天。
- **要花多少钱？** Vercel 和 Supabase 的免费额度够个人网站用。模型按你的 API 用量计费，默认全站每天最多 30 次对话，防止被刷。

---

以下是进阶内容：在自己电脑上用后台维护资料、测试草稿、审核对话。只用上面三步的话可以不看。

## 进阶：在本机用后台

想在本机维护资料、审核对话、测试草稿，就在本机运行。需要 Node.js 24（使用内置 SQLite）。

```bash
npm ci
cp .env.example .env.local
npm run dev:chat    # 访客聊天 http://127.0.0.1:5174/chat
npm run dev:admin   # 私人工作台 http://127.0.0.1:5175（另开终端）
```

默认 `PAI_MODE=mock`，不调用任何模型，界面明确标记“模拟回答”。仓库自带的是示例资料。

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

   密钥只在服务端使用，不带 `VITE_` 前缀。改完重启。后台「发布与嵌入 → 模型检查」可以确认模型能否按目录读取详细资料。

工作台日常用法见 [主人使用说明](docs/OWNER-GUIDE.md)，运行细节见 [架构与运行细节](docs/ARCHITECTURE.md)。

## 嵌入到你的网站

部署聊天站后（一键部署的话，`/install` 页面已经替你填好地址），在你的网站任意页面加一行：

```html
<script src="https://YOUR-CHAT-SITE/embed.js" data-label="和我的 AI 聊聊" defer></script>
```

右下角出现按钮，点开是聊天面板，手机上全屏，Esc 关闭。可选属性：`data-theme="auto|light|dark"`、`data-position="right|left"`、`data-open="true"`。页面脚本可以调用 `EchoMe.open()` / `EchoMe.close()`。

两处必须允许你的网站来源，否则浏览器会拒绝嵌入：

- `owner.config.json` 的 `embedOrigins`（聊天页据此信任父窗口消息）；
- 页面会核对真正嵌入它的网站（浏览器的 `ancestorOrigins` 或来源页），不在名单里就不显示聊天。仓库默认的响应头是 `frame-ancestors *`，靠这道页面检查把关；想在浏览器层面也锁死，运行 `npm run deploy:vercel`，它会按 `embedOrigins` 生成更严格的 `vercel.local.json` 再部署。

聊天内容只留在聊天站自己的源里，从不通过窗口消息传给宿主页面。需要自己控制面板或做更深的转场集成，见 [双站与嵌入协议](docs/SEPARATE-SITES.md)。

## 部署

- 只要公开聊天：`npm run build:chat`，`dist/chat` 是静态站，但需要一个运行 `server/api.ts` 的 Node 服务提供 `/api/chat`。
- 一键部署：见本文开头的三步。线上直接读取仓库里的 `owner.config.json` 和 `knowledge/`。
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
