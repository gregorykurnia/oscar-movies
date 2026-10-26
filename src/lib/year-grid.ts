// The year grid (plan §5.7, guide §8.4, product plan §3.7): for a film year and an Oscar category (or
// "all" four together, the year summary's lists), one row per film with a nomination anywhere in
// that category and one column per award that gives it (Oscars, majors, festivals, critics groups,
// each in calendar order; in Documentary an award with several categories gets one column for each).
// Pure, so the columns, the cells, the totals, the sort, the filter and the
// address are unit tested; the data layer (`src/data/year-grid.ts`) reads the rows and the page
// draws them.
import type { FilmRowData } from "@/data/films";
import type { AwardKind, AwardSummary } from "@/lib/awards";
import { DASH, formatScore } from "@/lib/format";
import { MARK_FILTERS, parseMarkFilter, passesMark, toggleFilterIn, type MarkSets } from "@/lib/mark-filter";
import { parseCategory, RACE_CATEGORIES, type RaceCategory } from "@/lib/race";
import { compareOutcome, isNomination, isShortlisted, type Outcome } from "@/lib/stage";

export type EditionStatus = "loaded" | "partial" | "no_data";

/** One of a split award's categories (product plan §3.7): its slug, its own name and its head. */
export type GridSubColumn = { slug: string; name: string; shortName: string };

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
  /** Set when the award is split: the column is this one category. */
  sub?: GridSubColumn;
};

/** The key of a column's cells in `GridFilm.cells`: the award's slug, or "cinema-eye/direction" for a split column. */
export function columnKey(column: Pick<GridColumn, "slug" | "sub">): string {
  return column.sub ? `${column.slug}/${column.sub.slug}` : column.slug;
}

/** A film's furthest result at one award, in the categories mapped to the grid's Oscar category. */
export type GridCell = { outcome: Outcome; category: string };

export type GridFilm = {
  film: FilmRowData;
  /** By column key (`columnKey`); an award the film has no result at has no cell. */
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

/** The grids whose awards get one column per category (product plan §3.7). */
const SPLIT_CATEGORIES: GridCategory[] = ["documentary"];

/** One of an award's categories mapped to the grid's Oscar category, as the data layer reads them (in the award's order). */
export type GridAwardCategory = { awardSlug: string; slug: string; name: string };

/** The awards split into one column per category: in a split grid, those with more than one category. */
export function splitAwards(category: GridCategory, categories: GridAwardCategory[]): Set<string> {
  if (!SPLIT_CATEGORIES.includes(category)) return new Set();
  const count = new Map<string, number>();
  for (const c of categories) count.set(c.awardSlug, (count.get(c.awardSlug) ?? 0) + 1);
  return new Set([...count].filter(([, n]) => n > 1).map(([slug]) => slug));
}

// A split column's head; any other category's head is its own name.
const SUB_SHORT_NAMES: Record<string, string> = {
  "cinema-eye/feature": "Feature",
  "cinema-eye/direction": "Direction",
  "cinema-eye/production": "Production",
  "cinema-eye/audience": "Audience",
  "cinema-eye/unforgettables": "Unforgettables",
  "sundance/us-documentary-jury": "U.S. Jury",
  "sundance/us-documentary-audience": "U.S. Audience",
  "sundance/world-documentary-jury": "World Jury",
  "sundance/world-documentary-audience": "World Audience",
  "doc-nyc/short-list": "Short List",
  "doc-nyc/winners-circle": "Winner's Circle",
  "critics-choice-documentary/feature": "Feature",
  "critics-choice-documentary/director": "Director",
  "critics-choice-documentary/political": "Political",
  "ida/feature": "Feature",
  "ida/director": "Director",
};

/**
 * The awards that give the category (every award for "all"), Oscars first, then majors, festivals and
 * critics groups, each in calendar order, with their edition's status that year. A critics group
 * with no data in any year (`withData` lacks it) has no column: it would read "No data" all down.
 * A split award (`splitAwards`) is one column per category, in the award's order.
 */
export function gridColumns(
  awards: AwardSummary[],
  category: GridCategory,
  editions: { slug: string; status: EditionStatus }[],
  withData?: Set<string>,
  categories: GridAwardCategory[] = [],
): GridColumn[] {
  const status = new Map(editions.map((e) => [e.slug, e.status]));
  const split = splitAwards(category, categories);
  return awards
    .filter((a) => category === "all" || a.oscarCategories.includes(category))
    .filter((a) => a.kind !== "critics" || !withData || withData.has(a.slug))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.calendarOrder - b.calendarOrder)
    .flatMap((a) => {
      const column: GridColumn = {
        slug: a.slug,
        shortName: a.shortName,
        name: a.name,
        kind: a.kind,
        isSelection: a.isSelection,
        status: status.get(a.slug) ?? null,
      };
      if (!split.has(a.slug)) return [column];
      return categories
        .filter((c) => c.awardSlug === a.slug)
        .map((c) => ({ ...column, sub: { slug: c.slug, name: c.name, shortName: SUB_SHORT_NAMES[`${a.slug}/${c.slug}`] ?? c.name } }));
    });
}

/** The columns in runs of one award: a split award's categories together, any other award alone. */
export function awardRuns(columns: GridColumn[]): GridColumn[][] {
  const runs: GridColumn[][] = [];
  for (const column of columns) {
    const last = runs.at(-1);
    if (column.sub && last?.[0].sub && last[0].slug === column.slug) last.push(column);
    else runs.push([column]);
  }
  return runs;
}

