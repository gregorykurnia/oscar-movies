// Accuracy figures (IMPLEMENTATION_PLAN.md §5.2): how well one award category foretells the
// Oscar category it maps to. Pure: `scripts/lib/compute.ts` reads the database, calls this and
// stores the hits and counts in `accuracy`; pages only format them.
import { DASH } from "./format";
import { compareOutcome, isNomination, isShortlisted, type Outcome } from "./stage";

export type EditionStatus = "loaded" | "partial" | "no_data";

/** A film, as whatever key the caller matches on (a movie ID, an IMDb ID). */
export type MovieKey = string | number;

/** One edition of the award, with only this category's results. */
export type AccuracyEdition = {
  year: number;
  status: EditionStatus;
  results: ReadonlyArray<{ movie: MovieKey; outcome: Outcome }>;
};

/** One Oscars edition, with only the mapped Oscar category's results. */
export type OscarEdition = {
  year: number;
  status: EditionStatus;
  winnersOn: string | null;
  results: ReadonlyArray<{ movie: MovieKey; outcome: Outcome }>;
};

/**
 * The Oscar categories whose figures count only films that made the Oscar shortlist (§5.2's
 * shortlist rule, task 8.1): the others have no shortlist.
 */
export const SHORTLIST_RULE_CATEGORIES: ReadonlySet<string> = new Set(["documentary", "international"]);

/** The footnote on the accuracy and award pages for the shortlist rule. */
export const SHORTLIST_RULE_NOTE = "Documentary and International count only films that made the Oscar shortlist.";

/** §5.2's shortlist rule for one award category; build it with `shortlistRule`. */
export type ShortlistRule = {
  /** Each season's films on the Oscar shortlist or further, from `oscarShortlistsByYear`. */
  byYear: ReadonlyMap<number, ReadonlySet<MovieKey>>;
  /** A festival's film can make the next season's shortlist too. */
  nextYear: boolean;
};

/** Hits over a count; a count of 0 means the figure can't be worked out yet. */
export type Figure = { hits: number; count: number };

export type AccuracyFigures = {
  /** Winner → Oscar win, over the years with a winner. */
  win: Figure;
  /** Winner → Oscar nomination (or win), over the years with a winner. */
  nomination: Figure;
  /** Nominees → Oscar nominees, over all nominees; null for `winners_only` awards. */
  nominees: Figure | null;
  /**
   * Oscar nominees it caught: of the Oscar nominees in the years the nominees figure counts, those
   * the award nominated (or more) in any edition; null when the nominees figure is.
   */
  caught: Figure | null;
  /** The finished seasons counted (the edition has results in this category). */
  years: number[];
  /** The finished seasons left out because the award has no data for them. */
  noDataYears: number[];
};

/**
 * The seasons whose Oscars are over: the ceremony date has passed (`today` is `YYYY-MM-DD`)
 * and the Oscar category has its winner loaded.
 */
export function finishedYears(oscars: ReadonlyArray<OscarEdition>, today: string): Set<number> {
  return new Set(
    oscars
      .filter(
        (e) =>
          e.status !== "no_data" &&
          e.winnersOn !== null &&
          e.winnersOn <= today &&
          e.results.some((r) => r.outcome === "won"),
      )
      .map((e) => e.year),
  );
}

/** Each film's furthest outcome in the Oscar category, over every Oscars edition. */
export function oscarOutcomes(oscars: ReadonlyArray<OscarEdition>): Map<MovieKey, Outcome> {
  const furthest = new Map<MovieKey, Outcome>();
  for (const edition of oscars) {
    for (const r of edition.results) {
      const seen = furthest.get(r.movie);
      if (seen === undefined || compareOutcome(r.outcome, seen) > 0) furthest.set(r.movie, r.outcome);
    }
  }
  return furthest;
}

/** Each season's Oscar nominees (and winners) in the Oscar category. */
export function oscarNomineesByYear(oscars: ReadonlyArray<OscarEdition>): Map<number, MovieKey[]> {
  return new Map(oscars.map((e) => [e.year, e.results.filter((r) => isNomination(r.outcome)).map((r) => r.movie)]));
}

/** Each season's films on the Oscar shortlist or further (shortlisted, nominated, won). */
export function oscarShortlistsByYear(oscars: ReadonlyArray<OscarEdition>): Map<number, Set<MovieKey>> {
  return new Map(oscars.map((e) => [e.year, new Set(e.results.filter((r) => isShortlisted(r.outcome)).map((r) => r.movie))]));
}

/**
 * The shortlist rule for an award category mapped to `oscarCategory`, or null when the category
 * has no shortlist (Picture, Animated). A festival's film counts if it made that season's
 * shortlist or the next one's.
 */
