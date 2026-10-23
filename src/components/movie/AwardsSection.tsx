import Link from "next/link";
import type { ReactNode } from "react";
import { Notice } from "@/components/notice/Notice";
import { StagePill, type Stage } from "@/components/stage-pill/StagePill";
import { cn } from "@/lib/cn";
import { oscarName } from "@/lib/award-page";
import { COVERAGE_NOTICE, hasLineups, lineupPath, screeningCaption, type MovieScreening } from "@/lib/lineup";
import {
  awardRowCaption,
  awardsSections,
  resultLabel,
  resultSummary,
  type AwardsSection as Section,
  type MovieAwardRow,
} from "@/lib/movie-awards";
import { CappedList } from "./CappedList";

/** Critics groups show this many rows, the rest behind "Show all" (guide §8.6). */
export const CRITICS_CAP = 6;

const STAGES: Record<MovieAwardRow["result"], Stage> = {
  won: "won",
  nominated: "nominated",
  runner_up: "runner-up",
  not_nominated: "not-nominated",
};

/**
 * Guide §8.6 Awards: sections for Major awards, Festivals and Critics groups, each row an award,
 * its category and Won / Nominated / Not nominated (the last in `--ink-muted`). Critics groups are
 * summarised in the heading and capped. The Festivals section also lists the film's screenings
 * (section and prizes, each linking to its lineup). `today` decides whether a "not nominated" can
 * be said yet; `year` is the film's, for the note that lineups are tracked from 2025.
 */
export function AwardsSection({
  rows,
  screenings = [],
  year,
  today,
}: {
  rows: MovieAwardRow[];
  screenings?: MovieScreening[];
  year?: number;
  today: string;
}) {
  const sections = awardsSections(rows, today);
  const shown = sections.flatMap((s) => s.rows);
  const showYear = new Set([...shown, ...screenings].map((r) => r.year)).size > 1;
  const showOscar = new Set(shown.map((r) => r.oscarCategory)).size > 1;
  // A film from before the lineups with no screening says so; one with a screening has nothing to add.
  const coverage = year !== undefined && !hasLineups(year) && screenings.length === 0;
  const festivals = sections.find((s) => s.kind === "festival")?.rows ?? [];
  return (
    <section aria-labelledby="awards-h" className="mt-10 md:mt-14">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="awards-h" className="text-section-phone leading-tight font-medium tracking-heading md:text-section">
          Awards
        </h2>
        {shown.length > 0 ? (
          <span className="text-small text-ink-muted">
            Every followed award that gave these categories{showYear ? "" : ` in ${shown[0].year}`}
          </span>
        ) : null}
      </div>
      {sections.length > 0 || screenings.length > 0 ? (
        <div className="space-y-7">
          {(["major", "festival", "critics"] as const).map((kind) => {
            if (kind === "festival") {
              return (
                <FestivalsGroup
                  key={kind}
                  rows={festivals}
                  screenings={screenings}
                  coverage={coverage}
                  showYear={showYear}
                  showOscar={showOscar}
                />
              );
            }
            const section = sections.find((s) => s.kind === kind);
            return section ? <AwardsGroup key={kind} section={section} showYear={showYear} showOscar={showOscar} /> : null;
          })}
        </div>
      ) : (
        <p className="text-small text-ink-muted">No award results for this film yet.</p>
      )}
    </section>
  );
}

/** The Festivals group: the prize rows, then the screenings. A film with neither says so. */
function FestivalsGroup({
  rows,
  screenings,
  coverage,
  showYear,
  showOscar,
}: {
  rows: MovieAwardRow[];
  screenings: MovieScreening[];
  coverage: boolean;
  showYear: boolean;
  showOscar: boolean;
}) {
  if (rows.length === 0 && screenings.length === 0) return <NoFestivals coverage={coverage} />;
  return (
    <div role="group" aria-labelledby="awards-festival-h">
      <h3 id="awards-festival-h" className="mb-1 text-body-phone font-semibold md:text-body">
        Festivals
      </h3>
      <ul className="border-b border-line">
        {rows.map((r) => (
          <AwardRow key={`${r.awardSlug}-${r.year}-${r.category}`} row={r} showYear={showYear} showOscar={showOscar} />
        ))}
        {screenings.map((s) => (
          <ResultRow
            key={`${s.awardSlug}-${s.year}-${s.section}`}
            result="selected"
            href={lineupPath(s.awardSlug, s.year)}
            name={s.awardName}
            caption={screeningCaption(s, showYear)}
            pill={<StagePill stage="nominated">Selected</StagePill>}
          />
        ))}
      </ul>
      {coverage ? <Notice tone="neutral" className="mt-3">{COVERAGE_NOTICE}</Notice> : null}
    </div>
  );
}

