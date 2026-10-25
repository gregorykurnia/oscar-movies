// Nomination patterns (product plan §3.16, IMPLEMENTATION_PLAN.md Phase 8 notes): for Documentary
// and International, the strong awards, the patterns and their rates, the films ranked with their
// % to be nominated, reasons, underdogs, outside chances, the Snub risk signs, the earlier-seasons
// backtest and the best predictors. Pure: `src/data/patterns.ts` (task 8.3) reads the seasons, the
// same ones the prediction engine reads plus each film's title and countries, and calls these.
import type { Figure } from "../accuracy";
import type { MovieKey, ResultState, Season, SeasonFilm } from "../predict";
import { NOMINATE_CAP } from "../predict/model";
import { resultAsOf } from "../predict/season";
import { isNomination, isShortlisted } from "../stage";
import {
  BUSY,
  FEW_FILMS,
  FIRST_SEASON,
  MOST_AWARDED_MISSES,
  OUTSIDE,
  PICKS_FROM,
  PREDICTOR_MIN_FILMS,
  PRIOR,
  RULES,
  STRONG_CAP,
  STRONG_MIN_FILMS,
  STRONG_RATE,
  UNDERDOG_MAX_STRONG,
  WEAK_MIN_NOMINATIONS,
  type PatternCategory,
  type SnubSign,
} from "./rules";

export * from "./rules";

export type PatternFilm = SeasonFilm & {
  title: string;
  /** Its countries (after 7.2); US-only means exactly `["US"]`. */
  countries: readonly string[] | null;
};

/** One season of one category, as the engine reads it, with titles and countries. */
export type PatternSeason = Omit<Season, "films"> & { films: ReadonlyArray<PatternFilm> };

/** Where a season stands: no shortlist yet, the shortlist out, or the nominees known. */
export type PatternState = "before" | "shortlist" | "nominations";

/** Strong awards that nominated a film, capped at 3; `usOnly` is null where the category has no split. */
export type Pattern = { strong: number; usOnly: boolean | null };

export type AwardRate = { category: string; figure: Figure; rate: number; strong: boolean };
export type PatternRate = { pattern: Pattern; figure: Figure; rate: number };

export type Reason =
  /** Its pattern and how films with it did in earlier seasons. */
  | { kind: "pattern"; pattern: Pattern; figure: Figure }
  /** Its nominations, and how many came from strong awards. */
  | { kind: "nominations"; total: number; strong: number }
  /** A miss with many nominations and no strong award. */
  | { kind: "weak"; nominations: number }
  /** The snub rule marked it down. */
  | { kind: "snub-rule"; figure: Figure }
  /** Outside the busy five, with a filmmakers' group nomination (a reason only, not in the ranking). */
  | { kind: "filmmakers"; figure: Figure };

export type SnubRisk = { sign: SnubSign; figure: Figure };

export type FilmPatterns = {
  movie: MovieKey;
  title: string;
  /** Its precursor results as the patterns count them (announced before the Oscar nominations), by award category. */
  results: Record<string, ResultState>;
  nominations: number;
  /** The strong award categories that nominated it (or more). */
  strongAwards: string[];
  pattern: Pattern;
  patternRate: number;
  /** Its rate after the snub rule: what it is ranked by. */
  rate: number;
  /** The snub rule gave it a lower rate than its pattern's. */
  markedDown: boolean;
  /** Among the season's five most-nominated (ties at fifth included). */
  busy: boolean;
  /** Its rank ("Pick #k"); null before `PICKS_FROM`. */
  pick: number | null;
  /** 0–0.99, adding to the slots; null before the shortlist. */
  pNominate: number | null;
  /** Its Oscar nomination; null until the nominees are known. */
  nominated: boolean | null;
  /** A nominee with at most one strong award. */
  underdog: boolean;
  /** Ranked just after the slots, before the nominations. */
  outside: boolean;
  /** The Snub risk signs it matches, from the shortlist on. */
  snubRisk: SnubRisk[];
  reasons: Reason[];
};

