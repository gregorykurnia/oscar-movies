// `npm run db:seed:test` (IMPLEMENTATION_PLAN.md §3.6): loads the data files into the `test`
// branch with the loader (`scripts/lib/load.ts`), then resets the marks to
// `tests/fixtures/marks.json`. Test only: there is no `--target`, it reads `.env.test` and
// stops unless `app_meta` says `test`.
import { readFileSync } from "node:fs";
import { inArray, sql } from "drizzle-orm";
import { createScriptDb, type ScriptDb } from "../src/db";
import { readDbBranch } from "../src/db/meta";
import { marks, movies } from "../src/db/schema";
import { recomputeAccuracy, recomputePredictions } from "./lib/compute";
import { readDataSet } from "./lib/data-check";
import { revalidateAwards, runLoad } from "./lib/load";
import { loadTargetEnv } from "./lib/target";

type Tx = Parameters<Parameters<ScriptDb["transaction"]>[0]>[0];

type MarksFile = Array<{ imdb: string; watched: boolean; want: boolean }>;

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

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
    const { data, errors } = readDataSet("data");
    if (errors.length > 0) throw new Error(`The data files fail the checks:\n- ${errors.join("\n- ")}`);
    await runLoad(db, data, {
      target: "test",
      dryRun: false,
      afterWrites: async (tx) => {
        const today = new Date().toISOString().slice(0, 10);
        console.log(await recomputeAccuracy(tx, today));
        console.log(await recomputePredictions(tx, today));
      },
      revalidate: revalidateAwards,
    });
    const fixtures = await db.transaction(resetMarks);
    const [{ films }] = await db.select({ films: sql<number>`count(*)::int` }).from(movies);
    console.log(`Seeded test: ${films} films, marks reset to ${fixtures} fixtures.`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
