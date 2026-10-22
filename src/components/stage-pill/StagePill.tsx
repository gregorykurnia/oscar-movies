import { cn } from "@/lib/cn";

export type Stage =
  | "won"
  | "nominated"
  | "shortlisted"
  | "eligible"
  | "submitted"
  | "not-nominated"
  | "not-submitted"
  | "runner-up"
  | "no-data"
  | "partly-loaded"
  | "live";

// Labels from guide §11; "Live" is the live season (year switcher, coverage).
export const STAGE_LABELS: Record<Stage, string> = {
  won: "Won",
  nominated: "Nominated",
  shortlisted: "Shortlisted",
  eligible: "Eligible",
  submitted: "Submitted",
  "not-nominated": "Not nominated",
  "not-submitted": "Not submitted",
  "runner-up": "Runner-up",
  "no-data": "No data",
  "partly-loaded": "Partly loaded",
  live: "Live",
};

// Guide §7 Stage pill. Gold only for a win and the live season; nominated is ink on track.
const looks: Record<Stage, string> = {
  won: "bg-gold-wash text-gold-ink before:size-1.5 before:rounded-full before:bg-gold before:content-['']",
  nominated: "bg-track text-ink",
  shortlisted: "text-ink-muted shadow-[inset_0_0_0_1px_var(--line-strong)]",
  eligible: "text-ink-muted shadow-[inset_0_0_0_1px_var(--line-strong)]",
  submitted: "text-ink-muted shadow-[inset_0_0_0_1px_var(--line)]",
  "not-nominated": "text-ink-muted !pl-0",
  "not-submitted": "text-ink-muted !pl-0",
  "runner-up": "bg-track text-ink-muted",
  "no-data": "!font-normal text-ink-muted shadow-[inset_0_0_0_1px_var(--line)]",
  "partly-loaded": "!font-normal text-ink-muted shadow-[inset_0_0_0_1px_var(--line)]",
  live: "bg-gold-wash text-gold-ink",
};

export function StagePill({
  stage,
  children,
  className,
}: {
  stage: Stage;
  /** Overrides the standard label (e.g. a festival prize name). */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      data-stage={stage}
      className={cn(
        "inline-flex h-[22px] items-center gap-[5px] rounded-sm px-2 align-middle text-micro leading-none font-medium whitespace-nowrap",
        looks[stage],
        className,
      )}
    >
      {children ?? STAGE_LABELS[stage]}
    </span>
  );
}
