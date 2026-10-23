import { connection } from "next/server";
import { Suspense } from "react";
import { FilterChips } from "@/components/chip/FilterChips";
import { EmptyState } from "@/components/empty-state/EmptyState";
import { PageHeader } from "@/components/page-header/PageHeader";
import { Segmented } from "@/components/segmented/Segmented";
import { RaceRowsSkeleton } from "@/components/skeleton/Skeleton";
import { TextLink } from "@/components/text-link/TextLink";
import { YearSwitcher } from "@/components/year-switcher/YearSwitcher";
import { getMarks } from "@/data/watch-list";
import { getYearGrid } from "@/data/year-grid";
import { RACE_CATEGORIES } from "@/lib/race";
import {
  filmCountLabel,
  GRID_SORT_LABELS,
  GRID_SORTS,
  gridHref,
  gridQuery,
  hasNoData,
  parseGridQuery,
  toggleGridFilter,
  viewGrid,
  type GridQuery,
} from "@/lib/year-grid";
import { LIVE_YEAR, OLDEST_YEAR, yearRange } from "@/lib/years";
import { SortMenu } from "./SortMenu";
import { YearGrid, YearGridLegend } from "./YearGrid";

type Query = Record<string, string | string[] | undefined>;

const YEARS = yearRange(LIVE_YEAR, OLDEST_YEAR);

const oscarName = (view: GridQuery) => RACE_CATEGORIES.find((c) => c.slug === view.category)!.oscar;

/**
 * Guide §8.4 the year grid (`/grid/[year]?category=&sort=&filter=&critics=`): PageHeader with the
 * count, the "Year summary" link and the year switcher; a toolbar (category, sort, Unwatched, and
 * the critics groups' folding when the category has any); the grid; the legend. The whole view is
 * in the address; the grid is read for it, and the Unwatched filter reads the marks per visit.
 */
export function YearGridPage({ year, query }: { year: number; query: Promise<Query> }) {
  return (
    <>
      <PageHeader
        title={`${year} year grid`}
        sub={
          <Suspense fallback={<p>Every film with a nomination, award by award.</p>}>
            <Sub year={year} query={query} />
          </Suspense>
        }
        actions={
          <Suspense fallback={<YearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} href="/grid/{year}" />}>
            <SwitchYear year={year} query={query} />
          </Suspense>
        }
      />
      <Suspense fallback={<RaceRowsSkeleton label="Loading the grid" />}>
        <Grid year={year} query={query} />
      </Suspense>
    </>
  );
}

async function Sub({ year, query }: { year: number; query: Promise<Query> }) {
  // Wait for the request, so `next build` never reads the database.
  await connection();
  const view = parseGridQuery(await query);
  const { films } = await getYearGrid(year, view.category);
  return (
    <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <span>
        {oscarName(view)} · {filmCountLabel(films.length)}
      </span>
      <TextLink href={`/years/${year}`}>Year summary</TextLink>
    </p>
  );
}

/** The year switcher keeps the rest of the view when it changes the year. */
async function SwitchYear({ year, query }: { year: number; query: Promise<Query> }) {
  const view = parseGridQuery(await query);
  return <YearSwitcher year={year} years={YEARS} liveYear={LIVE_YEAR} href={`/grid/{year}${gridQuery(view)}`} />;
}

async function Grid({ year, query }: { year: number; query: Promise<Query> }) {
  // Wait for the request: the address and the marks are read per visit.
  await connection();
  const view = parseGridQuery(await query);
  const [grid, marks] = await Promise.all([getYearGrid(year, view.category), getMarks()]);
  const watched = new Set(marks.filter((m) => m.watched).map((m) => m.movieId));
  const shown = viewGrid(grid.films, view, watched);
  const critics = grid.columns.filter((c) => c.kind === "critics");
  const oscar = oscarName(view);

  const chips = [
    {
      label: "Unwatched",
      href: gridHref(year, { ...view, filters: toggleGridFilter(view.filters, "unwatched") }),
      pressed: view.filters.includes("unwatched"),
    },
  ];
  if (critics.length > 0) {
    chips.push({
      label: "Critics groups folded",
      href: gridHref(year, { ...view, criticsOpen: !view.criticsOpen }),
      pressed: !view.criticsOpen,
    });
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-3 md:mt-7">
        <Segmented
          label="Category"
          className="mr-auto"
          items={RACE_CATEGORIES.map((c) => ({
            label: c.name,
            href: gridHref(year, { ...view, category: c.slug }),
            current: c.slug === view.category,
          }))}
        />
        <SortMenu
          items={GRID_SORTS.map((sort) => ({
            label: GRID_SORT_LABELS[sort],
            href: gridHref(year, { ...view, sort }),
            current: sort === view.sort,
          }))}
        />
        <FilterChips label="Filter" items={chips} />
      </div>

      {grid.films.length === 0 ? (
        <EmptyState title="No nominations yet" className="mt-6">
          No film has a nomination for {oscar} in {year} yet. The grid fills in as the awards announce theirs.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState
          title="No unwatched films"
          className="mt-6"
          actions={
            <TextLink href={gridHref(year, { ...view, filters: [] })} className="text-small">
              Show all films
            </TextLink>
          }
        >
          You&apos;ve watched every film in the {year} grid for {oscar}.
        </EmptyState>
      ) : (
        <>
          <YearGrid
            columns={grid.columns}
            films={shown}
            category={view.category}
            criticsOpen={view.criticsOpen}
            caption={`${oscar}, ${year}: each film's results at every award`}
          />
          <YearGridLegend
            category={view.category}
            hasCritics={critics.length > 0 && !view.criticsOpen}
            hasNoDataColumn={grid.columns.some((c) => hasNoData(c) && (c.kind !== "critics" || view.criticsOpen))}
          />
        </>
      )}
    </>
  );
}
