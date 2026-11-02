# EchoMe

给你的个人网站加一个 AI 助手。访客问关于你的事，它只根据你公开写过的资料回答，不乱编。一行代码嵌进你的网站。

*EchoMe adds an AI assistant to your personal website. It answers visitors only from what you published, embeds with one line, and is hardened against prompt injection. MIT licensed.*

![EchoMe：为你的网站增加一个 AI 助手](docs/media/echome-cover.jpg)

https://github.com/user-attachments/assets/92dbd220-6ea7-4de6-a63c-1aeebc83cda1

- 访客在网站上直接提问，回答只依据你公开写过的资料；资料之外，明确告知无法确认。
- 提示词注入、伪造的历史消息，由服务端代码拦截。
- 合作咨询经 Grok Bot 推送到手机，回复一句，访客端显示「本人回复」。
- 自带后台：手机或电脑打开你自己站点的 `/owner`，输入密码就能看访客对话、直接回复，也能查看、修改、上传 AI 用的资料。
- 四步接入：一键部署到 Vercel → 替换为你的资料 → 嵌入一行代码 → 开启后台；也可以交给 Claude Code、Codex 等 AI 助手安装。

## 最省事：让你的 AI 帮你装

如果你有 Grok Bot、Claude Code、Codex 这类能操作电脑的 AI 助手，把下面这句话发给它：

```text
请按 https://github.com/FANzR-arch/EchoMe/blob/main/AGENT-SETUP.md 帮我安装 EchoMe，并把你自己接上它的访客提醒和回复。需要我登录、填密钥或确认的时候再叫我。
```

它会帮你复制项目、问你几个问题、照着你的网站起草资料、建数据库、部署、给自己接上访客提醒和回复工具，最后把嵌入代码和你的对话后台地址交给你。你只需要在它叫你的时候登录账号、填密钥、点确认。

想自己动手，就按下面四步：前三步让你的网站有 AI 助手，第四步给你一个手机也能打开的后台，随时看访客问了什么。

## 怎么用：四步

你需要准备两样东西：一个 GitHub 账号，一个大模型 API 密钥（DeepSeek、OpenAI 或任何兼容 OpenAI 接口的服务都行）。第四步还要一个免费的 Supabase 账号。

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

最省事的做法：先做完第三、四步，再用下面「第一次用：让你的 AI 帮你整理资料」的提示词，让你的 AI 把资料整理好放进后台，你逐条确认。

想先在仓库里写好，就在你 GitHub 上那份复制出来的仓库里，直接在网页上编辑这两处：

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

### 第四步：开启你的后台

做完这一步，你会有一个只有自己能进的后台网页：`https://你的项目.vercel.app/owner`。手机、电脑都能打开：访客问了什么、AI 怎么答的、谁留了联系方式都在里面，可以直接以本人身份回复访客；AI 知道的资料也在这里查看、修改、上传，改完马上生效，不用再去 GitHub。

**1. 建一个免费的 Supabase 数据库（用来存对话）**

