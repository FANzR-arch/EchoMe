# EchoMe

给你的个人网站加一个 AI 助手。访客问关于你的事，它只用你公开的资料回答，不知道的会直说不知道。你可以在手机上看访客问了什么，也可以亲自回复。

*EchoMe adds an AI assistant to your personal website. It answers visitors only from what you published, embeds with one line, and is hardened against prompt injection. MIT licensed.*

![EchoMe：为你的网站增加一个 AI 助手](docs/media/echome-cover.jpg)

https://github.com/user-attachments/assets/92dbd220-6ea7-4de6-a63c-1aeebc83cda1

## 安装

把下面这段话发给 Claude Code 或 Codex（能操作电脑的 AI）。它会从头装到尾，你只需要在它叫你的时候登录账号、填密钥、点确认。

```text
请帮我安装 EchoMe（https://github.com/FANzR-arch/EchoMe），从头做到尾：

1. 按仓库里 AGENT-SETUP.md 的第 1–5 步和第 9 步执行：把项目复制到我的 GitHub，问我几个问题，照我的网站起草资料，建 Supabase 数据库，部署到 Vercel，把聊天窗口放到我的网站上。
2. 建数据库时运行仓库里 supabase/setup.sql 的全部内容。后台密码 PAI_OWNER_PASSWORD 让我自己填，至少 12 位。
3. 需要我登录、填密钥或确认时再叫我。任何密钥都不要显示在聊天里。
4. 全部完成后，用简单的话告诉我：聊天站地址、后台地址（聊天站地址加 /owner），以及怎么登录后台。
5. 最后问我有没有 Grok Bot。如果有，按仓库里 docs/GROK-BOT.md，把要发给 Grok Bot 的那段话填好我的地址和项目名，整段给我，并告诉我怎么设置它的权限。
```

开始前准备好：GitHub、Vercel、Supabase 三个账号（都免费），以及一个模型的 API 密钥（比如 DeepSeek）。

## 装好以后

- **网站**：右下角出现聊天按钮，访客可以直接提问。
- **后台**：用手机或电脑打开 `你的聊天站地址/owner`，输入你设的密码。在这里看访客对话、亲自回复访客、修改 AI 用的资料。改完马上生效。
- **Grok Bot**（如果有）：把 AI 给你的那段话发给 Grok Bot。之后有访客想合作或留了联系方式，它会提醒你；你对它说“回他：……”，访客就能看到你本人的回复。

## 常用提示词

**让 AI 补充资料**（发给 Grok Bot 或任意 AI，整理好的资料会先放在后台「待处理」，你确认后才生效）：

```text
请按 https://github.com/FANzR-arch/EchoMe/blob/main/docs/RESEARCH.md 帮我整理 EchoMe 的资料。我的聊天站是 https://<我的聊天站>。
```

**更新到新版本**（发给 Claude Code 或 Codex）：

```text
请把我的 EchoMe 更新到 https://github.com/FANzR-arch/EchoMe 的最新版本：合并上游 main 并推送，等 Vercel 部署完成，再在我的 Supabase 里运行最新的 supabase/setup.sql。需要我登录或确认时叫我。
```

**出了问题**（发给 Claude Code 或 Codex）：

```text
我的 EchoMe（https://<我的聊天站>）出了问题：<描述你看到的现象>。请按 https://github.com/FANzR-arch/EchoMe/blob/main/AGENT-SETUP.md 末尾的「出问题时」排查并修好。要改设置或重新部署前先告诉我。
```

## 更多

- 安装细节：[AGENT-SETUP.md](AGENT-SETUP.md)
- 接入 Grok Bot：[docs/GROK-BOT.md](docs/GROK-BOT.md)
- 后台和本机工作台：[docs/OWNER-GUIDE.md](docs/OWNER-GUIDE.md)
- 原理、安全设计与开发：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

费用：Vercel 和 Supabase 的免费额度足够个人网站使用，模型按你的 API 用量计费。默认每天最多回答 100 条访客消息。

## 许可

[MIT](LICENSE)。第三方组件及其许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
