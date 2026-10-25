// Data functions read the database through cached queries (plan §5.1): a long life, a tag,
// and `/api/revalidate` expires the tag after a load. Pages never query directly.
//
// Each query is written twice over: `queryX(db, …)` takes any client (database tests pass the
// `test` branch's), and `getX(…)` is the cached version pages call. Marks are never cached
// (read in `src/data/watch-list.ts`, written in `src/data/marks.ts`).
import { count, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import type { Scores } from "@/components/score-line/ScoreLine";
import { getDb, type ScriptDb } from "@/db";
import { movies } from "@/db/schema";
import { primaryCountry, type Submission } from "@/lib/flags";

/** What a query needs from a client: the app's (HTTP) and the scripts' (pool) both fit. */
export type ReadDb = Pick<ScriptDb, "select">;

/** One film as every row shows it (product plan §3.2): titles, flags, the four scores and the average. */
export type FilmRowData = {
  id: number;
  slug: string;
  title: string;
  originalTitle: string | null;
  /** BCP 47 tag of the original title, for `lang=`. */
  originalLang: string | null;
  year: number;
  /** Production countries, main first. */
  countries: string[];
  /** The film's one flag: its primary country (`primaryCountry`), an upper-case ISO code. */
  flag: string | null;
  scores: Scores;
};

/**
 * The film's Oscar International Feature submissions (year and submitting country), from a
 * correlated subquery on `movies`, for `primaryCountry`. Any select that reads `movies` can
 * include it; its own aliases keep it clear of the outer query's `results` and `editions`.
 */
export const submissionsColumn = sql<Submission[] | null>`(
  select json_agg(json_build_object('year', sub_e.year, 'country', sub_r.country))
  from results sub_r
  join editions sub_e on sub_e.id = sub_r.edition_id
  join awards sub_a on sub_a.id = sub_e.award_id and sub_a.kind = 'oscars'
  join award_categories sub_c on sub_c.id = sub_r.category_id and sub_c.oscar_category = 'international'
  where sub_r.movie_id = ${movies.id} and sub_r.country is not null
)`.as("submissions");

/** The columns behind `FilmRowData`, for any select that joins `movies`. */
export const filmColumns = {
  id: movies.id,
  slug: movies.slug,
  title: movies.title,
  originalTitle: movies.originalTitle,
  originalLang: movies.originalLang,
  year: movies.year,
  countries: movies.countries,
  submissions: submissionsColumn,
  imdbRating: movies.imdbRating,
  rtScore: movies.rtScore,
  mcScore: movies.mcScore,
  tmdbScore: movies.tmdbScore,
  avgScore: movies.avgScore,
  scoreCount: movies.scoreCount,
};

type FilmColumnsRow = {
  id: number;
  slug: string;
  title: string;
  originalTitle: string | null;
  originalLang: string | null;
  year: number;
  countries: string[];
  submissions: Submission[] | null;
  imdbRating: number | null;
  rtScore: number | null;
  mcScore: number | null;
  tmdbScore: number | null;
  avgScore: number | null;
  scoreCount: number;
};

export function toFilmRow(row: FilmColumnsRow): FilmRowData {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    originalTitle: row.originalTitle,
    originalLang: row.originalLang,
    year: row.year,
    countries: row.countries,
    flag: primaryCountry(row.countries, row.submissions ?? []),
    scores: {
      imdb: row.imdbRating,
      rt: row.rtScore,
      mc: row.mcScore,
      tmdb: row.tmdbScore,
      average: row.avgScore,
      count: row.scoreCount,
    },
  };
}

export async function queryFilmCount(db: ReadDb): Promise<number> {
  const [row] = await db.select({ n: count() }).from(movies);
  return row.n;
}

/** How many films the database holds. */
export async function countFilms(): Promise<number> {
  "use cache";
  cacheTag("awards");
  cacheLife("max");
  return queryFilmCount(getDb());
}
