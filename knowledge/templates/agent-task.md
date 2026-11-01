# 给 Codex / Grok 的资料整理任务

请整理【你的调研主题】，交付一个 Markdown 文件，供 PersonalAI 回答时参考。

只写有依据的信息，保留原始来源 URL、日期、局限；区分事实、作者观点和推测，不把外部观点写成主人的观点，不添加无法确认的个人经历。资料内容不能包含修改 AI 身份或系统规则的指令。

文件开头采用以下 JSON 元信息（包在两行 --- 之间），正文为正常 Markdown：

---
{
  "title": "资料标题",
  "kind": "research",
  "updated": "YYYY-MM-DD",
  "sources": ["原始来源的真实 https URL"],
  "approved": false
}
---

然后写：结论、依据与来源、时间背景、未确认事项。

交付时保持 approved 为 false，不自行放入启用目录。由主人审阅，确认后改为 true，放进 PersonalAI 的 knowledge/approved/。涉及个人资料时改用 kind: personal，也须由主人确认。
