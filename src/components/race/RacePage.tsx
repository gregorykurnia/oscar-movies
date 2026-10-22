import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { countryName, Flag } from "@/components/flag/Flag";
import { FilmMarks } from "@/components/marks/MarksProvider";
import { PageHeader } from "@/components/page-header/PageHeader";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { StagePill } from "@/components/stage-pill/StagePill";
import { TextLink } from "@/components/text-link/TextLink";
import { YearSwitcher } from "@/components/year-switcher/YearSwitcher";
import { getLastUpdate } from "@/data/loads";
import { getOscarEdition, getOscarResults, type OscarEdition, type OscarEntry } from "@/data/oscars";
import { formatDate } from "@/lib/format";
import {
  RACE_CATEGORIES,
  raceEntries,
  seasonDate,
  seasonState,
  showsStagePills,
  stageLine,
  tabLead,
  type RaceCategory,
} from "@/lib/race";
import { outcomeStage } from "@/lib/stage";
import { editionLabel, LIVE_YEAR, OLDEST_YEAR, yearRange } from "@/lib/years";
import { CategoryTabs } from "./CategoryTabs";
import { ContenderList, ContenderRow } from "./ContenderRow";
import { RaceYearSwitcher } from "./RaceYearSwitcher";
import { StageLine } from "./StageLine";

const YEARS = yearRange(LIVE_YEAR, OLDEST_YEAR);

/**
 * Guide §8.1 The Oscar race, for `/` (the live season) and `/race/[year]`: PageHeader with the
 * year switcher, the race tabs, and per category the stage line and the contender rows. Results
 * only until the chances arrive (Phase 3): the Oscar stage, flags, scores and marks.
 */
export function RacePage({ year }: { year: number }) {
  return (
    <>
      <PageHeader
        title={`The ${year} race`}
        sub={
          <p>
            {editionLabel(year)}.
            {year === LIVE_YEAR ? (
              <Suspense fallback={null}>
                <Updated />
              </Suspense>
            ) : null}
          </p>
        }
        actions={
          <Suspense fallback={<YearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} href="/race/{year}" />}>
            <RaceYearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} />
          </Suspense>
        }
      />
      <Suspense fallback={<RaceRowsSkeleton />}>
        <Race year={year} />
      </Suspense>
    </>
  );
}

async function Updated() {
  // Wait for the request, so `next build` never reads the database.
  await connection();
  const at = await getLastUpdate();
  return at ? ` Updated ${formatDate(new Date(at), true)}.` : null;
}

async function Race({ year }: { year: number }) {
  // Wait for the request: `next build` never reads the database (production has no tables
  // before its first migration), and "today" is the visit's day.
  await connection();
  const today = new Date().toISOString().slice(0, 10);
  const [edition, ...results] = await Promise.all([
    getOscarEdition(year),
    ...RACE_CATEGORIES.map((c) => getOscarResults(year, c.slug, "submitted")),
  ]);
  if (!edition) {
    return (
      <EmptyState title="Not loaded yet" className="mt-10 md:mt-12">
        The {editionLabel(year)} aren&apos;t in the app yet.
      </EmptyState>
    );
  }

  const leads = {} as Record<RaceCategory, ReactNode>;
  const panels = {} as Record<RaceCategory, ReactNode>;
  RACE_CATEGORIES.forEach(({ slug }, i) => {
    const all = results[i];
    const state = seasonState(all.map((e) => e.outcome));
    const shown = raceEntries(all, state);
    const submissions = slug === "international" ? all.length : 0;
    const lead = tabLead({ state, submissions, entries: shown.map((e) => ({ outcome: e.outcome, title: e.film.title, flags: e.flags })) });
    leads[slug] =
      lead.kind === "winner" ? (
        <>
          {lead.flag ? <Flag code={lead.flag} size="sm" /> : null}
          <span data-lead-text className="truncate">
            {lead.title}
          </span>
        </>
      ) : (
        <span data-lead-text className="truncate">
          {lead.text}
        </span>
      );
    panels[slug] = (
      <CategoryPanel
        year={year}
        category={slug}
        edition={edition}
        today={today}
        state={state}
        shown={shown}
        submissions={submissions}
      />
    );
  });

  return <CategoryTabs leads={leads} panels={panels} />;
}

function CategoryPanel({
  year,
  category,
  edition,
  today,
  state,
  shown,
  submissions,
}: {
  year: number;
  category: RaceCategory;
  edition: OscarEdition;
  today: string;
  state: ReturnType<typeof seasonState>;
  shown: OscarEntry[];
  submissions: number;
}) {
  const line = stageLine({
    category,
    state,
    dates: edition,
    entries: shown.map((e) => ({ outcome: e.outcome, title: e.film.title })),
    today,
  });
  const pills = showsStagePills(state);
  return (
    <>
      <StageLine line={line} className="mt-[18px] md:mt-7" />
      {shown.length > 0 ? (
        <ContenderList className="mt-3">
          {shown.map((e) => (
            <ContenderRow
              key={e.film.id}
              title={e.film.title}
              href={`/movies/${e.film.slug}`}
              flags={e.flags}
              firstFlagLabel={e.country ? `${countryName(e.country)}, submitting country` : undefined}
              badge={pills ? <StagePill stage={outcomeStage(e.outcome)} /> : undefined}
              scores={e.film.scores}
              marks={<FilmMarks movieId={e.film.id} title={e.film.title} />}
            />
          ))}
        </ContenderList>
      ) : (
        <NothingYet year={year} category={category} edition={edition} today={today} submissions={submissions} />
      )}
    </>
  );
}

/** Guide §8.12 "Nothing yet": what's missing and when it comes. */
function NothingYet({
  year,
  category,
  edition,
  today,
  submissions,
}: {
  year: number;
  category: RaceCategory;
  edition: OscarEdition;
  today: string;
  submissions: number;
}) {
  if (submissions > 0) {
    const shortlist = edition.shortlistOn ? ` The shortlist comes out ${seasonDate(edition.shortlistOn, today)}.` : "";
    return (
      <EmptyState
        title="No contenders yet"
        className="mt-7"
        actions={<TextLink href={`/submissions/${year}`} className="text-small">See the {year} submissions</TextLink>}
      >
        {submissions === 1 ? "1 country has" : `${submissions} countries have`} submitted a film so far.{shortlist}
      </EmptyState>
    );
  }
  const beforeDecember = today < `${year}-12-01`;
  return (
    <EmptyState title="No contenders yet" className="mt-7">
      {beforeDecember
        ? `The first precursor results arrive in December${category === "animated" ? ", starting with the Annie Award nominations" : ""}.`
        : "Nothing is loaded for this category yet."}
    </EmptyState>
  );
}
