import { Link } from "react-router-dom";
import { Moon, Sun, ArrowUpRight, Languages } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import { usePreferences } from "@/lib/preferences";
import { useState, type ReactNode } from "react";
import { siteTarget } from "@/lib/site";
import { ownerName } from "@/lib/owner";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to={
        siteTarget === "admin" ? "/admin/inbox" : `/chat${location.search}`
      }
      className="brand"
    >
      <span className="brand-mark">
        {ownerName.en.slice(0, 1).toUpperCase()}<ArrowUpRight size={16} />
      </span>
      {!compact && (
        <span>
          {ownerName.en}<span className="brand-sub"> / Personal AI</span>
        </span>
      )}
    </Link>
  );
}
export function PreferencesControls() {
  const { locale, setLocale, theme, setTheme, t } = usePreferences();
  return (
    <div className="toolbar">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("切换语言", "Switch language")}
        onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
      >
        <Languages />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("切换主题", "Switch theme")}
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        {theme === "dark" ? <Sun /> : <Moon />}
      </Button>
    </div>
  );
}
export function DemoBadge() {
  const { t } = usePreferences();
  return (
    <Badge variant="outline" className="demo-badge">
      <span className="status-dot" />
      {t("演示模式", "Demo mode")}
    </Badge>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {actions}
    </header>
  );
}
export function Choice({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)} items={items}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Confirm({
  children,
  title,
  description,
  onConfirm,
}: {
  children: ReactNode;
  title: string;
  description: string;
  onConfirm: () => void | Promise<unknown>;
}) {
  const [open, setOpen] = useState(false),
    { t } = usePreferences();
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {children}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("取消", "Cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await onConfirm();
                setOpen(false);
              }}
            >
              {t("确认", "Confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}
export function External({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="source-link"
    >
      {children}
      <ArrowUpRight size={14} />
    </a>
  );
}
