// `npm run marks:export -- --target test|production [--yes-production] [--allow-shrink] [--file <path>]`
// `npm run marks:restore -- --target test|production [--yes-production] [--dry-run] [--file <path>]`
//
// Marks backup (IMPLEMENTATION_PLAN.md §3.5, §10; how and when: docs/runbook.md). Export
// writes every marked film to the file; restore plans the writes that would make the
// database match the file, prints every one, and with `--dry-run` stops there. Restore
// writes only films whose marks differ, in one transaction, and never clears a mark the
// file doesn't mention. The file defaults to `data/marks.json` (committed) for production
// and `.cache/marks.test.json` (gitignored) for test, so a test run never overwrites the
// production backup.
import { createScriptDb } from "../src/db";
import { readDbBranch, type DbBranch } from "../src/db/meta";
import {
  applyRestore,
  exportMarksToFile,
  formatPlan,
  loadRestorePlan,
  PRODUCTION_MARKS_FILE,
  readMarksFile,
} from "./lib/marks";
import { loadTargetEnv, parseTargetArgs } from "./lib/target";

const DEFAULT_FILES: Record<DbBranch, string> = {
  production: PRODUCTION_MARKS_FILE,
  test: ".cache/marks.test.json",
};

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (command !== "export" && command !== "restore") {
    throw new Error("Use `npm run marks:export` or `npm run marks:restore`.");
  }
  const { target } = parseTargetArgs(argv, {
    flags: command === "export" ? ["--allow-shrink"] : ["--dry-run"],
    values: ["--file"],
  });
  const fileArg = argv.indexOf("--file");
  const file = fileArg >= 0 ? argv[fileArg + 1] : DEFAULT_FILES[target];
  const dryRun = argv.includes("--dry-run");
  const allowShrink = argv.includes("--allow-shrink");

  loadTargetEnv(target);
  const { db, close } = createScriptDb();
  try {
    const branch = await readDbBranch(db);
    if (branch !== target) {
      throw new Error(`app_meta.db_branch is ${JSON.stringify(branch)}, not "${target}". Nothing was written.`);
    }

    if (command === "export") {
      console.log(await exportMarksToFile(db, { target, file, allowShrink }));
      return;
    }

    const entries = readMarksFile(file);
    const plan = await loadRestorePlan(db, entries);
    console.log(formatPlan(plan, `Restore plan for ${target} from ${file}`));
    if (plan.problems.length > 0) {
      throw new Error("Some entries can't be restored. Nothing was written.");
    }
    if (dryRun) {
      console.log("Dry run: nothing was written.");
      return;
    }
    const written = await applyRestore(db, plan);
    console.log(written === 0 ? "Nothing to write." : `Wrote ${written} marks in one transaction.`);
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