export type SeasonPatterns = {
  year: number;
  category: PatternCategory;
  state: PatternState;
  slots: number;
  /** The earlier seasons it learned from. */
  history: number[];
  /** Nominees among the shortlisted films of those seasons. */
  base: Figure;
  /** Every award category that nominated a shortlisted film before, strong first, by rate. */
  awards: AwardRate[];
  /** Every pattern, most strong awards first (not US-only before US-only). */
  patterns: PatternRate[];
  /** Earlier seasons' films for the snub rule (sign "busy"), the critics' sweep and the filmmakers' reason; null where the category has none. */
  snubRule: Figure | null;
  sweep: Figure | null;
  filmmakers: Figure | null;
  /** Ranked: rate, then strong awards, then nominations, then title. */
  films: FilmPatterns[];
};

/** One film of a season as the patterns read it, without anything learned. */
type Read = {
  film: PatternFilm;
  results: Map<string, ResultState>;
  nominations: number;
  usOnly: boolean;
  busy: boolean;
  nominated: boolean;
};

const fig = (hits = 0, count = 0): Figure => ({ hits, count });
const add = (f: Figure, hit: boolean) => {
  f.count += 1;
  if (hit) f.hits += 1;
};

/** The smoothed rate `(hits + PRIOR·base) / (count + PRIOR)`, in one division so equal rates compare equal. */
export function smoothed(f: Figure, base: Figure): number {
  return (f.hits * base.count + PRIOR * base.hits) / (base.count * (f.count + PRIOR));
}

function isStrong(f: Figure, base: Figure): boolean {
  if (f.count < STRONG_MIN_FILMS) return false;
  return STRONG_RATE.den * (f.hits * base.count + PRIOR * base.hits) >= STRONG_RATE.num * base.count * (f.count + PRIOR);
}

export function seasonPatternState(season: PatternSeason): PatternState {
  if (season.films.some((f) => f.oscar !== null && isNomination(f.oscar))) return "nominations";
  if (season.films.some((f) => f.oscar !== null && isShortlisted(f.oscar))) return "shortlist";
  return "before";
}

export function isUsOnly(countries: readonly string[] | null): boolean {
  return countries !== null && countries.length === 1 && countries[0] === "US";
}

/**
 * The season's films as the patterns see them: the shortlist once it is out, else every film with
 * a counted result (International: its submissions, once any are known). Results count when
 * announced before the Oscar nominations day; a win announced later counts as a nomination.
 */
function readSeason(season: PatternSeason, category: PatternCategory): Read[] {
  const state = seasonPatternState(season);
  const reads = season.films.map((film) => {
    const results = new Map<string, ResultState>();
    for (const r of film.results) {
      const s = resultAsOf(r, season.oscar.nominationsOn);
      if (s === null) continue;
      if (results.get(r.category) !== "won") results.set(r.category, s);
    }
    return {
      film,
      results,
      nominations: results.size,
      usOnly: isUsOnly(film.countries),
      busy: false,
      nominated: film.oscar !== null && isNomination(film.oscar),
    };
  });
  let pool: Read[];
  if (state !== "before") pool = reads.filter((r) => r.film.oscar !== null && isShortlisted(r.film.oscar));
  else {
    pool = reads.filter((r) => r.nominations > 0 || r.film.oscar !== null);
    const submitted = pool.filter((r) => r.film.oscar !== null);
    if (category === "international" && submitted.length > 0) pool = submitted;
  }
  const counts = pool.map((r) => r.nominations).sort((a, b) => b - a);
  const fifth = counts[Math.min(BUSY, counts.length) - 1] ?? 0;
  for (const r of pool) r.busy = r.nominations > 0 && r.nominations >= fifth;
  return pool;
}

const has = (r: Read, categories: readonly string[]) => categories.some((c) => r.results.has(c));

function snubbed(r: Read, category: PatternCategory): boolean {
  const rule = RULES[category].snubRule;
  return rule !== null && r.busy && !has(r, rule.without);
}

