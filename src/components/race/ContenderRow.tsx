import Link from "next/link";
import type { ReactNode } from "react";
import { Flags } from "@/components/flag/Flag";
import { ScoreLine, type Scores } from "@/components/score-line/ScoreLine";
import { cn } from "@/lib/cn";

// Guide §6.5 Contender row, results only: film (1fr) · marks (84px). The "to be nominated" and
// "to win" columns, the precursor line and the chance line join it with the chances (Phase 3).

/** The race's list: the first rule in ink, the rest in line. */
export function ContenderList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("[&>*:first-child]:border-t-ink", className)}>{children}</div>;
}

export function ContenderRow({
  title,
  href,
  flags,
  firstFlagLabel,
  badge,
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
          <ScoreLine scores={scores} className="mt-1.5" />
        </div>
      </div>
      {/* Phone: marks on their own line, indented to the title (21px flag + 12px gap). */}
      <div className="mt-2.5 ml-[33px] flex justify-start [grid-area:marks] md:mt-0 md:ml-0 md:justify-end">{marks}</div>
    </div>
  );
}
