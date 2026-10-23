import { cn } from "@/lib/cn";
import type { StageLineText } from "@/lib/race";

/**
 * Guide §6.4 Stage line: a gold dot with a gold-wash halo, the step in ink 500 and the rest in
 * ink-muted ("**Nominations 22 Jan** · Ceremony 15 Mar"). Once the season is over the dot is ink
 * on a track halo. On desktop the race's column labels sit at its right ("To be nominated",
 * "To win", or "Final prediction"), over the row's columns.
 */
export function StageLine({
  line,
  columns,
  className,
}: {
  line: StageLineText;
  /** The chance columns the rows show (`chanceColumns`); none when the race has no chances. */
  columns?: { nominate: boolean; win: string } | null;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4", className)}>
      <div className="flex min-w-0 items-start gap-2.5 text-caption text-ink-muted md:items-center md:text-small">
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
      {columns ? (
        <div
          aria-hidden="true"
          data-columns
          className={cn(
            "hidden flex-none text-right text-caption text-ink-muted md:grid",
            columns.nominate ? "grid-cols-[112px_200px_84px]" : "grid-cols-[200px_84px]",
          )}
        >
          {columns.nominate ? <span>To be nominated</span> : null}
          <span>{columns.win}</span>
          <span />
        </div>
      ) : null}
    </div>
  );
}
