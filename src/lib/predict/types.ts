// The prediction engine's input and output (IMPLEMENTATION_PLAN.md §5.3). `scripts/compute.ts`
// (task 3.2) reads the database into `Season`s for one Oscar category; the engine never reads it.
import type { Outcome } from "../stage";

export type OscarCategory = "picture" | "documentary" | "international" | "animated";

/** A film, as whatever key the caller matches on (a movie ID in the app, a name in tests). */
export type MovieKey = string | number;

/** One result at an award category mapped to the Oscar category, with its edition's dates. */
export type PrecursorResult = {
  /** The award (one edition per award per season), e.g. "bafta". Counted for "Early". */
  award: string;
  /** The award category, e.g. "bafta/film": with the result, the feature a weight belongs to. */
  category: string;
  /** Only `won`, `nominated` and `runner_up` (a nomination) count. */
  outcome: Outcome;
  nominationsOn: string | null;
  winnersOn: string | null;
};

/** A film with any result in the Oscar category that season, at a precursor or the Oscars. */
export type SeasonFilm = {
  movie: MovieKey;
  results: ReadonlyArray<PrecursorResult>;
  /**
   * Its furthest Oscar outcome in the category that season (null: none). The engine reads it only
   * as far as the snapshot's date shows it (`oscarStatusAsOf`), and as the answer for history.
   */
  oscar: Outcome | null;
};

export type OscarDates = { shortlistOn: string | null; nominationsOn: string | null; winnersOn: string | null };

/** One season of one Oscar category. */
export type Season = {
  year: number;
  /** Oscar winner known and the ceremony over (`finishedYears` in `accuracy.ts`): counts as history. */
  finished: boolean;
  /** Nomination slots: `nominationSlots`. */
  slots: number;
  oscar: OscarDates;
  films: ReadonlyArray<SeasonFilm>;
};

/**
 * `live` uses every loaded result (`today` lines the history up with the same point of the
 * season); the eves use only results announced before the day before the Oscar nominations or
 * ceremony.
 */
export type Snapshot = { kind: "live"; today: string } | { kind: "eve_nominations" } | { kind: "eve_ceremony" };

/** Before the Oscar nominations (contenders, % to be nominated) or after (the nominees only). */
export type Phase = "before" | "after";

/** A precursor result as of a date: a win replaces the nomination for the same award category. */
export type ResultState = "won" | "nominated";

/** A film's Oscar status as of a date. `eligible` is the eligible list, or International's "not shortlisted". */
export type OscarStatus = "submitted" | "eligible" | "shortlisted" | "nominated" | "won";

/** One line of the "why": a result, its weight and its record ("won the Oscar 5 of 13"). */
export type WhyResult = {
  category: string;
  result: ResultState;
  weight: number;
  /** Past contenders with this result who won the Oscar, of `count`. */
  hits: number;
  count: number;
};

/** Past contenders with the same top two results, and how many won. */
export type SimilarRun = {
  count: number;
  won: number;
  films: Array<{ movie: MovieKey; year: number; won: boolean }>;
};

/** Stored as `predictions.why` (jsonb). */
export type Why = { top: WhyResult[]; similar: SimilarRun | null };

export type ContenderPrediction = {
  movie: MovieKey;
  /** 0–1; a category's add to 1. */
  pWin: number;
  /** 0–0.99; a category's add to its slots. Null after the nominations. */
  pNominate: number | null;
  /** 1 = favourite. */
  rank: number;
  /** Sum of the film's win weights. */
  score: number;
  why: Why;
};

export type CategoryPrediction = {
  year: number;
  phase: Phase;
  /** Fewer than 3 precursor awards announced: "Early: few results yet." */
  early: boolean;
  /** The finished seasons learned from (never `year`). */
  history: number[];
  params: {
    win: { alpha: number; temperature: number };
    nominate: { alpha: number; a: number; b: number } | null;
  };
  contenders: ContenderPrediction[];
};