/** One result as the data layer reads it: a film, an award, the award's category and the stage. */
export type GridResultRow = {
  film: FilmRowData;
  awardSlug: string;
  /** The award's own name for the category ("Best Film"). */
  category: string;
  /** The category's slug, which a split award's cells are keyed by. */
  categorySlug?: string;
  outcome: Outcome;
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
 * row read wins, so the caller orders rows by the award's category order. A split award (`split`)
 * has a cell per category instead.
 */
export function gridFilms(rows: GridResultRow[], split: Set<string> = new Set()): GridFilm[] {
  const byFilm = new Map<number, { film: FilmRowData; cells: Record<string, GridCell> }>();
  for (const row of rows) {
    let entry = byFilm.get(row.film.id);
    if (!entry) {
      entry = { film: row.film, cells: {} };
      byFilm.set(row.film.id, entry);
    }
    const key = split.has(row.awardSlug) ? `${row.awardSlug}/${row.categorySlug}` : row.awardSlug;
    const current = entry.cells[key];
    if (!current || compareOutcome(row.outcome, current.outcome) > 0) {
      entry.cells[key] = { outcome: row.outcome, category: row.category };
    }
  }
  return [...byFilm.values()]
    .filter((e) => isGridFilm(e.cells))
    .map((e) => ({ film: e.film, cells: e.cells }));
}

/** Wins and nominations over every column (a win counts as a nomination too; runner-up counts); a split award's categories count one each. */
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
  return columns.filter((c) => c.kind === "critics" && film.cells[columnKey(c)]?.outcome === "won").length;
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

export const GRID_SORTS = ["oscar", "wins", "noms", "average", "title"] as const;
export type GridSort = (typeof GRID_SORTS)[number];
export const GRID_SORT_LABELS: Record<GridSort, string> = {
  oscar: "Oscars",
  wins: "Wins",
  noms: "Nominations",
  average: "Average score",
  title: "Title",
};
export const GRID_FILTERS = MARK_FILTERS;
export type GridFilter = (typeof GRID_FILTERS)[number];

export type GridQuery = {
  category: GridCategory;
  sort: GridSort;
  filters: GridFilter[];
  /** Critics groups as one count column (the default) or one column each. */
  criticsOpen: boolean;
};

const DEFAULT_SORT: GridSort = "oscar";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => [value].flat()[0];

/** The address's view. Anything unknown is ignored: Picture, in Oscar order, no filter, critics folded. */
export function parseGridQuery(params: SearchParams): GridQuery {
  const mark = parseMarkFilter(params);
  return {
    category: first(params.category) === "all" ? "all" : parseCategory(params.category),
    sort: GRID_SORTS.find((s) => s === first(params.sort)) ?? DEFAULT_SORT,
    filters: mark ? [mark] : [],
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
 * The Oscar order's group: the Oscar winner, then nominees (a runner-up place counts), then films on
 * the shortlist, then the rest (eligible, submitted, or no Oscar result). In "All categories" the
 * cell is the film's furthest Oscar outcome in any category.
 */
function oscarGroup(film: GridFilm): number {
  const outcome = film.cells.oscars?.outcome;
  if (!outcome) return 3;
  if (outcome === "won") return 0;
  if (isNomination(outcome)) return 1;
  return isShortlisted(outcome) ? 2 : 3;
}

/** The group row a film sits under in the Oscar order (guide §8.4): winner and nominees share one. */
export type OscarGroupLabel = "Oscar winner and nominees" | "Oscar shortlist" | "Other films";

export function oscarGroupLabel(film: GridFilm): OscarGroupLabel {
  const group = oscarGroup(film);
  return group <= 1 ? "Oscar winner and nominees" : group === 2 ? "Oscar shortlist" : "Other films";
}

/**
 * The rows the page shows: the filter (Watched keeps films marked watched, Unwatched the rest, so a
 * want-to-watch film stays; Want to watch keeps those), then the sort. Oscars: the winner, then
 * nominees, then shortlisted films, then the rest, each group by nominations, then wins; Wins: most wins, then nominations; Nominations:
 * the other way round; Average: highest first, no scores last; every sort ends on the title.
 */
export function viewGrid(films: GridFilm[], { sort, filters }: GridQuery, marks: MarkSets): GridFilm[] {
  const totals = new Map(films.map((f) => [f.film.id, gridTotals(f)]));
  const t = (f: GridFilm) => totals.get(f.film.id)!;
  const compare: Record<GridSort, (a: GridFilm, b: GridFilm) => number> = {
    oscar: (a, b) => oscarGroup(a) - oscarGroup(b) || t(b).noms - t(a).noms || t(b).wins - t(a).wins || byTitle(a, b),
    wins: (a, b) => t(b).wins - t(a).wins || t(b).noms - t(a).noms || byTitle(a, b),
    noms: (a, b) => t(b).noms - t(a).noms || t(b).wins - t(a).wins || byTitle(a, b),
    average: (a, b) => byAverage(a, b) || t(b).wins - t(a).wins || byTitle(a, b),
    title: byTitle,
  };
  const kept = (f: GridFilm) => filters.every((filter) => passesMark(filter, f.film.id, marks));
  return films.filter(kept).sort(compare[sort]);
}

/** The filters with one chip flipped: on, it replaces the other chips; off, it's removed. */
export function toggleGridFilter(filters: GridFilter[], filter: GridFilter): GridFilter[] {
  return toggleFilterIn(GRID_FILTERS, filters, filter);
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
