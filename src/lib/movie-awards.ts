// The Awards sections of the movie page (guide §8.6) and the race's precursor line (guide §6.5):
// what a film did at every other award, with the awards that passed it over. Pure, so unit
// tests cover the rules; the queries are in `src/data/movie.ts` and `src/data/precursors.ts`.
import type { AwardKind } from "@/lib/awards";
import type { Outcome } from "@/lib/stage";

type OscarCategoryName = "picture" | "documentary" | "international" | "animated";

/** One of the film's results at an award that isn't the Oscars. */
export type AwardResult = {
  awardSlug: string;
  awardName: string;
  kind: Exclude<AwardKind, "oscars">;
  calendarOrder: number;
  isSelection: boolean;
  year: number;
  categoryName: string;
  oscarCategory: OscarCategoryName;
  outcome: Outcome;
};

/** A category an award gave in a year (with results), that the film might have been passed over for. */
export type AwardCandidate = Omit<AwardResult, "outcome"> & {
  /** From when a missing result means "not nominated": the day the nominations came out. */
  since: string | null;
};

export type MovieAwardRow = {
  awardSlug: string;
  awardName: string;
  kind: Exclude<AwardKind, "oscars">;
  calendarOrder: number;
  isSelection: boolean;
  year: number;
  /** The award's own name for the category (names joined with " / " for a "not nominated" in several). */
  category: string;
  oscarCategory: OscarCategoryName;
  result: "won" | "nominated" | "runner_up" | "not_nominated";
  /** Only for not nominated: shown from this day (the nominations' day); null when unknown. */
  since: string | null;
};

const RESULT_ORDER: Record<MovieAwardRow["result"], number> = {
  won: 0,
  nominated: 1,
  runner_up: 1,
  not_nominated: 2,
};

/**
 * The film's rows at the other awards: each win, nomination and runner-up place, then a "not
 * nominated" for every award that gave a film category the film is in the running for that year and
 * passed it over. An award with several categories mapped to one Oscar category (Golden Globes'
 * Drama and Comedy) gives one "not nominated" row, and none if the film is in any of them.
 * Director and cast prizes (loose mapping) never make one: they're not about the film as such.
 * `candidates` are the loaded, nominees-announcing awards' categories only (the query's job).
 */
export function movieAwardRows(results: AwardResult[], candidates: AwardCandidate[]): MovieAwardRow[] {
  const rows: MovieAwardRow[] = [];
  for (const r of results) {
    if (r.outcome !== "won" && r.outcome !== "nominated" && r.outcome !== "runner_up") continue;
    rows.push({
      awardSlug: r.awardSlug,
      awardName: r.awardName,
      kind: r.kind,
      calendarOrder: r.calendarOrder,
      isSelection: r.isSelection,
      year: r.year,
      category: r.categoryName,
      oscarCategory: r.oscarCategory,
      result: r.outcome,
      since: null,
    });
  }

  const key = (c: { awardSlug: string; year: number; oscarCategory: string }) =>
    `${c.awardSlug}:${c.year}:${c.oscarCategory}`;
  const inTheRunning = new Set(results.map(key));
  const missed = new Map<string, AwardCandidate[]>();
  for (const c of candidates) {
    if (inTheRunning.has(key(c))) continue;
    missed.set(key(c), [...(missed.get(key(c)) ?? []), c]);
  }
  for (const list of missed.values()) {
    const [first] = list;
    rows.push({
      awardSlug: first.awardSlug,
      awardName: first.awardName,
      kind: first.kind,
      calendarOrder: first.calendarOrder,
      isSelection: first.isSelection,
      year: first.year,
      category: [...new Set(list.map((c) => c.categoryName))].join(" / "),
      oscarCategory: first.oscarCategory,
      result: "not_nominated",
      since: list.map((c) => c.since).reduce<string | null>((a, b) => (a && b ? (a > b ? a : b) : (a ?? b)), null),
    });
  }
  return rows;
}

export type AwardsSection = {
  kind: Exclude<AwardKind, "oscars">;
  title: string;
  rows: MovieAwardRow[];
};

