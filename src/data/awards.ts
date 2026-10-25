// One award's results in one film year (plan §3.1, guide §8.2): per category the films with the
// stage each reached, the Oscar result of the category it maps to, and the award's accuracy
// figures. Cached under `awards` and `scores`; see `films.ts` for the query/cached pairing.
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { accuracy, awardCategories, awards, editions, movies, results } from "@/db/schema";
import type { Figure } from "@/lib/accuracy";
import { seasonState, type SeasonState } from "@/lib/race";
import { compareOutcome, flagsFor, type Outcome } from "@/lib/stage";
import { filmColumns, toFilmRow, type FilmRowData, type ReadDb } from "./films";
import { queryOscarResults, type OscarCategory } from "./oscars";

export type AwardFigures = {
  win: Figure;
  nomination: Figure;
  /** Null for awards that announce winners only. */
  nominees: Figure | null;
  /** Oscar nominees it caught; null as `nominees`, and until the figures are recomputed. */
  caught: Figure | null;
};

export type AwardCategory = {
  slug: string;
  /** The award's own name for it ("Best Film"). */
  name: string;
  oscarCategory: OscarCategory;
  /** A director or cast prize counted towards a film category. */
  loose: boolean;
  mappingNote: string | null;
  /** Null until `npm run compute` has run for the category. */
  figures: AwardFigures | null;
};

export type AwardEdition = {
  year: number;
  /** "79th" */
  ordinal: string | null;
  status: "loaded" | "partial" | "no_data";
  note: string | null;
  /** ISO date ("2026-02-22"). A list with no winner (AFI, DOC NYC) gives its announcement day instead. */
  winnersOn: string | null;
};

// A list's results are out on its announcement day: the day pages show where a prize shows its winners' day.
const resultsDay = sql<string | null>`coalesce(${editions.winnersOn}, case when ${awards.isSelection} then ${editions.nominationsOn} end)::text`;

/** The film's result in the Oscar category this category maps to, in the same film year. */
export type OscarOutcome = { outcome: Outcome; country: string | null } | null;

export type AwardEntry = {
  film: FilmRowData;
  /** The furthest stage the film reached in this category. */
  outcome: Outcome;
  /** Flags to show: the production countries. */
  flags: string[];
  /** Null when the film isn't on the Oscar category's list that year (see `oscarState`). */
  oscar: OscarOutcome;
};

export type AwardCategoryResults = {
  category: AwardCategory;
  /** Where the mapped Oscar category's season stands: decides what "no Oscar result" means. */
  oscarState: SeasonState;
  /** Winners first, then by title. */
  entries: AwardEntry[];
};

export type AwardYear = {
  edition: AwardEdition | null;
  /** In the award's own order; a category with no results that year is left out. */
  categories: AwardCategoryResults[];
};

/** An award's categories in the registry's order, with their accuracy figures. */
export async function queryAwardCategories(db: ReadDb, awardSlug: string): Promise<AwardCategory[]> {
  const rows = await db
    .select({
      slug: awardCategories.slug,
      name: awardCategories.name,
      oscarCategory: awardCategories.oscarCategory,
      loose: awardCategories.loose,
      mappingNote: awardCategories.mappingNote,
      winHits: accuracy.winHits,
      winCount: accuracy.winCount,
      nomHits: accuracy.nomHits,
      nomCount: accuracy.nomCount,
      nomineesHits: accuracy.nomineesHits,
      nomineesCount: accuracy.nomineesCount,
      caughtHits: accuracy.caughtHits,
      caughtCount: accuracy.caughtCount,
    })
    .from(awardCategories)
    .innerJoin(awards, eq(awards.id, awardCategories.awardId))
    .leftJoin(accuracy, eq(accuracy.categoryId, awardCategories.id))
    .where(eq(awards.slug, awardSlug))
    .orderBy(asc(awardCategories.sortOrder), asc(awardCategories.id));
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    oscarCategory: r.oscarCategory,
    loose: r.loose,
    mappingNote: r.mappingNote,
    figures:
      r.winHits === null || r.winCount === null || r.nomHits === null || r.nomCount === null
        ? null
        : {
            win: { hits: r.winHits, count: r.winCount },
            nomination: { hits: r.nomHits, count: r.nomCount },
            nominees:
              r.nomineesHits === null || r.nomineesCount === null
                ? null
                : { hits: r.nomineesHits, count: r.nomineesCount },
            caught: r.caughtHits === null || r.caughtCount === null ? null : { hits: r.caughtHits, count: r.caughtCount },
          },
  }));
}

