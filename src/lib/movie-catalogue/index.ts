import "server-only";
import { getDb } from "@/db";
import { readDbBranch } from "@/db/meta";
import { createTmdbCatalogue } from "./client";
import type { MovieCatalogue } from "./contract";

/** Both the flag and the actual connected branch must allow fixtures, including in production-mode test builds. */
export async function getMovieCatalogue(): Promise<MovieCatalogue> {
  if (process.env.MOVIE_CATALOGUE_FIXTURES === "1") {
    if (process.env.EXPECT_DB_BRANCH !== "test" || process.env.VERCEL_ENV === "production"
      || await readDbBranch(getDb()) !== "test") {
      throw new Error("Catalogue fixtures require the guarded test database.");
    }
    const { catalogueFixtureFetch } = await import("./fixtures");
    return createTmdbCatalogue("catalogue-fixture-token", catalogueFixtureFetch);
  }
  // A test server must never accidentally spend a real provider credential or use its network.
  if (process.env.EXPECT_DB_BRANCH === "test") throw new Error("Catalogue test fixtures are required.");
  return createTmdbCatalogue(process.env.TMDB_READ_TOKEN);
}
