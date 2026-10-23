// The accuracy page's backtest (plan §5.3, guide §8.5): per finished season, the Oscar winner and
// nominees and the two eve snapshots stored by `scripts/compute.ts`. Cached under `awards`; see
// `films.ts` for the query/cached pairing.
import { and, asc, eq, inArray } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { awardCategories, awards, editions, movies, predictions, results } from "@/db/schema";
import { buildBacktest, type Backtest, type BacktestFilm, type SeasonInput } from "@/lib/backtest";
import { flagsFor } from "@/lib/stage";
import type { ReadDb } from "./films";
import type { OscarCategory } from "./oscars";

/** The backtest of the given finished seasons of one Oscar category. */
export async function queryBacktest(db: ReadDb, category: OscarCategory, seasons: number[]): Promise<Backtest> {
  if (seasons.length === 0) return buildBacktest(category, []);

  const oscar = await db
    .select({
      year: editions.year,
      movieId: results.movieId,
      outcome: results.outcome,
      country: results.country,
      title: movies.title,
      slug: movies.slug,
      countries: movies.countries,
    })
    .from(results)
    .innerJoin(editions, eq(editions.id, results.editionId))
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
    .innerJoin(movies, eq(movies.id, results.movieId))
    .where(and(eq(awards.kind, "oscars"), eq(awardCategories.oscarCategory, category), inArray(editions.year, seasons)));

  const stored = await db
    .select({
      year: predictions.year,
      snapshot: predictions.snapshot,
      movieId: predictions.movieId,
      pWin: predictions.pWin,
      pNominate: predictions.pNominate,
      rank: predictions.rank,
      title: movies.title,
      slug: movies.slug,
      countries: movies.countries,
    })
    .from(predictions)
    .innerJoin(movies, eq(movies.id, predictions.movieId))
    .where(
      and(
        eq(predictions.oscarCategory, category),
        inArray(predictions.year, seasons),
        inArray(predictions.snapshot, ["eve_ceremony", "eve_nominations"]),
      ),
    )
    .orderBy(asc(predictions.year), asc(predictions.rank));

  // International's flag is the submitting country first, as everywhere else.
  const submitted = new Map(oscar.filter((r) => r.country).map((r) => [`${r.year}/${r.movieId}`, r.country]));
  const film = (year: number, r: { movieId: number; title: string; slug: string; countries: string[] }): BacktestFilm => ({
    id: r.movieId,
    title: r.title,
    slug: r.slug,
    flags: flagsFor(r.countries, submitted.get(`${year}/${r.movieId}`)),
  });

  const inputs = seasons.map((year): SeasonInput => {
    const ceremony = stored.filter((r) => r.year === year && r.snapshot === "eve_ceremony");
    const eveNominations = stored.filter((r) => r.year === year && r.snapshot === "eve_nominations");
    const first = ceremony[0];
    return {
      year,
      winners: oscar.filter((r) => r.year === year && r.outcome === "won").map((r) => film(year, r)),
      nomineeIds: oscar
        .filter((r) => r.year === year && (r.outcome === "won" || r.outcome === "nominated" || r.outcome === "runner_up"))
        .map((r) => r.movieId),
      favourite: first ? { film: film(year, first), pWin: first.pWin } : null,
      eveNominations:
        eveNominations.length > 0
          ? eveNominations.map((r) => ({ movieId: r.movieId, pNominate: r.pNominate ?? 0, rank: r.rank }))
          : null,
    };
  });
  return buildBacktest(category, inputs);
}

/** Cached `queryBacktest`; the seasons come from the accuracy rows, so a new finished season is a new key. */
export async function getBacktest(category: OscarCategory, seasons: number[]): Promise<Backtest> {
  "use cache";
  cacheTag("awards");
  cacheLife("max");
  return queryBacktest(getDb(), category, seasons);
}
