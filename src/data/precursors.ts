// What each film in a race category did at the other awards (guide §6.5's precursor line): per
// film, the awards it won and was nominated for in the same film year, in categories that count
// towards the Oscar category. Cached under `awards`; see `films.ts` for the query/cached pairing.
import { and, eq, inArray, ne } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { awardCategories, awards, editions, results } from "@/db/schema";
import { precursorLine, type PrecursorLine, type PrecursorResult } from "@/lib/movie-awards";
import type { ReadDb } from "./films";
import type { OscarCategory } from "./oscars";

/** A film's precursor line, by film id: films with no win or nomination elsewhere have none. */
export type RacePrecursors = Array<{ movieId: number } & PrecursorLine>;

export async function queryRacePrecursors(db: ReadDb, year: number, category: OscarCategory): Promise<RacePrecursors> {
  const rows = await db
    .select({
      movieId: results.movieId,
      shortName: awards.shortName,
      kind: awards.kind,
      calendarOrder: awards.calendarOrder,
      isSelection: awards.isSelection,
      outcome: results.outcome,
    })
    .from(results)
    .innerJoin(editions, eq(editions.id, results.editionId))
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
    .where(
      and(
        eq(editions.year, year),
        ne(awards.kind, "oscars"),
        eq(awardCategories.oscarCategory, category),
        inArray(results.outcome, ["won", "nominated"]),
      ),
    );
  const byFilm = new Map<number, PrecursorResult[]>();
  for (const { movieId, ...r } of rows) {
    byFilm.set(movieId, [...(byFilm.get(movieId) ?? []), { ...r, kind: r.kind as PrecursorResult["kind"] }]);
  }
  return [...byFilm].map(([movieId, list]) => ({ movieId, ...precursorLine(list) }));
}

/** Cached `queryRacePrecursors`. */
export async function getRacePrecursors(year: number, category: OscarCategory): Promise<RacePrecursors> {
  "use cache";
  cacheTag("awards");
  cacheLife("max");
  return queryRacePrecursors(getDb(), year, category);
}
