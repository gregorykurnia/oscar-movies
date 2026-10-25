// The Watch list's address and sorts (guide §8.3, plan §4): `?sort=` and `?all=1` are read from the
// address; the lists are sorted here. Pure, so the address and the sorts are unit tested.
import type { StagedFilm } from "@/data/watch-list";
import { matchRange, normalizeQuery } from "@/lib/search";
import { compareOutcome } from "@/lib/stage";

export const WATCH_SORTS = ["mine", "stage", "chance", "nominations", "average"] as const;
export type WatchSort = (typeof WATCH_SORTS)[number];

export const WATCH_SORT_LABELS: Record<WatchSort, string> = {
  mine: "My order",
  stage: "Oscar stage",
  chance: "% chance",
  nominations: "Nominations",
  average: "Average score",
};

const DEFAULT_SORT: WatchSort = "mine";

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
  // The owner's order is the order the data comes in (Want to watch); the season section, which has
  // no order of its own, follows the Oscar stage under it.
  mine: (a, b) => stageRank(b) - stageRank(a) || b.nominations - a.nominations || byTitle(a, b),
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
export function sortWatchList<F extends StagedFilm>(films: F[], sort: WatchSort): F[] {
  return [...films].sort(COMPARE[sort]);
}

/** Want to watch keeps the owner's order (as it comes) under "My order", and follows the sort otherwise. */
export function sortWanted<F extends StagedFilm>(films: F[], sort: WatchSort): F[] {
  return sort === "mine" ? [...films] : sortWatchList(films, sort);
}

// "My order" (guide §8.3, task 7.9): the drag order's helpers, kept pure so they're unit tested.

/** A new list with the item at `from` moved to `to` (indexes before the move). Out of range: unchanged. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * The order to save, top first: the rows' films that are still wanted. A film unmarked during the
 * visit keeps its row until the next visit but no longer has a place (`wanted` says false); an
 * unknown mark (`undefined`, the marks not read yet) counts as wanted.
 */
export function orderToSave(ids: readonly number[], wanted: (id: number) => boolean | undefined): number[] {
  return ids.filter((id) => wanted(id) !== false);
}

/** "position 2 of 4" (index from 0). */
export const positionText = (index: number, total: number) => `position ${index + 1} of ${total}`;

/** The live region's words as a film is lifted, moved, dropped or put back by the keyboard or a pointer. */
export const reorderWords = {
  lifted: (title: string, index: number, total: number) => `Picked up ${title}. ${capitalise(positionText(index, total))}.`,
  moved: (title: string, index: number, total: number) => `Moved ${title} to ${positionText(index, total)}`,
  dropped: (title: string, index: number, total: number) => `Dropped ${title} at ${positionText(index, total)}.`,
  cancelled: (title: string, index: number, total: number) => `Moving cancelled. ${title} is back at ${positionText(index, total)}.`,
};

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Release notes (guide §8.3, task 7.10): the release line's words and the platform field's suggestions.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The release line's parts: `date` is strong (ink 500) when it is a real date; `platform` follows muted. */
export type ReleaseLine = {
  kind: "empty" | "tbd" | "coming" | "out";
  /** "12 Dec 2026", "Out 3 Oct", "TBD", or "Add release date" when both fields are empty. */
  date: string;
  platform: string | null;
};

/** Today's date in Indonesia (`YYYY-MM-DD`), where the owner watches: the day a release turns "Out". */
export function todayInJakarta(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** "3 Oct" or "3 Oct 2026" from `YYYY-MM-DD`, without going through a time zone. */
function dayMonth(iso: string, withYear: boolean): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}${withYear ? ` ${year}` : ""}`;
}

/**
 * The words on a Want to watch row's release button. A date still to come reads "12 Dec 2026"; once
 * it has come (today counts) "Out 3 Oct", with the year only when it isn't this year; no date is
 * "TBD"; nothing at all is "Add release date". `today` is `YYYY-MM-DD` (`todayInJakarta`).
 */
export function releaseLine({ releaseOn, platform }: { releaseOn: string | null; platform: string | null }, today: string): ReleaseLine {
  const place = platform?.trim() || null;
  if (!releaseOn)
    return place ? { kind: "tbd", date: "TBD", platform: place } : { kind: "empty", date: "Add release date", platform: null };
  if (releaseOn > today) return { kind: "coming", date: dayMonth(releaseOn, true), platform: place };
  return {
    kind: "out",
    date: `Out ${dayMonth(releaseOn, releaseOn.slice(0, 4) !== today.slice(0, 4))}`,
    platform: place,
  };
}

/** The line as one string ("Out 3 Nov · Cinema XXI"). */
export const releaseLineText = ({ date, platform }: ReleaseLine) => (platform ? `${date} · ${platform}` : date);

/** The platforms offered after the owner's own, in the guide's order. */
export const PLATFORM_SUGGESTIONS = [
  "Netflix",
  "Prime Video",
  "Disney+ Hotstar",
  "Apple TV+",
  "HBO Max",
  "Vidio",
  "MUBI",
  "Catchplay+",
  "KlikFilm",
  "Cinema XXI",
  "CGV",
  "Cinépolis",
];

/** Most "Used before" platforms offered at once. */
export const USED_PLATFORMS_LIMIT = 8;

export type PlatformOptions = { used: string[]; suggestions: string[] };

/**
 * The platform field's list for the text typed so far: the owner's earlier platforms (newest first,
 * as given), then the usual ones they haven't used; case and accents ignored. A suggestion the owner
 * has used moves up to "Used before" rather than showing twice.
 */
export function platformOptions(text: string, used: readonly string[]): PlatformOptions {
  const query = normalizeQuery(text);
  const matches = (name: string) => query === "" || matchRange(name, query) !== null;
  const key = (name: string) => normalizeQuery(name);
  const seen = new Set<string>();
  const earlier = used.filter((name) => {
    const k = key(name);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    used: earlier.filter(matches).slice(0, USED_PLATFORMS_LIMIT),
    suggestions: PLATFORM_SUGGESTIONS.filter((name) => !seen.has(key(name)) && matches(name)),
  };
}
