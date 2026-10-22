import { Info, WifiOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type NoticeTone = "gold" | "neutral" | "error";

// Guide §7 Notice. Gold: the season's state. Neutral: coverage notes. Error: offline.
const tones: Record<NoticeTone, { panel: string; icon: string; title: string; Icon: LucideIcon }> = {
  gold: { panel: "bg-gold-wash", icon: "text-gold-ink", title: "text-ink", Icon: Info },
  neutral: { panel: "bg-track", icon: "text-ink-muted", title: "text-ink", Icon: Info },
  error: { panel: "bg-error-wash", icon: "text-error", title: "text-error", Icon: WifiOff },
};

/** A bold first sentence (`title`), then the rest in ink-muted (`children`). */
export function Notice({
  tone = "neutral",
  title,
  children,
  icon,
  role,
  className,
}: {
  tone?: NoticeTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  icon?: LucideIcon;
  /** "status" when the notice appears while the page is open (offline). */
  role?: "status" | "alert";
  className?: string;
}) {
  const t = tones[tone];
  const Icon = icon ?? t.Icon;
  return (
    <div
      role={role}
      data-tone={tone}
      className={cn("flex items-start gap-3 rounded-md px-4 py-3.5 text-small text-ink", t.panel, className)}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 size-4 flex-none", t.icon)} strokeWidth={1.75} />
      <p>
        {title ? <strong className={cn("font-medium", t.title)}>{title}</strong> : null}
        {title && children ? " " : null}
        {children ? <span className="text-ink-muted">{children}</span> : null}
      </p>
    </div>
  );
}
