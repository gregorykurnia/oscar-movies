// The year grid's data (plan §5.7): every result in one Oscar category's mapped award categories in
// a film year, shaped into columns and films by `src/lib/year-grid.ts`. Cached under `awards` and
// `scores` (rows carry the average); see `films.ts` for the query/cached pairing.
import { and, asc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { awardCategories, awards, editions, movies, results } from "@/db/schema";
import { AWARDS } from "@/lib/awards";
import type { RaceCategory } from "@/lib/race";
import { gridColumns, gridFilms, type YearGrid } from "@/lib/year-grid";
import { queryYearEditions } from "./awards";
import { filmColumns, toFilmRow, type ReadDb } from "./films";

export async function queryYearGrid(db: ReadDb, year: number, category: RaceCategory): Promise<YearGrid> {
  const [yearEditions, rows] = await Promise.all([
    queryYearEditions(db, year),
    db
      .select({
        ...filmColumns,
        awardSlug: awards.slug,
        category: awardCategories.name,
        outcome: results.outcome,
        country: results.country,
      })
      .from(results)
      .innerJoin(editions, eq(editions.id, results.editionId))
      .innerJoin(awards, eq(awards.id, editions.awardId))
      .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
      .innerJoin(movies, eq(movies.id, results.movieId))
      .where(and(eq(editions.year, year), eq(awardCategories.oscarCategory, category)))
      // The award's own category order decides which name a tied cell shows.
      .orderBy(asc(awardCategories.sortOrder), asc(awardCategories.id)),
  ]);
  return {
    columns: gridColumns(AWARDS, category, yearEditions),
    films: gridFilms(
      rows.map(({ awardSlug, category: name, outcome, country, ...film }) => ({
        film: toFilmRow(film),
        awardSlug,
        category: name,
        outcome,
        country,
      })),
      category,
    ),
  };
}

/** Cached `queryYearGrid`. */
export async function getYearGrid(year: number, category: RaceCategory): Promise<YearGrid> {
  "use cache";
  cacheTag("awards", "scores");
  cacheLife("max");
  return queryYearGrid(getDb(), year, category);
}