/** The award's edition for a film year, or null when none is loaded. */
export async function queryAwardEdition(db: ReadDb, awardSlug: string, year: number): Promise<AwardEdition | null> {
  const [row] = await db
    .select({
      year: editions.year,
      ordinal: editions.ordinal,
      status: editions.status,
      note: editions.note,
      winnersOn: resultsDay,
    })
    .from(editions)
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .where(and(eq(awards.slug, awardSlug), eq(editions.year, year)));
  return row ?? null;
}

/**
 * Everything the award page shows for one film year: the edition, then per category the films
 * with their stage, each with its Oscar result (the same film year's Oscars, in the category
 * this one maps to). Null when the award isn't in the database.
 */
export async function queryAwardYear(db: ReadDb, awardSlug: string, year: number): Promise<AwardYear | null> {
  const [categories, edition] = await Promise.all([
    queryAwardCategories(db, awardSlug),
    queryAwardEdition(db, awardSlug, year),
  ]);
  if (categories.length === 0) return null;
  if (!edition) return { edition: null, categories: [] };

  const rows = await db
    .select({ ...filmColumns, categorySlug: awardCategories.slug, outcome: results.outcome })
    .from(results)
    .innerJoin(editions, eq(editions.id, results.editionId))
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
    .innerJoin(movies, eq(movies.id, results.movieId))
    .where(and(eq(awards.slug, awardSlug), eq(editions.year, year)))
    .orderBy(asc(movies.title), asc(movies.id));

  const withResults = categories.filter((c) => rows.some((r) => r.categorySlug === c.slug));
  // Each mapped Oscar category's whole list (submitted and up), once.
  const oscarLists = new Map(
    await Promise.all(
      [...new Set(withResults.map((c) => c.oscarCategory))].map(
        async (oc) => [oc, await queryOscarResults(db, year, oc, "submitted")] as const,
      ),
    ),
  );

  return {
    edition,
    categories: withResults.map((category) => {
      const oscars = oscarLists.get(category.oscarCategory) ?? [];
      const byFilm = new Map(oscars.map((e) => [e.film.id, e]));
      const entries = rows
        .filter((r) => r.categorySlug === category.slug)
        .map(({ outcome, ...film }): AwardEntry => {
          const oscar = byFilm.get(film.id);
          return {
            film: toFilmRow(film),
            outcome,
            flags: flagsFor(film.countries),
            oscar: oscar ? { outcome: oscar.outcome, country: oscar.country } : null,
          };
        })
        .sort((a, b) => compareOutcome(b.outcome, a.outcome));
      return { category, oscarState: seasonState(oscars.map((e) => e.outcome)), entries };
    }),
  };
}

/** Cached `queryAwardYear`. */
export async function getAwardYear(awardSlug: string, year: number): Promise<AwardYear | null> {
  "use cache";
  cacheTag("awards", "scores");
  cacheLife("max");
  return queryAwardYear(getDb(), awardSlug, year);
}

/** One award's edition in a film year, with the award's slug (the awards index's rows, guide §8.7). */
export type YearEdition = AwardEdition & { slug: string };

/** Every award's edition in a film year, the Oscars included: one row per award that has the year. */
export async function queryYearEditions(db: ReadDb, year: number): Promise<YearEdition[]> {
  return db
    .select({
      slug: awards.slug,
      year: editions.year,
      ordinal: editions.ordinal,
      status: editions.status,
      note: editions.note,
      winnersOn: resultsDay,
    })
    .from(editions)
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .where(eq(editions.year, year));
}

/** The awards with at least one edition that isn't "no data", in any year. */
export async function queryAwardsWithData(db: ReadDb): Promise<Set<string>> {
  const rows = await db
    .select({ slug: awards.slug })
    .from(editions)
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .where(ne(editions.status, "no_data"))
    .groupBy(awards.slug);
  return new Set(rows.map((r) => r.slug));
}

/** Cached `queryYearEditions`. */
export async function getYearEditions(year: number): Promise<YearEdition[]> {
  "use cache";
  cacheTag("awards");
  cacheLife("max");
  return queryYearEditions(getDb(), year);
}
