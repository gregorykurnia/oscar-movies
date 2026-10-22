// One film for its page (`/movies/[slug]`, guide §8.6): facts, scores with the day each was
// fetched, and its Oscar result in every category. Cached under `awards` and `scores`; see
// `films.ts` for the query/cached pairing.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { awardCategories, awards, editions, movies, results } from "@/db/schema";
import type { ScoreTilesData } from "@/components/score-tiles/ScoreTiles";
import { compareOutcome, type Outcome } from "@/lib/stage";
import type { ReadDb } from "./films";
import type { OscarCategory } from "./oscars";

/** One Oscar category the film has a result in. */
export type OscarBox = {
  year: number;
  /** "97th" */
  ordinal: string | null;
  category: OscarCategory;
  /** The furthest stage the film reached in this category that year. */
  outcome: Outcome;
  /** Submitting country (International only). */
  country: string | null;
  /** Films on the same list: nominees (runner-ups too) for a nomination or win, the shortlist for a shortlisted film. */
  listSize: number;
  /** ISO date of the ceremony ("2025-03-02"), or null before it is set. */
  winnersOn: string | null;
};

export type MovieData = {
  id: number;
  slug: string;
  title: string;
  originalTitle: string | null;
  originalLang: string | null;
  year: number;
  countries: string[];
  /** ISO 639-1 code ("pt"), or null when unknown. */
  language: string | null;
  scores: ScoreTilesData;
  /** Furthest first, then newest edition first. */
  oscars: OscarBox[];
};

const NOMINATED: Outcome[] = ["runner_up", "nominated", "won"];
const SHORTLISTED: Outcome[] = ["shortlisted", "runner_up", "nominated", "won"];

export async function queryMovie(db: ReadDb, slug: string): Promise<MovieData | null> {
  const [m] = await db.select().from(movies).where(eq(movies.slug, slug));
  if (!m) return null;

  const mine = await db
    .select({
      editionId: results.editionId,
      categoryId: results.categoryId,
      year: editions.year,
      ordinal: editions.ordinal,
      winnersOn: editions.winnersOn,
      category: awardCategories.oscarCategory,
      outcome: results.outcome,
      country: results.country,
    })
    .from(results)
    .innerJoin(editions, eq(editions.id, results.editionId))
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
    .where(and(eq(results.movieId, m.id), eq(awards.kind, "oscars")))
    .orderBy(asc(editions.year));

  // How many films share each list (nominees, shortlist) in the editions and categories the film is in.
  const sizes = mine.length
    ? await db
        .select({
          editionId: results.editionId,
          categoryId: results.categoryId,
          nominees: sql<number>`(count(*) filter (where ${inArray(results.outcome, NOMINATED)}))::int`,
          shortlist: sql<number>`(count(*) filter (where ${inArray(results.outcome, SHORTLISTED)}))::int`,
        })
        .from(results)
        .where(
          and(
            inArray(results.editionId, [...new Set(mine.map((r) => r.editionId))]),
            inArray(results.categoryId, [...new Set(mine.map((r) => r.categoryId))]),
          ),
        )
        .groupBy(results.editionId, results.categoryId)
    : [];
  const sizeOf = new Map(sizes.map((s) => [`${s.editionId}:${s.categoryId}`, s]));

  const oscars = mine
    .map((r): OscarBox => {
      const size = sizeOf.get(`${r.editionId}:${r.categoryId}`);
      const nominated = NOMINATED.includes(r.outcome);
      return {
        year: r.year,
        ordinal: r.ordinal,
        category: r.category,
        outcome: r.outcome,
        country: r.country,
        listSize: (nominated ? size?.nominees : size?.shortlist) ?? 0,
        winnersOn: r.winnersOn,
      };
    })
    .sort((a, b) => compareOutcome(b.outcome, a.outcome) || b.year - a.year);

  return {
    id: m.id,
    slug: m.slug,
    title: m.title,
    originalTitle: m.originalTitle,
    originalLang: m.originalLang,
    year: m.year,
    countries: m.countries,
    language: m.language,
    scores: {
      imdb: { value: m.imdbRating, updatedAt: m.imdbAt },
      rt: { value: m.rtScore, updatedAt: m.rtAt },
      mc: { value: m.mcScore, updatedAt: m.mcAt },
      tmdb: { value: m.tmdbScore, updatedAt: m.tmdbAt },
      average: m.avgScore,
      count: m.scoreCount,
    },
    oscars,
  };
}

/** The film at `/movies/<slug>`, or null when there is none. */
export async function getMovie(slug: string): Promise<MovieData | null> {
  "use cache";
  cacheTag("awards", "scores");
  cacheLife("max");
  return queryMovie(getDb(), slug);
}
