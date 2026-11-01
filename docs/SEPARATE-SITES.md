# 聊天与管理网站分离

## 当前入口

| 用途 | 命令 | 本地地址 | 构建产物 |
| --- | --- | --- | --- |
| 可嵌入聊天站点 | `npm run dev:chat` | http://127.0.0.1:5174/chat | `dist/chat` |
| 独立管理网站 | `npm run dev:admin` | http://127.0.0.1:5175/ | `dist/admin` |
| 原版一体化演示，仅用于回归和旧数据查看 | `npm run dev -- --port 5173` | http://127.0.0.1:5173 | `dist/demo`（显式 build:demo） |

聊天端不注册管理路由，不提供后台链接或演示场景选择器；管理端不注册公开聊天路由。管理站点中的「打开聊天」跳到独立站点，「嵌入预览」加载独立聊天站点的 iframe。

保留原版演示用于检验旧有模拟业务闭环，不将它作为公开发布目标。原有浏览器数据没有迁移或删除；使用原协议、主机和 5173 端口启动原版演示仍可查看。

## 可复用的嵌入窗口

最简单的方式是一行脚本，见 README「嵌入到你的网站」。需要自己控制面板时，可以直接放 iframe（把地址替换成正式聊天站点，parentOrigin 换成你网站的 origin）：

```html
<iframe
  src="https://YOUR-CHAT-DOMAIN/chat?embed=1&parentOrigin=https%3A%2F%2Fexample.com"
  title="AI 助手"
  style="width:100%;height:100%;border:0"
></iframe>
```

父容器需要有明确高度。桌面面板和手机全屏效果可在独立管理网站的 `/embed-preview` 中直接验证，个人网站现已接入，新增沉浸式模式见文末说明。

iframe 仅接受允许来源列表中父窗口发来的主题消息。关闭与就绪消息发送到明确的父来源；父页面必须同时检查 `event.origin` 和 `event.source === iframe.contentWindow`。当前参考实现位于 `src/pages/embed.tsx`。

## 环境配置

`.env.example` 包含公开地址与空白服务端模型变量；实际密钥只填写在被 Git 忽略的本机环境文件中。真实模式配置见 README。分别按站点配置：

- 管理站点的 `.env.admin.local`：`VITE_CHAT_SITE_URL` 为聊天站点的完整 origin。
- 聊天站点的 `.env.chat.local`：`VITE_EMBED_ALLOWED_ORIGINS` 为允许的父站点 origin，逗号分隔，不允许通配符。
- Vercel 上分别配置这两个项目的环境变量，不把密钥、私有提示词或访问令牌写入 `VITE_*`。

本地默认允许 `http://127.0.0.1:5175` 与 owner.config.json 中的 `embedOrigins`。来源检查只保护窗口通信，不是服务端鉴权或防反代措施。

## 后续 Vercel 部署边界

当前本机 API 只由开发服务器提供，以下静态构建配置不会部署模型接口；上线需要另行设计服务端运行环境，本阶段不执行。

后续使用同一个代码仓库创建两个 Vercel 项目，代码仓库根目录相同：

| 项目 | 构建命令 | 输出目录 |
| --- | --- | --- |
| 聊天站点 | `npm run check && npm run build:chat` | `dist/chat` |
| 管理网站 | `npm run check && npm run build:admin` | `dist/admin` |

**本次未部署。管理网站目前仍是本地演示，尚不具备“只有本人能访问”的生产保护，不能直接按静态网站公开发布。** 实际上线前必须接入服务端认证，并将管理员账号限制为本人；每个管理数据接口也必须验证权限。域名隐藏、前端密码、分开打包都不等于认证。

建议后续采用 GitHub 登录与单账号白名单，配置 OAuth 凭据和服务器会话密钥；登录方式尚待用户最终选择。不要把密钥粘贴到页面或写入代码仓库。

## 数据状态

当前支持本机真实模型与模拟模式，聊天历史继续使用浏览器 IndexedDB。5173、5174、5175 是不同 origin，**各自保存数据，不同步访客记录或规则**。管理站点的 iframe 保存的是聊天站点的数据，管理页无法直接读取它。保留这一浏览器隔离，不通过 postMessage 搬运管理数据。

下一阶段要让后台看到公开聊天记录，必须把两端接到统一的服务器 API 与数据库：公共聊天接口只处理当前会话，管理接口在本人登录后提供跨会话审核与配置。已增加本机服务端模型 API；尚未接入共享数据库、真实通知或登录。管理页本地模拟配置不影响真实模型接口。

## 进阶：宿主网站对话模式

作者的个人网站已接入公开聊天 iframe，首页使用 `host=portfolio&surface=immersive`，内页使用 `host=portfolio`。新模式只有受信任父来源才能启用；普通独立聊天和原版 embed 保持兼容。

首页显示透明、无外框聊天内容，问候由宿主转场完成后启动。父站保留导航；同页收起不取消生成，跨页通过带 requestId 的 pai:prepare-navigation / pai:saved 保存暂停协议恢复已有会话和草稿。正文与草稿仍留在聊天 origin，不通过窗口消息传给父站。

公开嵌入扩展位于 src/lib/host-bridge.ts、src/components/host-greeting.tsx、src/host-embed.css，复用 pages/chat.tsx 和 components/chat-thread.tsx。管理功能仍为演示，公开聊天可配置真实模型并继续使用浏览器存储，未部署。

这是可选的深度集成协议，普通嵌入不需要。正式来源仍需在 owner.config.json 的 `embedOrigins` 中显式配置。
