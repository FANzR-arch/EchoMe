import type { ChatModelAdapter } from "@assistant-ui/react";
import {
  activeRules,
  event,
  getData,
  now,
  updateData,
  uid,
  type Locale,
  type Rules,
  type Scenario,
} from "./data";
import { ownerName as N, owner, siteOrigin } from "./owner";
const delay = (signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, 24);
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
  });
export function mockAdapter(options: {
  conversation?: string;
  locale: () => Locale;
  scenario: () => Scenario;
  rules?: () => Rules;
}): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const en = options.locale() === "en",
        scenario = options.scenario(),
        rules = options.rules?.() ?? activeRules();
      const question =
        messages
          .at(-1)
          ?.content.filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("") ?? "";
      if (!options.rules) {
        let block = "";
        await updateData((d) => {
          const day = now().slice(0, 10),
            minute = Date.now() - 60000;
          const attempts = d.events.filter((e) => e.type === "model-run");
          if (d.safety.paused)
            block = en
              ? "Demo is paused by the administrator."
              : "管理员已暂停演示回答。";
          else if (
            attempts.filter((e) => e.time.startsWith(day)).length >=
              d.safety.dailyLimit ||
            scenario === "quota"
          )
            block = en
              ? "Demo daily quota reached. Adjust it in the admin panel."
              : "演示每日额度已用完，可在后台调整。";
          else if (
            attempts.filter((e) => Date.parse(e.time) > minute).length >=
              d.safety.perMinute ||
            scenario === "rate"
          )
            block = en
              ? "Too many requests. Try again later."
              : "请求过于频繁，请稍后重试。";
          d.events.push({
            id: uid(),
            time: now(),
            type: block ? "blocked" : "model-run",
            conversation: options.conversation,
            detail: block || scenario,
          });
        });
        if (block) throw new Error(block);
      }
      if (question.length > 2000)
        throw new Error(
          en
            ? "Please keep messages under 2,000 characters."
            : "消息请保持在 2,000 字以内。",
        );
      if (scenario === "network")
        throw new Error(
          en
            ? "Simulated connection failure. Switch to Normal and retry."
            : "模拟连接失败。切换为「正常回答」后重试。",
        );
      let text: string,
        sources: string[] = [];
      const approved = rules.approved.find(
        (a) =>
          a.question.trim().toLowerCase() === question.trim().toLowerCase(),
      );
      if (
        scenario === "injection" ||
        /忽略.*(指令|规则)|系统提示词|system prompt|ignore.*instruction/i.test(
          question,
        )
      ) {
        text = en
          ? `I cannot reveal internal instructions or change my role. I can help you explore ${N.en}’s public work and experience.`
          : `我不能提供内部指令，也不会因对话内容改变身份或回答边界。我们可以继续聊${N.zh}的公开经历、作品和想法。`;
      } else if (approved) text = approved.answer;
      else if (
        scenario === "unknown" ||
        /收入|身份证|私人|salary|private|secret/i.test(question)
      ) {
        text = en
          ? `The public material does not contain that information, so I cannot confirm it. You can leave a message for ${N.en} if you need a personal answer.`
          : `现有公开资料没有这方面的信息，我无法确认，也不会替${N.zh}编造答案。如果需要本人确认，可以通过联系入口留言。`;
      } else if (/合作|联系|contact|collaborat/i.test(question)) {
        text = en
          ? `You can leave a short introduction and a way to reach you using “Leave a message”. Availability, pricing and commitments need ${N.en}’s personal confirmation.\n\nThis is a demonstration; no notification will actually be sent.`
          : `可以通过「联系${N.zh}」留下简单介绍和联系方式。项目时间、报价和具体承诺，都需要${N.zh}本人确认。\n\n这是演示流程，留言只保存在当前浏览器，不会真正发送通知。`;
      } else {
        text = en
          ? `${N.en}’s public site and project archive are a good starting point. You can explore the work, then ask about a particular project or leave a message.\n\nThis response is a fixed demo example based on public material.`
          : `可以先从${N.zh}的公开网站和作品档案开始了解。也可以继续问某个方向，或留下一条消息。\n\n这是一段基于公开资料的固定演示回答。`;
        if (rules.sources)
          sources = [
            new URL("/projects", siteOrigin).href,
            owner.contact.url,
          ];
      }
      if (rules.concise) text = text.split("\n\n")[0];
      for (let i = 0; i < text.length; i += 5) {
        await delay(abortSignal);
        yield {
          content: [{ type: "text", text: text.slice(0, i + 5) }],
          metadata: { custom: { sources } },
        };
      }
      if (!options.rules)
        await event("answer-complete", options.conversation, scenario);
    },
  };
}
