// `npm run race:check -- --target test|production [--data <dir>] [--season <year>]`
//
// What loading the data files would change in the race (docs/update-the-race.md): the load plan,
// every new and changed result, and the chances that move, in full for the current season and
// as one line per other season. Writes nothing, on either target, so production needs no
// `--yes-production`. "Clean" means the data files pass the checks and the database already
// matches them. Exits 1 when the files fail the checks or the plan has problems.
import { createScriptDb } from "../src/db";
import { isDbBranch, readDbBranch } from "../src/db/meta";
import { movies } from "../src/db/schema";
import { computePredictionRows, readPredictionTables } from "./lib/compute";
import { checkData, readDataSet } from "./lib/data-check";
import { formatLoadPlan, planLoad, planSize, readDbState } from "./lib/load";
import { chanceMoves, formatRaceCheck, tablesAfterPlan } from "./lib/race-check";
import { checkArgs, loadTargetEnv } from "./lib/target";

async function main() {
  const argv = process.argv.slice(2);
  checkArgs(argv, { values: ["--data", "--season"] });
  const value = (flag: string) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  const target = value("--target");
  if (!isDbBranch(target)) throw new Error("Pass --target test or --target production.");
  const dataDir = value("--data") ?? "data";
  const today = new Date().toISOString().slice(0, 10);

  const { data, errors: fileErrors } = readDataSet(dataDir);
  const { errors } = checkData(data, { today });
  if (fileErrors.length + errors.length > 0) {
    throw new Error(`The data files in ${dataDir}/ fail the checks (npm run data:check).\n- ${[...fileErrors, ...errors].join("\n- ")}`);
  }

  loadTargetEnv(target);
  const { db, close } = createScriptDb();
  try {
    const branch = await readDbBranch(db);
    if (branch !== target) throw new Error(`app_meta.db_branch is ${JSON.stringify(branch)}, not "${target}".`);

    const plan = planLoad(data, await readDbState(db, data));
    const planText = formatLoadPlan(plan, `race:check against ${target}${dataDir === "data" ? "" : ` (files in ${dataDir}/)`}`);
    if (plan.problems.length > 0) {
      console.log(planText);
      throw new Error("The plan has problems (above), so the load would refuse it.");
    }

    const tables = await readPredictionTables(db);
    const films = await db
      .select({ id: movies.id, title: movies.title, imdbId: movies.imdbId, wikidataId: movies.wikidataId })
      .from(movies);
    const after = tablesAfterPlan(tables, plan, films);
    const moves = chanceMoves(computePredictionRows(tables, today), computePredictionRows(after.tables, today));

    const oscars = after.tables.awardRows.find((a) => a.kind === "oscars");
    const latest = Math.max(...after.tables.editionRows.filter((e) => e.awardId === oscars?.id).map((e) => e.year));
    const season = value("--season") ? Number(value("--season")) : latest;
    const titles = new Map(after.films.map((f) => [f.id, f.title]));

    console.log(formatRaceCheck({ planText, plan, moves, season, titleOf: (id) => titles.get(id) ?? `film #${id}` }));
    const size = planSize(plan);
    console.log(
      size === 0
        ? `race:check is clean: the files pass the checks and ${target} already matches them.`
        : `race:check: ${size} writes waiting. Load them with npm run load -- --target ${target}${target === "production" ? " --yes-production" : ""} (dry run first).`,
    );
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
