// `npm run db:mark-branch -- --target test|production [--yes-production]`
// Writes `app_meta.db_branch` once per Neon branch (IMPLEMENTATION_PLAN.md §2), after the
// first migration. Running it again is a no-op; a branch already marked as the other target
// is never overwritten.
import { createScriptDb } from "../src/db";
import { readDbBranch } from "../src/db/meta";
import { appMeta } from "../src/db/schema";
import { loadTargetEnv, parseTargetArgs } from "./lib/target";

async function main() {
  const { target } = parseTargetArgs(process.argv.slice(2));
  loadTargetEnv(target);

  const { db, close } = createScriptDb();
  try {
    const current = await readDbBranch(db);
    if (current === target) {
      console.log(`app_meta.db_branch is already "${target}". Nothing to do.`);
      return;
    }
    if (current !== null) {
      throw new Error(
        `This database is marked "${current}", not "${target}". Check the env file; nothing was written.`,
      );
    }
    await db.insert(appMeta).values({ key: "db_branch", value: target });
    console.log(`Marked this database as "${target}" (app_meta.db_branch).`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
