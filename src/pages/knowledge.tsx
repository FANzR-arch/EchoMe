import { useState } from "react";
import { Play, Save, RotateCcw, Upload, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { PageHeading, Empty } from "@/components/shared";
import { ChatRuntime } from "@/components/chat-thread";
import { now, uid, updateData, useData } from "@/lib/data";
import { usePreferences } from "@/lib/preferences";
import { toast } from "sonner";
export default function Knowledge() {
  const data = useData(),
    { t } = usePreferences(),
    [draft, setDraft] = useState(() => structuredClone(data.draft)),
    [trial, setTrial] = useState(false),
    [trialKey, setTrialKey] = useState(0);
  const save = async () => {
    await updateData((d) => {
      d.draft = structuredClone(draft);
    });
    toast.success(
      t("草稿已保存，未改变已启用规则", "Draft saved. Active rules unchanged."),
    );
  };
  const publish = async () => {
    await updateData((d) => {
      const version = { id: uid(), time: now(), rules: structuredClone(draft) };
      d.draft = structuredClone(draft);
      d.versions.push(version);
      d.activeVersion = version.id;
    });
    toast.success(t("新版本已启用", "New version published"));
  };
  return (
    <>
      <PageHeading
        eyebrow="KNOWLEDGE & GUARDRAILS"
        title={t(
          "让回答，更像你的判断。",
          "Make every answer more considered.",
        )}
        description={t(
          "知识提供依据，规则定义边界。访客对话不会自动加入这里。",
          "Knowledge supplies the facts. Rules define the boundaries. Visitor conversations are never added automatically.",
        )}
        actions={
          <div className="toolbar">
            <Button
              variant="outline"
              onClick={() => {
                setTrialKey((v) => v + 1);
                setTrial(true);
              }}
            >
              <Play />
              {t("试聊草稿", "Test draft")}
            </Button>
            <Button onClick={publish}>
              <Upload />
              {t("启用此版本", "Publish version")}
            </Button>
          </div>
        }
      />
      <div className="knowledge-grid">
        <section>
          <div className="section-heading">
            <h2>{t("编辑草稿", "Edit draft")}</h2>
            <Badge variant="outline">
              {t("保存后仍需启用", "Publish separately")}
            </Badge>
          </div>
          <Tabs defaultValue="knowledge">
            <TabsList>
              <TabsTrigger value="knowledge">
                {t("公开资料", "Knowledge")}
              </TabsTrigger>
              <TabsTrigger value="rules">
                {t("系统规则", "System rules")}
              </TabsTrigger>
              <TabsTrigger value="answers">
                {t("批准答案", "Approved answers")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="knowledge" className="form-stack">
              <label>
                {t("身份说明", "Identity")}
                <Textarea
                  value={draft.identity}
                  onChange={(e) =>
                    setDraft({ ...draft, identity: e.target.value })
                  }
                  maxLength={2000}
                />
              </label>
              <label>
                {t("公开知识资料", "Public knowledge")}
                <Textarea
                  className="large-editor"
                  value={draft.knowledge}
                  onChange={(e) =>
                    setDraft({ ...draft, knowledge: e.target.value })
                  }
                  maxLength={20000}
                />
              </label>
              <p className="subtle-note">
                {t(
                  "仅放入可公开资料。Demo 保存这些文本，但不进行真实检索。",
                  "Public material only. Demo saves this text but does not perform real retrieval.",
                )}
              </p>
            </TabsContent>
            <TabsContent value="rules" className="form-stack">
              <label>
                {t("系统提示词约束", "System prompt constraints")}
                <Textarea
                  className="large-editor"
                  aria-label={t("系统提示词约束", "System prompt constraints")}
                  value={draft.instructions}
                  onChange={(e) =>
                    setDraft({ ...draft, instructions: e.target.value })
                  }
                  maxLength={12000}
                />
              </label>
              <div className="setting-row">
                <div>
                  <strong>{t("简洁回答", "Concise answers")}</strong>
                  <p>
                    {t(
                      "预设回答仅保留第一段",
                      "Keep the first paragraph of preset answers",
                    )}
                  </p>
                </div>
                <Switch
                  aria-label={t("简洁回答", "Concise answers")}
                  checked={draft.concise}
                  onCheckedChange={(v) => setDraft({ ...draft, concise: v })}
                />
              </div>
              <div className="setting-row">
                <div>
                  <strong>{t("展示资料来源", "Show sources")}</strong>
                  <p>
                    {t(
                      "在预设介绍回答下展示公开链接",
                      "Show public links below preset introductions",
                    )}
                  </p>
                </div>
                <Switch
                  aria-label={t("展示资料来源", "Show sources")}
                  checked={draft.sources}
                  onCheckedChange={(v) => setDraft({ ...draft, sources: v })}
                />
              </div>
              <p className="callout">
                {t(
                  "试聊只识别结构化开关和精确匹配的批准答案。自由编辑提示词不会驱动真实模型，不能用来证明安全性。",
                  "Test chat uses structured toggles and exact-match approved answers. Free-form prompt text does not drive a real model and does not prove security.",
                )}
              </p>
            </TabsContent>
            <TabsContent value="answers" className="form-stack">
              {!draft.approved.length && (
                <Empty>
                  {t(
                    "从会话中补充理想答案，或在这里新增。",
                    "Add an ideal answer from a conversation, or create one here.",
                  )}
                </Empty>
              )}
              {draft.approved.map((a, i) => (
                <div className="answer-editor" key={i}>
                  <label>
                    {t("精确匹配的问题", "Exact question")}
                    <Input
                      value={a.question}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          approved: draft.approved.map((v, j) =>
                            j === i ? { ...v, question: e.target.value } : v,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    {t("已批准的答案", "Approved answer")}
                    <Textarea
                      value={a.answer}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          approved: draft.approved.map((v, j) =>
                            j === i ? { ...v, answer: e.target.value } : v,
                          ),
                        })
                      }
                    />
                  </label>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        approved: draft.approved.filter((_, j) => j !== i),
                      })
                    }
                  >
                    {t("移除此答案", "Remove answer")}
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() =>
                  setDraft({
                    ...draft,
                    approved: [...draft.approved, { question: "", answer: "" }],
                  })
                }
              >
                {t("新增批准答案", "Add approved answer")}
              </Button>
            </TabsContent>
          </Tabs>
          <Button variant="outline" className="save-draft" onClick={save}>
            <Save />
            {t("保存草稿", "Save draft")}
          </Button>
        </section>
        <aside className="versions">
          <p className="eyebrow">VERSION HISTORY</p>
          <h2>{t("每一次修改，都可回看。", "A history of your decisions.")}</h2>
          {[...data.versions].reverse().map((v, i) => (
            <div className="version-row" key={v.id}>
              <div>
                <strong>v{data.versions.length - i}</strong>
                <p>{new Date(v.time).toLocaleString()}</p>
              </div>
              {data.activeVersion === v.id ? (
                <Badge variant="outline">
                  <Check size={12} />
                  {t("已启用", "Active")}
                </Badge>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await updateData((d) => {
                      d.activeVersion = v.id;
                    });
                    toast.success(
                      t(
                        "已回退启用版本，草稿保留",
                        "Active version restored. Draft kept.",
                      ),
                    );
                  }}
                >
                  <RotateCcw size={13} />
                  {t("回退", "Restore")}
                </Button>
              )}
            </div>
          ))}
        </aside>
      </div>
      <Sheet open={trial} onOpenChange={setTrial}>
        <SheetContent className="trial-sheet">
          <SheetHeader>
            <SheetTitle>{t("草稿试聊", "Test draft")}</SheetTitle>
            <SheetDescription>
              {t(
                "不计入访客统计，不触发通知。使用当前编辑内容。",
                "Not counted as a visitor conversation. No notifications. Uses the current editor draft.",
              )}
            </SheetDescription>
          </SheetHeader>
          <ChatRuntime key={trialKey} scenario="normal" draft={draft} />
        </SheetContent>
      </Sheet>
    </>
  );
}