function NoFestivals({ coverage }: { coverage: boolean }) {
  return (
    <div role="group" aria-labelledby="awards-festival-h">
      <h3 id="awards-festival-h" className="mb-2 text-body-phone font-semibold md:text-body">
        Festivals
      </h3>
      <Notice tone="neutral">{coverage ? `No followed festival prize. ${COVERAGE_NOTICE}` : "No followed festival prize."}</Notice>
    </div>
  );
}

function AwardsGroup({ section, showYear, showOscar }: { section: Section; showYear: boolean; showOscar: boolean }) {
  const capped = section.kind === "critics" && section.rows.length > CRITICS_CAP;
  const visible = capped ? section.rows.slice(0, CRITICS_CAP) : section.rows;
  const rest = capped ? section.rows.slice(CRITICS_CAP) : [];
  const row = (r: MovieAwardRow) => (
    <AwardRow key={`${r.awardSlug}-${r.year}-${r.category}`} row={r} showYear={showYear} showOscar={showOscar} />
  );
  return (
    <div role="group" aria-labelledby={`awards-${section.kind}-h`}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id={`awards-${section.kind}-h`} className="text-body-phone font-semibold md:text-body">
          {section.title}
        </h3>
        {section.kind === "critics" ? <span className="text-small text-ink-muted">{resultSummary(section.rows)}</span> : null}
      </div>
      {capped ? (
        <CappedList
          head={visible.map(row)}
          rest={rest.map(row)}
          label={`Show all ${new Set(section.rows.map((r) => r.awardSlug)).size} critics groups`}
        />
      ) : (
        <ul className="border-b border-line">{visible.map(row)}</ul>
      )}
    </div>
  );
}

function AwardRow({ row, showYear, showOscar }: { row: MovieAwardRow; showYear: boolean; showOscar: boolean }) {
  return (
    <ResultRow
      result={row.result}
      href={`/awards/${row.awardSlug}/${row.year}`}
      name={row.awardName}
      caption={awardRowCaption(row, { showYear, oscarName: showOscar ? oscarName(row.oscarCategory) : null })}
      pill={<StagePill stage={STAGES[row.result]}>{resultLabel(row)}</StagePill>}
      muted={row.result === "not_nominated"}
    />
  );
}

/** One row of the Awards sections: the award's name (a link), its caption and a pill at the end. */
function ResultRow({
  result,
  href,
  name,
  caption,
  pill,
  muted = false,
}: {
  result: string;
  href: string;
  name: string;
  caption: string;
  pill: ReactNode;
  /** "Not nominated" rows read in `--ink-muted`. */
  muted?: boolean;
}) {
  return (
    <li
      data-result={result}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-t border-line py-3.5 text-small first:border-t-ink",
        "md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_132px] md:gap-4",
      )}
    >
      <div className={cn("min-w-0 font-medium [overflow-wrap:anywhere]", muted && "font-normal text-ink-muted")}>
        <Link
          href={href}
          className="rounded-xs outline-none decoration-line-strong decoration-1 underline-offset-4 hover:underline focus-visible:shadow-focus"
        >
          {name}
        </Link>
      </div>
      <span className="col-span-2 row-start-2 text-caption text-ink-muted [overflow-wrap:anywhere] md:col-span-1 md:col-start-2 md:row-start-1 md:text-small">
        {caption}
      </span>
      <div className="col-start-2 row-start-1 justify-self-end md:col-start-3">{pill}</div>
    </li>
  );
}
