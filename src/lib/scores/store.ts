// The batch's database side (plan §5.4). Works on the app's HTTP client (the cron route) and
// the scripts' WebSocket client: every write is one statement, so no transaction is needed.
import { and, asc, between, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../db/schema";
import { dataLoads, movies } from "../../db/schema";
import { LIVE_YEAR } from "../years";
import type { QueueFilm, QueueOptions, RunSummary, ScoreStore } from "./batch";
import type { ScoreUpdate } from "./merge";

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const DAY_MS = 86_400_000;
/** Current- and previous-season films are rechecked after 7 days, older ones after 30. */
export const RECHECK_DAYS = { recent: 7, older: 30 } as const;

export function createScoreStore(db: Db, gitCommit: string | null = null): ScoreStore {
  return {
    async queue({ now, years }: QueueOptions): Promise<QueueFilm[]> {
      const recentFrom = LIVE_YEAR - 1;
      const isRecent = gte(movies.year, recentFrom);
      // `--year` asks for those films whatever their age; the daily run takes only the due ones.
      const where = years
        ? between(movies.year, years.from, years.to)
        : or(
            isNull(movies.scoresCheckedAt),
            and(isRecent, lt(movies.scoresCheckedAt, new Date(now.getTime() - RECHECK_DAYS.recent * DAY_MS))),
            and(lt(movies.year, recentFrom), lt(movies.scoresCheckedAt, new Date(now.getTime() - RECHECK_DAYS.older * DAY_MS))),
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
          // Never checked first, then the current and previous seasons, then the longest waiting.
          sql`${movies.scoresCheckedAt} is null desc`,
          sql`${isRecent} desc`,
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
