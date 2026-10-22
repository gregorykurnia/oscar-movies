// `npm run data:check [-- --base <git ref>]` (IMPLEMENTATION_PLAN.md §3.3): validates every
// file in `data/` and the rules across them, and lists unresolved films. Slugs are compared
// with the last commit (`--base`, default HEAD) because a slug must never change.
// Exits 1 on any error; warnings don't fail it. Reads no database and writes nothing.
import { execFileSync } from "node:child_process";
import { moviesFileSchema } from "../src/lib/data-files";
import { checkData, dataSummary, readDataSet } from "./lib/data-check";
import { checkArgs } from "./lib/target";

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/** Slugs by film key in `data/movies/` at `ref`; empty when git or the ref isn't there. */
function slugsAt(ref: string): Map<string, string> {
  const slugs = new Map<string, string>();
  const names = git(["ls-tree", "--name-only", `${ref}:data/movies`]);
  for (const name of (names ?? "").split("\n").filter((n) => /^\d{4}\.json$/.test(n))) {
    const text = git(["show", `${ref}:data/movies/${name}`]);
    const parsed = text === null ? null : moviesFileSchema.safeParse(JSON.parse(text));
    if (!parsed?.success) continue;
    for (const [key, m] of Object.entries(parsed.data)) slugs.set(key, m.slug);
  }
  return slugs;
}

function main() {
  const argv = process.argv.slice(2);
  checkArgs(argv, { values: ["--base"] });
  const i = argv.indexOf("--base");
  const base = i >= 0 ? argv[i + 1] : "HEAD";

  const { data, errors: fileErrors } = readDataSet("data");
  const today = new Date().toISOString().slice(0, 10);
  const { errors, warnings } = checkData(data, { today, previousSlugs: slugsAt(base) });
  const all = [...fileErrors, ...errors];

  for (const w of warnings) console.log(`warning: ${w}`);
  for (const e of all) console.log(`error: ${e}`);
  const summary = dataSummary(data);
  if (all.length > 0) {
    console.log(`data:check failed: ${all.length} error(s), ${warnings.length} warning(s) in ${summary}.`);
    process.exit(1);
  }
  console.log(`data:check passed: ${summary}${warnings.length ? `, ${warnings.length} warning(s)` : ""}.`);
}

main();
