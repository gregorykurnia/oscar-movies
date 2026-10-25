import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Flags } from "@/components/flag/Flag";
import { ScoreLine, type Scores } from "@/components/score-line/ScoreLine";
import { cn } from "@/lib/cn";

// Guide §7 Film row: flags · title with a meta line and the scores line · result columns · marks.
// The list sets the desktop columns once (--film-cols) and every row inherits them. A row's lead
// (International's submitting country) is the first column on desktop and a line above the film
// on phone.
const DEFAULT_COLUMNS = ["minmax(0,1fr)", "132px", "168px", "84px"];

const rowGrid = "items-center gap-y-2.5 md:grid-cols-[var(--film-cols)] md:gap-4 md:[grid-template-areas:none]";
// Phone: the film and marks, then the results (a lead takes a line of its own above). A drag
// handle (the Watch list's My order) is a 28px column at the left of both lines.
const phoneGrid = "grid-cols-[minmax(0,1fr)_auto] gap-x-3 [grid-template-areas:'film_marks'_'res_res']";
const phoneGridWithLead = "grid-cols-[minmax(0,1fr)_auto] gap-x-3 [grid-template-areas:'lead_lead'_'film_marks'_'res_res']";
const phoneGridWithHandle =
  "grid-cols-[28px_minmax(0,1fr)_auto] gap-x-2 [grid-template-areas:'grip_film_marks'_'grip_res_res']";

/**
 * A list of film rows: the first rule in ink, a head row of column labels on desktop.
 * `columns` are the desktop grid tracks: the handle and the lead (if rows have them), the film
 * column, one per result, then the marks.
 */
export function FilmList({
  head,
  filmLabel = "Film",
  leadLabel,
  handles = false,
  columns = DEFAULT_COLUMNS,
  children,
  className,
}: {
  /** Labels of the result columns, in order ("BAFTA", "Oscar, Best Picture"); a numeric column's label is right-aligned over its figures. */
  head?: (string | { label: string; numeric: true })[];
  /** The film column's label. */
  filmLabel?: string;
  /** The lead column's label ("Country"), when the rows have a lead. */
  leadLabel?: string;
  /** The rows start with a drag handle (an unlabelled first column). */
  handles?: boolean;
  columns?: string[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-t border-ink", className)} style={{ "--film-cols": columns.join(" ") } as CSSProperties}>
      {head ? (
        <div aria-hidden="true" className={cn(rowGrid, "hidden border-b border-line py-2.5 text-caption text-ink-muted md:grid")}>
          {handles ? <span /> : null}
          {leadLabel ? <span>{leadLabel}</span> : null}
          <span>{filmLabel}</span>
          {head.map((h) =>
            typeof h === "string" ? (
              <span key={h}>{h}</span>
            ) : (
              <span key={h.label} className="text-right">
                {h.label}
              </span>
            ),
          )}
          <span />
        </div>
      ) : null}
      {children}
    </div>
  );
}

export type FilmResult = {
  /** The column's name: shown before the value on phone, read out on desktop ("BAFTA"). */
  label: string;
  /** A stage pill, or a number. */
  value: ReactNode;
  /** Numbers: 18px light, right-aligned (caption on phone). */
  numeric?: boolean;
  /** A number in gold-ink (a win count, the leader). */
  gold?: boolean;
  /** Left out of the phone's results line (an empty "–" that would take a line of its own). */
  phoneHidden?: boolean;
};

export function FilmRow({
  title,
  href,
  lang,
  handle,
  lead,
  flag,
  flagLabel,
  meta,
  scores,
  note,
  badge,
  results,
  marks,
  winner = false,
  headingLevel = 3,
}: {
  title: string;
  href: string;
  /** The title's language where it isn't English ("pt"). */
  lang?: string;
  /** A drag handle before everything else (the Watch list's My order); not used with `lead`. */
  handle?: ReactNode;
  /** The first column (International: the submitting country's flag and name). */
  lead?: ReactNode;
  /** The film's one flag: its primary country (`FilmRowData.flag`). */
  flag?: string | null;
  /** Accessible name of the flag ("Brazil, submitting country"). */
  flagLabel?: string;
  /** Caption under the title (year · categories). */
  meta?: ReactNode;
  scores?: Scores;
  /** A line under the scores (the Watch list's release line). */
  note?: ReactNode;
  /** A stage pill after the title. */
  badge?: ReactNode;
  results: FilmResult[];
  /** The marks pair: `FilmMarks` for a real film. */
  marks?: ReactNode;
  /** The winner's row: a gold wash fading from the left. */
  winner?: boolean;
  headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      className={cn(
        rowGrid,
        handle ? phoneGridWithHandle : lead ? phoneGridWithLead : phoneGrid,
        "grid border-b border-line py-4 md:py-[18px]",
        winner && "-mx-4 bg-[linear-gradient(90deg,var(--gold-wash),transparent_70%)] px-4",
      )}
      data-winner={winner || undefined}
    >
      {handle ? <div className="flex justify-center max-md:[grid-area:grip]">{handle}</div> : null}
      {lead ? <div className="min-w-0 text-small max-md:[grid-area:lead]">{lead}</div> : null}
      <div className="flex min-w-0 gap-3 max-md:[grid-area:film] md:gap-3.5">
        <Flags code={flag} label={flagLabel} className="mt-1" />
        <div className="min-w-0">
          <Heading className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[16px] leading-snug font-medium tracking-title [overflow-wrap:anywhere] md:text-[17px]">
            <Link
              href={href}
              lang={lang}
              className="rounded-xs outline-none decoration-line-strong decoration-1 underline-offset-4 hover:underline focus-visible:shadow-focus"
            >
              {title}
            </Link>
            {badge}
          </Heading>
          {meta ? <p className="mt-1 text-caption text-ink-muted">{meta}</p> : null}
          {scores ? <ScoreLine scores={scores} className="mt-1" /> : null}
          {note}
        </div>
      </div>
      {/* On phone the results line sits under the title, indented past the flags when there are some. */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-caption max-md:[grid-area:res] md:contents",
          flag && "pl-[33px]",
          results.every((r) => r.phoneHidden) && "max-md:hidden",
        )}
      >
        {results.map((result) => (
          <span
            key={result.label}
            className={cn(
              result.numeric &&
                "md:text-right md:text-[18px] md:font-light md:tracking-[-0.02em]",
              !result.numeric && "md:text-small",
              result.gold && "text-gold-ink",
              result.phoneHidden && "max-md:hidden",
            )}
          >
            <span className="text-ink-muted md:sr-only">{result.label} </span>
            {result.value}
          </span>
        ))}
      </div>
      <div className="flex justify-end self-start max-md:[grid-area:marks] md:self-auto">{marks}</div>
    </div>
  );
}
