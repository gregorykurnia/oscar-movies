import { cn } from "@/lib/cn";
import type { StageLineText } from "@/lib/race";

/**
 * Guide §6.4 Stage line: a gold dot with a gold-wash halo, the step in ink 500 and the rest in
 * ink-muted ("**Nominations 22 Jan** · Ceremony 15 Mar"). Once the season is over the dot is ink
 * on a track halo. The column labels sit at its right when the chances arrive (Phase 3).
 */
export function StageLine({ line, className }: { line: StageLineText; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2.5 text-caption text-ink-muted md:items-center md:text-small", className)}>
      <span
        aria-hidden="true"
        data-done={line.done || undefined}
        className={cn(
          "mt-1.5 size-2 flex-none rounded-full md:mt-0",
          line.done ? "bg-ink shadow-[0_0_0_4px_var(--track)]" : "bg-gold shadow-[0_0_0_4px_var(--gold-wash)]",
        )}
      />
      <p className="min-w-0 [overflow-wrap:anywhere]">
        <strong className="font-medium text-ink">{line.lead}</strong>
        {line.rest ? ` · ${line.rest}` : null}
      </p>
    </div>
  );
}
