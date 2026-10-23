// A season as of a date (IMPLEMENTATION_PLAN.md §5.3): which results are announced, each film's
// Oscar status, the phase, the contenders and their features. Dates are ISO `YYYY-MM-DD`; a
// cutoff of null means every loaded result (the live snapshot).
import { isNomination, type Outcome } from "../stage";
import type {
  OscarCategory,
  OscarDates,
  OscarStatus,
  Phase,
  PrecursorResult,
  ResultState,
  Season,
  SeasonFilm,
  Snapshot,
} from "./types";

/** The Oscar lists each category has before its nominations. */
const OSCAR_LISTS: Record<OscarCategory, { submissions: boolean; shortlist: boolean; eligibleList: boolean }> = {
  picture: { submissions: false, shortlist: false, eligibleList: false },
  documentary: { submissions: false, shortlist: true, eligibleList: false },
  international: { submissions: true, shortlist: true, eligibleList: false },
  animated: { submissions: false, shortlist: false, eligibleList: true },
};

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The day before: an eve snapshot counts what was announced before it. */
export function eve(date: string): string {
  return addDays(date, -1);
}

/** An Oscar date is announced when it falls before the cutoff; an unknown date never is (it would give the answer away). */
function oscarAnnounced(date: string | null, cutoff: string | null): boolean {
  return cutoff === null || (date !== null && date < cutoff);
}

/**
 * A precursor date by the cutoff. An unknown one (a gap in the research, not a future result)
 * counts as announced when `undatedOut` says so: see `seasonAsOf`.
 */
function precursorAnnounced(date: string | null, cutoff: string | null, undatedOut: boolean): boolean {
  return cutoff === null || (date === null ? undatedOut : date < cutoff);
}

/** What a precursor result showed by the cutoff: a winner is a nominee until its winners day. */
export function resultAsOf(r: PrecursorResult, cutoff: string | null, undatedOut = true): ResultState | null {
  if (!isNomination(r.outcome)) return null;
  const announced = (date: string | null) => precursorAnnounced(date, cutoff, undatedOut);
  if (r.outcome === "won" && announced(r.winnersOn)) return "won";
  // Awards that name only winners (festivals) have no nominations day: a runner-up comes out with the winners.
  if (r.nominationsOn === null) return r.outcome !== "won" && announced(r.winnersOn) ? "nominated" : null;
  return announced(r.nominationsOn) ? "nominated" : null;
}

/**
 * A film's Oscar status by the cutoff. Nominees reach the stage before: International's
 * submissions are known from the start; the shortlist and Animated's eligible list come out on
 * the shortlist day (the eligible list's own day isn't recorded, so this is the latest it can be).
 */
export function oscarStatusAsOf(
  category: OscarCategory,
  outcome: Outcome | null,
  dates: OscarDates,
  cutoff: string | null,
): OscarStatus | null {
  if (outcome === null) return null;
  const lists = OSCAR_LISTS[category];
  if (isNomination(outcome) && oscarAnnounced(dates.nominationsOn, cutoff)) {
    return outcome === "won" && oscarAnnounced(dates.winnersOn, cutoff) ? "won" : "nominated";
  }
  if (oscarAnnounced(dates.shortlistOn, cutoff)) {
    if (outcome === "submitted" || outcome === "eligible") return outcome;
    if (lists.shortlist) return "shortlisted";
    if (lists.eligibleList) return "eligible";
  }
  return lists.submissions ? "submitted" : null;
}

/** A contender as of a cutoff, without its answer. */
export type ContenderAsOf = {
  movie: SeasonFilm["movie"];
  /** Precursor results: `category|won` or `category|nominated`. */
  winFeatures: string[];
  /** The same, plus `oscar|submitted`, `oscar|eligible` or `oscar|shortlisted` before the nominations. */
  nomFeatures: string[];
  film: SeasonFilm;
};

export type SeasonAsOf = { phase: Phase; early: boolean; contenders: ContenderAsOf[] };

export const OSCAR_FEATURE = "oscar";

export function featureKey(category: string, state: string): string {
  return `${category}|${state}`;
}

export function parseFeature(key: string): { category: string; state: string } {
  const at = key.lastIndexOf("|");
  return { category: key.slice(0, at), state: key.slice(at + 1) };
}

/**
 * The contenders as of the cutoff. Before the nominations: every film with a precursor
 * nomination or win, or on an Oscar list; once a list rules films out, only the films on it
 * (International's submissions, then the shortlist; Animated's eligible list). After: the nominees.
 */
