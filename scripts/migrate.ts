// `npm run db:migrate:test` (`--target test`) and `npm run db:migrate` (`--target production
// --yes-production`, only with the owner's approval; CLAUDE.md).
//
// Runs `drizzle-kit migrate` behind the guards every writing script has (IMPLEMENTATION_PLAN.md §2):
// the target's env file wins over anything exported in the shell (`node --env-file` doesn't),
// the file is refused when it reaches the other target's database, and once `app_meta` exists
// its `db_branch` must be the target. Before the first migration there is no `app_meta` yet.
import { spawnSync } from "node:child_process";
import { sql } from "drizzle-orm";
import { createScriptDb } from "../src/db";
import { readDbBranch } from "../src/db/meta";
import { loadTargetEnv, parseTargetArgs } from "./lib/target";

async function main() {
  const { target } = parseTargetArgs(process.argv.slice(2));
  loadTargetEnv(target);

  const { db, close } = createScriptDb();
  try {
    const { rows } = await db.execute<{ exists: boolean }>(
      sql`select to_regclass('public.app_meta') is not null as exists`,
    );
    const branch = rows[0]?.exists ? await readDbBranch(db) : null;
    if (branch !== null && branch !== target) {
      throw new Error(`app_meta.db_branch is ${JSON.stringify(branch)}, not "${target}". Nothing was migrated.`);
    }
  } finally {
    await close();
  }

  console.log(`Migrating ${target}…`);
  const result = spawnSync("./node_modules/.bin/drizzle-kit", ["migrate"], { env: process.env, stdio: "inherit" });
  process.exit(result.status ?? 1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
