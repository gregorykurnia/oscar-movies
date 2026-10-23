// What the data coverage page reads (guide §8.9): every edition's status, the film count and the last
// score refresh. Cached under `awards` and `scores`; the stale-score check runs per request on the
// cached date. See `films.ts` for the query/cached pairing.
import { desc, eq, gte, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { awards, dataLoads, editions, movies } from "@/db/schema";
import type { EditionStatusRow } from "@/lib/coverage";
import type { ReadDb } from "./films";

export type CoverageData = {
  editions: EditionStatusRow[];
  films: number;
  /** The last score refresh (ISO), or null before the first. */
  scoresAt: string | null;
  /** Films whose scores were checked on that refresh's day (UTC). */
  scoresFilms: number;
};

export async function queryCoverage(db: ReadDb): Promise<CoverageData> {
  const editionRows = await db
    .select({ slug: awards.slug, year: editions.year, status: editions.status })
    .from(editions)
    .innerJoin(awards, eq(awards.id, editions.awardId));
  const [{ films }] = await db.select({ films: sql<number>`count(*)::int` }).from(movies);
  const [last] = await db
    .select({ loadedAt: dataLoads.loadedAt })
    .from(dataLoads)
    .where(eq(dataLoads.kind, "scores"))
    .orderBy(desc(dataLoads.loadedAt))
    .limit(1);
  let scoresFilms = 0;
  if (last) {
    const day = new Date(last.loadedAt).toISOString().slice(0, 10);
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(movies)
      .where(gte(movies.scoresCheckedAt, sql`${day}::date`));
    scoresFilms = n;
  }
  return {
    editions: editionRows,
    films,
    scoresAt: last ? new Date(last.loadedAt).toISOString() : null,
    scoresFilms,
  };
}

/** Cached `queryCoverage`. */
export async function getCoverage(): Promise<CoverageData> {
  "use cache";
  cacheTag("awards", "scores");
  cacheLife("max");
  return queryCoverage(getDb());
}
