import Link from "next/link";
import type { ReactNode } from "react";
import { Flags } from "@/components/flag/Flag";
import { ScoreLine, type Scores } from "@/components/score-line/ScoreLine";
import { cn } from "@/lib/cn";
import { formatChance } from "@/lib/race-chances";
import type { PrecursorLine } from "@/lib/movie-awards";
import { ChanceLine } from "./ChanceLine";
import { Pct } from "./Pct";
import { WhyButton, WhyRegion } from "./RaceList";

// Guide §6.5 Contender row: film (1fr) · to be nominated (112px) · to win (200px) · marks (84px),
// the chance line on its bottom rule and the "why" under it. Without chances (a race with none
// stored) it is film · marks.

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

export { ContenderList } from "./ContenderList";

/** A row's chance to win and to be nominated, and its "why" (`WhyPanel`). */
export type RowChance = {
  /** Unique on the page: the "why" is `${id}-why`. */
  id: string;
  pWin: number;
  /** Null after the nominations. */
  pNominate: number | null;
  /** The favourite: its % in gold-ink. */
  leader: boolean;
  /** After the ceremony: "final prediction" under the %. */
  final: boolean;
  why: ReactNode;
};

/** Which chance columns the list shows (`chanceColumns`): none, to win, or both. */
export type ChanceColumns = "none" | "win" | "both";

const GRID: Record<ChanceColumns, string> = {
  none: cn(
    "grid-cols-[minmax(0,1fr)] [grid-template-areas:'film'_'marks']",
    "md:grid-cols-[minmax(0,1fr)_84px] md:[grid-template-areas:'film_marks']",
  ),
  win: cn(
    "grid-cols-[minmax(0,1fr)_auto] [grid-template-areas:'film_win'_'film_nom'_'marks_marks'_'why_why']",
    "md:grid-cols-[minmax(0,1fr)_200px_84px] md:[grid-template-areas:'film_win_marks'_'why_why_why']",
  ),
  both: cn(
    "grid-cols-[minmax(0,1fr)_auto] [grid-template-areas:'film_win'_'film_nom'_'marks_marks'_'why_why']",
    "md:grid-cols-[minmax(0,1fr)_112px_200px_84px] md:[grid-template-areas:'film_nom_win_marks'_'why_why_why_why']",
  ),
};

export function ContenderRow({
  title,
  href,
  flag,
  flagLabel,
  badge,
  precursors,
  scores,
  marks,
  columns = "none",
  chance,
}: {
  title: string;
  href: string;
  /** The film's one flag: its primary country (`FilmRowData.flag`). */
  flag: string | null;
  /** Accessible name of the flag ("Brazil, submitting country"). */
  flagLabel?: string;
  /** The Oscar stage pill after the title (Shortlisted, Won, Nominated). */
  badge?: ReactNode;
  /** The awards it won and was nominated for (`precursorLine`). */
  precursors?: PrecursorLine;
  scores: Scores;
  /** `FilmMarks` for the film. */
  marks: ReactNode;
  /** The list's chance columns; a row without a chance shows "–" in them. */
  columns?: ChanceColumns;
  chance?: RowChance | null;
}) {
  return (
    <div
      className={cn(
        "relative grid border-t border-line pt-5 pb-[18px] md:items-center md:pt-[26px] md:pb-7",
        columns !== "none" && "gap-y-0.5 md:gap-y-0",
        GRID[columns],
      )}
    >
      <div className="flex min-w-0 gap-3 [grid-area:film] md:gap-4">
        <Flags code={flag} label={flagLabel} className="mt-1 md:mt-1.5" />
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
      {columns === "both" ? (
        // Phone: "99% to be nominated" under the %; desktop: the column, labelled on the stage line.
        <p className="self-start pl-3 text-right text-micro text-ink-muted [grid-area:nom] md:self-auto md:pl-0 md:text-[18px]">
          {chance?.pNominate != null ? (
            <>
              {formatChance(chance.pNominate)}%<span className="md:sr-only"> to be nominated</span>
            </>
          ) : (
            <>
              <span aria-hidden="true">
                –<span className="md:hidden"> to be nominated</span>
              </span>
              <span className="sr-only">No chance to be nominated worked out</span>
            </>
          )}
        </p>
      ) : null}
      {columns !== "none" ? (
        <div className="justify-self-end pl-3 text-right [grid-area:win] md:pl-0">
          {chance ? (
            <>
              <WhyButton id={chance.id} label={`${formatChance(chance.pWin)}% ${chance.final ? "final prediction" : "chance to win"}, show why`}>
                <Pct p={chance.pWin} leader={chance.leader} />
              </WhyButton>
              <span aria-hidden="true" className="mt-1 block text-micro text-ink-muted">
                {chance.final ? "final prediction" : "to win"}
              </span>
            </>
          ) : (
            <span className="text-title text-ink-muted">
              <span aria-hidden="true">–</span>
              <span className="sr-only">No chance worked out</span>
            </span>
          )}
        </div>
      ) : null}
      {/* The "why" follows its % in the reading order; the grid draws it under the row. */}
      {chance ? (
        <WhyRegion id={chance.id} className="[grid-area:why]">
          {chance.why}
        </WhyRegion>
      ) : null}
      {/* Phone: marks on their own line, indented to the title (21px flag + 12px gap). */}
      <div className="mt-2.5 ml-[33px] flex justify-start [grid-area:marks] md:mt-0 md:ml-0 md:justify-end">{marks}</div>
      {chance ? <ChanceLine p={chance.pWin} /> : null}
    </div>
  );
}
