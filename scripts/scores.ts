// `npm run scores:refresh -- --target test|production [--yes-production] [--year 2025 | 2024-2026]
//   [--limit 300] [--dry-run]`
//
// Runs the score batch (IMPLEMENTATION_PLAN.md §5.4) from the command line, the same code the
// daily cron runs. With `--year`, every film of those years is refreshed whatever its age;
// without it, only the films that are due. `test` shares the OMDb key's 1,000 calls a day with
// production, so refresh `test` only for the years a test needs, with a `--limit`.
import { createScriptDb } from "../src/db";
import { readDbBranch } from "../src/db/meta";
import { createScoreStore, describeRun, runScores, scoreClientsFromEnv } from "../src/lib/scores";
import { gitCommit, revalidateTags } from "./lib/load";
import { loadTargetEnv, parseTargetArgs } from "./lib/target";

/** "2025" or "2024-2026". Exported for the unit tests. */
export function parseYears(value: string): { from: number; to: number } {
  const match = /^(\d{4})(?:-(\d{4}))?$/.exec(value);
  if (!match) throw new Error(`--year takes a year or a range such as 2024-2026, not ${JSON.stringify(value)}.`);
  const from = Number(match[1]);
  const to = Number(match[2] ?? match[1]);
  if (to < from) throw new Error(`--year ${value} runs backwards.`);
  return { from, to };
}

function valueOf(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const { target } = parseTargetArgs(argv, { flags: ["--dry-run"], values: ["--year", "--limit"] });
  const yearArg = valueOf(argv, "--year");
  const years = yearArg ? parseYears(yearArg) : undefined;
  const limitArg = valueOf(argv, "--limit");
  const maxOmdbCalls = limitArg === undefined ? undefined : Number(limitArg);
  if (maxOmdbCalls !== undefined && !(Number.isInteger(maxOmdbCalls) && maxOmdbCalls > 0)) {
    throw new Error(`--limit takes a whole number above 0, not ${JSON.stringify(limitArg)}.`);
  }

  loadTargetEnv(target);
  const { db, close } = createScriptDb();
  try {
    const branch = await readDbBranch(db);
    if (branch !== target) {
      throw new Error(`app_meta.db_branch is ${JSON.stringify(branch)}, not "${target}". Nothing was written.`);
    }
    const store = createScoreStore(db, gitCommit());
    if (argv.includes("--dry-run")) {
      const queue = await store.queue({ now: new Date(), years });
      const omdb = queue.filter((f) => f.imdbId).length;
      const never = queue.filter((f) => f.scoresCheckedAt === null).length;
      console.log(
        `Dry run on ${target}: ${queue.length} films due (${never} never checked), ${omdb} with an IMDb ID ` +
          `(OMDb calls, before the cap${maxOmdbCalls ? ` of ${maxOmdbCalls}` : ""}). Nothing was called or written.`,
      );
      return;
    }
    const summary = await runScores(store, scoreClientsFromEnv(), {
      source: "script",
      years,
      maxOmdbCalls,
      log: console.log,
    });
    console.log(describeRun(summary));
    for (const e of summary.errors) console.log(`  movie ${e.movieId}: ${e.reason}`);
    if (summary.checked > 0) console.log(await revalidateTags(["scores"]));
    if (summary.stoppedBy === "refused" || summary.stoppedBy === "failing") process.exitCode = 1;
  } finally {
    await close();
  }
}

// Only when run, not when the unit tests import `parseYears`.
if (process.argv[1]?.endsWith("scores.ts")) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
