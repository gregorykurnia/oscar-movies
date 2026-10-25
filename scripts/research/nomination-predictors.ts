// `npx tsx scripts/research/nomination-predictors.ts --target test [--category international]`
//
// The figures behind `docs/research/nomination-predictors.md` (task 8.3), read-only: the shortlist
// and its nominees, the best predictors in their groups, the strong awards and patterns as learned
// for the latest season, underdogs, the busy five and the candidate Snub risk signs, and both
// methods' backtests (each season from earlier seasons only). Writes nothing.
import { eq } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { readDbBranch, isDbBranch } from "../../src/db/meta";
import { awardCategories, awards } from "../../src/db/schema";
import { queryPatternSeasons } from "../../src/data/patterns";
import type { Figure } from "../../src/lib/accuracy";
import {
  analyzeSeason,
  backtest,
  bestPredictors,
  BUSY,
  FIRST_SEASON,
  isUsOnly,
  pastSeasons,
  PICKS_FROM,
  PREDICTOR_MIN_FILMS,
  seasonPatternState,
  underdogRecord,
  type PatternCategory,
  type PatternSeason,
} from "../../src/lib/patterns";
import { figureWords, patternLabel, predictorLabel, GROUP_LABELS } from "../../src/lib/patterns/words";
import { engineBacktest } from "../../src/lib/predict/method";
import { resultAsOf } from "../../src/lib/predict/season";
import { isNomination, isShortlisted } from "../../src/lib/stage";
import { checkArgs, loadTargetEnv } from "../lib/target";

const pct = (f: Figure) => (f.count === 0 ? "–" : `${Math.round((100 * f.hits) / f.count)}%`);
const fw = (f: Figure) => `${f.hits} of ${f.count} (${pct(f)})`;