1. 打开 [supabase.com](https://supabase.com) 注册并登录，点 **New project** 新建一个项目。地区选离你近的，例如 Tokyo 或 Singapore。数据库密码随便设一个记下来就行，EchoMe 用不到它。
2. 项目建好后，点左边栏的 **SQL Editor**。打开本仓库的 [supabase/setup.sql](supabase/setup.sql)，点文件右上角的复制按钮复制全文，粘贴到编辑框里，点 **Run**。如果弹窗提示里面有删除操作，点确认（只是替换旧版本的函数，不删数据）。下方显示 `Success. No rows returned` 就成功了。
3. 点左边栏的 **Project Settings**，在 API 设置里记下两样东西：**Project URL**（形如 `https://xxxx.supabase.co`）和 **`service_role` 密钥**（不是 `anon`，也不是 publishable）。

**2. 在 Vercel 里加三个环境变量**

打开你的 Vercel 项目 → **Settings → Environment Variables**，一条一条添加，每条都勾选 **Sensitive**：

| 名字 | 填什么 |
| --- | --- |
| `PAI_SUPABASE_URL` | 上一步的 Project URL |
| `PAI_SUPABASE_SECRET_KEY` | 上一步的 `service_role` 密钥 |
| `PAI_OWNER_PASSWORD` | 你自己想一个后台密码，至少 12 位。只有你知道，别发给任何人 |

加完后打开 **Deployments**，在最新那次部署右边点 **⋯ → Redeploy**，等一两分钟。

**3. 打开后台**

用手机或电脑浏览器打开 `https://你的项目.vercel.app/owner`，输入刚才的密码，点「登录」。地址就是第一步部署出来的那个，在 Vercel 项目首页的 Domains 里也能看到。看到对话列表就说明开好了，还没人来聊的话列表是空的。

## 日常使用：后台怎么用

**打开后台**：浏览器打开 `https://你的项目.vercel.app/owner`。建议收藏，或在手机浏览器里选「添加到主屏幕」，以后点一下就进。同一台设备登录一次，30 天内不用再输密码。电脑上左边是菜单，手机上点左上角的按钮打开菜单。

后台和本机工作台是同一套界面，一共五页：

- **待处理**：需要你看一眼的事都在这里，左边菜单上的数字就是件数。
  - 等你确认的资料：你的 AI 整理的、你上传的资料。点「查看并确认」，可以直接「确认上线」、改几个字再确认，或者「丢弃」。没确认的不会被网站 AI 使用。
  - 想找你本人的访客：访客点聊天窗口右上角「联系 + 你的名字」留下的留言，点「去回复」。
  - 它没答上来的问题：网站 AI 说“无法确认”的问题。点「写一条资料」写出正确说法，以后类似的问题就按它回答；不需要处理的点「忽略」。
- **对话**：所有对话，最新的在最上面，可以筛「访客 / 我的测试 / 全部」、搜索。点开一段看完整对话：灰色是访客说的，白色卡片是 AI 的回答，虚线框是访客留言，绿色边框是你的回复。
  - AI 答得不对，点那条回答下面的「纠正这个回答」，写出正确说法，存成一条资料。
  - 想亲自回，在最下面写，点「发送」。访客开着聊天窗口的话几秒内看到「本人回复」，关掉了就下次打开同一个浏览器时看到。每小时最多 20 条。
- **它知道什么**：网站 AI 用的全部资料，按关于我、作品、文章、线上新增、已隐藏分组。点一条就能改标题、正文、来源链接，选「每次都带上」或「需要时读取」，保存后新的提问马上按新内容回答。线上改过的标「线上改过」，随时可以「恢复原文」。右上角「新增一条」「上传文件」（`.md` 或 `.txt`，按下面「资料文件格式」写的会拆成多条放进待处理）。页面下方是「你确认过的回答」，不想再用就删掉。
- **语气与规则**：它怎么说话、必须遵守什么，直接改。你的称呼、网站、联系入口来自 `owner.config.json`，在这里只能看。
- **用量与嵌入**：今天回答了多少条、上限多少，以及放到你网站上的那一行嵌入代码。

右上角「试一试」：像访客一样问一句，看它用现在的资料怎么回答，改完资料马上就能试。测试会计入今天的用量，在「对话」里显示为「我的测试」。

保存时会自动检查：链接格式不对、「每次都带上」超过 4000 字时会提示原因，不会让网站坏掉。

**退出和改密码**：菜单底部「退出登录」只退出这台设备。忘了密码或担心泄露，就在 Vercel 里把 `PAI_OWNER_PASSWORD` 改成新的再 Redeploy，所有已登录的设备都会自动退出。连续输错 5 次密码要等 15 分钟。

## 第一次用：让你的 AI 帮你整理资料

资料从零写起最费时间。把下面这段发给你自己的 AI（Grok Bot、Claude Code、Codex、ChatGPT 都行），让它去读你公开的网站和主页，整理成一条条资料，放进后台的「待确认」，你再逐条检查：

```text
请帮我给 EchoMe（我个人网站上的 AI 助手）整理一份资料。网站 AI 只会根据这些资料回答访客，所以只写有依据的事实。

1. 先问我：要参考哪些公开来源（我的网站、社交主页、作品集、文章），以及有没有我想补充的文件。只看我给的来源和公开页面，不要搜索我的私人信息。
2. 读完后按这些类别整理，每条一个主题：个人介绍、联系方式、作品（每个作品一条：做了什么、给谁用、我负责什么）、文章（每篇一条：讲了什么）、服务与合作方式、常见问题。
3. 每条用第三人称写成事实陈述，附上来源链接（完整的 https:// 地址）。个人介绍和联系方式标为「每次都带上」，这两类合计不超过 4000 字；其他都是「需要时读取」。
4. 不确定的、来源互相矛盾的、或我可能不想公开的内容（报价、档期、客户名称、私人经历），不要写进资料，列成「待你确认的问题」问我。
5. 写入方式：如果你能用 EchoMe 的 draft_knowledge 工具，每条用它写进待确认区，来源和疑问写在 note 里，不要用 update_knowledge 直接上线。如果不能，就按 https://github.com/FANzR-arch/EchoMe#资料文件格式 的格式生成一个 Markdown 文件给我，我在后台「它知道什么 → 上传文件」导入。
6. 最后告诉我：一共整理了几条、待你确认的问题有哪些、去哪里检查（https://<我的聊天站>/owner → 待处理）。
```

整理完打开后台「待处理」页，在「等你确认的资料」里逐条看：对的点「确认上线」，要改的改完再确认，不要的点「丢弃」。以后有新作品、新文章，也可以让它照这个方法再整理一次。

### 资料文件格式

一个 Markdown 文件里可以放多条资料，每条以 `## 标题` 开头，标题下面几行可选：

```markdown
## 个人介绍
链接：https://wang.example.com/about
每次都带上
备注：来自关于页
小王是一名独立设计师，主要做品牌视觉和网站设计……

## 作品：咖啡品牌官网
链接：https://wang.example.com/projects/coffee
为一家咖啡品牌设计并搭建官网，小王负责视觉设计和前端开发……
```

- `链接：` 后面写完整的 `https://` 地址，多个用空格隔开；
- 写一行 `每次都带上`，这条就每个问题都参考，不写就是「需要时读取」；
- `备注：` 是写给你自己看的说明（比如来源、疑问），网站 AI 不会用；
- 其余文字是正文；
- 标题是「待你确认的问题」的那一节不会被导入。

## 和你的私人 AI 联动（Grok Bot）

访客想合作、留了联系方式、或者 AI 答不上来时，Grok Bot 会在你手机上提醒你。你对它说一句“回他：……”，访客的聊天窗口里马上出现「本人回复」。普通问题照常由 AI 回答，不打扰你。

它也能直接改资料：对它说“把我的简介改成……”“加一个作品：……”“把旧报价那条隐藏”，它先把改动给你看，你点「允许一次」后生效，后台「它知道什么」页会标出线上改过的条目。让它帮你调研整理的资料则放进后台「待处理」，等你确认。

需要接 Supabase，加三个环境变量，在 Grok Bot 里建一个 webhook 任务、接一个 MCP 工具。完整步骤见 [和 Grok Bot 联动](docs/GROK-BOT.md)。用的是通用的 webhook 和 MCP，其他支持这两种接口的助手也能照着接。

## 常见问题

- **按钮出现了，点开却显示“这里不能嵌入聊天”？** 把你网站的地址加进 `owner.config.json` 的 `embedOrigins`，提交后等重新部署完。
- **回答里说“无法确认”？** 说明资料里没写这件事。把它写进 `knowledge/`。
- **模型报错，说不支持工具？** 在 Vercel 的环境变量里加 `PAI_TOOLS=off`。之后它只参考标了 `"tier": "core"` 的资料。
- **用了自己的域名打不开？** 在 Vercel 环境变量里加 `PAI_PUBLIC_ORIGIN=https://你的聊天域名`。
- **想看访客都问了什么？** 按第四步开启对话后台，然后打开 `https://你的项目.vercel.app/owner`。不开也能正常聊天，只是对话不会保存。
- **打开 `/owner` 提示“主人页还没开启”或“还没有对话存档”？** 前者是 `PAI_OWNER_PASSWORD` 没设或不足 12 位，后者是 `PAI_SUPABASE_URL` / `PAI_SUPABASE_SECRET_KEY` 没设。改完记得 Redeploy。
- **后台提示“数据库需要更新”？** 在 Supabase 的 SQL Editor 里重新运行一次 [supabase/setup.sql](supabase/setup.sql)，刷新后台即可。从旧版本升级后都要做这一步。
- **后台登录后列表是空的？** 还没有访客聊过。你可以先打开 `https://你的项目.vercel.app/chat` 自己问一句，再回后台点「刷新」。
- **要花多少钱？** Vercel 和 Supabase 的免费额度够个人网站用。模型按你的 API 用量计费。默认全站每天最多 100 条访客消息、每分钟 20 条、同时回答 4 条，防止被刷；按消息算，不是按访客。想调就在 Vercel 环境变量里设 `PAI_DAILY_LIMIT`、`PAI_PER_MINUTE_LIMIT`、`PAI_CONCURRENT_LIMIT`，重新部署后生效（接了 Supabase 的话，先在 SQL Editor 里重新运行一次 [supabase/setup.sql](supabase/setup.sql)）。
- **部署失败，日志里写着 “EchoMe build check failed”？** 下一行会写清是哪个文件、哪一条、哪个字段写错了，改好再提交即可。资料里的网址要写完整的 `https://` 地址。
- **部署成功但聊天一直说“暂时无法回答”？** 在 Vercel 项目的 Logs 里搜 `EchoMe could not start`，后面就是原因。

---

以下是进阶内容：在自己电脑上用本机工作台维护资料、测试草稿、纠正回答。只是看对话和回复访客的话，第四步的网页后台就够了，下面可以不看。

## 进阶：在本机用后台

日常看对话、改资料用网页后台就够了。本机工作台多了「让 AI 采访我」（用你电脑上的 Codex 一问一答补资料）和更细的回答记录（每条用了哪些资料、token 用量），需要时在本机运行。需要 Node.js 24（使用内置 SQLite）。

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
npx playwright install chromium   # 第一次跑端到端测试前装浏览器（或设 PW_CHANNEL=chrome 用本机 Chrome）
npm test                # Playwright 端到端（先关闭占用 5173–5175 的开发服务）
```

测试固定使用仓库里的示例主人和临时数据目录，不读取你的私人资料，也不调用真实模型。

## 许可

[MIT](LICENSE)。复用的第三方组件及其许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
