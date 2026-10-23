// The year summary (guide §8.8, product plan §3.8): the season in numbers for a film year. Pure, so
// the counts, the watched figures, the most-nominated film and the links are unit tested; the data
// layer reads the grids (`src/data/year-summary.ts`) and the page draws them. Every count is taken
// from the rows its list shows (`src/lib/year-grid.ts`), so a count and its list always agree.
import type { RaceCategory } from "@/lib/race";
import { gridCategoryName, gridHref, gridTotals, type GridCategory, type GridFilm, type GridQuery, type YearGrid } from "@/lib/year-grid";

export type SummaryRow = {
  slug: RaceCategory;
  /** "Best Picture". */
  name: string;
  /** The category's grid rows. */
  films: number;
  /** Of those, marked watched. */
  watched: number;
};

/** The most nominations any film has: the count and the films that reach it, best first. */
export type MostNominated = {
  count: number;
  /** Ordered as the grid's Nominations sort: more wins first, then by title. */
  films: { title: string; wins: number; awards: string[] }[];
};

export type YearSummary = {
  /** Films on the grids: each film once, however many categories it's in. */
  films: number;
  /** Of those, marked watched. */
  watched: number;
  /** One row per category, in the race's order. */
  rows: SummaryRow[];
  /** Null while no film has a nomination (only shortlists, or nothing yet). */
  mostNominated: MostNominated | null;
};

/**
 * The summary from the year's grids: `all` is every category together (its rows are the films, and
 * its columns name the awards), `categories` each category's grid, and `watched` the films marked
 * watched.
 */
export function yearSummary(
  all: YearGrid,
  categories: { slug: RaceCategory; grid: YearGrid }[],
  watched: ReadonlySet<number>,
): YearSummary {
  const isWatched = (film: GridFilm) => watched.has(film.film.id);
  return {
    films: all.films.length,
    watched: all.films.filter(isWatched).length,
    rows: categories.map(({ slug, grid }) => ({
      slug,
      name: gridCategoryName(slug),
      films: grid.films.length,
      watched: grid.films.filter(isWatched).length,
    })),
    mostNominated: mostNominated(all),
  };
}

/**
 * The films with the most awards nominating them (the grid's Noms in the all-categories view,
 * where each award's column counts once). A win counts as a nomination.
 */
export function mostNominated({ columns, films }: YearGrid): MostNominated | null {
  const totals = films.map((film) => ({ film, ...gridTotals(film) }));
  const count = Math.max(0, ...totals.map((t) => t.noms));
  if (count === 0) return null;
  const top = totals
    .filter((t) => t.noms === count)
    .sort((a, b) => b.wins - a.wins || a.film.film.title.localeCompare(b.film.film.title, "en") || a.film.film.id - b.film.film.id);
  return {
    count,
    films: top.map(({ film, wins }) => ({
      title: film.film.title,
      wins,
      awards: columns.filter((c) => film.cells[c.slug]?.outcome === "won").map((c) => c.shortName),
    })),
  };
}

/** "Oscars", "Oscars and BAFTA", "Oscars, BAFTA and Globes". */
export function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The figure's label, naming whose it is: "Nominations for Hamnet, the most" (guide §11). */
export function mostNominatedLabel({ films }: MostNominated): string {
  return `Nominations for ${films[0].title}, the most`;
}

/** The line under it: the film's wins and where they came from, and how many films tie with it. */
export function mostNominatedNote({ films }: MostNominated): string {
  const [top, ...tied] = films;
  const wins =
    top.wins === 0 ? "No wins yet" : `${top.wins} ${top.wins === 1 ? "win" : "wins"} at ${listOf(top.awards)}`;
  const more = tied.length > 0 ? ` · ${tied.length} more tied` : "";
  return `${wins}${more}`;
}

/** Where a count opens: the grid's view for the category, filter and sort it counts (the defaults otherwise). */
export function listHref(year: number, view: Partial<GridQuery> & { category: GridCategory }): string {
  return gridHref(year, { sort: "wins", filters: [], criticsOpen: false, ...view });
}