/** Every finished season's shortlisted films, as the patterns read them (results before the nominations), with the busy five marked. */
function shortlisted(seasons: readonly PatternSeason[]) {
  const out: Array<{ year: number; title: string; results: Map<string, string>; nominated: boolean; busy: boolean; usOnly: boolean }> = [];
  for (const s of seasons) {
    if (s.year < FIRST_SEASON || !s.finished || seasonPatternState(s) !== "nominations") continue;
    const films = s.films
      .filter((f) => f.oscar !== null && isShortlisted(f.oscar))
      .map((f) => {
        const results = new Map<string, string>();
        for (const r of f.results) {
          const state = resultAsOf(r, s.oscar.nominationsOn);
          if (state !== null && results.get(r.category) !== "won") results.set(r.category, state);
        }
        return { year: s.year, title: f.title, results, nominated: isNomination(f.oscar!), busy: false, usOnly: isUsOnly(f.countries) };
      });
    const counts = films.map((f) => f.results.size).sort((a, b) => b - a);
    const fifth = counts[Math.min(BUSY, counts.length) - 1] ?? 0;
    for (const f of films) f.busy = f.results.size > 0 && f.results.size >= fifth;
    out.push(...films);
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  checkArgs(argv, { values: ["--category"] });
  const value = (flag: string) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
  const target = value("--target");
  if (!isDbBranch(target)) throw new Error("Pass --target test or --target production.");
  const category = (value("--category") ?? "international") as PatternCategory;
  const today = new Date().toISOString().slice(0, 10);
  loadTargetEnv(target);
  const { db, close } = createScriptDb();
  try {
    if ((await readDbBranch(db)) !== target) throw new Error(`app_meta.db_branch is not "${target}".`);
    const names = new Map<string, string>();
    const rows = await db
      .select({ award: awards.slug, awardName: awards.name, slug: awardCategories.slug, name: awardCategories.name })
      .from(awardCategories)
      .innerJoin(awards, eq(awards.id, awardCategories.awardId));
    for (const r of rows) names.set(`${r.award}/${r.slug}`, `${r.awardName} ${r.name}`);
    const awardName = (c: string) => names.get(c) ?? c;

    const { seasons } = await queryPatternSeasons(db, category, today);
    const best = bestPredictors({ category, seasons });
    console.log(`# ${category}: seasons ${best.seasons[0]}–${best.seasons.at(-1)}, shortlist ${fw(best.shortlist)}`);
    for (const g of best.groups) {
      console.log(`\n## ${GROUP_LABELS[g.group].title}`);
      for (const r of g.rows) console.log(`| ${predictorLabel(r.predictor, awardName)} | ${fw(r.gotIn)} | ${pct(r.caught)} |`);
    }
    console.log(`\nStrong awards (all finished seasons): ${best.strong.map(awardName).join("; ")}`);

    const latest = [...seasons].filter((s) => seasonPatternState(s) === "nominations").at(-1)!;
    const a = analyzeSeason({ category, year: latest.year, seasons })!;
    console.log(`\n## As learned for ${latest.year} (from ${a.history[0]}–${a.history.at(-1)})`);
    console.log(`Strong: ${a.awards.filter((x) => x.strong).map((x) => `${awardName(x.category)} ${figureWords(x.figure)}`).join("; ")}`);
    console.log(`Not strong (6+ films): ${a.awards.filter((x) => !x.strong && x.figure.count >= PREDICTOR_MIN_FILMS).map((x) => `${awardName(x.category)} ${fw(x.figure)}`).join("; ")}`);
    for (const p of a.patterns) console.log(`| ${patternLabel(p.pattern)} | ${fw(p.figure)} |`);

    const past = pastSeasons({ category, seasons });
    console.log(`\nUnderdogs ${PICKS_FROM}–: ${fw(underdogRecord(past))} of nominees`);

    const films = shortlisted(seasons);
    const busy = films.filter((f) => f.busy);
    const share: Figure = { hits: films.filter((f) => f.nominated).length, count: films.length };
    const of = (list: typeof films): Figure => ({ hits: list.filter((f) => f.nominated).length, count: list.length });
    const line = (label: string, list: typeof films) => {
      const f = of(list);
      const holds = f.count >= 6 && 100 * f.hits * share.count <= (100 * share.hits + 5 * share.count) * f.count;
      console.log(`| ${label} | ${fw(f)}${holds ? " HOLDS" : ""} | ${list.filter((x) => !x.nominated).map((x) => `${x.title} (${x.year})`).slice(0, 12).join(", ")}`);
    };
    console.log(`\n## Busy five: ${fw(of(busy))}; shortlist ${fw(share)}; a sign holds at ≤ ${Math.round((100 * share.hits) / share.count) + 5}% over 6+ films`);
    line("busy, 0 strong awards (all-seasons strong)", busy.filter((f) => ![...f.results.keys()].some((c) => best.strong.includes(c))));
    line("busy, no win anywhere", busy.filter((f) => ![...f.results.values()].includes("won")));
    line("busy, US-only", busy.filter((f) => f.usOnly));
    const cats = [...new Set(films.flatMap((f) => [...f.results.keys()]))].sort();
    for (const c of cats) {
      const without = busy.filter((f) => !f.results.has(c));
      const withIt = busy.filter((f) => f.results.has(c));
      if (without.length >= 6) line(`busy, no ${awardName(c)} nomination`, without);
      if (withIt.length >= 6) line(`busy, ${awardName(c)} nominee`, withIt);
    }
    // The same sign as the page would judge it: each season's strong awards from earlier seasons only.
    const asOf = seasons
      .map((s) => analyzeSeason({ category, year: s.year, seasons }))
      .filter((x) => x !== null && x.state === "nominations" && seasons.find((s) => s.year === x.year)!.finished)
      .flatMap((x) => x!.films.filter((f) => f.busy && f.strongAwards.length === 0).map((f) => ({ ...f, year: x!.year })));
    const asOfFigure: Figure = { hits: asOf.filter((f) => f.nominated).length, count: asOf.length };
    console.log(`| busy, 0 strong awards (each season's own strong awards, ${FIRST_SEASON + 1}–) | ${fw(asOfFigure)} | ${asOf.map((f) => `${f.title} (${f.year}${f.nominated ? ", in" : ""})`).join(", ")}`);
    const critics = ["new-york-critics/foreign", "los-angeles-critics/foreign", "national-society/foreign"].filter((c) => cats.includes(c));
    if (critics.length > 0) line(`2+ of ${critics.map(awardName).join(", ")}`, films.filter((f) => critics.filter((c) => f.results.has(c)).length >= 2));

    const withSnub = backtest({ category, seasons });
    const without = backtest({ category, seasons, snubRule: false });
    const engine = engineBacktest({ category, seasons, years: withSnub.rows.map((r) => r.year) });
    console.log(`\n## Backtest`);
    console.log(`| Year | ${withSnub.rows.map((r) => r.year).join(" | ")} | Total |`);
    console.log(`| Patterns | ${withSnub.rows.map((r) => r.hits).join(" | ")} | ${withSnub.hits} of ${withSnub.nominees} |`);
    console.log(`| Patterns, no snub rule | ${without.rows.map((r) => r.hits).join(" | ")} | ${without.hits} of ${without.nominees} |`);
    console.log(`| Engine | ${engine.rows.map((r) => r.hits).join(" | ")} | ${engine.hits} of ${engine.nominees} |`);
    const title = new Map(seasons.flatMap((s) => s.films.map((f) => [f.movie, f.title] as const)));
    for (const r of withSnub.rows.slice(-3)) {
      const e = engine.rows.find((x) => x.year === r.year)!;
      console.log(`${r.year} patterns: ${r.picks.map((m) => title.get(m)).join(", ")} | engine: ${e.picks.map((m) => title.get(m)).join(", ")}`);
    }
    for (const s of past.slice(-3)) {
      console.log(`${s.year} nominees: ${s.films.filter((f) => f.nominated).map((f) => `${f.title} (#${f.pick})`).join(", ")}`);
    }
  } finally {
    await close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
