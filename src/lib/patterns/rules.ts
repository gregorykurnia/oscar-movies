// The nomination patterns' settings (IMPLEMENTATION_PLAN.md Phase 8 notes): the numbers and the
// award categories each rule names. One home, so 8.3's findings change only this file.
import type { OscarCategory } from "../predict";

/** The categories with a shortlist the patterns read. */
export type PatternCategory = Extract<OscarCategory, "documentary" | "international">;

export const PATTERN_CATEGORIES: readonly PatternCategory[] = ["documentary", "international"];

/** The first season the patterns learn from. */
export const FIRST_SEASON = 2012;
/** The first season with a pick ("Pick #k") and a backtest row: earlier ones have too little history. */
export const PICKS_FROM = 2015;
/** Smoothing: `(hits + PRIOR·base) / (count + PRIOR)`. */
export const PRIOR = 5;
/** A strong award: at least this many shortlisted films it nominated (or more) in earlier seasons… */
export const STRONG_MIN_FILMS = 6;
/** …and a smoothed rate of at least 60% (as a fraction: 6 / 10, for whole-number comparisons). */
export const STRONG_RATE = { num: 6, den: 10 } as const;
/** Patterns count strong awards up to 3 ("3+"). */
export const STRONG_CAP = 3;
/** The busy films: the season's five most-nominated (ties at fifth included). */
export const BUSY = 5;
/** Outside chances: the three ranks after the slots, in a season without its nominations. */
export const OUTSIDE = 3;
/** A miss with this many nominations and no strong award gets the "did no better" reason. */
export const WEAK_MIN_NOMINATIONS = 4;
/** An underdog: a nominee with at most this many strong awards. */
export const UNDERDOG_MAX_STRONG = 1;
/** A sign's figure under this many films adds "few films". */
export const FEW_FILMS = 5;
/** Best predictors: shown when at least this many films had it. */
export const PREDICTOR_MIN_FILMS = 6;
/** The most-awarded misses across all years: how many the page lists. */
export const MOST_AWARDED_MISSES = 10;

const SPIRIT = "spirit-awards/documentary";
const IDA_FEATURE = "ida/feature";
const DGA = "dga/documentary";
const CINEMA_EYE_FEATURE = "cinema-eye/feature";
const BIG_CRITICS = ["new-york-critics/documentary", "los-angeles-critics/documentary", "national-society/documentary"];

/** A Snub risk sign (shown from the shortlist on). */
export type SnubSign = "busy" | "sweep";

export type CategoryRules = {
  /** Patterns split by US-only (countries exactly `["US"]`) or not. */
  usSplit: boolean;
  /**
   * The snub rule: a busy film with none of these nominations is marked down to how such films
   * did before. Also Snub risk sign "busy". Null: no snub rule.
   */
  snubRule: { without: readonly string[] } | null;
  /** The "a filmmakers' group nominated it" reason, for a film outside the busy five. Null: none. */
  filmmakers: readonly string[] | null;
  /** Snub risk sign "sweep": nominated by `min` of `critics`, and by none of `without`. */
  sweep: { critics: readonly string[]; min: number; without: readonly string[] } | null;
  /** The Snub risk signs shown (task 8.3 adds International's if one holds there). */
  signs: readonly SnubSign[];
};

export const RULES: Record<PatternCategory, CategoryRules> = {
  documentary: {
    usSplit: true,
    snubRule: { without: [SPIRIT, IDA_FEATURE] },
    filmmakers: [DGA, CINEMA_EYE_FEATURE, SPIRIT],
    sweep: { critics: BIG_CRITICS, min: 2, without: [DGA, CINEMA_EYE_FEATURE, IDA_FEATURE] },
    signs: ["busy", "sweep"],
  },
  international: {
    usSplit: false,
    snubRule: null,
    filmmakers: null,
    sweep: null,
    signs: [],
  },
};
