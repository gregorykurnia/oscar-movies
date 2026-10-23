// `npm run compute -- --target test|production [--yes-production]`
//
// Recomputes the computed tables from what the database holds (IMPLEMENTATION_PLAN.md §5.2:
// accuracy; §5.3: predictions), in one transaction. Every load already does this; run it on its
// own when a season ends or an eve passes with no new data (the Oscars' dates passing turn a
// season into a counted one and add its eve snapshots), then expire the cache.
import { createScriptDb } from "../src/db";
import { readDbBranch } from "../src/db/meta";
import { recomputeAccuracy, recomputePredictions } from "./lib/compute";
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
    const lines = await db.transaction(async (tx) => [await recomputeAccuracy(tx, today), await recomputePredictions(tx, today)]);
    console.log(lines.join("\n"));
    console.log(await revalidateAwards());
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