function swept(r: Read, category: PatternCategory): boolean {
  const rule = RULES[category].sweep;
  return rule !== null && rule.critics.filter((c) => r.results.has(c)).length >= rule.min && !has(r, rule.without);
}

function filmmakers(r: Read, category: PatternCategory): boolean {
  const list = RULES[category].filmmakers;
  return list !== null && !r.busy && has(r, list);
}

function patternOf(r: Read, strong: ReadonlySet<string>, category: PatternCategory): Pattern {
  const n = [...r.results.keys()].filter((c) => strong.has(c)).length;
  return { strong: Math.min(n, STRONG_CAP), usOnly: RULES[category].usSplit ? r.usOnly : null };
}

export function patternKey(p: Pattern): string {
  return `${p.strong}${p.usOnly === null ? "" : p.usOnly ? "|us" : "|not"}`;
}

/** Every pattern of a category, most strong awards first, not US-only before US-only. */
export function allPatterns(category: PatternCategory): Pattern[] {
  const out: Pattern[] = [];
  for (let strong = STRONG_CAP; strong >= 0; strong--) {
    if (RULES[category].usSplit) out.push({ strong, usOnly: false }, { strong, usOnly: true });
    else out.push({ strong, usOnly: null });
  }
  return out;
}

/** The strong awards and the figures learned from some seasons' reads. */
type Learned = {
  base: Figure;
  awards: Map<string, Figure>;
  strong: Set<string>;
  patterns: Map<string, Figure>;
  snubRule: Figure;
  sweep: Figure;
  filmmakers: Figure;
};

function learn(reads: readonly Read[], category: PatternCategory): Learned {
  const base = fig();
  const awards = new Map<string, Figure>();
  for (const r of reads) {
    add(base, r.nominated);
    for (const c of r.results.keys()) {
      if (!awards.has(c)) awards.set(c, fig());
      add(awards.get(c)!, r.nominated);
    }
  }
  const strong = new Set([...awards].filter(([, f]) => isStrong(f, base)).map(([c]) => c));
  const patterns = new Map<string, Figure>();
  const snubRule = fig();
  const sweep = fig();
  const makers = fig();
  for (const r of reads) {
    const key = patternKey(patternOf(r, strong, category));
    if (!patterns.has(key)) patterns.set(key, fig());
    add(patterns.get(key)!, r.nominated);
    if (snubbed(r, category)) add(snubRule, r.nominated);
    if (swept(r, category)) add(sweep, r.nominated);
    if (filmmakers(r, category)) add(makers, r.nominated);
  }
  return { base, awards, strong, patterns, snubRule, sweep, filmmakers: makers };
}

function historyReads(seasons: ReadonlyArray<PatternSeason>, category: PatternCategory, before: number, finishedOnly = false) {
  const years: number[] = [];
  const reads: Read[] = [];
  for (const s of [...seasons].sort((a, b) => a.year - b.year)) {
    if (s.year < FIRST_SEASON || s.year >= before || seasonPatternState(s) !== "nominations") continue;
    if (finishedOnly && !s.finished) continue;
    years.push(s.year);
    reads.push(...readSeason(s, category));
  }
  return { years, reads };
}

/**
 * Chances that add to the slots: the rates scaled, each capped at 99%, the rest scaled again to
 * fill what the capped ones leave. With too few films to fill the slots, everyone gets 99%.
 */
export function scaleToSlots(rates: readonly number[], slots: number, cap = NOMINATE_CAP): number[] {
  const out = rates.map(() => cap);
  if (cap * rates.length <= slots) return out;
  let free = rates.map((_, i) => i);
  let left = slots;
  for (;;) {
    const sum = free.reduce((s, i) => s + rates[i], 0);
    const value = (i: number) => (sum > 0 ? (rates[i] * left) / sum : left / free.length);
    const over = free.filter((i) => value(i) > cap);
    if (over.length === 0) {
      for (const i of free) out[i] = value(i);
      return out;
    }
    left -= cap * over.length;
    free = free.filter((i) => !over.includes(i));
  }
}

