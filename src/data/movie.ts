// One film for its page (`/movies/[slug]`, guide §8.6): facts, scores with the day each was
// fetched, and its Oscar result in every category. Cached under `awards` and `scores`; see
// `films.ts` for the query/cached pairing.
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { awardCategories, awards, editions, movies, results, screenings } from "@/db/schema";
import type { ScoreTilesData } from "@/components/score-tiles/ScoreTiles";
import { primaryCountry } from "@/lib/flags";
import { orderScreenings, type MovieScreening } from "@/lib/lineup";
import { movieAwardRows, type AwardCandidate, type AwardResult, type MovieAwardRow } from "@/lib/movie-awards";
import { compareOutcome, isShortlisted, type Outcome } from "@/lib/stage";
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
  /** The one large flag: the primary country (`primaryCountry`). */
  flag: string | null;
  /** ISO 639-1 code ("pt"), or null when unknown. */
  language: string | null;
  scores: ScoreTilesData;
  /** Furthest first, then newest edition first. */
  oscars: OscarBox[];
  /** Results at every other award, with "not nominated" rows; the page picks what to show by the day. */
  awards: MovieAwardRow[];
  /** The festival lineups the film is in, in calendar order (2025 on). */
  screenings: MovieScreening[];
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
  const [awardRows, screeningRows] = await Promise.all([
    queryAwardRows(
      db,
      m.id,
      mine.filter((r) => isShortlisted(r.outcome)).map((r) => ({ year: r.year, oscarCategory: r.category })),
    ),
    queryScreenings(db, m.id),
  ]);

  return {
    id: m.id,
    slug: m.slug,
    title: m.title,
    originalTitle: m.originalTitle,
    originalLang: m.originalLang,
    year: m.year,
    countries: m.countries,
    flag: primaryCountry(m.countries, mine.filter((r) => r.category === "international")),
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
    awards: awardRows,
    screenings: screeningRows,
  };
}

/** The film's screenings at the festivals, in calendar order. */
async function queryScreenings(db: ReadDb, movieId: number): Promise<MovieScreening[]> {
  const rows = await db
    .select({
      awardSlug: awards.slug,
      awardName: awards.name,
      calendarOrder: awards.calendarOrder,
      year: editions.year,
      section: screenings.section,
      sectionOrder: screenings.sectionOrder,
      prize: screenings.prize,
    })
    .from(screenings)
    .innerJoin(editions, eq(editions.id, screenings.editionId))
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .where(eq(screenings.movieId, movieId));
  return orderScreenings(rows);
}

/**
 * The film's rows at the other awards. A "not nominated" needs a category the film is in the
 * running for in that film year: an Oscar shortlist place or better, or a result at another award
 * mapped to it. It's only said by awards with a `loaded` edition that announced nominees, for a
 * category that gave results, and never for festivals (their lineups are the screenings).
 */
async function queryAwardRows(
  db: ReadDb,
  movieId: number,
  oscarPairs: Array<{ year: number; oscarCategory: OscarCategory }>,
): Promise<MovieAwardRow[]> {
  const rows = await db
    .select({
      awardSlug: awards.slug,
      awardName: awards.name,
      kind: awards.kind,
      calendarOrder: awards.calendarOrder,
      isSelection: awards.isSelection,
      year: editions.year,
      categoryName: awardCategories.name,
      oscarCategory: awardCategories.oscarCategory,
      outcome: results.outcome,
    })
    .from(results)
    .innerJoin(editions, eq(editions.id, results.editionId))
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
    .where(and(eq(results.movieId, movieId), ne(awards.kind, "oscars")));
  const mine = rows.map((r) => ({ ...r, kind: r.kind as AwardResult["kind"] }));

  const pairKey = (p: { year: number; oscarCategory: string }) => `${p.year}:${p.oscarCategory}`;
  const pairs = new Map([...oscarPairs, ...mine].map((p) => [pairKey(p), p]));
  if (pairs.size === 0) return [];

  const found = await db
    .select({
      awardSlug: awards.slug,
      awardName: awards.name,
      kind: awards.kind,
      calendarOrder: awards.calendarOrder,
      isSelection: awards.isSelection,
      year: editions.year,
      categoryName: awardCategories.name,
      oscarCategory: awardCategories.oscarCategory,
      nominationsOn: editions.nominationsOn,
      winnersOn: editions.winnersOn,
    })
    .from(results)
    .innerJoin(editions, eq(editions.id, results.editionId))
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
    .where(
      and(
        inArray(editions.year, [...new Set([...pairs.values()].map((p) => p.year))]),
        inArray(awardCategories.oscarCategory, [...new Set([...pairs.values()].map((p) => p.oscarCategory))]),
        eq(editions.status, "loaded"),
        inArray(awards.kind, ["major", "critics"]),
        eq(awards.winnersOnly, false),
        eq(awardCategories.loose, false),
      ),
    )
    .groupBy(
      awards.slug,
      awards.name,
      awards.kind,
      awards.calendarOrder,
      awards.isSelection,
      editions.year,
      awardCategories.name,
      awardCategories.oscarCategory,
      editions.nominationsOn,
      editions.winnersOn,
    );
  const candidates = found
    .filter((c) => pairs.has(pairKey(c)))
    .map(({ nominationsOn, winnersOn, ...c }): AwardCandidate => ({
      ...c,
      kind: c.kind as AwardCandidate["kind"],
      since: nominationsOn ?? winnersOn,
    }));
  return movieAwardRows(mine, candidates);
}

/** The film at `/movies/<slug>`, or null when there is none. */
export async function getMovie(slug: string): Promise<MovieData | null> {
  "use cache";
  cacheTag("awards", "scores");
  cacheLife("max");
  return queryMovie(getDb(), slug);
}
