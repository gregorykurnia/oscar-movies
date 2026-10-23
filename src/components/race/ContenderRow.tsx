import Link from "next/link";
import type { ReactNode } from "react";
import { Flags } from "@/components/flag/Flag";
import { ScoreLine, type Scores } from "@/components/score-line/ScoreLine";
import { cn } from "@/lib/cn";
import type { PrecursorLine } from "@/lib/movie-awards";

// Guide §6.5 Contender row, results only: film (1fr) · marks (84px), with the precursor line. The
// "to be nominated" and "to win" columns and the chance line join it with the chances (Phase 3).

/** "Won: BAFTA, PGA · Nominated: Globes": labels muted, awards in ink; null when there is nothing to say. */
export function PrecursorText({ line, className }: { line: PrecursorLine; className?: string }) {
  const parts = [
    { label: "Won", awards: line.won },
    { label: "Nominated", awards: line.nominated },
  ].filter((p) => p.awards.length > 0);
  if (parts.length === 0) return null;
  return (
    <p data-precursors className={cn("text-small text-ink-muted [overflow-wrap:anywhere]", className)}>
      {parts.map((p, i) => (
        <span key={p.label}>
          {i > 0 ? " · " : null}
          {p.label}: <span className="text-ink">{p.awards.join(", ")}</span>
        </span>
      ))}
    </p>
  );
}

/** The rows: the first rule in ink, and a closing rule under the last (drop it when a "Show all" row follows: it has its own rule). */
export function ContenderList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("border-b border-line [&>*:first-child]:border-t-ink", className)}>{children}</div>;
}

export function ContenderRow({
  title,
  href,
  flags,
  firstFlagLabel,
  badge,
  precursors,
  scores,
  marks,
}: {
  title: string;
  href: string;
  /** Country codes, main first (the submitting country first for International). */
  flags: string[];
  /** Accessible name of the first flag ("Brazil, submitting country"). */
  firstFlagLabel?: string;
  /** The Oscar stage pill after the title (Shortlisted, Won, Nominated). */
  badge?: ReactNode;
  /** The awards it won and was nominated for (`precursorLine`). */
  precursors?: PrecursorLine;
  scores: Scores;
  /** `FilmMarks` for the film. */
  marks: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] border-t border-line pt-5 pb-[18px] [grid-template-areas:'film'_'marks']",
        "md:grid-cols-[minmax(0,1fr)_84px] md:items-center md:pt-[26px] md:pb-7 md:[grid-template-areas:'film_marks']",
      )}
    >
      <div className="flex min-w-0 gap-3 [grid-area:film] md:gap-4">
        <Flags codes={flags} stacked firstLabel={firstFlagLabel} className="pt-1 md:pt-1.5" />
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-title-phone leading-snug font-medium tracking-title [overflow-wrap:anywhere] md:text-title">
            <Link
              href={href}
              className="rounded-xs outline-none decoration-line-strong decoration-1 underline-offset-4 hover:underline focus-visible:shadow-focus"
            >
              {title}
            </Link>
            {badge}
          </h3>
          {precursors ? <PrecursorText line={precursors} className="mt-1.5" /> : null}
          <ScoreLine scores={scores} className="mt-1.5" />
        </div>
      </div>
      {/* Phone: marks on their own line, indented to the title (21px flag + 12px gap). */}
      <div className="mt-2.5 ml-[33px] flex justify-start [grid-area:marks] md:mt-0 md:ml-0 md:justify-end">{marks}</div>
    </div>
  );
}
