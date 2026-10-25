// The strong signals page's data (plan Phase 7 notes, guide §8.13): the accuracy rows, each strong
// award category's edition of the year with its results, the films and their Oscar outcome that
// year, put together by `buildSignals`. Cached under `awards` and `scores` (rows carry scores);
// `today` is an argument as in `accuracy.ts`. See `films.ts` for the query/cached pairing.
import { and, eq, inArray, ne } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { awardCategories, awards, editions, movies, results } from "@/db/schema";
import { buildSignals, strongKinds, type SignalEdition, type Signals } from "@/lib/signals";
import type { Outcome } from "@/lib/stage";
import { queryAccuracy } from "./accuracy";
import { filmColumns, toFilmRow, type FilmRowData, type ReadDb } from "./films";
import { queryOscarResults, type OscarCategory } from "./oscars";

export type SignalsData = Signals<FilmRowData>;

/** The strong awards of an Oscar category and the films they picked in a film year, both views. */
export async function querySignals(db: ReadDb, category: OscarCategory, year: number, today: string): Promise<SignalsData> {
  const { rows } = await queryAccuracy(db, category, today);
  const strong = rows.filter((r) => strongKinds(r).length > 0);
  if (strong.length === 0) return buildSignals({ rows, editions: new Map(), films: new Map(), oscar: new Map(), today });

  const key = (awardSlug: string, categorySlug: string) => `${awardSlug}/${categorySlug}`;
  const strongAwards = [...new Set(strong.map((r) => r.key.split("/")[0]))];

  const [editionRows, resultRows, oscars] = await Promise.all([
    db
      .select({
        awardSlug: awards.slug,
        status: editions.status,
        nominationsOn: editions.nominationsOn,
        winnersOn: editions.winnersOn,
      })
      .from(editions)
      .innerJoin(awards, eq(awards.id, editions.awardId))
      .where(and(eq(editions.year, year), inArray(awards.slug, strongAwards))),
    db
      .select({ ...filmColumns, awardSlug: awards.slug, categorySlug: awardCategories.slug, outcome: results.outcome })
      .from(results)
      .innerJoin(editions, eq(editions.id, results.editionId))
      .innerJoin(awards, eq(awards.id, editions.awardId))
      .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
      .innerJoin(movies, eq(movies.id, results.movieId))
      .where(
        and(
          eq(editions.year, year),
          eq(awardCategories.oscarCategory, category),
          inArray(awards.slug, strongAwards),
          ne(awards.kind, "oscars"),
        ),
      ),
    queryOscarResults(db, year, category, "submitted"),
  ]);

  const listed = new Map<string, { movieId: number; outcome: Outcome }[]>();
  const films = new Map<number, FilmRowData>();
  for (const { awardSlug, categorySlug, outcome, ...film } of resultRows) {
    const k = key(awardSlug, categorySlug);
    listed.set(k, [...(listed.get(k) ?? []), { movieId: film.id, outcome }]);
    if (!films.has(film.id)) films.set(film.id, toFilmRow(film));
  }
  const signalEditions = new Map<string, SignalEdition>();
  for (const r of strong) {
    const e = editionRows.find((row) => row.awardSlug === r.key.split("/")[0]);
    if (e) signalEditions.set(r.key, { ...e, results: listed.get(r.key) ?? [] });
  }

  return buildSignals({
    rows,
    editions: signalEditions,
    films,
    oscar: new Map(oscars.map((e) => [e.film.id, e.outcome])),
    today,
  });
}

/** Cached `querySignals`. */
export async function getSignals(category: OscarCategory, year: number, today: string): Promise<SignalsData> {
  "use cache";
  cacheTag("awards", "scores");
  cacheLife("max");
  return querySignals(getDb(), category, year, today);
}
