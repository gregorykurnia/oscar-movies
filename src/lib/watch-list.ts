// The Watch list's address and sorts (guide §8.3, plan §4): `?sort=` and `?all=1` are read from the
// address; the lists are sorted here. Pure, so the address and the sorts are unit tested.
import type { StagedFilm } from "@/data/watch-list";
import { compareOutcome } from "@/lib/stage";

export const WATCH_SORTS = ["stage", "chance", "nominations", "average"] as const;
export type WatchSort = (typeof WATCH_SORTS)[number];

export const WATCH_SORT_LABELS: Record<WatchSort, string> = {
  stage: "Oscar stage",
  chance: "% chance",
  nominations: "Nominations",
  average: "Average score",
};

const DEFAULT_SORT: WatchSort = "stage";

/** The season section shows this many films until "Show all". */
export const SEASON_LIMIT = 20;

export type WatchQuery = { sort: WatchSort; all: boolean };

type SearchParams = Record<string, string | string[] | undefined>;

/** The address's sort and "show all". Anything unknown is ignored: the default sort, the short list. */
export function parseWatchQuery(params: SearchParams): WatchQuery {
  const sort = WATCH_SORTS.find((s) => s === [params.sort].flat()[0]) ?? DEFAULT_SORT;
  return { sort, all: [params.all].flat()[0] === "1" };
}

/** "?sort=nominations&all=1", or "" for the defaults. */
export function watchHref({ sort, all }: WatchQuery): string {
  const params = new URLSearchParams();
  if (sort !== DEFAULT_SORT) params.set("sort", sort);
  if (all) params.set("all", "1");
  const query = params.toString();
  return `/watch-list${query ? `?${query}` : ""}`;
}

/** A film with no Oscar result at all ranks below every stage. */
const stageRank = (f: StagedFilm) => (f.stage === null ? -1 : compareOutcome(f.stage, "submitted"));
const byTitle = (a: StagedFilm, b: StagedFilm) => a.film.title.localeCompare(b.film.title, "en") || a.film.id - b.film.id;

const COMPARE: Record<WatchSort, (a: StagedFilm, b: StagedFilm) => number> = {
  // Furthest first (won, nominated, shortlisted, …), then most nominations.
  stage: (a, b) => stageRank(b) - stageRank(a) || b.nominations - a.nominations || byTitle(a, b),
  // Best chance to win first (the live season's prediction, best category); a film with none last.
  chance: (a, b) => {
    const x = a.chance;
    const y = b.chance;
    if (x === y) return stageRank(b) - stageRank(a) || byTitle(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x || stageRank(b) - stageRank(a) || byTitle(a, b);
  },
  // Most nominations first, then furthest stage.
  nominations: (a, b) => b.nominations - a.nominations || stageRank(b) - stageRank(a) || byTitle(a, b),
  // Highest average first; films with no scores last.
  average: (a, b) => {
    const x = a.film.scores.average;
    const y = b.film.scores.average;
    if (x === y) return byTitle(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    return y - x || byTitle(a, b);
  },
};

/** A new list in the sort's order. */
export function sortWatchList(films: StagedFilm[], sort: WatchSort): StagedFilm[] {
  return [...films].sort(COMPARE[sort]);
}
