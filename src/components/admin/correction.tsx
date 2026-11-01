/** "纠正这个回答": the one way to fix a wrong answer, from any conversation or the test chat. */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { usePreferences } from "@/lib/preferences";
import { workbench, type Proposal } from "@/lib/workbench";
import { useWorkbench, type Origin } from "./store";
export type CorrectionTarget = {
  question: string;
  answer: string;
  /** Recorded request, when there is one: local store or cloud archive. */
  runId?: string;
  origin?: Origin;
  /** Titles of the knowledge the answer was based on, to preselect an entry. */
  sources?: string[];
  note?: string;
  corrected?: string;
};
export function CorrectionDialog({ target, onClose }: { target?: CorrectionTarget; onClose: () => void }) {
  const { t } = usePreferences(),
    { state, refresh, reloadCloud } = useWorkbench();
  const [note, setNote] = useState(""),
    [corrected, setCorrected] = useState(""),
    [mode, setMode] = useState<"new" | "existing">("new"),
    [entry, setEntry] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const entries = useMemo(() => (state?.assets ?? []).filter((a) => a.key.startsWith("doc:") && a.kind !== "research"), [state?.assets]);
  useEffect(() => {
    if (!target) return;
    setNote(target.note ?? "");
    setCorrected(target.corrected ?? "");
    setMode("new");
    setError("");
    const guess = entries.find((a) => target.sources?.includes(a.title)) ?? entries.find((a) => a.key === "doc:profile") ?? entries[0];
    setEntry(guess?.key ?? "");
  }, [target]);
  const save = async () => {
    if (!target || !corrected.trim()) return;
    setBusy(true);
    setError("");
    try {
      const question = target.question.trim();
      if (mode === "new") {
        await workbench("new", {
          title: (question || t("纠正的回答", "Corrected answer")).slice(0, 80),
          content: question ? `问：${question}\n答：${corrected.trim()}` : corrected.trim(),
          kind: "personal",
          urls: [],
          origin: "correction",
        });
      } else {
        const before = entries.find((a) => a.key === entry);
        if (!before) throw Error(t("请选择要改进的资料", "Choose the entry to improve"));
        const instruction = [
          "主人纠正了一个回答，请据此修改这份资料。",
          question && "访客问题：" + question,
          "AI 原回答：" + target.answer,
          note.trim() && "哪里不对：" + note.trim(),
          "主人确认的正确说法：" + corrected.trim(),
        ].filter(Boolean).join("\n").slice(0, 7500);
        const proposal = await workbench<Pick<Proposal, "id">>("propose", { target: before.key, instruction, runId: target.origin === "local" ? target.runId : undefined, cli: false });
        // Start the draft with the correction appended; the owner reviews and confirms it in 待处理.
        await workbench("proposal-edit", { id: proposal.id, content: before.content.trimEnd() + "\n\n" + (question ? `问：${question}\n答：${corrected.trim()}` : corrected.trim()) });
      }
      if (target.runId) await workbench(target.origin === "cloud" ? "cloud-review" : "review", { id: target.runId, note: note.trim(), corrected: corrected.trim(), reviewed: true });
      await Promise.all([refresh(), target.origin === "cloud" ? reloadCloud().catch(() => {}) : undefined]);
      toast.success(
        mode === "new"
          ? t("已记下。测试对话马上会用到；发布后访客才能看到。", "Saved. The test chat uses it now; visitors see it after you publish.")
          : t("已生成修改草稿，在「待处理」里确认后生效。", "Draft created. Confirm it in Inbox to apply it."),
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="adm-dialog adm-dialog-wide">
        <DialogTitle>{t("纠正这个回答", "Correct this answer")}</DialogTitle>
        <DialogDescription>{t("告诉它正确的说法。原来的回答不会被改写，以后的回答会照你说的来。", "Tell it what is right. The original answer stays as it was; future answers follow your correction.")}</DialogDescription>
        {target && (
          <form
            className="adm-correction"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="adm-quote">
              {target.question && (
                <p>
                  <strong>{t("问", "Q")}</strong>
                  {target.question}
                </p>
              )}
              <p>
                <strong>{t("答", "A")}</strong>
                {target.answer || t("（没有回答）", "(no answer)")}
              </p>
            </div>
            <label>
              {t("哪里不对？（可选）", "What is wrong? (optional)")}
              <Textarea aria-label={t("哪里不对", "What is wrong")} value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} placeholder={t("例如：我已经不在那家公司了。", "For example: I no longer work there.")} />
            </label>
            <label>
              {t("正确的说法是？", "What is the right answer?")}
              <Textarea aria-label={t("正确的说法", "Correct answer")} value={corrected} maxLength={8000} required onChange={(e) => setCorrected(e.target.value)} placeholder={t("用你希望它对访客说的话来写。", "Write it the way you want it said to visitors.")} />
            </label>
            <fieldset className="adm-choice">
              <legend>{t("怎么记下来", "How to save it")}</legend>
              <label>
                <input type="radio" name="correction-mode" checked={mode === "new"} onChange={() => setMode("new")} />
                <span>
                  <strong>{t("存成一条新问答", "Save as a new Q&A")}</strong>
                  <small>{t("马上在测试对话里生效，发布后访客可见。", "Works in the test chat right away; visitors see it after publishing.")}</small>
                </span>
              </label>
              <label>
                <input type="radio" name="correction-mode" checked={mode === "existing"} onChange={() => setMode("existing")} />
                <span>
                  <strong>{t("改进一条已有资料", "Improve an existing entry")}</strong>
                  <small>{t("生成修改草稿，你在「待处理」里看过再确认。", "Creates a draft you review in Inbox first.")}</small>
                </span>
              </label>
              {mode === "existing" && (
                <select aria-label={t("要改进的资料", "Entry to improve")} value={entry} onChange={(e) => setEntry(e.target.value)}>
                  {entries.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.title}
                    </option>
                  ))}
                </select>
              )}
            </fieldset>
            {error && <p role="alert">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                {t("取消", "Cancel")}
              </Button>
              <Button type="submit" disabled={busy || !corrected.trim()}>
                {t("保存纠正", "Save correction")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
