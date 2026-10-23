// Festival lineups (plan task 5.3, guide §8.3 and §8.6): the lineup page's sort and mark chip in
// the address, the films of each section in order, the coverage wording, and a film's screenings
// on its page. Pure, so the rules are unit tested; the queries are in `src/data/lineup.ts` and
// `src/data/movie.ts`.
import type { LineupFilm, LineupSection } from "@/data/lineup";
import { keepMarked, parseMarkFilter, type MarkFilter, type MarkSets } from "@/lib/mark-filter";

/** The first film year with festival lineups. Earlier years show prizes only. */
export const FIRST_LINEUP_YEAR = 2025;

export const hasLineups = (year: number): boolean => year >= FIRST_LINEUP_YEAR;

/** A festival's lineup page for a film year (it exists for every year; `hasLineups` says whether it has films). */
export const lineupPath = (slug: string, year: number): string => `/festivals/${slug}/${year}`;

/** The coverage line: on a film from before the lineups, with no screening, and on the festivals' earlier years. */
export const COVERAGE_NOTICE = `Festival lineups are tracked from ${FIRST_LINEUP_YEAR} on.`;

/** The title of a lineup page for an earlier year. */
export const LINEUPS_START = `Lineups start in ${FIRST_LINEUP_YEAR}`;

export const LINEUP_SORTS = ["title", "average"] as const;
export type LineupSort = (typeof LINEUP_SORTS)[number];
export const LINEUP_SORT_LABELS: Record<LineupSort, string> = {
  title: "Title",
  average: "Average score",
};
const DEFAULT_SORT: LineupSort = "title";

export type LineupQuery = { sort: LineupSort; filter: MarkFilter | null };

type SearchParams = Record<string, string | string[] | undefined>;

/** The address's sort and mark chip. Anything unknown is ignored: the default sort, no chip. */
export function parseLineupQuery(params: SearchParams): LineupQuery {
  const sort = LINEUP_SORTS.find((s) => s === [params.sort].flat()[0]) ?? DEFAULT_SORT;
  return { sort, filter: parseMarkFilter(params) };
}

/** The address's query for a sort and chip: "?sort=average&filter=want", or "" for the defaults. */
export function lineupQuery({ sort, filter }: LineupQuery): string {
  const params = new URLSearchParams();
  if (sort !== DEFAULT_SORT) params.set("sort", sort);
  if (filter) params.set("filter", filter);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function lineupHref(slug: string, year: number, state: LineupQuery): string {
  return `${lineupPath(slug, year)}${lineupQuery(state)}`;
}

/** What the empty state says a film is under a mark chip. */
const FILTER_PHRASES: Record<MarkFilter, string> = {
  watched: "marked watched",
  unwatched: "unwatched",
  want: "marked want to watch",
};
export const filterPhrase = (filter: MarkFilter): string => FILTER_PHRASES[filter];

const byTitle = (a: LineupFilm, b: LineupFilm) => a.title.localeCompare(b.title, "en");

const COMPARE: Record<LineupSort, (a: LineupFilm, b: LineupFilm) => number> = {
  title: byTitle,
  // Highest average first; films with no scores last.
  average: (a, b) => {
    const x = a.scores.average;
    const y = b.scores.average;
    if (x === y) return byTitle(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x || byTitle(a, b);
  },
};

/**
 * The sections the page shows: the films under the mark chip, sorted within each section, and the
 * sections left with none out. Makes new arrays; the input is untouched.
 */
export function viewLineup(sections: LineupSection[], { sort, filter }: LineupQuery, marks: MarkSets): LineupSection[] {
  return sections
    .map((s) => ({ ...s, films: [...keepMarked(s.films, filter, marks, (f) => f.id)].sort(COMPARE[sort]) }))
    .filter((s) => s.films.length > 0);
}

/** "1 film", "1,204 films". */
export function filmCount(n: number): string {
  return `${n.toLocaleString("en")} ${n === 1 ? "film" : "films"}`;
}

/** The section headings' ids on the lineup page, unique per section. */
export const sectionId = (section: LineupSection): string => `section-${section.order}`;

/** A film's screening at one festival, as its page lists it: the festival, the year, the section and the prizes won there. */
export type MovieScreening = {
  awardSlug: string;
  awardName: string;
  /** The festival's place in the season (the registry's calendar order). */
  calendarOrder: number;
  year: number;
  section: string;
  sectionOrder: number;
  /** The section's prizes, joined with "; ", or null. */
  prize: string | null;
};

/** A movie page's screenings in order: festivals in calendar order, the newer year first, then the section's place. */
export function orderScreenings(screenings: MovieScreening[]): MovieScreening[] {
  return [...screenings].sort(
    (a, b) => a.calendarOrder - b.calendarOrder || b.year - a.year || a.sectionOrder - b.sectionOrder,
  );
}

/**
 * A screening's prizes, one pill each: "Best Director; Best Actor" is two. Inside a section a
 * prize's trailing "(<section>)" repeats the heading, so it goes: "Jury Prize (Un Certain Regard)"
 * reads "Jury Prize" under Un Certain Regard.
 */
export function prizesOf(prize: string | null, section?: string): string[] {
  if (!prize) return [];
  const suffix = section ? ` (${section})` : null;
  return prize.split("; ").map((p) => (suffix && p.endsWith(suffix) && p.length > suffix.length ? p.slice(0, -suffix.length) : p));
}

const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/**
 * A listed category names the prize: "Palme d'Or" is "Palme d'Or"; Sundance's "U.S. Grand Jury Prize:
 * Dramatic" and "Audience Award: World Cinema Dramatic" are its sections' "Grand Jury Prize" and "Audience Award".
 */
const names = (listed: string, prize: string) =>
  [plain(listed), plain(listed.split(":")[0]).replace(/^(?:u s|world cinema) /, "")].includes(plain(prize));

/**
 * A screening row's caption: the section and its prizes, the year first when the list spans years.
 * A prize the page already lists as its own row (`listed`: the festival's won categories that
 * year, "Palme d'Or", "U.S. Grand Jury Prize: Dramatic") isn't said twice.
 */
export function screeningCaption(
  s: Pick<MovieScreening, "year" | "section" | "prize">,
  showYear: boolean,
  listed: string[] = [],
): string {
  const prizes = prizesOf(s.prize, s.section).filter((p) => !listed.some((l) => names(l, p)));
  return [showYear ? String(s.year) : null, s.section, prizes.length > 0 ? prizes.join("; ") : null]
    .filter(Boolean)
    .join(" · ");
}

/** The films an edition's note says were left out of its lineup ("Lineup: Memory left out (…)."), or null. */
export function lineupNote(note: string | null): string | null {
  const m = note?.match(/Lineup:\s*([^]*)$/);
  return m ? m[1].trim() || null : null;
}
