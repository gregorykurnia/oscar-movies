// The year grid's data (plan §5.7): every result in one Oscar category's mapped award categories in
// a film year, shaped into columns and films by `src/lib/year-grid.ts`. Cached under `awards` and
// `scores` (rows carry the average); see `films.ts` for the query/cached pairing.
import { and, asc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { awardCategories, awards, editions, movies, results } from "@/db/schema";
import { AWARDS } from "@/lib/awards";
import { gridColumns, gridFilms, splitAwards, type GridCategory, type YearGrid } from "@/lib/year-grid";
import { queryAwardsWithData, queryYearEditions } from "./awards";
import { filmColumns, toFilmRow, type ReadDb } from "./films";

export async function queryYearGrid(db: ReadDb, year: number, category: GridCategory): Promise<YearGrid> {
  const [yearEditions, withData, categories, rows] = await Promise.all([
    queryYearEditions(db, year),
    queryAwardsWithData(db),
    // Every award's categories in this one, for the awards split into a column each (none in "all").
    category === "all"
      ? []
      : db
          .select({ awardSlug: awards.slug, slug: awardCategories.slug, name: awardCategories.name })
          .from(awardCategories)
          .innerJoin(awards, eq(awards.id, awardCategories.awardId))
          .where(eq(awardCategories.oscarCategory, category))
          .orderBy(asc(awardCategories.sortOrder), asc(awardCategories.id)),
    db
      .select({
        ...filmColumns,
        awardSlug: awards.slug,
        category: awardCategories.name,
        categorySlug: awardCategories.slug,
        outcome: results.outcome,
      })
      .from(results)
      .innerJoin(editions, eq(editions.id, results.editionId))
      .innerJoin(awards, eq(awards.id, editions.awardId))
      .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
      .innerJoin(movies, eq(movies.id, results.movieId))
      .where(and(eq(editions.year, year), category === "all" ? undefined : eq(awardCategories.oscarCategory, category)))
      // The award's own category order decides which name a tied cell shows.
      .orderBy(asc(awardCategories.sortOrder), asc(awardCategories.id)),
  ]);
  return {
    columns: gridColumns(AWARDS, category, yearEditions, withData, categories),
    films: gridFilms(
      rows.map(({ awardSlug, category: name, categorySlug, outcome, ...film }) => ({
        film: toFilmRow(film),
        awardSlug,
        category: name,
        categorySlug,
        outcome,
      })),
      splitAwards(category, categories),
    ),
  };
}

/** Cached `queryYearGrid`. */
export async function getYearGrid(year: number, category: GridCategory): Promise<YearGrid> {
  "use cache";
  cacheTag("awards", "scores");
  cacheLife("max");
  return queryYearGrid(getDb(), year, category);
}