export function seasonAsOf(season: Season, category: OscarCategory, cutoff: string | null): SeasonAsOf {
  const lists = OSCAR_LISTS[category];
  const awards = new Set<string>();
  // A result with no date (Cinema Eye 2012–2020, AFI 2017) counts from the eve of the season's
  // nominations, when every followed precursor has announced; before that it would put a January
  // result into a season lined up with October (3.R). Live, a loaded result is out.
  const undatedOut = cutoff === null || season.oscar.nominationsOn === null || cutoff >= eve(season.oscar.nominationsOn);
  const rows = season.films.map((film) => {
    const winFeatures: string[] = [];
    for (const r of film.results) {
      const state = resultAsOf(r, cutoff, undatedOut);
      if (state === null) continue;
      awards.add(r.award);
      winFeatures.push(featureKey(r.category, state));
    }
    const status = oscarStatusAsOf(category, film.oscar, season.oscar, cutoff);
    return { film, status, winFeatures };
  });

  const phase: Phase = rows.some((r) => r.status === "nominated" || r.status === "won") ? "after" : "before";
  let kept: typeof rows;
  if (phase === "after") {
    kept = rows.filter((r) => r.status === "nominated" || r.status === "won");
  } else {
    kept = rows.filter((r) => r.winFeatures.length > 0 || r.status !== null);
    const narrow = (onList: (status: OscarStatus | null) => boolean) => {
      const on = kept.filter((r) => onList(r.status));
      if (on.length > 0) kept = on;
    };
    const listOut = oscarAnnounced(season.oscar.shortlistOn, cutoff);
    if (lists.submissions) narrow((s) => s !== null);
    if (lists.shortlist && listOut) narrow((s) => s === "shortlisted");
    if (lists.eligibleList && listOut) narrow((s) => s === "eligible");
  }

  return {
    phase,
    early: awards.size < 3,
    contenders: kept.map((r) => ({
      movie: r.film.movie,
      winFeatures: r.winFeatures,
      nomFeatures:
        phase === "before" && r.status !== null && r.status !== "nominated" && r.status !== "won"
          ? [...r.winFeatures, featureKey(OSCAR_FEATURE, r.status)]
          : r.winFeatures,
      film: r.film,
    })),
  };
}

/** The target's cutoff: null (live: everything loaded) or the eve of its Oscar date; undefined when that date is unknown. */
export function targetCutoff(snapshot: Snapshot, dates: OscarDates): string | null | undefined {
  if (snapshot.kind === "live") return null;
  const date = snapshot.kind === "eve_nominations" ? dates.nominationsOn : dates.winnersOn;
  return date === null ? undefined : eve(date);
}

/**
 * A history season's cutoff, so it is learned from at the same point of its season as the target:
 * the eves for the eve snapshots; for live, as many days before its nominations (or ceremony,
 * once the target's nominations are out) as `today` is before the target's. Undefined: the season
 * lacks the dates, so it is left out.
 */
export function historyCutoff(snapshot: Snapshot, phase: Phase, target: OscarDates, past: OscarDates): string | undefined {
  const { nominationsOn, winnersOn } = past;
  if (nominationsOn === null || winnersOn === null) return undefined;
  if (snapshot.kind === "eve_nominations") return eve(nominationsOn);
  if (snapshot.kind === "eve_ceremony") return eve(winnersOn);
  const clamp = (date: string, low: string | null, high: string) => (date > high ? high : low !== null && date < low ? low : date);
  if (phase === "after") {
    if (target.winnersOn === null) return eve(winnersOn);
    return clamp(addDays(winnersOn, 1 - daysBetween(snapshot.today, target.winnersOn)), addDays(nominationsOn, 1), eve(winnersOn));
  }
  if (target.nominationsOn === null) return eve(nominationsOn);
  // The live target counts results through today, so the matching day counts too (cutoffs are exclusive: one day on).
  return clamp(addDays(nominationsOn, 1 - daysBetween(snapshot.today, target.nominationsOn)), null, eve(nominationsOn));
}

/**
 * Nomination slots: Picture had that year's number of nominees until 2020 and 10 from 2021;
 * the others 5. `nominees` is the season's count when known (0 before the nominations).
 */
export function nominationSlots(category: OscarCategory, year: number, nominees: number): number {
  if (category !== "picture") return 5;
  if (year >= 2021 || nominees === 0) return 10;
  return nominees;
}
