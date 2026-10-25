import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { Notice } from "@/components/notice/Notice";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Segmented } from "@/components/segmented/Segmented";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { StatsStrip } from "@/components/stats-strip/StatsStrip";
import { TextLink } from "@/components/text-link/TextLink";
import { YearSwitcher } from "@/components/year-switcher/YearSwitcher";
import { getPatterns } from "@/data/patterns";
import { parsePatternCategory, PATTERN_TABS, PATTERN_YEARS, patternsHref } from "@/lib/patterns/page";
import type { PatternCategory } from "@/lib/patterns";
import { seasonDate } from "@/lib/race";
import { signalsHref } from "@/lib/signals";
import { LIVE_YEAR } from "@/lib/years";
import { BacktestStrip, BestPredictors, FiveFinished, FiveLive, Footnote, HowToPick, Learned, MostAwardedMisses, recordStats, WhyTheyMissed } from "./Sections";

type Query = Record<string, string | string[] | undefined>;

/**
 * Guide §8.14 Nomination patterns (`/patterns/[year]?category=`): PageHeader with the year
 * switcher, the category control in the address, and for one shortlist category and year the five
 * the patterns pick, how they did and why the well-awarded films missed.
 */
export function PatternsPage({ year, query }: { year: number; query: Promise<Query> }) {
  return (
    <Suspense fallback={<RaceRowsSkeleton label="Loading nomination patterns" />}>
      <Page year={year} query={query} />
    </Suspense>
  );
}

async function Page({ year, query }: { year: number; query: Promise<Query> }) {
  const category = parsePatternCategory((await query).category);
  const tab = PATTERN_TABS.find((t) => t.slug === category)!;
  return (
    <>
      <PageHeader
        title={`${year} nomination patterns`}
        sub={
          <p>
            {tab.oscar} · the films the patterns pick, and why the well-awarded ones miss ·{" "}
            <TextLink href={signalsHref(year, category)}>Strong signals</TextLink>
          </p>
        }
        actions={<YearSwitcher year={year} years={PATTERN_YEARS} liveYear={LIVE_YEAR} href={patternsHref("{year}", category)} />}
      />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 md:mt-7">
        <Segmented
          label="Category"
          items={PATTERN_TABS.map((t) => ({ label: t.name, href: patternsHref(year, t.slug), current: t.slug === category }))}
        />
      </div>
      <Suspense fallback={<RaceRowsSkeleton label="Loading nomination patterns" />}>
        <Patterns year={year} category={category} name={tab.name} />
      </Suspense>
    </>
  );
}

async function Patterns({ year, category, name }: { year: number; category: PatternCategory; name: string }) {
  // Wait for the request, so `next build` never reads the database.
  await connection();
  const today = new Date().toISOString().slice(0, 10);
  const data = await getPatterns(category, today);
  const season = data.seasons.find((s) => s.year === year);
  // The live year's Oscars edition may not be loaded yet (a new season): say so, as the race does, rather than a 404 under a 200.
  if (!season && year >= LIVE_YEAR) {
    return (
      <EmptyState title="Not loaded yet" className="mt-10 md:mt-12">
        The {year} Oscars season isn&apos;t in the app yet, so there are no contenders to rank. It appears here once its first results are loaded.
      </EmptyState>
    );
  }
  if (!season) notFound();
  const dates = data.info[year]?.dates;
  const first = season.history[0];
  const last = season.history.at(-1);
  return (
    <>
      {season.state === "nominations" ? (
        <Notice tone="neutral" title="Worked out from earlier seasons only." className="mt-6 md:mt-7">
          For {year} the patterns saw {first}–{last}, as they would have live. These are tendencies from a small history, not rules.
        </Notice>
      ) : season.state === "shortlist" ? (
        <Notice tone="gold" title="The shortlist is out." className="mt-6 md:mt-7">
          {dates?.nominationsOn ? `Nominations are announced on ${seasonDate(dates.nominationsOn, today)}. ` : ""}The % to be nominated adds up to{" "}
          {season.slots}, the number of slots, and is worked out from the seasons before {year} only.
        </Notice>
      ) : (
        <Notice tone="gold" title="The shortlist isn't out yet." className="mt-6 md:mt-7">
          {name}&apos;s 15 shortlisted films are announced{dates?.shortlistOn ? ` on ${seasonDate(dates.shortlistOn, today)}` : " later in the season"}. Until then
          these are the contenders, ranked the same way, with no percentages and no Snub risk flags.
        </Notice>
      )}
      <StatsStrip stats={recordStats(data, category)} className="mt-10" />
      {season.state === "nominations" ? (
        <>
          <FiveFinished data={data} season={season} />
          <Learned season={season} />
          <WhyTheyMissed data={data} season={season} />
        </>
      ) : (
        <>
          <FiveLive
            data={data}
            season={season}
            note={
              season.state === "shortlist"
                ? `Shortlist of ${season.films.length}${dates?.nominationsOn ? ` · nominations ${seasonDate(dates.nominationsOn, today)}` : ""}`
                : `${season.films.length} films with an award result · ranked by pattern`
            }
          />
          <Learned season={season} />
        </>
      )}
      <MostAwardedMisses data={data} />
      <BestPredictors data={data} />
      <HowToPick category={category} name={name} />
      <BacktestStrip data={data} year={year} category={category} />
      <Footnote data={data} year={year} category={category} />
    </>
  );
}
