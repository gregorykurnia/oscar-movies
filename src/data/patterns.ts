// The nomination patterns' data (IMPLEMENTATION_PLAN.md Phase 8 notes): one read per category of
// the seasons the prediction engine reads, plus each film's title, countries, slug and flag,
// worked out by `src/lib/patterns`. Cached under `awards` and `scores` (rows carry scores); `today` is an argument as in
// `accuracy.ts` (it decides which seasons are finished). See `films.ts` for the query/cached pairing.
import { eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { awardCategories, awards, editions, movies, results } from "@/db/schema";
import type { Figure } from "@/lib/accuracy";
import {
  analyzeSeason,
  backtestOf,
  bestPredictors,
  flaggedRecord,
  mostAwardedMisses,
  patternSeasons,
  PICKS_FROM,
  underdogRecord,
  type BestPredictors,
  type MissRow,
  type PatternCategory,
  type PatternsBacktest,
  type PatternSeason,
  type SeasonPatterns,
} from "@/lib/patterns";
import { buildSeasons, type OscarDates } from "@/lib/predict";
import { engineBacktest, type EngineBacktest } from "@/lib/predict/method";
import { filmColumns, toFilmRow, type FilmRowData, type ReadDb } from "./films";

/** A film the patterns name: its row (title, flag, scores) and link. */
export type PatternFilmLink = FilmRowData;

/** A season's Oscar dates and, once it is out, its winner. */
export type PatternSeasonInfo = { dates: OscarDates; winner: number | null };

export type PatternsData = {
  category: PatternCategory;
  /** Every season the patterns can work out (from earlier seasons only), oldest first. */
  seasons: SeasonPatterns[];
  /** The seasons from `PICKS_FROM` with their nominees: the five it picked against the real five. */
  backtest: PatternsBacktest;
  /** Every finished season together. */
  predictors: BestPredictors;
  /** The shortlisted films that missed with the most nominations, across the backtest's seasons. */
  misses: MissRow[];
  /** Films flagged Snub risk in the backtest's seasons, and how many got in. */
  flagged: Figure;
  /** Underdogs among those seasons' nominees. */
  underdogs: Figure;
  /** The app's current method's picks for the same seasons as `backtest` (each from earlier seasons only), for the strip. */
  engineBacktest: EngineBacktest;
  /** Each season's Oscar dates and winner, by year. */
  info: Record<number, PatternSeasonInfo>;
  /** Every film in `seasons`, by id. */
  films: Record<number, PatternFilmLink>;
};

/** The category's seasons as the patterns read them (every film with a result in it, with title and countries). */
export async function queryPatternSeasons(
  db: ReadDb,
  category: PatternCategory,
  today: string,
): Promise<{ seasons: PatternSeason[]; films: Record<number, PatternFilmLink> }> {
  const filmIds = db
    .select({ movieId: results.movieId })
    .from(results)
    .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
    .where(eq(awardCategories.oscarCategory, category))
    .groupBy(results.movieId)
    .as("film_ids");
  const [awardRows, categoryRows, editionRows, resultRows, movieRows] = await Promise.all([
    db.select({ id: awards.id, kind: awards.kind, slug: awards.slug }).from(awards),
    db
      .select({ id: awardCategories.id, awardId: awardCategories.awardId, slug: awardCategories.slug, oscarCategory: awardCategories.oscarCategory })
      .from(awardCategories)
      .where(eq(awardCategories.oscarCategory, category)),
    db
      .select({
        id: editions.id,
        awardId: editions.awardId,
        year: editions.year,
        status: editions.status,
        shortlistOn: editions.shortlistOn,
        nominationsOn: editions.nominationsOn,
        winnersOn: editions.winnersOn,
      })
      .from(editions),
    db
      .select({ editionId: results.editionId, categoryId: results.categoryId, movieId: results.movieId, outcome: results.outcome })
      .from(results)
      .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
      .where(eq(awardCategories.oscarCategory, category)),
    db.select(filmColumns).from(movies).innerJoin(filmIds, eq(filmIds.movieId, movies.id)),
  ]);
  const seasons = patternSeasons(
    buildSeasons({ awardRows, categoryRows, editionRows, resultRows }, category, today),
    new Map(movieRows.map((m) => [m.id, m])),
  );
  const films: Record<number, PatternFilmLink> = {};
  for (const m of movieRows) films[m.id] = toFilmRow(m);
  return { seasons, films };
}

/** Everything the patterns show for a category, worked out from `queryPatternSeasons`. */
export async function queryPatterns(db: ReadDb, category: PatternCategory, today: string): Promise<PatternsData> {
  const { seasons: input, films } = await queryPatternSeasons(db, category, today);
  const seasons = input
    .map((s) => analyzeSeason({ category, year: s.year, seasons: input }))
    .filter((a): a is SeasonPatterns => a !== null);
  const past = seasons.filter((s) => s.year >= PICKS_FROM && s.state === "nominations");
  const named = new Set(seasons.flatMap((s) => s.films.map((f) => Number(f.movie))));
  const backtested = backtestOf(past);
  return {
    category,
    seasons,
    backtest: backtested,
    engineBacktest: engineBacktest({ category, seasons: input, years: backtested.rows.map((r) => r.year) }),
    info: Object.fromEntries(
      input.map((s) => {
        const winner = s.films.find((f) => f.oscar === "won");
        return [s.year, { dates: s.oscar, winner: winner ? Number(winner.movie) : null }];
      }),
    ),
    predictors: bestPredictors({ category, seasons: input }),
    misses: mostAwardedMisses(past),
    flagged: flaggedRecord(past),
    underdogs: underdogRecord(past),
    films: Object.fromEntries(Object.entries(films).filter(([id]) => named.has(Number(id)))),
  };
}

/** Cached `queryPatterns`: one read per category (and day). */
export async function getPatterns(category: PatternCategory, today: string): Promise<PatternsData> {
  "use cache";
  cacheTag("awards", "scores");
  cacheLife("max");
  return queryPatterns(getDb(), category, today);
}
