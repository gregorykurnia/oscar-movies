// Data functions read the database through cached queries (plan §5.1): a long life, a tag,
// and `/api/revalidate` expires the tag after a load. Pages never query directly.
//
// Each query is written twice over: `queryX(db, …)` takes any client (database tests pass the
// `test` branch's), and `getX(…)` is the cached version pages call. Marks are never cached
// (`src/data/marks.ts`).
import { count } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import type { Scores } from "@/components/score-line/ScoreLine";
import { getDb, type ScriptDb } from "@/db";
import { movies } from "@/db/schema";

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
  scores: Scores;
};

/** The columns behind `FilmRowData`, for any select that joins `movies`. */
export const filmColumns = {
  id: movies.id,
  slug: movies.slug,
  title: movies.title,
  originalTitle: movies.originalTitle,
  originalLang: movies.originalLang,
  year: movies.year,
  countries: movies.countries,
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
