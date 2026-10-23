// `npm run compute -- --target test|production [--yes-production]`
//
// Recomputes the computed tables from what the database holds (IMPLEMENTATION_PLAN.md §5.2:
// accuracy; predictions join in task 3.2), in one transaction. Every load already does this;
// run it on its own when a season ends with no new data (the Oscars' date passing turns a
// season into a counted one), then expire the cache.
import { createScriptDb } from "../src/db";
import { readDbBranch } from "../src/db/meta";
import { recomputeAccuracy } from "./lib/compute";
import { revalidateAwards } from "./lib/load";
import { loadTargetEnv, parseTargetArgs } from "./lib/target";

async function main() {
  const { target } = parseTargetArgs(process.argv.slice(2));
  loadTargetEnv(target);
  const { db, close } = createScriptDb();
  try {
    const branch = await readDbBranch(db);
    if (branch !== target) {
      throw new Error(`app_meta.db_branch is ${JSON.stringify(branch)}, not "${target}". Nothing was written.`);
    }
    const today = new Date().toISOString().slice(0, 10);
    const line = await db.transaction((tx) => recomputeAccuracy(tx, today));
    console.log(line);
    console.log(await revalidateAwards());
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
