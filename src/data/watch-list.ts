// The marks and the watch list (plan §5.1, product plan §3.13). Marks change any time, so
// nothing that reads them is cached: `getMarks` feeds the layout's `MarksProvider`, and the
// watch list reads them per request (unmarking a film drops it on the next visit). A season's
// films don't depend on the marks and are cached like the other award queries.
import { and, asc, eq, or, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { awards, editions, marks, movies, results } from "@/db/schema";
import { flagsFor, type Outcome } from "@/lib/stage";
import { filmColumns, toFilmRow, type FilmRowData, type ReadDb } from "./films";

export type Mark = { movieId: number; watched: boolean; want: boolean };

/** A film with its furthest Oscar stage, for lists sorted by stage or nominations. */
export type StagedFilm = {
  film: FilmRowData;
  /** Furthest Oscar outcome in any category (in that season, for season lists); null: none. */
  stage: Outcome | null;
  /** Oscar nominations (runner-up, nominated or won), one per category. */
  nominations: number;
  /** Flags to show: an International submission's country first. */
  flags: string[];
};

export type WatchList = {
  /** Films marked want to watch, from any year. */
  want: StagedFilm[];
  /** The season's films not watched and not already in `want`. */
  unwatched: StagedFilm[];
};

/** Every non-empty mark (a few hundred rows at most). */
export async function queryMarks(db: ReadDb): Promise<Mark[]> {
  return db
    .select({ movieId: marks.movieId, watched: marks.watched, want: marks.want })
    .from(marks)
    .where(or(eq(marks.watched, true), eq(marks.want, true)))
    .orderBy(asc(marks.movieId));
}

/** The marks, read fresh on every request (never cached). */
export async function getMarks(): Promise<Mark[]> {
  return queryMarks(getDb());
}

/** Per film: its furthest Oscar outcome, nominations and submitting country, in one year or all. */
function oscarSummary(db: ReadDb, year?: number) {
  return db
    .select({
      movieId: results.movieId,
      // Postgres orders an enum by its declaration: submitted … won.
      stage: sql<Outcome>`max(${results.outcome})`.as("stage"),
      nominations:
        sql<number>`(count(*) filter (where ${results.outcome} in ('runner_up', 'nominated', 'won')))::int`.as(
          "nominations",
        ),
      country: sql<string | null>`max(${results.country})`.as("country"),
    })
    .from(results)
    .innerJoin(editions, eq(editions.id, results.editionId))
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .where(and(eq(awards.kind, "oscars"), year === undefined ? undefined : eq(editions.year, year)))
    .groupBy(results.movieId)
    .as("oscar_summary");
}

type StagedRow = Parameters<typeof toFilmRow>[0] & {
  stage: Outcome | null;
  nominations: number | null;
  country: string | null;
};

function toStagedFilm({ stage, nominations, country, ...film }: StagedRow): StagedFilm {
  return { film: toFilmRow(film), stage, nominations: nominations ?? 0, flags: flagsFor(film.countries, country) };
}

/** Every film with an Oscar result in a season (any category, any stage), by title. */
export async function querySeasonFilms(db: ReadDb, year: number): Promise<StagedFilm[]> {
  const summary = oscarSummary(db, year);
  const rows = await db
    .select({ ...filmColumns, stage: summary.stage, nominations: summary.nominations, country: summary.country })
    .from(summary)
    .innerJoin(movies, eq(movies.id, summary.movieId))
    .orderBy(asc(movies.title), asc(movies.id));
  return rows.map(toStagedFilm);
}

/** Cached `querySeasonFilms`. */
export async function getSeasonFilms(year: number): Promise<StagedFilm[]> {
  "use cache";
  cacheTag("awards", "scores");
  cacheLife("max");
  return querySeasonFilms(getDb(), year);
}

/** Films marked want to watch, with their furthest Oscar stage in any year, by title. */
export async function queryWantedFilms(db: ReadDb): Promise<StagedFilm[]> {
  const summary = oscarSummary(db);
  const rows = await db
    .select({ ...filmColumns, stage: summary.stage, nominations: summary.nominations, country: summary.country })
    .from(marks)
    .innerJoin(movies, eq(movies.id, marks.movieId))
    .leftJoin(summary, eq(summary.movieId, movies.id))
    .where(eq(marks.want, true))
    .orderBy(asc(movies.title), asc(movies.id));
  return rows.map(toStagedFilm);
}

/** The watch list's two sections; the page sorts each. */
export function buildWatchList(wanted: StagedFilm[], season: StagedFilm[], allMarks: Mark[]): WatchList {
  const marked = new Set(allMarks.filter((m) => m.watched || m.want).map((m) => m.movieId));
  return { want: wanted, unwatched: season.filter((f) => !marked.has(f.film.id)) };
}

/** The watch list for a season, read per request (it depends on the marks). */
export async function getWatchList(year: number): Promise<WatchList> {
  const db = getDb();
  const [wanted, season, allMarks] = await Promise.all([queryWantedFilms(db), getSeasonFilms(year), queryMarks(db)]);
  return buildWatchList(wanted, season, allMarks);
}
