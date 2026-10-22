// `npm run marks:export -- --target test|production [--yes-production] [--file <path>]`
// `npm run marks:restore -- --target test|production [--yes-production] [--dry-run] [--file <path>]`
//
// Marks backup (IMPLEMENTATION_PLAN.md §3.5, §10; how and when: docs/runbook.md). Export
// writes every marked film to the file; restore plans the writes that would make the
// database match the file, prints every one, and with `--dry-run` stops there. Restore
// writes only films whose marks differ, in one transaction, and never clears a mark the
// file doesn't mention. The file defaults to `data/marks.json` (committed) for production
// and `.cache/marks.test.json` (gitignored) for test, so a test run never overwrites the
// production backup.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createScriptDb } from "../src/db";
import { readDbBranch, type DbBranch } from "../src/db/meta";
import { marksFileSchema } from "../src/lib/data-files";
import { applyRestore, exportMarks, formatPlan, loadRestorePlan, serializeMarks } from "./lib/marks";
import { loadTargetEnv, parseTargetArgs } from "./lib/target";

const DEFAULT_FILES: Record<DbBranch, string> = {
  production: "data/marks.json",
  test: ".cache/marks.test.json",
};

function readMarksFile(path: string) {
  if (!existsSync(path)) throw new Error(`${path} doesn't exist. Nothing was written.`);
  const parsed = marksFileSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "file"}: ${i.message}`);
    throw new Error(`${path} isn't a valid marks file. Nothing was written.\n- ${issues.join("\n- ")}`);
  }
  return parsed.data;
}

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  if (command !== "export" && command !== "restore") {
    throw new Error("Use `npm run marks:export` or `npm run marks:restore`.");
  }
  const { target } = parseTargetArgs(argv);
  const fileArg = argv.indexOf("--file");
  const file = fileArg >= 0 ? argv[fileArg + 1] : DEFAULT_FILES[target];
  if (!file) throw new Error("--file needs a path.");
  const dryRun = argv.includes("--dry-run");

  loadTargetEnv(target);
  const { db, close } = createScriptDb();
  try {
    const branch = await readDbBranch(db);
    if (branch !== target) {
      throw new Error(`app_meta.db_branch is ${JSON.stringify(branch)}, not "${target}". Nothing was written.`);
    }

    if (command === "export") {
      const before = existsSync(file) ? marksFileSchema.safeParse(JSON.parse(readFileSync(file, "utf8"))) : null;
      const entries = await exportMarks(db);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, serializeMarks(entries));
      const was = before?.success ? ` (the file had ${before.data.length} before)` : "";
      console.log(`Exported ${entries.length} marked films from ${target} to ${file}${was}.`);
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
