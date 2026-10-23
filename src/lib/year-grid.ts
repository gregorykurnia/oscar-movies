// The year grid (plan §5.7, guide §8.4, product plan §3.7): for a film year and an Oscar category (or
// "all" four together, the year summary's lists), one row per film with a nomination anywhere in
// that category and one column per award that gives it (Oscars, majors, festivals, critics groups,
// each in calendar order). Pure, so the columns, the cells, the totals, the sort, the filter and the
// address are unit tested; the data layer (`src/data/year-grid.ts`) reads the rows and the page
// draws them.
import type { FilmRowData } from "@/data/films";
import type { AwardKind, AwardSummary } from "@/lib/awards";
import { DASH, formatScore } from "@/lib/format";
import { parseCategory, RACE_CATEGORIES, type RaceCategory } from "@/lib/race";
import { compareOutcome, flagsFor, isNomination, isShortlisted, type Outcome } from "@/lib/stage";

export type EditionStatus = "loaded" | "partial" | "no_data";

export type GridColumn = {
  slug: string;
  /** The column's head ("BAFTA"). */
  shortName: string;
  /** The award's full name, for the head's title. */
  name: string;
  kind: AwardKind;
  isSelection: boolean;
  /** The award's edition that film year; null when it has none. */
  status: EditionStatus | null;
};

/** A film's furthest result at one award, in the categories mapped to the grid's Oscar category. */
export type GridCell = { outcome: Outcome; category: string };

export type GridFilm = {
  film: FilmRowData;
  /** Production countries; for International the submitting country first. */
  flags: string[];
  /** By award slug; an award the film has no result at has no cell. */
  cells: Record<string, GridCell>;
};

export type YearGrid = { columns: GridColumn[]; films: GridFilm[] };

const KIND_ORDER: AwardKind[] = ["oscars", "major", "festival", "critics"];

/** A grid view's category: one of the Oscar categories, or every one together ("all", the year summary's lists). */
export type GridCategory = RaceCategory | "all";

/** The category in words: "Best Picture", or "All categories". */
export function gridCategoryName(category: GridCategory): string {
  return category === "all" ? "All categories" : RACE_CATEGORIES.find((c) => c.slug === category)!.oscar;
}

/**
 * The awards that give the category (every award for "all"), Oscars first, then majors, festivals and
 * critics groups, each in calendar order, with their edition's status that year.
 */
export function gridColumns(
  awards: AwardSummary[],
  category: GridCategory,
  editions: { slug: string; status: EditionStatus }[],
): GridColumn[] {
  const status = new Map(editions.map((e) => [e.slug, e.status]));
  return awards
    .filter((a) => category === "all" || a.oscarCategories.includes(category))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.calendarOrder - b.calendarOrder)
    .map((a) => ({
      slug: a.slug,
      shortName: a.shortName,
      name: a.name,
      kind: a.kind,
      isSelection: a.isSelection,
      status: status.get(a.slug) ?? null,
    }));
}

/** One result as the data layer reads it: a film, an award, the award's category and the stage. */
export type GridResultRow = {
  film: FilmRowData;
  awardSlug: string;
  /** The award's own name for the category ("Best Film"). */
  category: string;
  outcome: Outcome;
  /** Submitting country (International only). */
  country: string | null;
};

/**
 * A film is a row when it has a nomination (or a win, or a runner-up place, or a place on a list
 * such as AFI's) at any award, or is on the Oscar shortlist. Being submitted or eligible alone
 * doesn't make it one: International would list every submission.
 */
function isGridFilm(cells: Record<string, GridCell>): boolean {
  return Object.entries(cells).some(
    ([slug, cell]) => isNomination(cell.outcome) || (slug === "oscars" && isShortlisted(cell.outcome)),
  );
}

/**
 * The grid's films from the year's results in the category. Each award's cell is the film's
 * furthest result there (Golden Globes' Drama and Comedy share one column); on a tie the first
 * row read wins, so the caller orders rows by the award's category order.
 */
