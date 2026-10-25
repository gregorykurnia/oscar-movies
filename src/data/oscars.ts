// Oscar editions and results (plan §3.1, §3.2): one year's dates and status, and one
// category's films with the stage each reached. Cached under `awards` and `scores` (rows carry
// scores); see `films.ts` for the query/cached pairing.
import { and, asc, eq, inArray } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { awardCategories, awards, editions, movies, results } from "@/db/schema";
import { OUTCOMES, type Outcome } from "@/lib/stage";
import { filmColumns, toFilmRow, type FilmRowData, type ReadDb } from "./films";

export type OscarCategory = "picture" | "documentary" | "international" | "animated";

export type OscarEdition = {
  year: number;
  /** "98th" */
  ordinal: string | null;
  status: "loaded" | "partial" | "no_data";
  note: string | null;
  /** ISO dates ("2026-01-22"); they drive the season stage (§3.2 rule 4). */
  shortlistOn: string | null;
  nominationsOn: string | null;
  winnersOn: string | null;
};

export type OscarEntry = {
  film: FilmRowData;
  /** The furthest stage the film reached in this category this year. */
  outcome: Outcome;
  /** Submitting country (International only). */
  country: string | null;
};

export async function queryOscarEdition(db: ReadDb, year: number): Promise<OscarEdition | null> {
  const [row] = await db
    .select({
      year: editions.year,
      ordinal: editions.ordinal,
      status: editions.status,
      note: editions.note,
      shortlistOn: editions.shortlistOn,
      nominationsOn: editions.nominationsOn,
      winnersOn: editions.winnersOn,
    })
    .from(editions)
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .where(and(eq(awards.kind, "oscars"), eq(editions.year, year)));
  return row ?? null;
}

/** The Oscars edition of a film year, or null when none is loaded. */
export async function getOscarEdition(year: number): Promise<OscarEdition | null> {
  "use cache";
  cacheTag("awards");
  cacheLife("max");
  return queryOscarEdition(getDb(), year);
}

/**
 * One Oscar category's films in a year at `from` or later in the outcome order (submitted,
 * eligible, shortlisted, runner-up, nominated, won), furthest first, then by title. The default
 * (`shortlisted`) is the shortlist, nominees and winner; `submitted` is every film the category
 * lists (International's submissions, Animated's eligible films).
 */
export async function queryOscarResults(
  db: ReadDb,
  year: number,
  category: OscarCategory,
  from: Outcome = "shortlisted",
): Promise<OscarEntry[]> {
  // By the schema's order, not by rank: eligible ranks with shortlisted but isn't on a shortlist.
  const outcomes = OUTCOMES.slice(OUTCOMES.indexOf(from));
  const rows = await db
    .select({ ...filmColumns, outcome: results.outcome, country: results.country })
    .from(results)
    .innerJoin(editions, eq(editions.id, results.editionId))
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
    .innerJoin(movies, eq(movies.id, results.movieId))
    .where(
      and(
        eq(awards.kind, "oscars"),
        eq(editions.year, year),
        eq(awardCategories.oscarCategory, category),
        inArray(results.outcome, outcomes),
      ),
    )
    .orderBy(asc(movies.title), asc(movies.id));
  return rows
    .map(({ outcome, country, ...film }) => ({
      film: toFilmRow(film),
      outcome,
      country,
    }))
    .sort((a, b) => OUTCOMES.indexOf(b.outcome) - OUTCOMES.indexOf(a.outcome));
}

/** Cached `queryOscarResults`. */
export async function getOscarResults(
  year: number,
  category: OscarCategory,
  from: Outcome = "shortlisted",
): Promise<OscarEntry[]> {
  "use cache";
  cacheTag("awards", "scores");
  cacheLife("max");
  return queryOscarResults(getDb(), year, category, from);
}

/** A year's International Feature submissions (product plan §3.10), furthest first. */
export async function querySubmissions(db: ReadDb, year: number): Promise<OscarEntry[]> {
  return queryOscarResults(db, year, "international", "submitted");
}

/** Cached `querySubmissions`. The page sorts them (country, stage, average). */
export async function getSubmissions(year: number): Promise<OscarEntry[]> {
  "use cache";
  cacheTag("awards", "scores");
  cacheLife("max");
  return querySubmissions(getDb(), year);
}
