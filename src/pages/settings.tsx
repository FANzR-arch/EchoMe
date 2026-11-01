import { useState } from "react";
import { ShieldCheck, RotateCcw, Bell, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageHeading, Confirm, Empty } from "@/components/shared";
import { event, resetData, updateData, useData } from "@/lib/data";
import { usePreferences } from "@/lib/preferences";
import { toast } from "sonner";
export function Security() {
  const data = useData(),
    { t } = usePreferences(),
    [limit, setLimit] = useState(String(data.safety.dailyLimit)),
    [rate, setRate] = useState(String(data.safety.perMinute)),
    [origin, setOrigin] = useState(data.safety.allowedOrigin);
  const blocked = data.events.filter((e) => e.type === "blocked"),
    valid =
      Number.isInteger(Number(limit)) &&
      Number(limit) >= 1 &&
      Number(limit) <= 10000 &&
      Number.isInteger(Number(rate)) &&
      Number(rate) >= 1 &&
      Number(rate) <= 100;
  return (
    <>
      <PageHeading
        eyebrow="SAFETY & USAGE"
        title={t("有边界，才安心。", "Confidence starts with boundaries.")}
        description={t(
          "在 Demo 中体验限制与异常反馈；真实防护必须由服务端执行。",
          "Explore limits and error states. Real protection must be enforced on the server.",
        )}
      />
      <div className="callout">
        <ShieldCheck size={18} />
        <span>
          {t(
            "这里只验证交互，不具备生产认证、防反代、IP 限流或费用保护。",
            "This validates interactions, not production authentication, anti-proxy protection, IP limits or billing caps.",
          )}
        </span>
      </div>
      <section className="settings-section">
        <h2>{t("演示用量控制", "Demo usage controls")}</h2>
        <div className="setting-row">
          <div>
            <strong>{t("暂停所有演示回答", "Pause demo responses")}</strong>
            <p>
              {t(
                "开启后，新请求被拦截。已开始的回答可由访客停止。",
                "Blocks new requests. Visitors can stop a response already running.",
              )}
            </p>
          </div>
          <Switch
            aria-label={t("暂停所有演示回答", "Pause demo responses")}
            checked={data.safety.paused}
            onCheckedChange={(v) =>
              void updateData((d) => {
                d.safety.paused = v;
              })
            }
          />
        </div>
        <div className="settings-fields">
          <label>
            {t("每日演示调用上限", "Daily demo run limit")}
            <Input
              type="number"
              min="1"
              max="10000"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </label>
          <label>
            {t("每分钟演示调用上限", "Demo runs per minute")}
            <Input
              type="number"
              min="1"
              max="100"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </label>
        </div>
        <Button
          variant="outline"
          disabled={!valid}
          onClick={async () => {
            await updateData((d) => {
              d.safety.dailyLimit = Number(limit);
              d.safety.perMinute = Number(rate);
            });
            toast.success(t("演示限制已保存", "Demo limits saved"));
          }}
        >
          {t("保存用量限制", "Save usage limits")}
        </Button>
        <p className="subtle-note">
          {t(
            "基于本地调用事件计数，可通过清空浏览器绕过。模拟费用 ¥0.00。",
            "Counts local run events and can be bypassed by clearing browser data. Simulated cost ¥0.00.",
          )}
        </p>
      </section>
      <section className="settings-section">
        <h2>{t("生产防护接入清单", "Production protection checklist")}</h2>
        {[
          [
            t(
              "后台认证与会话权限",
              "Admin authentication & session permissions",
            ),
            t(
              "每个管理接口验证权限，访客不能读取他人会话",
              "Authorize every admin request and isolate visitor sessions",
            ),
          ],
          [
            t("服务端限流与费用上限", "Server limits & billing caps"),
            t(
              "计数不可用时暂停付费调用",
              "Fail closed when paid-call quota checks are unavailable",
            ),
          ],
          [
            t("防盗用与来源检查", "Abuse prevention & origin checks"),
            t(
              "CORS 不能阻止服务器伪装来源；组合会话凭证、限流和异常验证",
              "CORS does not prevent server impersonation; combine session tokens, limits and anomaly checks",
            ),
          ],
        ].map(([label, desc]) => (
          <div className="setting-row" key={label}>
            <div>
              <strong>{label}</strong>
              <p>{desc}</p>
            </div>
            <Badge variant="outline">{t("待接入", "Not connected")}</Badge>
          </div>
        ))}
        <label className="origin-field">
          {t(
            "允许来源（仅保存配置草稿，不执行拦截）",
            "Allowed origin (configuration draft, not enforced)",
          )}
          <Input
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            maxLength={300}
          />
        </label>
        <Button
          variant="outline"
          onClick={async () => {
            await updateData((d) => {
              d.safety.allowedOrigin = origin;
            });
            toast.success(
              t(
                "配置草稿已保存，未启用来源防护",
                "Draft saved. Origin enforcement is not enabled.",
              ),
            );
          }}
        >
          {t("保存来源草稿", "Save origin draft")}
        </Button>
      </section>
      <section className="settings-section">
        <h2>{t("异常记录", "Blocked requests")}</h2>
        {!blocked.length ? (
          <Empty>
            {t(
              "暂无拦截。可在聊天页选择异常场景体验。",
              "No blocked requests. Try an error scenario in chat.",
            )}
          </Empty>
        ) : (
          <div className="event-list">
            {blocked
              .slice(-10)
              .reverse()
              .map((e) => (
                <div key={e.id}>
                  <span>{e.detail}</span>
                  <time>{new Date(e.time).toLocaleTimeString()}</time>
                </div>
              ))}
          </div>
        )}
      </section>
      <div className="reset-row">
        <div>
          <h2>{t("重置演示数据", "Reset demo data")}</h2>
          <p className="subtle-note">
            {t(
              "删除新增会话和配置，恢复两条初始示例。",
              "Removes added conversations and settings; restores the two initial samples.",
            )}
          </p>
        </div>
        <Confirm
          title={t("重置全部演示数据？", "Reset all demo data?")}
          description={t(
            "当前浏览器中的会话、草稿和事件将被替换，无法撤销。",
            "Conversations, drafts and events in this browser will be replaced. Cannot be undone.",
          )}
          onConfirm={async () => {
            await resetData();
            location.reload();
          }}
        >
          <RotateCcw />
          {t("重置 Demo", "Reset demo")}
        </Confirm>
      </div>
    </>
  );
}
export function Notifications() {
  const data = useData(),
    { t } = usePreferences(),
    [preview, setPreview] = useState<"contact" | "daily">("daily");
  const chats = data.conversations.filter(
      (c) => c.messages.length || c.contact,
    ),
    todays = chats.filter(
      (c) => c.updated.slice(0, 10) === new Date().toISOString().slice(0, 10),
    );
  const logs = data.events.filter(
    (e) =>
      e.type === "notification-preview" || e.type === "notification-failed",
  );
  return (
    <>
      <PageHeading
        eyebrow="NOTIFICATIONS"
        title={t("重要的时候，再打扰你。", "Only when it matters.")}
        description={t(
          "即时线索与每日摘要，避免每句话都触发提醒。",
          "Important leads and daily summaries, without a notification for every message.",
        )}
      />
      <div className="knowledge-grid">
        <section>
          {(
            [
              [
                "contact",
                t("收到联系留言", "Contact message received"),
                t(
                  "访客主动留下联系方式或留言时生成预览",
                  "Preview when a visitor submits a contact message",
                ),
              ],
              [
                "daily",
                t("每日摘要", "Daily summary"),
                t(
                  "展示问题、联系线索和待查看会话；尚未接入定时任务",
                  "Questions, leads and unreviewed chats; no scheduled job connected",
                ),
              ],
              [
                "newChat",
                t("新会话提醒", "New conversation notification"),
                t(
                  "仅首次提问触发预览，每个访客 10 分钟冷却",
                  "Preview on first question, with a 10-minute cooldown per visitor",
                ),
              ],
            ] as const
          ).map(([key, title, desc]) => (
            <div className="setting-row" key={key}>
              <div>
                <strong>{title}</strong>
                <p>{desc}</p>
              </div>
              <Switch
                aria-label={title}
                checked={data.notifications[key]}
                onCheckedChange={(v) =>
                  void updateData((d) => {
                    d.notifications[key] = v;
                  })
                }
              />
            </div>
          ))}
          <p className="callout">
            {t(
              "通知渠道未连接。这里不会发送邮箱、Telegram 或其他推送。",
              "No channel connected. No email, Telegram or other push is sent.",
            )}
          </p>
          <div className="section-heading">
            <h2>{t("模拟记录", "Simulation log")}</h2>
            <Badge variant="outline">{t("本地", "Local")}</Badge>
          </div>
          {!logs.length ? (
            <Empty>
              {t(
                "可以在右侧预览一次通知。",
                "Preview a notification on the right.",
              )}
            </Empty>
          ) : (
            <div className="event-list">
              {logs
                .slice(-8)
                .reverse()
                .map((e) => (
                  <div key={e.id}>
                    <span>
                      {e.type === "notification-failed"
                        ? t("模拟失败", "Simulated failure")
                        : t(
                            "预览已生成，未发送",
                            "Preview generated, not sent",
                          )}
                    </span>
                    <time>{new Date(e.time).toLocaleTimeString()}</time>
                  </div>
                ))}
            </div>
          )}
        </section>
        <aside className="notification-preview">
          <p className="eyebrow">PREVIEW · NOT SENT</p>
          <div className="toolbar">
            <Button
              variant={preview === "daily" ? "secondary" : "ghost"}
              onClick={() => setPreview("daily")}
            >
              {t("每日摘要", "Daily summary")}
            </Button>
            <Button
              variant={preview === "contact" ? "secondary" : "ghost"}
              onClick={() => setPreview("contact")}
            >
              {t("联系留言", "Contact message")}
            </Button>
          </div>
          <Bell size={24} />
          <h2>
            {preview === "daily"
              ? t("今天，大家聊了什么？", "What came up today?")
              : t("有人留下了一点想法", "Someone left a thought")}
          </h2>
          {preview === "daily" ? (
            <>
              <p>
                {t("今日会话", "Today’s conversations")}: {todays.length}
                <br />
                {t("联系线索", "Contact leads")}:{" "}
                {todays.filter((c) => c.contact).length}
                <br />
                {t("待查看", "Unreviewed")}:{" "}
                {todays.filter((c) => !c.reviewed).length}
              </p>
              <p className="subtle-note">
                {todays[0]?.title || t("暂无会话", "No conversations yet")}
              </p>
            </>
          ) : (
            <p>
              {chats.find((c) => c.contact)?.contact?.message ||
                t(
                  "暂无留言，提交一条演示留言后查看。",
                  "No messages. Submit a demo contact message first.",
                )}
            </p>
          )}
          <div className="toolbar">
            <Button
              disabled={!data.notifications[preview]}
              onClick={() => {
                void event("notification-preview", undefined, preview);
                toast.success(
                  t(
                    "预览已生成，未发送通知",
                    "Preview generated. Nothing sent.",
                  ),
                );
              }}
            >
              <Send />
              {t("模拟成功", "Simulate success")}
            </Button>
            <Button
              variant="outline"
              disabled={!data.notifications[preview]}
              onClick={() => {
                void event("notification-failed", undefined, preview);
                toast.error(
                  t(
                    "模拟通知失败，会话记录保留",
                    "Simulated failure. Conversations are retained.",
                  ),
                );
              }}
            >
              {t("模拟失败", "Simulate failure")}
            </Button>
          </div>
          <small>
            {t(
              "统计按 UTC 日期，包含示例会话。",
              "UTC date boundary. Includes sample conversations.",
            )}
          </small>
        </aside>
      </div>
    </>
  );
}
