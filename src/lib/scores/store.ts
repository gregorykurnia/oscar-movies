// The batch's database side (plan §5.4). Works on the app's HTTP client (the cron route) and
// the scripts' WebSocket client: every write is one statement, so no transaction is needed.
import { and, asc, between, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../db/schema";
import { dataLoads, movies } from "../../db/schema";
import { refreshFromYear, type QueueFilm, type QueueOptions, type RunSummary, type ScoreStore } from "./batch";
import type { ScoreUpdate } from "./merge";

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const HOUR_MS = 3_600_000;
/**
 * Films in the refresh window (`refreshFromYear`) are rechecked daily: due again 20 hours after a
 * check. `vercel.json` runs the batch five times a day (each anywhere in its hour), oldest check
 * first, so a run never retakes a film checked earlier that day and each film comes round once.
 */
export const RECHECK_HOURS = 20;

export function createScoreStore(db: Db, gitCommit: string | null = null): ScoreStore {
  return {
    async queue({ now, years, ids }: QueueOptions): Promise<QueueFilm[]> {
      // `ids` and `--year` ask for those films whatever their age; the daily run takes only the
      // never-checked films (any year) and the window's films checked before the last run.
      const where = ids
        ? inArray(movies.id, ids)
        : years
          ? between(movies.year, years.from, years.to)
          : or(
              isNull(movies.scoresCheckedAt),
              and(
                gte(movies.year, refreshFromYear(now)),
                lt(movies.scoresCheckedAt, new Date(now.getTime() - RECHECK_HOURS * HOUR_MS)),
              ),
            );
      return db
        .select({
          id: movies.id,
          imdbId: movies.imdbId,
          tmdbId: movies.tmdbId,
          year: movies.year,
          scoresCheckedAt: movies.scoresCheckedAt,
          imdbRating: movies.imdbRating,
          rtScore: movies.rtScore,
          mcScore: movies.mcScore,
          tmdbScore: movies.tmdbScore,
        })
        .from(movies)
        .where(where)
        .orderBy(
          // Never checked first, then the longest waiting.
          sql`${movies.scoresCheckedAt} is null desc`,
          asc(movies.scoresCheckedAt),
          desc(movies.year),
          asc(movies.id),
        );
    },

    async save(movieId: number, update: ScoreUpdate) {
      await db.update(movies).set(update).where(eq(movies.id, movieId));
    },

    async record(summary: RunSummary) {
      await db.insert(dataLoads).values({ kind: "scores", summary, gitCommit });
    },
  };
}