export function gridFilms(rows: GridResultRow[], category: GridCategory): GridFilm[] {
  const byFilm = new Map<number, { film: FilmRowData; cells: Record<string, GridCell>; submittedBy: string | null }>();
  for (const row of rows) {
    let entry = byFilm.get(row.film.id);
    if (!entry) {
      entry = { film: row.film, cells: {}, submittedBy: null };
      byFilm.set(row.film.id, entry);
    }
    const current = entry.cells[row.awardSlug];
    if (!current || compareOutcome(row.outcome, current.outcome) > 0) {
      entry.cells[row.awardSlug] = { outcome: row.outcome, category: row.category };
    }
    if (row.awardSlug === "oscars" && row.country) entry.submittedBy = row.country;
  }
  return [...byFilm.values()]
    .filter((e) => isGridFilm(e.cells))
    .map((e) => ({
      film: e.film,
      flags: flagsFor(e.film.countries, category === "international" ? e.submittedBy : null),
      cells: e.cells,
    }));
}

/** Wins and nominations over every column (a win counts as a nomination too; runner-up counts). */
export function gridTotals(film: GridFilm): { wins: number; noms: number } {
  let wins = 0;
  let noms = 0;
  for (const cell of Object.values(film.cells)) {
    if (cell.outcome === "won") wins++;
    if (isNomination(cell.outcome)) noms++;
  }
  return { wins, noms };
}

/** Critics groups' wins, for the folded column's count chip. */
export function criticsWins(film: GridFilm, columns: GridColumn[]): number {
  return columns.filter((c) => c.kind === "critics" && film.cells[c.slug]?.outcome === "won").length;
}

/** How a cell looks (guide §7 Year grid): won, nominated or on the list, Oscar shortlist, submitted. */
export type CellKind = "won" | "nom" | "short" | "sub";

export function cellKind(outcome: Outcome): CellKind {
  if (outcome === "won") return "won";
  if (isNomination(outcome)) return "nom";
  return outcome === "shortlisted" ? "short" : "sub";
}

/**
 * A cell's text label (its title and accessible name; the column head names the award):
 * "Won: Best Film", "Runner-up: People's Choice Award", "Selected: Top 10 Films of the Year".
 * International's `eligible` is a submission that wasn't nominated, so it reads "Submitted".
 */
export function cellLabel(cell: GridCell, column: Pick<GridColumn, "isSelection">, category: GridCategory): string {
  const word: Record<Outcome, string> = {
    won: "Won",
    nominated: column.isSelection ? "Selected" : "Nominated",
    runner_up: "Runner-up",
    shortlisted: "Shortlisted",
    eligible: category === "international" ? "Submitted" : "Eligible",
    submitted: "Submitted",
  };
  return `${word[cell.outcome]}: ${cell.category}`;
}

/** The folded critics column's label: "3 critics group wins", "1 critics group win". */
export function criticsLabel(wins: number): string {
  return `${wins} critics group ${wins === 1 ? "win" : "wins"}`;
}

/** The film column's second line: "82 average", or "No scores yet". */
export function averageLine(film: FilmRowData): string {
  const value = formatScore(film.scores.average, 0);
  return value === DASH ? "No scores yet" : `${value} average`;
}

/** The sub line's count: "31 films with a nomination". */
export function filmCountLabel(n: number): string {
  return `${n.toLocaleString("en")} ${n === 1 ? "film" : "films"} with a nomination`;
}

// The address: `?category=&sort=&filter=&critics=` (plan §4).

export const GRID_SORTS = ["wins", "noms", "average", "title"] as const;
export type GridSort = (typeof GRID_SORTS)[number];
export const GRID_SORT_LABELS: Record<GridSort, string> = {
  wins: "Wins",
  noms: "Nominations",
  average: "Average score",
  title: "Title",
};
export const GRID_FILTERS = ["watched", "unwatched"] as const;
export type GridFilter = (typeof GRID_FILTERS)[number];

export type GridQuery = {
  category: GridCategory;
  sort: GridSort;
  filters: GridFilter[];
  /** Critics groups as one count column (the default) or one column each. */
  criticsOpen: boolean;
};

const DEFAULT_SORT: GridSort = "wins";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => [value].flat()[0];

