import { Bookmark, Check } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// Look and states only (guide §7 Marks). `FilmMarks` and `FilmLabelledMarks` (MarksProvider.tsx) wire them to the store.

export type MarkKind = "watched" | "want";
/** idle; saving (the gold ring, shown only after 400ms by the caller); failed (red ring for 2s). */
export type MarkStatus = "idle" | "saving" | "failed";

// aria-pressed carries the state; the name says what the button is or does (guide §7).
export const MARK_LABELS: Record<MarkKind, { off: string; on: string; short: string }> = {
  watched: { off: "Mark as watched", on: "Watched", short: "Watched" },
  want: { off: "Add to want to watch", on: "Want to watch", short: "Want to watch" },
};

const ICONS = { watched: Check, want: Bookmark };

type MarkProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  kind: MarkKind;
  on: boolean;
  status?: MarkStatus;
};

const shared =
  "relative outline-none transition-[background-color,color,border-color,transform] duration-[var(--dur-fast)] ease-app " +
  "focus-visible:shadow-focus disabled:cursor-default";

// Off: surface with a line border; on: gold wash, no border, gold-ink icon.
function stateClasses(on: boolean, status: MarkStatus): string {
  if (status === "failed") return "border-error bg-surface text-error";
  if (on) return "border-transparent bg-gold-wash text-gold-ink";
  return "border-line bg-surface text-ink-subtle enabled:hover:border-line-strong enabled:hover:text-ink";
}

// Saving: a thin gold ring turning over the border, its right quarter open.
const savingRing =
  "!text-ink-faint after:absolute after:-inset-px after:rounded-full after:border after:border-t-gold after:border-b-gold " +
  "after:border-l-gold after:border-r-transparent after:animate-[spin_0.9s_linear_infinite] after:content-['']";

/** A round mark: 40px on phone, 36px from md, 30px in the year grid; hit area at least 44px. */
export function Mark({
  kind,
  on,
  status = "idle",
  size = "md",
  className,
  ...rest
}: MarkProps & { size?: "md" | "sm" }) {
  const Icon = ICONS[kind];
  const label = MARK_LABELS[kind];
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? label.on : label.off}
      aria-busy={status === "saving" || undefined}
      data-status={status === "idle" ? undefined : status}
      className={cn(
        shared,
        "grid place-items-center rounded-full border enabled:active:scale-[0.92] disabled:text-ink-faint",
        // The invisible ::before widens the hit area to at least 44px.
        "before:absolute before:rounded-full before:content-['']",
        size === "sm"
          ? "size-[30px] before:-inset-[7px] [&_svg]:size-3.5"
          : "size-10 before:-inset-0.5 md:size-9 md:before:-inset-1 [&_svg]:size-4",
        stateClasses(on, status),
        status === "saving" && savingRing,
        className,
      )}
      {...rest}
    >
      <Icon aria-hidden="true" strokeWidth={1.75} fill={kind === "want" && on ? "currentColor" : "none"} />
    </button>
  );
}

/** Labelled pill marks, movie page only: 40px high, icon and "Watched" / "Want to watch". */
export function LabelledMark({ kind, on, status = "idle", className, ...rest }: MarkProps) {
  const Icon = ICONS[kind];
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-busy={status === "saving" || undefined}
      data-status={status === "idle" ? undefined : status}
      className={cn(
        shared,
        "inline-flex h-10 items-center gap-2 rounded-pill border pr-3.5 pl-3 text-small font-medium enabled:active:scale-[0.97]",
        status === "failed"
          ? "border-error bg-surface text-error"
          : on
            ? "border-transparent bg-gold-wash text-gold-ink"
            : "border-line bg-surface text-ink enabled:hover:border-line-strong [&_svg]:text-ink-subtle",
        "disabled:text-ink-faint",
        className,
      )}
      {...rest}
    >
      {status === "saving" ? (
        // Saving: the icon gives way to the same thin gold ring the round marks use.
        <span
          aria-hidden="true"
          className="size-4 rounded-full border border-t-gold border-r-transparent border-b-gold border-l-gold animate-[spin_0.9s_linear_infinite]"
        />
      ) : (
        <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} fill={kind === "want" && on ? "currentColor" : "none"} />
      )}
      {MARK_LABELS[kind].short}
    </button>
  );
}

/** The pair in a row: watched, then want to watch, 6px apart. */
export function Marks({
  watched,
  want,
  size = "md",
  status = {},
  disabled,
  onToggle,
  className,
}: {
  watched: boolean;
  want: boolean;
  size?: "md" | "sm";
  status?: Partial<Record<MarkKind, MarkStatus>>;
  /** Offline: both marks are disabled. */
  disabled?: boolean;
  onToggle?: (kind: MarkKind) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex justify-end gap-1.5", className)}>
      {(["watched", "want"] as const).map((kind) => (
        <Mark
          key={kind}
          kind={kind}
          on={kind === "watched" ? watched : want}
          status={status[kind]}
          size={size}
          disabled={disabled}
          onClick={onToggle ? () => onToggle(kind) : undefined}
        />
      ))}
    </div>
  );
}
