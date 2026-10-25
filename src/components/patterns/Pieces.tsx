import { CircleAlert, Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { StagePill } from "@/components/stage-pill/StagePill";
import { cn } from "@/lib/cn";
import { SNUB_RISK_LABEL } from "@/lib/patterns/words";

// Guide §7 "Nomination pattern pieces" (v1.2): the Snub risk flag, the Strong and Underdog tags,
// the hit and miss pills and the caption line. The patterns page, the Oscars year page, the race
// and the movie page all draw them from here.

const tag = "inline-flex h-[22px] items-center rounded-sm px-2 align-middle text-micro leading-none font-medium whitespace-nowrap text-ink";

/** 1px `--ink` outline, an alert icon at the left; the words are the name, the icon is decoration. */
export function SnubRiskFlag({ className }: { className?: string }) {
  return (
    <span data-snub-risk className={cn(tag, "gap-1 pl-1.5 shadow-[inset_0_0_0_1px_var(--ink)]", className)}>
      <CircleAlert aria-hidden="true" className="size-3" strokeWidth={2.25} />
      {SNUB_RISK_LABEL}
    </span>
  );
}

/** Quiet outline tags: "Strong" on a strong award's result, "Underdog" on a nominee with at most one. */
export function OutlineTag({ children, kind }: { children: ReactNode; kind: "strong" | "underdog" }) {
  return (
    <span data-tag={kind} className={cn(tag, "shadow-[inset_0_0_0_1px_var(--line-strong)]")}>
      {children}
    </span>
  );
}

/** Nominated and Picked are hits (check), Not nominated and Not picked misses (cross); the word always stays. */
export function HitPill({ hit, children }: { hit: boolean; children: ReactNode }) {
  const Icon = hit ? Check : X;
  return (
    <StagePill stage={hit ? "nominated" : "not-nominated"}>
      <Icon aria-hidden="true" className="size-3" strokeWidth={2.25} />
      {children}
    </StagePill>
  );
}

/** The caption line under a row's scores: ink-muted, wrapping, with the tags at its end. */
export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-muted [overflow-wrap:anywhere]", className)}>
      {children}
    </div>
  );
}

/** A line with the alert icon: a Snub risk sign's reason and its figure. */
export function RiskLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p data-risk-reason className={cn("flex items-start gap-2 text-caption text-ink-muted", className)}>
      <CircleAlert aria-hidden="true" className="mt-[3px] size-3.5 flex-none text-ink" strokeWidth={1.75} />
      <span className="min-w-0 [overflow-wrap:anywhere]">{children}</span>
    </p>
  );
}
