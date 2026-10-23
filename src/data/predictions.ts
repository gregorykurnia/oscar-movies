// The race's chances (IMPLEMENTATION_PLAN.md §5.3): one category's stored predictions for a year
// and snapshot, with their films, and how many precursor awards have announced results (for
// "Early"). Computed by `scripts/compute.ts`; pages only read. Cached under `awards` (a load
// recomputes them) and `scores` (rows carry scores); see `films.ts` for the query/cached pairing.
import { and, asc, countDistinct, eq, inArray, ne } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { awardCategories, awards, editions, movies, predictions, results } from "@/db/schema";
import type { Why } from "@/lib/predict/types";
import type { Chance, RaceSnapshot } from "@/lib/race-chances";
import { filmColumns, toFilmRow, type FilmRowData, type ReadDb } from "./films";
import type { OscarCategory } from "./oscars";

export type RacePrediction = { film: FilmRowData } & Chance;

export async function queryRacePredictions(
  db: ReadDb,
  year: number,
  category: OscarCategory,
  snapshot: RaceSnapshot,
): Promise<RacePrediction[]> {
  const rows = await db
    .select({ ...filmColumns, pWin: predictions.pWin, pNominate: predictions.pNominate, rank: predictions.rank, why: predictions.why })
    .from(predictions)
    .innerJoin(movies, eq(movies.id, predictions.movieId))
    .where(and(eq(predictions.year, year), eq(predictions.oscarCategory, category), eq(predictions.snapshot, snapshot)))
    .orderBy(asc(predictions.rank));
  return rows.map(({ pWin, pNominate, rank, why, ...film }) => ({ film: toFilmRow(film), pWin, pNominate, rank, why: why as Why }));
}

/** Cached `queryRacePredictions`: the category's contenders by rank, empty when none are stored. */
export async function getRacePredictions(year: number, category: OscarCategory, snapshot: RaceSnapshot): Promise<RacePrediction[]> {
  "use cache";
  cacheTag("awards", "scores");
  cacheLife("max");
  return queryRacePredictions(getDb(), year, category, snapshot);
}

/**
 * How many precursor awards have a win or nomination in the category that film year: the
 * engine's "Early" (fewer than 3) for the live snapshot, which counts every loaded result.
 */
export async function queryPrecursorAwardCount(db: ReadDb, year: number, category: OscarCategory): Promise<number> {
  const [row] = await db
    .select({ n: countDistinct(editions.awardId) })
    .from(results)
    .innerJoin(editions, eq(editions.id, results.editionId))
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
    .where(
      and(
        eq(editions.year, year),
        ne(awards.kind, "oscars"),
        eq(awardCategories.oscarCategory, category),
        inArray(results.outcome, ["won", "nominated", "runner_up"]),
      ),
    );
  return row?.n ?? 0;
}

/** Cached `queryPrecursorAwardCount`. */
export async function getPrecursorAwardCount(year: number, category: OscarCategory): Promise<number> {
  "use cache";
  cacheTag("awards");
  cacheLife("max");
  return queryPrecursorAwardCount(getDb(), year, category);
}
