// The mark filters (product plan §3.13): Watched, Unwatched and Want to watch chips on every film
// list. They are in the address as `?filter=watched` (repeated beside a list's own chips, such as
// Submissions' Shortlisted) and the list is read for that address with the live marks. Pure, so the
// address, the choice between chips and the filtering are unit tested.
import type { FilterLink } from "@/components/chip/FilterChips";
import type { Mark } from "@/data/watch-list";

export const MARK_FILTERS = ["watched", "unwatched", "want"] as const;
export type MarkFilter = (typeof MARK_FILTERS)[number];

export const MARK_FILTER_LABELS: Record<MarkFilter, string> = {
  watched: "Watched",
  unwatched: "Unwatched",
  want: "Want to watch",
};

/** The films marked watched and the films marked want to watch (a film is never in both). */
export type MarkSets = {
  watched: ReadonlySet<number>;
  want: ReadonlySet<number>;
};

export function markSets(marks: Mark[]): MarkSets {
  return {
    watched: new Set(marks.filter((m) => m.watched).map((m) => m.movieId)),
    want: new Set(marks.filter((m) => m.want).map((m) => m.movieId)),
  };
}

export const isMarkFilter = (value: string): value is MarkFilter =>
  (MARK_FILTERS as readonly string[]).includes(value);

/** Whether a film passes a mark filter: Unwatched is everything not marked watched, so a want-to-watch film stays. */
export function passesMark(
  filter: MarkFilter,
  movieId: number,
  { watched, want }: MarkSets,
): boolean {
  if (filter === "want") return want.has(movieId);
  return (filter === "watched") === watched.has(movieId);
}

/** The filters with one chip flipped, kept in `order`; turning a mark filter on turns the other mark filters off. */
export function toggleFilterIn<T extends string>(
  order: readonly T[],
  filters: readonly T[],
  filter: T,
): T[] {
  const on = !filters.includes(filter);
  return order.filter((f) =>
    f === filter
      ? on
      : filters.includes(f) && !(on && isMarkFilter(f) && isMarkFilter(filter)),
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

/** The mark filter in an address (`?filter=want`), for lists that have no other chips; anything unknown is none. */
export function parseMarkFilter(params: SearchParams): MarkFilter | null {
  const values = [params.filter ?? []].flat();
  return MARK_FILTERS.find((f) => values.includes(f)) ?? null;
}

/** The address's query for a mark filter: "?filter=want", or "". */
export const markFilterQuery = (filter: MarkFilter | null): string =>
  filter ? `?filter=${filter}` : "";

/** The three chips of a list with no other chips, each linking to `path` with that chip flipped. */
export function markChips(
  path: string,
  current: MarkFilter | null,
): FilterLink[] {
  return MARK_FILTERS.map((filter) => ({
    label: MARK_FILTER_LABELS[filter],
    href: `${path}${markFilterQuery(current === filter ? null : filter)}`,
    pressed: current === filter,
  }));
}

/** The films a list keeps under a mark filter (all of them with none). */
export function keepMarked<T>(
  rows: T[],
  filter: MarkFilter | null,
  sets: MarkSets,
  idOf: (row: T) => number,
): T[] {
  return filter
    ? rows.filter((row) => passesMark(filter, idOf(row), sets))
    : rows;
}