/**
 * One season of a category, worked out from the earlier seasons only (2012 on), as it would have
 * run live. Null when the season isn't in `seasons`, is before 2012, or has no earlier season to
 * learn from. `snubRule: false` ranks without the snub rule (the backtest's comparison).
 */
export function analyzeSeason(input: {
  category: PatternCategory;
  year: number;
  seasons: ReadonlyArray<PatternSeason>;
  snubRule?: boolean;
}): SeasonPatterns | null {
  const { category, year } = input;
  const season = input.seasons.find((s) => s.year === year);
  if (!season || year < FIRST_SEASON) return null;
  const history = historyReads(input.seasons, category, year);
  if (history.reads.length === 0) return null;
  const learned = learn(history.reads, category);
  const { base, strong } = learned;
  const rules = RULES[category];
  const useSnub = input.snubRule !== false && rules.snubRule !== null;
  const state = seasonPatternState(season);
  const rateOf = (f: Figure | undefined) => smoothed(f ?? fig(), base);
  const snubRate = rateOf(learned.snubRule);

  const films: FilmPatterns[] = readSeason(season, category).map((r) => {
    const pattern = patternOf(r, strong, category);
    const patternFigure = learned.patterns.get(patternKey(pattern)) ?? fig();
    const patternRate = rateOf(patternFigure);
    const snub = useSnub && snubbed(r, category);
    const rate = snub ? Math.min(patternRate, snubRate) : patternRate;
    const strongAwards = [...r.results.keys()].filter((c) => strong.has(c)).sort();
    const nominated = state === "nominations" ? r.nominated : null;
    const snubRisk: SnubRisk[] = [];
    if (state !== "before") {
      if (rules.signs.includes("busy") && snubbed(r, category)) snubRisk.push({ sign: "busy", figure: learned.snubRule });
      if (rules.signs.includes("sweep") && swept(r, category)) snubRisk.push({ sign: "sweep", figure: learned.sweep });
    }
    const reasons: Reason[] = [
      { kind: "pattern", pattern, figure: patternFigure },
      { kind: "nominations", total: r.nominations, strong: strongAwards.length },
    ];
    if (nominated === false && r.nominations >= WEAK_MIN_NOMINATIONS && strongAwards.length === 0) {
      reasons.push({ kind: "weak", nominations: r.nominations });
    }
    if (snub && rate < patternRate) reasons.push({ kind: "snub-rule", figure: learned.snubRule });
    if (filmmakers(r, category)) reasons.push({ kind: "filmmakers", figure: learned.filmmakers });
    return {
      movie: r.film.movie,
      title: r.film.title,
      results: Object.fromEntries([...r.results].sort(([a], [b]) => a.localeCompare(b))),
      nominations: r.nominations,
      strongAwards,
      pattern,
      patternRate,
      rate,
      markedDown: snub && rate < patternRate,
      busy: r.busy,
      pick: null,
      pNominate: null,
      nominated,
      underdog: nominated === true && strongAwards.length <= UNDERDOG_MAX_STRONG,
      outside: false,
      snubRisk,
      reasons,
    };
  });

  films.sort(
    (a, b) =>
      b.rate - a.rate ||
      b.strongAwards.length - a.strongAwards.length ||
      b.nominations - a.nominations ||
      a.title.localeCompare(b.title) ||
      String(a.movie).localeCompare(String(b.movie)),
  );
  const slots = season.slots;
  if (year >= PICKS_FROM) {
    films.forEach((f, i) => {
      f.pick = i + 1;
      f.outside = state !== "nominations" && f.pick > slots && f.pick <= slots + OUTSIDE;
    });
  }
  if (state !== "before") {
    const p = scaleToSlots(
      films.map((f) => f.rate),
      slots,
    );
    films.forEach((f, i) => (f.pNominate = p[i]));
  }

  const awards = [...learned.awards]
    .map(([c, f]) => ({ category: c, figure: f, rate: rateOf(f), strong: strong.has(c) }))
    .sort((a, b) => Number(b.strong) - Number(a.strong) || b.rate - a.rate || a.category.localeCompare(b.category));
  const patterns = allPatterns(category).map((pattern) => {
    const f = learned.patterns.get(patternKey(pattern)) ?? fig();
    return { pattern, figure: f, rate: rateOf(f) };
  });

  return {
    year,
    category,
    state,
    slots,
    history: history.years,
    base,
    awards,
    patterns,
    snubRule: rules.snubRule ? learned.snubRule : null,
    sweep: rules.sweep ? learned.sweep : null,
    filmmakers: rules.filmmakers ? learned.filmmakers : null,
    films,
  };
}

