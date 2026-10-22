// Database tests run against the Neon `test` branch only (CLAUDE.md). Loads `.env.test`
// over the shell's env and stops every test file at once unless `app_meta` says `test`.
import { createScriptDb } from "../../src/db";
import { readDbBranch } from "../../src/db/meta";
import { loadTargetEnv } from "../../scripts/lib/target";

loadTargetEnv("test");

const guard = createScriptDb();
const branch = await readDbBranch(guard.db).finally(() => guard.close());
if (branch !== "test") {
  throw new Error(
    `Database tests need the test branch, but app_meta.db_branch is ${JSON.stringify(branch)}. Stopping.`,
  );
}
