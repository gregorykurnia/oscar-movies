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
import { MARK_FILTER_LABELS, markSets } from "@/lib/mark-filter";
import { getYearGrid } from "@/data/year-grid";
import { RACE_CATEGORIES } from "@/lib/race";
import {
  filmCountLabel,
  GRID_FILTERS,
  GRID_SORT_LABELS,
  GRID_SORTS,
  gridCategoryName,
  gridHref,
  gridQuery,
  hasNoData,
  parseGridQuery,
  toggleGridFilter,
  viewGrid,
  type GridFilter,
  type GridQuery,
} from "@/lib/year-grid";
import { LIVE_YEAR, OLDEST_YEAR, yearRange } from "@/lib/years";
import { SortMenu } from "./SortMenu";
import { YearGrid, YearGridLegend } from "./YearGrid";

type Query = Record<string, string | string[] | undefined>;

const YEARS = yearRange(LIVE_YEAR, OLDEST_YEAR);

const EMPTY_TITLE: Record<GridFilter, string> = {
  watched: "No watched films",
  unwatched: "No unwatched films",
  want: "No films to watch",
};

/** Why a mark filter left nothing, for `where` ("the 2025 grid for Best Picture"). */
function emptyNote(filter: GridFilter, where: string): string {
  if (filter === "watched") return `You haven't marked a film in ${where} as watched yet.`;
  if (filter === "want") return `You haven't marked a film in ${where} as want to watch.`;
  return `You've watched every film in ${where}.`;
}

/** The words after a view's count: " for Best Picture", none for all categories. */
const scopeOf = (view: GridQuery) => (view.category === "all" ? "" : ` for ${gridCategoryName(view.category)}`);

/**
 * Guide §8.4 the year grid (`/grid/[year]?category=&sort=&filter=&critics=`): PageHeader with the
 * count, the "Year summary" link and the year switcher; a toolbar (category, sort, Watched,
 * Unwatched and Want to watch, and the critics groups' folding when the category has any); the grid; the legend. The
 * whole view is in the address; the grid is read for it, and the watched filters read the marks per
 * visit. "all" is every category together (the year summary's totals link there).
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
        {gridCategoryName(view.category)} · {filmCountLabel(films.length)}
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
  const shown = viewGrid(grid.films, view, markSets(marks));
  const critics = grid.columns.filter((c) => c.kind === "critics");
  const scope = scopeOf(view);
  const filterChip = (filter: GridFilter, label: string) => ({
    label,
    href: gridHref(year, { ...view, filters: toggleGridFilter(view.filters, filter) }),
    pressed: view.filters.includes(filter),
  });

  const chips = GRID_FILTERS.map((filter) => filterChip(filter, MARK_FILTER_LABELS[filter]));
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
          items={[
            { label: "All", href: gridHref(year, { ...view, category: "all" }), current: view.category === "all" },
            ...RACE_CATEGORIES.map((c) => ({
              label: c.name,
              href: gridHref(year, { ...view, category: c.slug }),
              current: c.slug === view.category,
            })),
          ]}
        />
        <SortMenu
          items={GRID_SORTS.map((sort) => ({
            label: GRID_SORT_LABELS[sort],
            href: gridHref(year, { ...view, sort }),
            current: sort === view.sort,
            caption: sort === "oscar" ? "Winner, nominees, shortlist, then the rest" : undefined,
          }))}
        />
        <FilterChips label="Filter" items={chips} />
      </div>

      {grid.films.length === 0 ? (
        <EmptyState title="No nominations yet" className="mt-6">
          No film has a nomination{scope} in {year} yet. The grid fills in as the awards announce theirs.
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState
          title={EMPTY_TITLE[view.filters[0]]}
          className="mt-6"
          actions={
            <TextLink href={gridHref(year, { ...view, filters: [] })} className="text-small">
              Show all films
            </TextLink>
          }
        >
          {emptyNote(view.filters[0], `the ${year} grid${scope}`)}
        </EmptyState>
      ) : (
        <>
          <YearGrid
            columns={grid.columns}
            films={shown}
            category={view.category}
            criticsOpen={view.criticsOpen}
            caption={`${gridCategoryName(view.category)}, ${year}: each film's results at every award`}
            oscarGroups={view.sort === "oscar"}
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