/** A sign's or reason's figure has few films behind it. */
export function fewFilms(f: Figure): boolean {
  return f.count < FEW_FILMS;
}

export type BacktestRow = { year: number; hits: number; nominees: number; picks: MovieKey[] };
export type PatternsBacktest = { rows: BacktestRow[]; hits: number; nominees: number };

/** The seasons from `PICKS_FROM` with their nominees: how many of the five picks were nominated. */
export function backtest(input: {
  category: PatternCategory;
  seasons: ReadonlyArray<PatternSeason>;
  snubRule?: boolean;
}): PatternsBacktest {
  const rows: BacktestRow[] = [];
  for (const analysis of pastSeasons(input)) {
    const picks = analysis.films.slice(0, analysis.slots);
    rows.push({
      year: analysis.year,
      hits: picks.filter((f) => f.nominated).length,
      nominees: analysis.films.filter((f) => f.nominated).length,
      picks: picks.map((f) => f.movie),
    });
  }
  return { rows, hits: rows.reduce((s, r) => s + r.hits, 0), nominees: rows.reduce((s, r) => s + r.nominees, 0) };
}

/** Every season from `PICKS_FROM` whose nominees are known, worked out from its earlier seasons. */
export function pastSeasons(input: {
  category: PatternCategory;
  seasons: ReadonlyArray<PatternSeason>;
  snubRule?: boolean;
}): SeasonPatterns[] {
  return [...input.seasons]
    .filter((s) => s.year >= PICKS_FROM && seasonPatternState(s) === "nominations")
    .sort((a, b) => a.year - b.year)
    .map((s) => analyzeSeason({ ...input, year: s.year }))
    .filter((a): a is SeasonPatterns => a !== null);
}

export type MissRow = { year: number; film: FilmPatterns };

/** The shortlisted films that missed, across past seasons: most nominations first, then strong awards, then the latest. */
export function mostAwardedMisses(past: readonly SeasonPatterns[], limit = MOST_AWARDED_MISSES): MissRow[] {
  return past
    .flatMap((a) => a.films.filter((f) => f.nominated === false).map((film) => ({ year: a.year, film })))
    .sort(
      (a, b) =>
        b.film.nominations - a.film.nominations ||
        b.film.strongAwards.length - a.film.strongAwards.length ||
        b.year - a.year ||
        a.film.title.localeCompare(b.film.title),
    )
    .slice(0, limit);
}

/** Flagged films (any Snub risk sign) in past seasons, and how many got in. */
export function flaggedRecord(past: readonly SeasonPatterns[]): Figure {
  const f = fig();
  for (const a of past) for (const film of a.films) if (film.snubRisk.length > 0) add(f, film.nominated === true);
  return f;
}

/** Underdogs among the nominees of past seasons: hits are underdogs, count the nominees. */
export function underdogRecord(past: readonly SeasonPatterns[]): Figure {
  const f = fig();
  for (const a of past) for (const film of a.films) if (film.nominated) add(f, film.underdog);
  return f;
}

export type Predictor =
  | { kind: "award"; category: string; result: "nominee" | "win" }
  | { kind: "country"; usOnly: boolean }
  | { kind: "pattern"; pattern: Pattern }
  | { kind: "snub-rule" };

export type PredictorGroup = "near-certain" | "all-round" | "wide-net" | "warning";
export const PREDICTOR_GROUPS: readonly PredictorGroup[] = ["near-certain", "all-round", "wide-net", "warning"];

