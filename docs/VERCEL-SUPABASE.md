# Vercel + Supabase：低访问量上线方案

只想让聊天上线？用 README 的一键部署即可，Supabase 是可选的。本文讲的是完整方案：本机审核后发布资料包，加上线上对话存档。

公开聊天和 API 在 Vercel；线上审核记录在 Supabase。私人工作台、Codex CLI、本机 SQLite 继续留在电脑，不公开管理接口。

## 费用与容量

2026-09-19 查阅官方页面：Supabase Free 数据库 500 MB、出站流量 5 GB；连续一周无活动可能暂停。Vercel Hobby 仅限个人非商业用途。DeepSeek 调用另计费。免费额度不是无限容量，也不保证全天可用。

每条请求包含上下文、原始回答、实际提供的资料和用量，不能按纯消息字数估算存档数量。部署后用数据库实际大小判断。知识资料随发布包部署，不为访客调用额外向量检索服务。

## 首次连接

1. Supabase 创建独立免费项目；在 SQL Editor 里粘贴运行 [`supabase/setup.sql`](../supabase/setup.sql)（全部迁移合在一起，可重复运行，只新建 `pai_` 开头的表和函数）。
2. 启用 Supabase Cron，运行 `supabase/schedule-cleanup.sql`。每小时清理一次；不是严格到秒删除。免费项目暂停期间任务不运行，恢复后下一次运行再清理。
3. 在本机 `.env.local` 填写 `PAI_SUPABASE_URL` 和 `PAI_SUPABASE_SECRET_KEY`（该项目服务端 service_role 密钥）。不要发到聊天，不使用 VITE_ 前缀，不提交 Git。重启管理站。
4. 运行 `npm run knowledge:export`，审核 `deploy/knowledge-release.json`，其中只含已启用资料、人设、规则和 owner 公开身份。访谈草稿、访客聊天、API 密钥不会导出。该文件默认忽略 Git。
5. `npm run deploy:vercel`（会先按 owner 配置生成 `vercel.local.json` 里的 frame-ancestors，再用 Vercel CLI 上传）。构建命令 `npm run build:cloud` 在 Vercel 上执行。Vercel 使用 Node 24，构建命令和输出目录见 `vercel.json`。通过本机 CLI 上传经过审核的资料包；若用 Git 自动部署，需要另行安排审核后的资料包进入构建环境，不能假设本机忽略文件会随 Git 上传。
6. 在 Vercel 服务端环境变量填写 `PAI_PUBLIC_ORIGIN`（聊天站 HTTPS 域名，无末尾斜杠）、`PAI_API_BASE_URL`、`PAI_MODEL`、`PAI_API_KEY`、`PAI_SUPABASE_URL`、`PAI_SUPABASE_SECRET_KEY`、`PAI_HISTORY_SECRET`（一串长随机字符，用于给回复签名；不填则由 API 密钥派生）、`PAI_OWNER_PASSWORD`（网页后台 `/owner` 的密码，至少 12 位）。VITE_EMBED_ALLOWED_ORIGINS 仅放允许嵌入的公开网站域名。
7. 函数和数据库选择相同地区。拿到实际聊天 URL 后才修改个人网站嵌入地址，先验证流式、停止、审核、刷新与手机显示。

发布包记录本机已经验证的模型工具兼容性；模型或服务商变化必须重新检查、导出。云端不会自动发起付费兼容性探测。

## 线上存档和 7 天清理

本机工作台新增「线上存档」。分页查看原始回答、来源、用量，保存批注或按整个会话删除。云端数据不自动复制回本机 SQLite。访客浏览器历史独立保存，不跨设备同步。

默认从会话最后一次交流计时，超过 **7 天未活动**后整段删除，包括所有重试、请求与批注。可选 7/30/90 天或关闭自动删除。设置缩短期限会使已过期会话在下一次任务中删除，无法撤销。删除不影响知识、人设、本机记录或访客浏览器历史；备份中的保留由平台规则决定。

数据库每日计数独立于会话，删除会话不能重置额度。默认全站每日最多 100 次有效请求、每分钟 20 次、并发 4 次，可用环境变量 `PAI_DAILY_LIMIT`、`PAI_PER_MINUTE_LIMIT`、`PAI_CONCURRENT_LIMIT` 调整；服务端把这些数字传给数据库，原子预留跨实例生效，不是每位访客各 100 次。从旧版本升级时在 SQL Editor 里重新运行一次 `supabase/setup.sql`，否则数据库仍按旧的 30/6/2 计数（函数日志会提示）。模型一条回复可能发起多次上游调用。云数据库不可用时拒绝启动模型调用。

## 当前验证边界

已完成的线上结果、实际模型用量及自动任务记录见 [云端验证记录](CLOUD-VERIFICATION.md)。

代码检查及模拟传输测试不等于线上验收。真实 Supabase 建表、Cron 运行、Vercel 函数构建、生产域名和真实聊天需要分别验证；未连接的平台不能标记已上线。服务异常终止可能使最后一段未存入审核记录，此类请求在清理时标记 interrupted，不伪装成功。

官方参考：[Supabase 价格](https://supabase.com/pricing) · [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Supabase Cron](https://supabase.com/docs/guides/cron)