/** The address's view. Anything unknown is ignored: Picture, by wins, no filter, critics folded. */
export function parseGridQuery(params: SearchParams): GridQuery {
  const filters = [params.filter ?? []].flat();
  return {
    category: first(params.category) === "all" ? "all" : parseCategory(params.category),
    sort: GRID_SORTS.find((s) => s === first(params.sort)) ?? DEFAULT_SORT,
    filters: GRID_FILTERS.filter((f) => filters.includes(f)),
    criticsOpen: first(params.critics) === "open",
  };
}

/** The query for a view, defaults left out: "?category=documentary&sort=title&filter=unwatched&critics=open", or "". */
export function gridQuery({ category, sort, filters, criticsOpen }: GridQuery): string {
  const params = new URLSearchParams();
  if (category !== "picture") params.set("category", category);
  if (sort !== DEFAULT_SORT) params.set("sort", sort);
  for (const filter of GRID_FILTERS) if (filters.includes(filter)) params.append("filter", filter);
  if (criticsOpen) params.set("critics", "open");
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function gridHref(year: number, view: GridQuery): string {
  return `/grid/${year}${gridQuery(view)}`;
}

const byTitle = (a: GridFilm, b: GridFilm) => a.film.title.localeCompare(b.film.title, "en") || a.film.id - b.film.id;

/** Highest first; a film with no average goes last. */
function byAverage(a: GridFilm, b: GridFilm): number {
  const x = a.film.scores.average;
  const y = b.film.scores.average;
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return y - x;
}

/**
 * The rows the page shows: the filters (Watched keeps films marked watched, Unwatched the rest; a
 * want-to-watch film is unwatched), then the sort. Wins: most wins, then nominations; Nominations:
 * the other way round; Average: highest first, no scores last; every sort ends on the title.
 */
export function viewGrid(films: GridFilm[], { sort, filters }: GridQuery, watched: ReadonlySet<number>): GridFilm[] {
  const totals = new Map(films.map((f) => [f.film.id, gridTotals(f)]));
  const t = (f: GridFilm) => totals.get(f.film.id)!;
  const compare: Record<GridSort, (a: GridFilm, b: GridFilm) => number> = {
    wins: (a, b) => t(b).wins - t(a).wins || t(b).noms - t(a).noms || byTitle(a, b),
    noms: (a, b) => t(b).noms - t(a).noms || t(b).wins - t(a).wins || byTitle(a, b),
    average: (a, b) => byAverage(a, b) || t(b).wins - t(a).wins || byTitle(a, b),
    title: byTitle,
  };
  const kept = (f: GridFilm) => filters.every((filter) => (filter === "watched") === watched.has(f.film.id));
  return films.filter(kept).sort(compare[sort]);
}

// Watched and Unwatched exclude each other: turning one on turns the other off.
const OPPOSITE_FILTER: Record<GridFilter, GridFilter> = { watched: "unwatched", unwatched: "watched" };

/** The filters with one chip flipped: on, it replaces its opposite; off, it's removed. */
export function toggleGridFilter(filters: GridFilter[], filter: GridFilter): GridFilter[] {
  if (filters.includes(filter)) return filters.filter((f) => f !== filter);
  return GRID_FILTERS.filter((f) => f === filter || (filters.includes(f) && f !== OPPOSITE_FILTER[filter]));
}

/** The head's groups (guide §8.4): Totals, Oscars, Major awards, Festivals, Critics groups. */
export type GridGroup = { label: string; columns: GridColumn[] };

const GROUP_LABELS: Record<AwardKind, string> = {
  oscars: "Oscars",
  major: "Major awards",
  festival: "Festivals",
  critics: "Critics groups",
};

/** The award columns' groups, in order, leaving out kinds with no column. */
export function gridGroups(columns: GridColumn[]): GridGroup[] {
  return KIND_ORDER.map((kind) => ({ label: GROUP_LABELS[kind], columns: columns.filter((c) => c.kind === kind) })).filter(
    (g) => g.columns.length > 0,
  );
}

/** A column with nothing loaded that year: its cells read "No data". */
export function hasNoData(column: GridColumn): boolean {
  return column.status === null || column.status === "no_data";
}
