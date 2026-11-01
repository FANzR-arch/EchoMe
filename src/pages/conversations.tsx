import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Trash2, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  PageHeading,
  Choice,
  Confirm,
  Empty,
  External,
} from "@/components/shared";
import {
  downloadJSON,
  removeConversation,
  safeUrl,
  updateData,
  useData,
  type Conversation,
} from "@/lib/data";
import { usePreferences } from "@/lib/preferences";
import { toast } from "sonner";
export default function Conversations() {
  const data = useData(),
    { t } = usePreferences(),
    [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(""),
    filter = params.get("filter") ?? "all";
  const chats = data.conversations.filter(
    (c) =>
      (c.messages.length || c.contact) &&
      (!search ||
        `${c.title} ${c.visitor} ${c.contact?.name ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (filter === "all" ||
        (filter === "contact" && c.contact) ||
        (filter === "issue" && Object.values(c.feedback).includes("bad")) ||
        (filter === "unread" && !c.reviewed) ||
        (filter === "done" && c.reviewed)),
  );
  const selected = chats.find((c) => c.id === params.get("id")) ?? chats[0];
  return (
    <>
      <PageHeading
        eyebrow="CONVERSATIONS"
        title={t("听见每一个问题", "Listen to every question")}
        description={t(
          "查看完整对话，留下备注，把有价值的修正带回知识库。",
          "Read conversations, keep notes, and bring useful corrections into your knowledge.",
        )}
        actions={
          <Button variant="outline" onClick={() => downloadJSON(chats)}>
            <Download />
            {t("导出", "Export")}
          </Button>
        }
      />
      <div className="conversation-tools">
        <div className="search-field">
          <Search size={16} />
          <Input
            aria-label={t("搜索会话", "Search conversations")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("搜索问题、访客…", "Search questions or visitors…")}
          />
        </div>
        <Choice
          label={t("筛选会话", "Filter conversations")}
          value={filter}
          onChange={(v) => setParams({ filter: v })}
          items={[
            ["all", t("全部会话", "All conversations")],
            ["unread", t("待查看", "Unreviewed")],
            ["contact", t("联系意向", "Contact leads")],
            ["issue", t("回答有问题", "Needs correction")],
            ["done", t("已处理", "Reviewed")],
          ].map(([value, label]) => ({ value, label }))}
        />
      </div>
      <div className="conversation-workspace">
        <aside className="conversation-list">
          {chats.map((c) => (
            <button
              className={selected?.id === c.id ? "selected" : ""}
              key={c.id}
              onClick={() => setParams({ filter, id: c.id })}
            >
              <div>
                <span className="status-dot" />
                <small>
                  {c.sample ? t("示例访客", "Sample visitor") : c.visitor}
                </small>
                {c.reviewed && <Check size={14} />}
              </div>
              <strong>{c.title || t("新留言", "New message")}</strong>
              <p>
                {c.messages.at(-1)?.text.slice(0, 70) || c.contact?.message}
              </p>
              <small>
                {c.messages.filter((m) => m.role === "user").length}{" "}
                {t("个问题", "questions")}
                {c.contact && ` · ${t("联系意向", "Contact")}`}
              </small>
            </button>
          ))}
          {!chats.length && (
            <Empty>
              {t(
                "没有匹配的会话。试试其他筛选。",
                "No matches. Try another filter.",
              )}
            </Empty>
          )}
        </aside>
        {selected ? (
          <ConversationDetail key={selected.id} conversation={selected} />
        ) : (
          <Empty>
            {t("发送一条消息，开始体验。", "Send a message to get started.")}
          </Empty>
        )}
      </div>
    </>
  );
}
function ConversationDetail({
  conversation: c,
}: {
  conversation: Conversation;
}) {
  const { t } = usePreferences(),
    [note, setNote] = useState(c.note),
    [correction, setCorrection] = useState(""),
    [messageId, setMessageId] = useState<string | null>(null);
  return (
    <section className="conversation-detail">
      <header>
        <div>
          <strong>
            {c.sample ? t("示例访客", "Sample visitor") : c.visitor}
          </strong>
          <p>
            {new Date(c.created).toLocaleString()} ·{" "}
            {t("本地记录", "Local record")}
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={() =>
            void updateData((d) => {
              const item = d.conversations.find((v) => v.id === c.id);
              if (item) item.reviewed = !item.reviewed;
            })
          }
        >
          <Check />
          {c.reviewed
            ? t("已处理", "Reviewed")
            : t("标记已处理", "Mark reviewed")}
        </Button>
        <Confirm
          title={t("删除这条演示会话？", "Delete this demo conversation?")}
          description={t(
            "同时删除本地留言和关联事件，无法撤销。",
            "This also removes its local contact and events. Cannot be undone.",
          )}
          onConfirm={() => removeConversation(c.id)}
        >
          <Trash2 size={15} />
        </Confirm>
      </header>
      {c.contact && (
        <div className="contact-note">
          <Badge variant="outline">{t("联系留言", "Contact message")}</Badge>
          <strong>{c.contact.name || t("未留称呼", "No name")}</strong>
          <p>{c.contact.address}</p>
          <p>{c.contact.message}</p>
          <small>
            {t(
              "仅演示保存，未向外发送",
              "Saved locally for demo. Not sent externally.",
            )}
          </small>
        </div>
      )}
      <div className="review-messages">
        {c.messages.map((m, i) => (
          <article key={m.id} className={`review-message ${m.role}`}>
            <small>
              {m.role === "user" ? t("访客", "Visitor") : "PHIL’S AI"}
              {m.state === "stopped" && ` · ${t("已停止", "Stopped")}`}
              {m.state === "error" && ` · ${t("生成失败", "Failed")}`}
            </small>
            <p>{m.text || t("未生成内容", "No content generated")}</p>
            <div className="source-links">
              {m.sources
                ?.filter((s) => safeUrl(s))
                .map((s) => (
                  <External href={safeUrl(s)!} key={s}>
                    {s}
                  </External>
                ))}
            </div>
            {m.role === "assistant" && (
              <div className="review-actions">
                <Button
                  variant={c.feedback[m.id] === "bad" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() =>
                    void updateData((d) => {
                      const item = d.conversations.find((v) => v.id === c.id);
                      if (item) item.feedback[m.id] = "bad";
                    })
                  }
                >
                  {c.feedback[m.id] === "bad"
                    ? t("已标记问题", "Flagged")
                    : t("标记问题", "Flag issue")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMessageId(m.id);
                    setCorrection(m.text);
                  }}
                >
                  {t("补充理想答案", "Write ideal answer")}
                </Button>
                {c.feedback[m.id] === "good" && (
                  <Badge variant="outline">{t("有帮助", "Helpful")}</Badge>
                )}
              </div>
            )}
            {messageId === m.id && (
              <div className="correction">
                <label>
                  {t(
                    "理想答案（保存到草稿，需另行启用）",
                    "Ideal answer (draft; publish separately)",
                  )}
                  <Textarea
                    aria-label={t("理想答案", "Ideal answer")}
                    value={correction}
                    maxLength={5000}
                    onChange={(e) => setCorrection(e.target.value)}
                  />
                </label>
                <Button
                  disabled={!correction.trim()}
                  onClick={async () => {
                    const question = c.messages
                      .slice(0, i)
                      .findLast((v) => v.role === "user")?.text;
                    if (!question) return;
                    await updateData((d) => {
                      d.draft.approved = d.draft.approved.filter(
                        (a) => a.question !== question,
                      );
                      d.draft.approved.push({ question, answer: correction });
                    });
                    setMessageId(null);
                    toast.success(
                      t(
                        "已加入知识草稿，尚未启用",
                        "Added to knowledge draft. Not published.",
                      ),
                    );
                  }}
                >
                  {t("保存到知识草稿", "Save to knowledge draft")}
                </Button>
                <Button variant="ghost" onClick={() => setMessageId(null)}>
                  {t("取消", "Cancel")}
                </Button>
              </div>
            )}
          </article>
        ))}
      </div>
      <div className="internal-note">
        <label>
          {t(
            "内部备注 · 不进入 AI 回答",
            "Internal note · Never used in AI responses",
          )}
          <Textarea
            aria-label={t("内部备注", "Internal note")}
            value={note}
            maxLength={3000}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <Button
          variant="outline"
          onClick={async () => {
            await updateData((d) => {
              const item = d.conversations.find((v) => v.id === c.id);
              if (item) item.note = note;
            });
            toast.success(t("备注已保存", "Note saved"));
          }}
        >
          {t("保存备注", "Save note")}
        </Button>
      </div>
    </section>
  );
}
