// The data coverage page's rules (guide §8.9, product plan §3.1): one strip cell per award and film
// year, the status words beside it, and the stale-score notice. Pure, so each is unit tested.
import type { AwardKind, AwardSummary } from "./awards";
import { formatDate } from "./format";

export type EditionStatus = "loaded" | "partial" | "no_data";
/** A strip cell: loaded (ink), partly loaded (half ink), no data (outlined), or the live season (gold). */
export type CellKind = "loaded" | "partial" | "none" | "live";

export type CoverageCell = { year: number; kind: CellKind; label: string };

export type CoverageRow = {
  slug: string;
  name: string;
  kind: AwardKind;
  /** Oldest year first, left to right. */
  cells: CoverageCell[];
  loaded: number;
  partial: number;
  none: number;
  status: string;
};

export type EditionStatusRow = { slug: string; year: number; status: EditionStatus };

const KIND_ORDER: AwardKind[] = ["oscars", "major", "festival", "critics"];

/** The sections of the coverage table, in order (the Oscars, then majors, festivals, critics groups). */
export const COVERAGE_GROUPS: { kind: AwardKind; label: string }[] = [
  { kind: "oscars", label: "Academy Awards" },
  { kind: "major", label: "Major awards" },
  { kind: "festival", label: "Festivals" },
  { kind: "critics", label: "Critics groups" },
];

const STATUS_WORD: Record<EditionStatus, string> = { loaded: "Loaded", partial: "Partly loaded", no_data: "No data" };

/**
 * "Loaded", "No data", "Partly loaded" or "Partly, 8 years no data" (a year with no edition counts
 * as no data; the live season's edition that isn't out yet counts as neither).
 */
export function statusText(loaded: number, partial: number, none: number): string {
  if (loaded === 0 && partial === 0) return "No data";
  if (partial === 0 && none === 0) return "Loaded";
  if (none === 0) return STATUS_WORD.partial;
  return `Partly, ${none} ${none === 1 ? "year" : "years"} no data`;
}

/**
 * A row per award, in the season's order within its kind. `years` runs oldest to newest. A year the
 * award has no edition for is "No data"; the live season is gold once loaded, partly loaded, or on
 * file and not out yet.
 */
export function coverageRows(
  awards: AwardSummary[],
  editions: EditionStatusRow[],
  years: number[],
  liveYear: number,
): CoverageRow[] {
  const byAward = new Map<string, Map<number, EditionStatus>>();
  for (const e of editions) {
    const map = byAward.get(e.slug) ?? new Map<number, EditionStatus>();
    map.set(e.year, e.status);
    byAward.set(e.slug, map);
  }
  return [...awards]
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.calendarOrder - b.calendarOrder)
    .map((award) => {
      const own = byAward.get(award.slug);
      let loaded = 0;
      let partial = 0;
      let none = 0;
      const cells = years.map((year): CoverageCell => {
        const status = own?.get(year) ?? "no_data";
        // The live season's edition is on file but not out yet: gold, and not a gap (preview §8.9).
        if (year === liveYear && status === "no_data" && own?.has(year)) {
          return { year, kind: "live", label: `${year}: Not out yet (live season)` };
        }
        if (status === "loaded") loaded++;
        else if (status === "partial") partial++;
        else none++;
        const kind: CellKind = status === "no_data" ? "none" : year === liveYear ? "live" : status === "loaded" ? "loaded" : "partial";
        return { year, kind, label: `${year}: ${STATUS_WORD[status]}${year === liveYear ? " (live season)" : ""}` };
      });
      return {
        slug: award.slug,
        name: award.name,
        kind: award.kind,
        cells,
        loaded,
        partial,
        none,
        status: statusText(loaded, partial, none),
      };
    });
}

/** Award years loaded (fully) out of every award and year the app covers. */
export function awardYearsLoaded(rows: CoverageRow[]): { loaded: number; total: number } {
  return {
    loaded: rows.reduce((n, r) => n + r.loaded, 0),
    total: rows.reduce((n, r) => n + r.cells.length, 0),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Scores older than this show the notice (plan §10: a broken cron must be visible in the app). */
export const STALE_AFTER_DAYS = 3;

/** The notice for scores more than 3 days old, or never refreshed; null while they're fresh. */
export function scoresNotice(lastRefresh: Date | null, now: Date): { title: string; body: string } | null {
  if (lastRefresh === null) {
    return { title: "Scores haven't been refreshed yet.", body: "Films show “–” for each score until the first refresh." };
  }
  const age = now.getTime() - lastRefresh.getTime();
  if (age <= STALE_AFTER_DAYS * DAY_MS) return null;
  const days = Math.floor(age / DAY_MS);
  return {
    title: `Scores are ${days} days old.`,
    body: "The daily refresh may have stopped. Films show the last scores loaded.",
  };
}

/** "22 Oct", with the year when it isn't this year's; "–" before the first refresh. */
export function refreshedLabel(lastRefresh: Date | null, now: Date): string {
  if (lastRefresh === null) return "–";
  return formatDate(lastRefresh, lastRefresh.getUTCFullYear() !== now.getUTCFullYear());
}
