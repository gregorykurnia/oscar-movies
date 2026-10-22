// `npm run load -- --target test|production [--yes-production] [--dry-run] [--only <award>]`
//
// Loads `data/` into the target database (IMPLEMENTATION_PLAN.md §3.5; the rules are in
// `scripts/lib/load.ts`). On production it first exports the marks to `data/marks.json` and
// stops if that fails; commit that file afterwards (docs/runbook.md). Always run the dry run
// first and read every line of the plan.
import { createScriptDb } from "../src/db";
import { readDbBranch } from "../src/db/meta";
import { readDataSet } from "./lib/data-check";
import { gitCommit, revalidateAwards, runLoad } from "./lib/load";
import { exportMarksToFile, PRODUCTION_MARKS_FILE } from "./lib/marks";
import { loadTargetEnv, parseTargetArgs } from "./lib/target";

async function main() {
  const argv = process.argv.slice(2);
  const { target } = parseTargetArgs(argv, { flags: ["--dry-run"], values: ["--only"] });
  const onlyArg = argv.indexOf("--only");
  const only = onlyArg >= 0 ? argv[onlyArg + 1] : undefined;
  const dryRun = argv.includes("--dry-run");

  const { data, errors } = readDataSet("data");
  if (errors.length > 0) {
    throw new Error(`The data files fail the checks (npm run data:check). Nothing was written.\n- ${errors.join("\n- ")}`);
  }

  loadTargetEnv(target);
  const { db, close } = createScriptDb();
  try {
    const branch = await readDbBranch(db);
    if (branch !== target) {
      throw new Error(`app_meta.db_branch is ${JSON.stringify(branch)}, not "${target}". Nothing was written.`);
    }
    await runLoad(db, data, {
      target,
      dryRun,
      only,
      backupMarks: () => exportMarksToFile(db, { target: "production", file: PRODUCTION_MARKS_FILE, allowShrink: false }),
      revalidate: revalidateAwards,
      gitCommit: gitCommit(),
    });
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