export function shortlistRule(
  oscarCategory: string,
  awardKind: string,
  shortlists: ReadonlyMap<number, ReadonlySet<MovieKey>>,
): ShortlistRule | null {
  if (!SHORTLIST_RULE_CATEGORIES.has(oscarCategory)) return null;
  return { byYear: shortlists, nextYear: awardKind === "festival" };
}

/**
 * The four figures for one award category. A film counts as an Oscar hit by its furthest
 * outcome in the mapped category in any Oscars edition (a festival film can reach the Oscars a
 * year later). Only finished seasons count, and only `loaded` or `partial` editions with results
 * in this category. The nominees figure skips an edition that names only winners in this category
 * (NBR's Animated, a `partial` edition with just its winner), which would read as a nominee list of
 * one, and is null when no edition names a nominee (Phase 4 review). A `partial` edition that names
 * nominees counts: most are partial only for a missing date (IMDb-loaded groups such as IDA).
 *
 * With a `shortlist` rule (Documentary and International), a result whose film didn't make that
 * season's Oscar shortlist (a festival's: that season's or the next) is left out of the winner and
 * nominees figures, and a year whose winners are all left out isn't counted for the winner figures.
 * Which years name nominees, and the caught figure, are worked out before the rule, so "caught"
 * is unchanged.
 */
export function computeAccuracy(input: {
  winnersOnly: boolean;
  editions: ReadonlyArray<AccuracyEdition>;
  oscars: ReadonlyMap<MovieKey, Outcome>;
  /** From `oscarNomineesByYear`. */
  oscarNominees: ReadonlyMap<number, ReadonlyArray<MovieKey>>;
  finished: ReadonlySet<number>;
  /** From `shortlistRule`; null or left out for categories with no shortlist. */
  shortlist?: ShortlistRule | null;
}): AccuracyFigures {
  const win: Figure = { hits: 0, count: 0 };
  const nomination: Figure = { hits: 0, count: 0 };
  const nominees: Figure = { hits: 0, count: 0 };
  const caught: Figure = { hits: 0, count: 0 };
  // Any edition, as a festival film can reach the Oscars a year later (mirrors `oscars`).
  const awardNominated = new Set(
    input.editions.flatMap((e) => e.results.filter((r) => isNomination(r.outcome)).map((r) => r.movie)),
  );
  const years: number[] = [];
  const noDataYears: number[] = [];
  const oscarNominated = (movie: MovieKey) => {
    const outcome = input.oscars.get(movie);
    return outcome !== undefined && isNomination(outcome);
  };
  const rule = input.shortlist ?? null;
  const counts = (movie: MovieKey, year: number) =>
    rule === null || rule.byYear.get(year)?.has(movie) === true || (rule.nextYear && rule.byYear.get(year + 1)?.has(movie) === true);

  for (const edition of [...input.editions].sort((a, b) => a.year - b.year)) {
    if (!input.finished.has(edition.year)) continue;
    if (edition.status === "no_data") {
      noDataYears.push(edition.year);
      continue;
    }
    if (edition.results.length === 0) continue;
    years.push(edition.year);

    // Ties: a hit if any winner did it.
    const winners = edition.results.filter((r) => r.outcome === "won" && counts(r.movie, edition.year));
    if (winners.length > 0) {
      win.count += 1;
      nomination.count += 1;
      if (winners.some((r) => input.oscars.get(r.movie) === "won")) win.hits += 1;
      if (winners.some((r) => oscarNominated(r.movie))) nomination.hits += 1;
    }

    if (edition.results.some((r) => r.outcome !== "won" && isNomination(r.outcome))) {
      // Winners, runners-up and AFI's list: everything at nomination stage or further.
      for (const r of edition.results) {
        if (!isNomination(r.outcome) || !counts(r.movie, edition.year)) continue;
        nominees.count += 1;
        if (oscarNominated(r.movie)) nominees.hits += 1;
      }
      for (const movie of input.oscarNominees.get(edition.year) ?? []) {
        caught.count += 1;
        if (awardNominated.has(movie)) caught.hits += 1;
      }
    }
  }

  const noNominees = input.winnersOnly || nominees.count === 0;
  return { win, nomination, nominees: noNominees ? null : nominees, caught: noNominees ? null : caught, years, noDataYears };
}

/** "79%", or "–" when the figure doesn't apply or has nothing to count (guide §11). */
export function formatFigure(figure: Figure | null): string {
  if (figure === null || figure.count === 0) return DASH;
  return `${Math.round((figure.hits / figure.count) * 100)}%`;
}

/** "11 of 14", or "–" (as `formatFigure`). */
export function formatFigureCount(figure: Figure | null): string {
  if (figure === null || figure.count === 0) return DASH;
  return `${figure.hits} of ${figure.count}`;
}
