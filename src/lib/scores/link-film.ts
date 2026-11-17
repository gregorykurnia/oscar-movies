// A film added by hand has no TMDB or IMDb ID, so the score batch has nothing to look it up by and
// it never gets a score. Right after it's added, find it on TMDB by its exact title and year and
// save the IDs, but only when the match is clear: a wrong link would show another film's scores,
// so anything ambiguous stays unlinked, as before.
import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "../../db/schema";
import { movies } from "../../db/schema";
import type { CatalogueDetails, MovieCatalogue } from "../movie-catalogue/contract";

type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Feature length as the Academy counts it: more than 40 minutes. */
export const FEATURE_MINUTES = 40;
/** More same-title, same-year films than this is too ambiguous to sort out by runtime. */
const MAX_CANDIDATES = 5;

export type TmdbLink = { tmdbId: number; imdbId: string | null };

/** Case, accents, punctuation and "&" vs "and" don't count. */
export function normalTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * The one TMDB film with this exact title (or original title) and year that isn't a short: a film
 * TMDB lists at 40 minutes or less is never the match, so a same-named short neither blocks the
 * link nor takes it. No such film, several, or a failed call: null.
 */
export async function findTmdbMatch(catalogue: MovieCatalogue, title: string, year: number): Promise<TmdbLink | null> {
  const page = await catalogue.search(title, 1, year);
  if (!page.ok) return null;
  const want = normalTitle(title);
  const same = page.value.films.filter(
    (f) => f.year === year && (normalTitle(f.title) === want || (f.originalTitle !== null && normalTitle(f.originalTitle) === want)),
  );
  if (same.length === 0 || same.length > MAX_CANDIDATES) return null;
  const results = await Promise.all(same.map((film) => catalogue.details(film.tmdbId)));
  // A film we couldn't read can't be ruled out.
  if (results.some((r) => !r.ok)) return null;
  const details = results.flatMap((r): CatalogueDetails[] => (r.ok ? [r.value] : []));
  const picks = details.filter((d) => d.runtime === null || d.runtime > FEATURE_MINUTES);
  return picks.length === 1 ? { tmdbId: picks[0].tmdbId, imdbId: picks[0].imdbId } : null;
}

/**
 * Links a hand-added film (it has a `local_id`) that has neither ID to its TMDB match. False when
 * it isn't hand-added (award imports match their own films), already has an ID, has no clear
 * match, or another film already holds the match's IDs (never merged: that's the owner's call).
 */
export async function linkFilmToTmdb(db: Db, catalogue: MovieCatalogue, movieId: number): Promise<boolean> {
  const [film] = await db
    .select({ title: movies.title, year: movies.year, tmdbId: movies.tmdbId, imdbId: movies.imdbId, localId: movies.localId })
    .from(movies)
    .where(eq(movies.id, movieId));
  if (!film || film.localId === null || film.tmdbId !== null || film.imdbId !== null) return false;
  const match = await findTmdbMatch(catalogue, film.title, film.year);
  if (!match) return false;
  const taken = await db
    .select({ id: movies.id })
    .from(movies)
    .where(or(eq(movies.tmdbId, match.tmdbId), match.imdbId ? eq(movies.imdbId, match.imdbId) : undefined));
  if (taken.length > 0) {
    console.info("Not linking a hand-added film: another film has its TMDB or IMDb ID", { movieId, match, taken });
    return false;
  }
  const linked = await db
    .update(movies)
    // Never checked with its IDs: the score batch takes it first, whatever its last (ID-less) check.
    .set({ tmdbId: match.tmdbId, imdbId: match.imdbId, scoresCheckedAt: null })
    .where(and(eq(movies.id, movieId), isNull(movies.tmdbId), isNull(movies.imdbId)))
    .returning({ id: movies.id });
  return linked.length > 0;
}

/** Hand-added films the daily run retries per run (a TMDB search and a details call or two each). */
export const LINK_PER_RUN = 10;

/**
 * The daily run's retry: hand-added films still without IDs, in case TMDB was down at the add or
 * has listed the film since. A random few each run, so films that never match can't hold up the
 * rest, and none starts after `deadline` (ms since epoch): the score batch needs its time. One
 * film's failure is logged and skipped. Never throws; returns how many films it linked.
 */
export async function linkHandAddedFilms(
  db: Db,
  catalogue: MovieCatalogue,
  deadline: number,
  now: () => number = Date.now,
  limit = LINK_PER_RUN,
): Promise<number> {
  let films: { id: number }[];
  try {
    films = await db
      .select({ id: movies.id })
      .from(movies)
      .where(and(isNotNull(movies.localId), isNull(movies.tmdbId), isNull(movies.imdbId)))
      .orderBy(sql`random()`)
      .limit(limit);
  } catch (error) {
    console.error("Listing hand-added films to link failed", error);
    return 0;
  }
  let linked = 0;
  for (const { id } of films) {
    if (now() >= deadline) break;
    try {
      if (await linkFilmToTmdb(db, catalogue, id)) linked++;
    } catch (error) {
      console.error("Linking a hand-added film to TMDB failed", { movieId: id }, error);
    }
  }
  return linked;
}