export type PredictorRow = {
  key: string;
  predictor: Predictor;
  /** Of the shortlisted films that had it, the nominees. */
  gotIn: Figure;
  /** Of the nominees, those that had it. */
  caught: Figure;
};

export type BestPredictors = {
  /** The finished seasons counted. */
  seasons: number[];
  /** Nominees among every shortlisted film counted. */
  shortlist: Figure;
  /** The strong awards the patterns use, learned from all those seasons. */
  strong: string[];
  /** Each group's rows (at least `PREDICTOR_MIN_FILMS` films), in order; the rest aren't listed. */
  groups: { group: PredictorGroup; rows: PredictorRow[] }[];
};

const atLeast = (f: Figure, pct: number) => 100 * f.hits >= pct * f.count;

/** The group a predictor falls in (first match), or null. */
export function predictorGroup(row: PredictorRow, shortlist: Figure): PredictorGroup | null {
  const { gotIn, caught } = row;
  if (atLeast(gotIn, 85)) return "near-certain";
  if (atLeast(gotIn, 65) && atLeast(caught, 25)) return "all-round";
  if (atLeast(caught, 50)) return "wide-net";
  // Got in ≤ the shortlist's share + 5 points.
  if (100 * gotIn.hits * shortlist.count <= (100 * shortlist.hits + 5 * shortlist.count) * gotIn.count) return "warning";
  const p = row.predictor;
  if (p.kind === "snub-rule" || (p.kind === "pattern" && p.pattern.strong === 0 && p.pattern.usOnly === true)) return "warning";
  return null;
}

const share = (f: Figure) => f.hits / f.count;

/**
 * Every finished season together (shortlisted films, the same as-of rule): each award category's
 * nomination and win, US-only or not, the patterns (by the strong awards learned from all of them)
 * and the snub rule's films, with "got in" and "caught", in their groups.
 */
export function bestPredictors(input: { category: PatternCategory; seasons: ReadonlyArray<PatternSeason> }): BestPredictors {
  const { category } = input;
  const { years, reads } = historyReads(input.seasons, category, Infinity, true);
  const learned = learn(reads, category);
  const shortlist = learned.base;
  const rows = new Map<string, PredictorRow>();
  const tally = (key: string, predictor: Predictor, r: Read) => {
    if (!rows.has(key)) rows.set(key, { key, predictor, gotIn: fig(), caught: fig(0, shortlist.hits) });
    const row = rows.get(key)!;
    add(row.gotIn, r.nominated);
    if (r.nominated) row.caught.hits += 1;
  };
  for (const r of reads) {
    for (const [c, state] of r.results) {
      tally(`award:${c}:nominee`, { kind: "award", category: c, result: "nominee" }, r);
      if (state === "won") tally(`award:${c}:win`, { kind: "award", category: c, result: "win" }, r);
    }
    if (RULES[category].usSplit) tally(`country:${r.usOnly ? "us" : "not"}`, { kind: "country", usOnly: r.usOnly }, r);
    const pattern = patternOf(r, learned.strong, category);
    tally(`pattern:${patternKey(pattern)}`, { kind: "pattern", pattern }, r);
    if (snubbed(r, category)) tally("snub-rule", { kind: "snub-rule" }, r);
  }
  const groups = PREDICTOR_GROUPS.map((group) => ({ group, rows: [] as PredictorRow[] }));
  for (const row of rows.values()) {
    if (row.gotIn.count < PREDICTOR_MIN_FILMS) continue;
    const group = predictorGroup(row, shortlist);
    if (group) groups.find((g) => g.group === group)!.rows.push(row);
  }
  for (const g of groups) {
    g.rows.sort((a, b) => {
      const got = share(b.gotIn) - share(a.gotIn);
      const caught = share(b.caught) - share(a.caught);
      const order =
        g.group === "warning" ? -got || b.gotIn.count - a.gotIn.count : g.group === "wide-net" ? caught || got : got || caught;
      return order || a.key.localeCompare(b.key);
    });
  }
  return { seasons: years, shortlist, strong: [...learned.strong].sort(), groups };
}