const SECTIONS: Array<[AwardsSection["kind"], string]> = [
  ["major", "Major awards"],
  ["festival", "Festivals"],
  ["critics", "Critics groups"],
];

/**
 * The page's sections in order (major awards, festivals, critics groups), each row set sorted won,
 * nominated, then not nominated, by the season's order. A "not nominated" shows only once the
 * nominations are out (`since` on or before `today`); sections with no rows are left out.
 */
export function awardsSections(rows: MovieAwardRow[], today: string): AwardsSection[] {
  const shown = rows.filter((r) => r.result !== "not_nominated" || r.since === null || r.since <= today);
  return SECTIONS.map(([kind, title]) => ({
    kind,
    title,
    rows: shown
      .filter((r) => r.kind === kind)
      .sort(
        (a, b) =>
          RESULT_ORDER[a.result] - RESULT_ORDER[b.result] ||
          b.year - a.year ||
          a.calendarOrder - b.calendarOrder ||
          a.awardName.localeCompare(b.awardName) ||
          a.category.localeCompare(b.category),
      ),
  })).filter((s) => s.rows.length > 0);
}

/** The critics groups' heading line: "3 won · 5 nominated · 12 not nominated" (zero counts left out). */
export function resultSummary(rows: Pick<MovieAwardRow, "result">[]): string {
  const count = (result: MovieAwardRow["result"][]) => rows.filter((r) => result.includes(r.result)).length;
  return [
    [count(["won"]), "won"],
    [count(["nominated", "runner_up"]), "nominated"],
    [count(["not_nominated"]), "not nominated"],
  ]
    .filter(([n]) => n !== 0)
    .map(([n, label]) => `${n} ${label}`)
    .join(" · ");
}

/** What a precursor line says about a film at one award (race rows, guide §6.5). */
export type PrecursorResult = {
  shortName: string;
  kind: Exclude<AwardKind, "oscars">;
  calendarOrder: number;
  isSelection: boolean;
  outcome: Outcome;
};

export type PrecursorLine = { won: string[]; nominated: string[] };

const KIND_ORDER: Record<PrecursorResult["kind"], number> = { major: 0, critics: 1, festival: 2 };

/**
 * "Won: BAFTA, PGA · Nominated: Globes": the awards that came up, wins first, at most `max` awards
 * in all (the most telling: major awards before critics groups before festivals, then the later
 * ones in the season). Festivals' runner-up places and AFI's selection are left out: neither is a
 * nomination. An award the film won and was nominated for in another category counts once, as a win.
 */
export function precursorLine(results: PrecursorResult[], max = 4): PrecursorLine {
  const best = new Map<string, PrecursorResult>();
  for (const r of results) {
    if (r.isSelection || (r.outcome !== "won" && r.outcome !== "nominated")) continue;
    const have = best.get(r.shortName);
    if (!have || (have.outcome !== "won" && r.outcome === "won")) best.set(r.shortName, r);
  }
  const ranked = [...best.values()].sort(
    (a, b) =>
      Number(b.outcome === "won") - Number(a.outcome === "won") ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      b.calendarOrder - a.calendarOrder,
  );
  const top = ranked.slice(0, max);
  return {
    won: top.filter((r) => r.outcome === "won").map((r) => r.shortName),
    nominated: top.filter((r) => r.outcome === "nominated").map((r) => r.shortName),
  };
}

/** The pill's word where it isn't the standard one: AFI's list says Selected, not Nominated. */
export function resultLabel(row: Pick<MovieAwardRow, "result" | "isSelection">): string | null {
  if (!row.isSelection) return null;
  return row.result === "not_nominated" ? "Not selected" : "Selected";
}

/**
 * The small line under an award's name: its own name for the category, with the film year when the
 * rows span several and the Oscar category when they span several (a film in two races).
 */
export function awardRowCaption(row: MovieAwardRow, opts: { showYear: boolean; oscarName: string | null }): string {
  return [row.category, opts.oscarName ? `counts towards ${opts.oscarName}` : null, opts.showYear ? String(row.year) : null]
    .filter(Boolean)
    .join(" · ");
}
