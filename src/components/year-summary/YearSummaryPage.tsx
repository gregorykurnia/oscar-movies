import { connection } from "next/server";
import { Suspense } from "react";
import { DataTable, type DataColumn, type DataRow } from "@/components/data-table/DataTable";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { PageHeader } from "@/components/page-header/PageHeader";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { StatsStrip, type Stat } from "@/components/stats-strip/StatsStrip";
import { TextLink } from "@/components/text-link/TextLink";
import { YearSwitcher } from "@/components/year-switcher/YearSwitcher";
import { getMarks } from "@/data/watch-list";
import { getYearSummaryGrids } from "@/data/year-summary";
import { listHref, mostNominatedNote, yearSummary, type YearSummary } from "@/lib/year-summary";
import { LIVE_YEAR, OLDEST_YEAR, yearRange } from "@/lib/years";

const YEARS = yearRange(LIVE_YEAR, OLDEST_YEAR);

const COLUMNS: DataColumn[] = [
  { key: "category", label: "Category" },
  { key: "films", label: "Films" },
  { key: "watched", label: "Watched" },
];

/**
 * Guide §8.8 the year summary (`/years/[year]`): PageHeader with the back link to the year grid and
 * the year switcher; the stats strip (films on the grids, watched with a meter, the most
 * nominations); a table of each category's films and watched. Every count links to the grid view it
 * counts, so a figure and its list always agree. The marks are read per visit.
 */
export function YearSummaryPage({ year }: { year: number }) {
  return (
    <>
      <PageHeader
        title={`${year} year summary`}
        sub="The season in numbers. Each count opens its list."
        back={{ label: `${year} year grid`, href: `/grid/${year}` }}
        actions={<YearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} href="/years/{year}" />}
      />
      <Suspense fallback={<RaceRowsSkeleton label="Loading the summary" />}>
        <Summary year={year} />
      </Suspense>
    </>
  );
}

async function Summary({ year }: { year: number }) {
  // Wait for the request: the marks are read per visit, so the build never reads the database.
  await connection();
  const [grids, marks] = await Promise.all([getYearSummaryGrids(year), getMarks()]);
  const watched = new Set(marks.filter((m) => m.watched).map((m) => m.movieId));
  const summary = yearSummary(grids.all, grids.categories, watched);

  if (summary.films === 0) {
    return (
      <EmptyState title="No nominations yet" className="mt-10 md:mt-12">
        No film has a nomination in {year} yet. The figures fill in as the awards announce theirs.
      </EmptyState>
    );
  }

  return (
    <>
      <StatsStrip stats={statsOf(year, summary)} className="mt-10 md:mt-12" />
      <section aria-label="Films by category" className="mt-10 md:mt-14">
        <DataTable caption="Films and watched by category" columns={COLUMNS} rows={rowsOf(year, summary)} />
        <footer className="mt-4 text-caption text-ink-muted">
          Films counts each grid&apos;s rows, which include the Oscar shortlist. Watched counts the films marked watched.
        </footer>
      </section>
    </>
  );
}

/** The three stats: films on the grids, watched (of them, with a meter), and the most nominations. */
function statsOf(year: number, summary: YearSummary): Stat[] {
  const most = summary.mostNominated;
  return [
    {
      value: String(summary.films),
      label: "Films with a nomination",
      href: listHref(year, { category: "all" }),
    },
    {
      value: String(summary.watched),
      of: `of ${summary.films}`,
      label: "Watched",
      meter: (summary.watched / summary.films) * 100,
      href: listHref(year, { category: "all", filters: ["watched"] }),
    },
    {
      value: most ? String(most.count) : "–",
      label: "Most nominations",
      note: most ? mostNominatedNote(most) : "No nominations yet",
      href: listHref(year, { category: "all", sort: "noms" }),
    },
  ];
}

/** One row per category: its films and its watched films, each count a link to that list. */
function rowsOf(year: number, summary: YearSummary): DataRow[] {
  return summary.rows.map((row) => ({
    key: row.slug,
    cells: [
      row.name,
      <TextLink key="films" href={listHref(year, { category: row.slug })}>
        {row.films}
      </TextLink>,
      <TextLink key="watched" href={listHref(year, { category: row.slug, filters: ["watched"] })}>
        {row.watched}
      </TextLink>,
    ],
  }));
}
