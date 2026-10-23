// The accuracy page's backtest (guide §8.5, plan §5.3): for every finished season, the app's
// eve-of-ceremony favourite and how it did, and how many of the Oscar nominees were in the top
// slots on the eve of the nominations. Pure, shared by the page and its tests.
import { nominationSlots, type OscarCategory } from "@/lib/predict";

export type BacktestFilm = { id: number; title: string; slug: string; flags: string[] };

/** What the database gives for one finished season of one category. */
export type SeasonInput = {
  year: number;
  /** The film(s) that won the Oscar (a tie has two). */
  winners: BacktestFilm[];
  /** Every Oscar nominee's movie ID (the winner included). */
  nomineeIds: number[];
  /** The `eve_ceremony` prediction's first row; null when none is stored. */
  favourite: { film: BacktestFilm; pWin: number } | null;
  /** The `eve_nominations` prediction: each contender's chance to be nominated, null when none is stored. */
  eveNominations: Array<{ movieId: number; pNominate: number; rank: number }> | null;
};

export type SeasonRow = {
  year: number;
  /** Null when no prediction is stored for the season. */
  favourite: { film: BacktestFilm; pWin: number } | null;
  /** "won", or the film(s) it lost to. */
  result: { kind: "won" } | { kind: "lost"; to: BacktestFilm[] } | null;
  /** Nominees among the top slots on the eve of the nominations; null when none is stored. */
  topSlots: { hits: number; slots: number } | null;
};

export type Backtest = {
  rows: SeasonRow[];
  /** Seasons with a favourite stored, and how many of them it won. */
  favouriteWon: { hits: number; count: number };
  /** Nominees found in the top slots, over every season with an eve of nominations. */
  nominees: { hits: number; count: number };
};

/** The top slots by chance to be nominated (ties by rank): how many of them were nominated. */
export function topSlotHits(
  category: OscarCategory,
  year: number,
  nomineeIds: number[],
  eve: NonNullable<SeasonInput["eveNominations"]>,
): { hits: number; slots: number } {
  const slots = nominationSlots(category, year, nomineeIds.length);
  const nominees = new Set(nomineeIds);
  const top = [...eve].sort((a, b) => b.pNominate - a.pNominate || a.rank - b.rank).slice(0, slots);
  return { hits: top.filter((c) => nominees.has(c.movieId)).length, slots };
}

export function buildBacktest(category: OscarCategory, seasons: SeasonInput[]): Backtest {
  const rows = [...seasons]
    .sort((a, b) => b.year - a.year)
    .map((s): SeasonRow => {
      const won = s.favourite !== null && s.winners.some((w) => w.id === s.favourite!.film.id);
      return {
        year: s.year,
        favourite: s.favourite,
        result: s.favourite === null ? null : won ? { kind: "won" } : { kind: "lost", to: s.winners },
        topSlots: s.eveNominations === null ? null : topSlotHits(category, s.year, s.nomineeIds, s.eveNominations),
      };
    });
  const withFavourite = rows.filter((r) => r.favourite !== null);
  const withSlots = rows.filter((r) => r.topSlots !== null);
  return {
    rows,
    favouriteWon: { hits: withFavourite.filter((r) => r.result?.kind === "won").length, count: withFavourite.length },
    nominees: {
      hits: withSlots.reduce((n, r) => n + r.topSlots!.hits, 0),
      count: withSlots.reduce((n, r) => n + r.topSlots!.slots, 0),
    },
  };
}

/**
 * One standard error of a hit rate over `n` seasons, in points, at its widest (a coin flip):
 * 14 seasons give ±13. The plain-words "normal noise" of a short history.
 */
export function noisePoints(n: number): number | null {
  return n === 0 ? null : Math.round(Math.sqrt(0.25 / n) * 100);
}

/** "Lost to CODA", "Lost to A and B". */
export function lostTo(films: Array<{ title: string }>): string {
  const titles = films.map((f) => f.title);
  const list = titles.length <= 1 ? (titles[0] ?? "the winner") : `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
  return `Lost to ${list}`;
}
