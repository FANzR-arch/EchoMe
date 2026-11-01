/** Small building blocks shared by the owner admin pages. */
import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { usePreferences } from "@/lib/preferences";
import { CORE_LIMIT, publishLabel, type Publish } from "./labels";
/** A destructive or costly action that always asks first, in a real dialog rather than window.confirm. */
export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive = true,
  disabled,
  variant,
  className,
}: {
  children: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<unknown> | void;
  destructive?: boolean;
  disabled?: boolean;
  variant?: "default" | "outline" | "ghost" | "destructive";
  className?: string;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    { t } = usePreferences();
  return (
    <>
      <Button variant={variant ?? (destructive ? "outline" : "default")} className={className ?? (destructive ? "wb-danger" : undefined)} disabled={disabled} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="adm-dialog">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("取消", "Cancel")}
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                } finally {
                  setBusy(false);
                  setOpen(false);
                }
              }}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function CopyBlock({ value, label }: { value: string; label: string }) {
  const { t } = usePreferences(),
    [copied, setCopied] = useState(false);
  return (
    <div className="adm-copy">
      <code aria-label={label}>{value}</code>
      <Button
        variant="outline"
        size="sm"
        aria-label={t("复制", "Copy") + " " + label}
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            },
            () => {},
          );
        }}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? t("已复制", "Copied") : t("复制", "Copy")}
      </Button>
    </div>
  );
}
export function PublishPill({ state }: { state?: Publish }) {
  const { t } = usePreferences();
  if (!state) return null;
  return (
    <span className="adm-pill" data-state={state}>
      {publishLabel(state, t)}
    </span>
  );
}
export function CoreMeter({ used }: { used: number }) {
  const { t } = usePreferences();
  const over = used > CORE_LIMIT;
  return (
    <div className="adm-meter" data-over={over}>
      <div className="adm-meter-label">
        <span>{t("「每次都带上」已用", "Always-included used")}</span>
        <span>
          {used.toLocaleString()} / {CORE_LIMIT.toLocaleString()} {t("字", "chars")}
        </span>
      </div>
      <div className="adm-meter-track" role="meter" aria-valuemin={0} aria-valuemax={CORE_LIMIT} aria-valuenow={used} aria-label={t("「每次都带上」字数", "Always-included characters")}>
        <span style={{ width: Math.min(100, (used / CORE_LIMIT) * 100) + "%" }} />
      </div>
      {over && <p className="adm-meter-note">{t("超过上限，保存会被拒绝。请精简，或把一些资料改成「需要时读取」。", "Over the limit; saving will be refused. Shorten it or switch some entries to “read when needed”.")}</p>}
    </div>
  );
}
export function Hint({ children }: { children: ReactNode }) {
  return <p className="adm-hint">{children}</p>;
}
