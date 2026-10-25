// The accuracy page's table (guide §8.5): one row per award category, grouped, sorted by the
// figure the visitor picks. Pure, shared by the page and its client table.
import { formatFigureCount, type Figure } from "@/lib/accuracy";
import type { AwardKind } from "@/lib/awards";

export type AccuracyRow = {
  /** The award category's unique key ("bafta/film"). */
  key: string;
  award: string;
  kind: AwardKind;
  /** The award's own name for the category, plus "(looser match)" and similar. */
  note: string;
  win: Figure | null;
  nomination: Figure | null;
  nominees: Figure | null;
  /** Of the Oscar nominees, the share it had nominated. */
  caught: Figure | null;
  /** Finished seasons the figures are based on. */
  years: number;
};

export const SORT_KEYS = ["award", "win", "nomination", "nominees", "caught", "years"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortState = { key: SortKey; direction: "ascending" | "descending" };

export const DEFAULT_SORT: SortState = { key: "win", direction: "descending" };

/** The groups the table has, in order (guide §8.5). Oscars never appear: they are what is predicted. */
export const GROUPS: { kind: AwardKind; label: string }[] = [
  { kind: "major", label: "Major awards" },
  { kind: "festival", label: "Festivals" },
  { kind: "critics", label: "Critics groups" },
];

/** The sort in the address (`?sort=win&dir=asc`); anything unknown is the default. */
export function parseSort(sort: string | string[] | undefined, dir: string | string[] | undefined): SortState {
  const key = (Array.isArray(sort) ? sort[0] : sort) as SortKey | undefined;
  if (!key || !SORT_KEYS.includes(key)) return DEFAULT_SORT;
  const d = Array.isArray(dir) ? dir[0] : dir;
  const fallback = key === "award" ? "ascending" : "descending";
  return { key, direction: d === "asc" ? "ascending" : d === "desc" ? "descending" : fallback };
}

/** The query string for a sort ("" for the default, so the plain address stays plain). */
export function sortQuery(sort: SortState): string {
  if (sort.key === DEFAULT_SORT.key && sort.direction === DEFAULT_SORT.direction) return "";
  return `?sort=${sort.key}&dir=${sort.direction === "ascending" ? "asc" : "desc"}`;
}

/** A figure as a share, or null when it doesn't apply or has nothing to count. */
function share(figure: Figure | null): number | null {
  return figure === null || figure.count === 0 ? null : figure.hits / figure.count;
}

function value(row: AccuracyRow, key: SortKey): string | number | null {
  switch (key) {
    case "award":
      return row.award;
    case "years":
      return row.years;
    default:
      return share(row[key]);
  }
}

/**
 * Sorts one group's rows. A figure that doesn't apply ("–") is always last, whichever way it
 * sorts; ties fall back to the award's name and then the category, so the order never jumps.
 */
export function sortRows(rows: AccuracyRow[], sort: SortState): AccuracyRow[] {
  const dir = sort.direction === "ascending" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const [x, y] = [value(a, sort.key), value(b, sort.key)];
    if (x === null || y === null) {
      if (x !== y) return x === null ? 1 : -1;
    } else if (x !== y) {
      const order = typeof x === "string" && typeof y === "string" ? x.localeCompare(y) : x < y ? -1 : 1;
      return order * dir;
    }
    return a.award.localeCompare(b.award) || a.note.localeCompare(b.note);
  });
}

/** The rows by group, empty groups left out, each sorted. */
export function groupRows(rows: AccuracyRow[], sort: SortState): { kind: AwardKind; label: string; rows: AccuracyRow[] }[] {
  return GROUPS.map((g) => ({ ...g, rows: sortRows(rows.filter((r) => r.kind === g.kind), sort) })).filter(
    (g) => g.rows.length > 0,
  );
}

/** The critics groups the table shows before "Show all" (guide §8.5; the sort decides which). */
export const CRITICS_CAP = 8;

/**
 * Folds the critics group's rows to the first `CRITICS_CAP` of its sort, unless `all`. `critics` is how many
 * critics groups (awards) the group holds, the N in "Show all N critics groups"; `hidden` how many rows the fold hides.
 */
export function foldCritics<G extends { kind: AwardKind; rows: AccuracyRow[] }>(
  groups: G[],
  all: boolean,
): { groups: G[]; critics: number; hidden: number } {
  const critics = groups.find((g) => g.kind === "critics");
  const hidden = critics ? Math.max(0, critics.rows.length - CRITICS_CAP) : 0;
  return {
    groups: all || hidden === 0 ? groups : groups.map((g) => (g === critics ? { ...g, rows: g.rows.slice(0, CRITICS_CAP) } : g)),
    critics: critics ? new Set(critics.rows.map((r) => r.award)).size : 0,
    hidden,
  };
}

/** The figure's pieces for a table cell: the percentage and the "11 of 14" count. */
export function figureCell(figure: Figure | null): { pct: number | null; count?: string } {
  const s = share(figure);
  return s === null ? { pct: null } : { pct: s * 100, count: formatFigureCount(figure) };
}

/** The caption under an award's name: its own category name and what is special about it. */
export function rowNote(c: { name: string; loose: boolean; winnersOnly: boolean; isSelection: boolean }): string {
  return [c.name, c.loose && "looser match", c.isSelection && "a list, no winner", c.winnersOnly && "winners only"]
    .filter(Boolean)
    .join(" · ");
}

/** "2012–2025 (14 finished seasons)", or a plain phrase when there are none or one. */
export function seasonsSpan(years: number[]): string {
  if (years.length === 0) return "no finished seasons yet";
  const first = Math.min(...years);
  const last = Math.max(...years);
  const n = years.length;
  const span = first === last ? `${first}` : `${first}–${last}`;
  return `${span} (${n} finished ${n === 1 ? "season" : "seasons"})`;
}
