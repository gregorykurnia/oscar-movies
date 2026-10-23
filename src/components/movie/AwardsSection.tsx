import Link from "next/link";
import { Notice } from "@/components/notice/Notice";
import { StagePill, type Stage } from "@/components/stage-pill/StagePill";
import { cn } from "@/lib/cn";
import { oscarName } from "@/lib/award-page";
import {
  awardRowCaption,
  awardsSections,
  resultLabel,
  resultSummary,
  type AwardsSection as Section,
  type MovieAwardRow,
} from "@/lib/movie-awards";

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
 * summarised in the heading and capped. `today` decides whether a "not nominated" can be said yet.
 */
export function AwardsSection({ rows, today }: { rows: MovieAwardRow[]; today: string }) {
  const sections = awardsSections(rows, today);
  const shown = sections.flatMap((s) => s.rows);
  const showYear = new Set(shown.map((r) => r.year)).size > 1;
  const showOscar = new Set(shown.map((r) => r.oscarCategory)).size > 1;
  return (
    <section aria-labelledby="awards-h" className="mt-10 md:mt-14">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="awards-h" className="text-section-phone leading-tight font-medium tracking-heading md:text-section">
          Awards
        </h2>
        {sections.length > 0 ? (
          <span className="text-small text-ink-muted">
            Every followed award that gave these categories{showYear ? "" : ` in ${shown[0].year}`}
          </span>
        ) : null}
      </div>
      {sections.length > 0 ? (
        <div className="space-y-7">
          {(["major", "festival", "critics"] as const).map((kind) => {
            const section = sections.find((s) => s.kind === kind);
            if (section) return <AwardsGroup key={kind} section={section} showYear={showYear} showOscar={showOscar} />;
            // With no festival prize, the Festivals section says so (guide §8.6, the reference file).
            return kind === "festival" ? <NoFestivals key={kind} /> : null;
          })}
        </div>
      ) : (
        <p className="text-small text-ink-muted">No award results for this film yet.</p>
      )}
    </section>
  );
}

function NoFestivals() {
  return (
    <div role="group" aria-labelledby="awards-festival-h">
      <h3 id="awards-festival-h" className="mb-2 text-body-phone font-semibold md:text-body">
        Festivals
      </h3>
      <Notice tone="neutral">No followed festival prize.</Notice>
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
      <ul className="border-b border-line">{visible.map(row)}</ul>
      {capped ? (
        <details className="group/all border-b border-line">
          <summary
            className={cn(
              "flex cursor-pointer list-none py-[22px] text-small text-ink-muted outline-none focus-visible:shadow-focus [&::-webkit-details-marker]:hidden",
              "group-open/all:hidden",
            )}
          >
            <strong className="font-medium text-ink underline-offset-[3px] hover:underline">
              Show all {section.rows.length} critics groups
            </strong>
          </summary>
          <ul>{rest.map(row)}</ul>
        </details>
      ) : null}
    </div>
  );
}

function AwardRow({ row, showYear, showOscar }: { row: MovieAwardRow; showYear: boolean; showOscar: boolean }) {
  const muted = row.result === "not_nominated";
  const label = resultLabel(row);
  return (
    <li
      data-result={row.result}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-t border-line py-3.5 text-small first:border-t-ink",
        "md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_132px] md:gap-4",
      )}
    >
      <div className={cn("min-w-0 font-medium [overflow-wrap:anywhere]", muted && "font-normal text-ink-muted")}>
        <Link
          href={`/awards/${row.awardSlug}/${row.year}`}
          className="rounded-xs outline-none decoration-line-strong decoration-1 underline-offset-4 hover:underline focus-visible:shadow-focus"
        >
          {row.awardName}
        </Link>
      </div>
      <span className="col-span-2 row-start-2 text-caption text-ink-muted [overflow-wrap:anywhere] md:col-span-1 md:col-start-2 md:row-start-1 md:text-small">
        {awardRowCaption(row, { showYear, oscarName: showOscar ? oscarName(row.oscarCategory) : null })}
      </span>
      <div className="col-start-2 row-start-1 justify-self-end md:col-start-3">
        <StagePill stage={STAGES[row.result]}>{label}</StagePill>
      </div>
    </li>
  );
}
