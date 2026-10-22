// `npm run db:seed:test` (IMPLEMENTATION_PLAN.md §3.6): loads the data files into the `test`
// branch, then resets the marks to `tests/fixtures/marks.json`. Test only: there is no
// `--target`, it reads `.env.test` and stops unless `app_meta` says `test`.
//
// Phase 0 stand-in for the loader: it reads the tiny Phase 0 set in `data/` with plain types
// and upserts it in one transaction. Task 1.2 replaces `loadDataFiles` with the loader
// (`scripts/load.ts`), which validates the files (1.1) and plans every change.
import { readdirSync, readFileSync } from "node:fs";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createScriptDb, type ScriptDb } from "../src/db";
import { readDbBranch } from "../src/db/meta";
import { awardCategories, awards, editions, marks, movies, results } from "../src/db/schema";
import { loadTargetEnv } from "./lib/target";

type Tx = Parameters<Parameters<ScriptDb["transaction"]>[0]>[0];

type AwardFile = Array<
  Omit<typeof awards.$inferInsert, "id"> & {
    categories: Array<Omit<typeof awardCategories.$inferInsert, "id" | "awardId">>;
  }
>;
type MovieFile = Record<
  string,
  { slug: string; title: string; originalTitle?: string; originalLang?: string; countries: string[]; language?: string; wd?: string; tmdb?: number }
>;
type EditionFile = Omit<typeof editions.$inferInsert, "id" | "awardId"> & {
  award: string;
  results: Array<{ category: string; imdb: string; title: string; outcome: (typeof results.$inferInsert)["outcome"]; country?: string }>;
};
type MarksFile = Array<{ imdb: string; watched: boolean; want: boolean }>;

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;
const jsonFiles = (dir: string) =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => `${dir}/${f}`);

async function loadDataFiles(tx: Tx) {
  for (const award of readJson<AwardFile>("data/awards.json")) {
    const { categories, ...fields } = award;
    const [{ id: awardId }] = await tx
      .insert(awards)
      .values(fields)
      .onConflictDoUpdate({ target: awards.slug, set: fields })
      .returning({ id: awards.id });
    for (const category of categories) {
      await tx
        .insert(awardCategories)
        .values({ ...category, awardId })
        .onConflictDoUpdate({ target: [awardCategories.awardId, awardCategories.slug], set: category });
    }
  }

  for (const file of jsonFiles("data/movies")) {
    const year = Number(file.match(/(\d{4})\.json$/)?.[1]);
    for (const [imdbId, m] of Object.entries(readJson<MovieFile>(file))) {
      const fields = {
        slug: m.slug,
        title: m.title,
        originalTitle: m.originalTitle ?? null,
        originalLang: m.originalLang ?? null,
        year,
        countries: m.countries,
        language: m.language ?? null,
        wikidataId: m.wd ?? null,
        tmdbId: m.tmdb ?? null,
      };
      await tx.insert(movies).values({ ...fields, imdbId }).onConflictDoUpdate({ target: movies.imdbId, set: fields });
    }
  }

  let resultCount = 0;
  for (const file of jsonFiles("data/editions")) {
    const { award: awardSlug, results: rows, ...fields } = readJson<EditionFile>(file);
    const [award] = await tx.select({ id: awards.id }).from(awards).where(eq(awards.slug, awardSlug));
    if (!award) throw new Error(`${file}: unknown award "${awardSlug}".`);
    const [{ id: editionId }] = await tx
      .insert(editions)
      .values({ ...fields, awardId: award.id })
      .onConflictDoUpdate({ target: [editions.awardId, editions.year], set: fields })
      .returning({ id: editions.id });
    // A reloaded edition's results are replaced as a whole (§3.1 rules).
    await tx.delete(results).where(eq(results.editionId, editionId));
    for (const r of rows) {
      const [category] = await tx
        .select({ id: awardCategories.id })
        .from(awardCategories)
        .where(and(eq(awardCategories.awardId, award.id), eq(awardCategories.slug, r.category)));
      const [movie] = await tx.select({ id: movies.id }).from(movies).where(eq(movies.imdbId, r.imdb));
      if (!category || !movie) throw new Error(`${file}: "${r.title}" has an unknown category or film.`);
      await tx.insert(results).values({
        editionId,
        categoryId: category.id,
        movieId: movie.id,
        outcome: r.outcome,
        country: r.country ?? null,
      });
      resultCount += 1;
    }
  }
  return resultCount;
}

async function resetMarks(tx: Tx) {
  const fixture = readJson<MarksFile>("tests/fixtures/marks.json");
  const found = await tx
    .select({ id: movies.id, imdbId: movies.imdbId })
    .from(movies)
    .where(inArray(movies.imdbId, fixture.map((m) => m.imdb)));
  const idOf = new Map(found.map((m) => [m.imdbId, m.id]));
  await tx.delete(marks);
  for (const m of fixture) {
    const movieId = idOf.get(m.imdb);
    if (movieId === undefined) throw new Error(`tests/fixtures/marks.json: no film ${m.imdb}.`);
    await tx.insert(marks).values({ movieId, watched: m.watched, want: m.want });
  }
  return fixture.length;
}

async function main() {
  loadTargetEnv("test");
  const { db, close } = createScriptDb();
  try {
    const branch = await readDbBranch(db);
    if (branch !== "test") {
      throw new Error(`app_meta.db_branch is ${JSON.stringify(branch)}, not "test". Nothing was written.`);
    }
    const counts = await db.transaction(async (tx) => ({
      results: await loadDataFiles(tx),
      marks: await resetMarks(tx),
    }));
    const [{ films }] = await db.select({ films: sql<number>`count(*)::int` }).from(movies);
    console.log(`Seeded test: ${films} films, ${counts.results} results, marks reset to ${counts.marks} fixtures.`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
