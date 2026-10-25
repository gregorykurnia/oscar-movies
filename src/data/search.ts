// Search (plan §5.5): films by title or original title, awards and festivals by name. The film
// match runs in the database on `movies.search_key` (title and original title, lower case,
// accents off, with a trigram index); the awards list is about 80 rows, so it is read once,
// cached, and matched in `src/lib/search.ts`.
import { asc, eq, max, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { awardCategories, awards, editions, movies, results } from "@/db/schema";
import {
  escapeLike,
  escapeRegex,
  MAX_FILMS,
  normalizeQuery,
  type AwardKind,
  type SearchableAward,
  type SearchFilm,
} from "@/lib/search";
import { oscarStage, type Outcome } from "@/lib/stage";
import { primaryCountry } from "@/lib/flags";
import { submissionsColumn, type ReadDb } from "./films";

/** The Oscar categories as a result row names them, in the order a film lists them. */
const CATEGORY_LABELS: Record<string, string> = {
  picture: "Best Picture",
  international: "International",
  documentary: "Documentary",
  animated: "Animated",
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

/** Per film: its furthest Oscar outcome and the categories it appears in. */
function oscarSummary(db: ReadDb) {
  return db
    .select({
      movieId: results.movieId,
      // Postgres orders an enum by its declaration: submitted … won.
      stage: sql<Outcome>`max(${results.outcome})`.as("stage"),
      categories: sql<string>`string_agg(distinct ${awardCategories.oscarCategory}::text, ',')`.as("categories"),
      // Every eligible result is International's: a furthest stage of eligible reads Not nominated.
      eligibleOnlyInternational:
        sql<boolean>`bool_and(${results.outcome} <> 'eligible' or ${awardCategories.oscarCategory} = 'international')`.as(
          "eligible_only_international",
        ),
    })
    .from(results)
    .innerJoin(editions, eq(editions.id, results.editionId))
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
    .where(eq(awards.kind, "oscars"))
    .groupBy(results.movieId)
    .as("search_summary");
}

/**
 * The films whose title or original title has a word starting with the query (or nearly: a
 * trigram match for queries of four letters or more), best first: a title that starts with it,
 * then similarity, then how far the film went at the Oscars, then the title. At most eight.
 * `rawQuery` is whatever was typed.
 */
export async function querySearchFilms(db: ReadDb, rawQuery: string): Promise<SearchFilm[]> {
  const query = normalizeQuery(rawQuery);
  if (!query) return [];
  const key = movies.searchKey;
  const startsTitle = sql`${key} like ${escapeLike(query) + "%"}`;
  const startsWord = sql`${key} ~ ${"(^|[^[:alnum:]])" + escapeRegex(query)}`;
  const nearly = query.length >= 4 ? sql`${query} <% ${key}` : sql`false`;
  const summary = oscarSummary(db);
  const rows = await db
    .select({
      id: movies.id,
      slug: movies.slug,
      title: movies.title,
      originalTitle: movies.originalTitle,
      originalLang: movies.originalLang,
      year: movies.year,
      countries: movies.countries,
      submissions: submissionsColumn,
      stage: summary.stage,
      categories: summary.categories,
      eligibleOnlyInternational: summary.eligibleOnlyInternational,
    })
    .from(movies)
    .leftJoin(summary, eq(summary.movieId, movies.id))
    .where(sql`(${startsWord} or ${nearly})`)
    .orderBy(
      sql`case when ${startsTitle} then 0 when ${startsWord} then 1 else 2 end`,
      sql`similarity(${key}, ${query}) desc`,
      sql`${summary.stage} desc nulls last`,
      asc(movies.title),
      asc(movies.id),
    )
    .limit(MAX_FILMS);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    originalTitle: row.originalTitle,
    originalLang: row.originalLang,
    year: row.year,
    flag: primaryCountry(row.countries, row.submissions ?? []),
    categories: (row.categories ?? "")
      .split(",")
      .filter((slug) => slug in CATEGORY_LABELS)
      .sort((a, b) => CATEGORY_ORDER.indexOf(a) - CATEGORY_ORDER.indexOf(b))
      .map((slug) => CATEGORY_LABELS[slug]),
    stage: row.stage ? oscarStage(row.stage, row.eligibleOnlyInternational ? "international" : null) : null,
    href: `/movies/${row.slug}`,
  }));
}

/** Every award and festival that has results loaded, with its newest year. */
export async function queryAwardList(db: ReadDb): Promise<SearchableAward[]> {
  const rows = await db
    .select({
      slug: awards.slug,
      name: awards.name,
      shortName: awards.shortName,
      kind: awards.kind,
      calendarOrder: awards.calendarOrder,
      year: max(editions.year),
    })
    .from(awards)
    .innerJoin(editions, eq(editions.awardId, awards.id))
    .groupBy(awards.id)
    .orderBy(asc(awards.calendarOrder), asc(awards.id));
  return rows.flatMap((row) =>
    row.year === null ? [] : [{ ...row, kind: row.kind as AwardKind, year: row.year }],
  );
}

/** Cached `queryAwardList`: it changes only on a load. */
export async function getAwardList(): Promise<SearchableAward[]> {
  "use cache";
  cacheTag("awards");
  cacheLife("max");
  return queryAwardList(getDb());
}
