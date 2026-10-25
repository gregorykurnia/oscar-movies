// The computed tables (IMPLEMENTATION_PLAN.md §5.2–5.3): accuracy and predictions. Run by the
// loader inside its transaction (`afterWrites`) and by `npm run compute`.
import type { ScriptDb } from "../../src/db";
import { accuracy, awardCategories, awards, editions, movies, predictions, results } from "../../src/db/schema";
import {
  computeAccuracy,
  finishedYears,
  oscarNomineesByYear,
  oscarOutcomes,
  oscarShortlistsByYear,
  shortlistRule,
  type AccuracyEdition,
  type OscarEdition,
} from "../../src/lib/accuracy";
import { patternChances, patternSeasons, type PatternCategory, type PatternSeason } from "../../src/lib/patterns";
import { buildSeasons, eve, predictCategory, type OscarCategory, type Season, type Snapshot } from "../../src/lib/predict";
import { NOMINATION_METHOD } from "../../src/lib/predict/method";
import type { Outcome } from "../../src/lib/stage";

type Tx = Parameters<Parameters<ScriptDb["transaction"]>[0]>[0];
type Db = Pick<ScriptDb, "select" | "insert" | "delete"> | Tx;

type ResultRow = { editionId: number; categoryId: number; movieId: number; outcome: Outcome };

/**
 * Recomputes the accuracy of every non-Oscar category from the whole database and replaces
 * the `accuracy` table (a few dozen rows, so every season, not just the loaded ones). `today`
 * (`YYYY-MM-DD`) decides which Oscar seasons are over. Returns a line to print.
 */
export async function recomputeAccuracy(db: Db, today: string): Promise<string> {
  const awardRows = await db.select().from(awards);
  const categoryRows = await db.select().from(awardCategories);
  const editionRows = await db.select().from(editions);
  const resultRows: ResultRow[] = await db
    .select({ editionId: results.editionId, categoryId: results.categoryId, movieId: results.movieId, outcome: results.outcome })
    .from(results);

  const oscarsAward = awardRows.find((a) => a.kind === "oscars");
  if (!oscarsAward) throw new Error("No Oscars award in the database, so no accuracy can be worked out.");

  const byEditionCategory = new Map<string, ResultRow[]>();
  for (const r of resultRows) {
    const key = `${r.editionId}/${r.categoryId}`;
    byEditionCategory.set(key, [...(byEditionCategory.get(key) ?? []), r]);
  }
  const resultsOf = (editionId: number, categoryId: number) =>
    (byEditionCategory.get(`${editionId}/${categoryId}`) ?? []).map((r) => ({ movie: r.movieId, outcome: r.outcome }));
  const editionsOf = (awardId: number) => editionRows.filter((e) => e.awardId === awardId);

  // Per Oscar category: the finished seasons, each film's furthest outcome, each season's nominees
  // and its shortlist (for the shortlist rule).
  const oscarSide = new Map<
    string,
    {
      finished: Set<number>;
      outcomes: ReturnType<typeof oscarOutcomes>;
      nominees: ReturnType<typeof oscarNomineesByYear>;
      shortlists: ReturnType<typeof oscarShortlistsByYear>;
    }
  >();
  for (const c of categoryRows.filter((c) => c.awardId === oscarsAward.id)) {
    const seasons: OscarEdition[] = editionsOf(oscarsAward.id).map((e) => ({
      year: e.year,
      status: e.status,
      winnersOn: e.winnersOn,
      results: resultsOf(e.id, c.id),
    }));
    oscarSide.set(c.oscarCategory, {
      finished: finishedYears(seasons, today),
      outcomes: oscarOutcomes(seasons),
      nominees: oscarNomineesByYear(seasons),
      shortlists: oscarShortlistsByYear(seasons),
    });
  }

  const rows = categoryRows.flatMap((c) => {
    const award = awardRows.find((a) => a.id === c.awardId);
    const oscar = oscarSide.get(c.oscarCategory);
    if (!award || award.kind === "oscars" || !oscar) return [];
    const awardEditions: AccuracyEdition[] = editionsOf(award.id).map((e) => ({
      year: e.year,
      status: e.status,
      results: resultsOf(e.id, c.id),
    }));
    const f = computeAccuracy({
      winnersOnly: award.winnersOnly,
      editions: awardEditions,
      oscars: oscar.outcomes,
      oscarNominees: oscar.nominees,
      finished: oscar.finished,
      shortlist: shortlistRule(c.oscarCategory, award.kind, oscar.shortlists),
    });
    return [
      {
        categoryId: c.id,
        winHits: f.win.hits,
        winCount: f.win.count,
        nomHits: f.nomination.hits,
        nomCount: f.nomination.count,
        nomineesHits: f.nominees?.hits ?? null,
        nomineesCount: f.nominees?.count ?? null,
        caughtHits: f.caught?.hits ?? null,
        caughtCount: f.caught?.count ?? null,
      },
    ];
  });

  await db.delete(accuracy);
  if (rows.length > 0) await db.insert(accuracy).values(rows);
  return `Accuracy: ${rows.length} categories recomputed.`;
}


const OSCAR_CATEGORIES: OscarCategory[] = ["picture", "documentary", "international", "animated"];

export type Tables = {
  awardRows: Array<typeof awards.$inferSelect>;
  categoryRows: Array<typeof awardCategories.$inferSelect>;
  editionRows: Array<typeof editions.$inferSelect>;
  resultRows: Array<ResultRow & { id?: number }>;
  /** Titles and countries, for the nomination patterns (a film missing here: no countries). */
  movieRows?: Array<{ id: number; title: string; countries: string[] | null }>;
};

export { buildSeasons };

/**
 * The snapshots stored for a season: `live` always; each eve once its day has come (before it,
 * the eve would only repeat `live`), and only when the Oscar date is known.
 */
export function snapshotsFor(season: Season, today: string): Snapshot[] {
  const out: Snapshot[] = [{ kind: "live", today }];
  const { nominationsOn, winnersOn } = season.oscar;
  if (nominationsOn !== null && eve(nominationsOn) <= today) out.push({ kind: "eve_nominations" });
  if (winnersOn !== null && eve(winnersOn) <= today) out.push({ kind: "eve_ceremony" });
  return out;
}

/** The rows predictions are worked out from (results with their ids, so a plan can be laid over them). */
export async function readPredictionTables(db: Db): Promise<Tables> {
  return {
    awardRows: await db.select().from(awards),
    categoryRows: await db.select().from(awardCategories),
    editionRows: await db.select().from(editions),
    resultRows: await db
      .select({
        id: results.id,
        editionId: results.editionId,
        categoryId: results.categoryId,
        movieId: results.movieId,
        outcome: results.outcome,
      })
      .from(results),
    movieRows: await db.select({ id: movies.id, title: movies.title, countries: movies.countries }).from(movies),
  };
}

export type PredictionRow = Omit<typeof predictions.$inferInsert, "computedAt"> & {
  oscarCategory: OscarCategory;
  pWin: number;
  pNominate: number | null;
  /** Its season is finished (history), so the race shows its `eve_ceremony` snapshot. */
  finished: boolean;
};

/**
 * The predictions of every season, Oscar category and stored snapshot, from `tables`. Writes
 * nothing. Where `NOMINATION_METHOD` names patterns, a snapshot before the nominations once the
 * shortlist is out takes its % to be nominated from them (a contender off the shortlist: 0); the
 * rest, % to win and the rank stay the engine's.
 */
export function computePredictionRows(tables: Tables, today: string): PredictionRow[] {
  const rows: PredictionRow[] = [];
  const films = new Map((tables.movieRows ?? []).map((m) => [m.id, m]));
  for (const category of OSCAR_CATEGORIES) {
    const seasons = buildSeasons(tables, category, today);
    let withFilms: PatternSeason[] | null = null;
    for (const season of seasons) {
      for (const snapshot of snapshotsFor(season, today)) {
        const p = predictCategory({ category, year: season.year, seasons, snapshot });
        if (!p) continue;
        let patterns: Map<number | string, number> | null = null;
        if (NOMINATION_METHOD[category] === "patterns" && p.phase === "before") {
          withFilms ??= patternSeasons(seasons, films);
          patterns = patternChances({ category: category as PatternCategory, year: season.year, seasons: withFilms });
        }
        for (const c of p.contenders) {
          rows.push({
            year: season.year,
            oscarCategory: category,
            snapshot: snapshot.kind,
            movieId: Number(c.movie),
            pWin: c.pWin,
            pNominate: patterns ? (patterns.get(c.movie) ?? 0) : c.pNominate,
            rank: c.rank,
            why: c.why,
            finished: season.finished,
          });
        }
      }
    }
  }
  return rows;
}

/**
 * Recomputes the predictions of every season and Oscar category and replaces the `predictions`
 * table. Every season, not just the loaded ones: each season is history for all the others
 * (leave one season out), so one new result can move any of them. Returns a line to print.
 */
export async function recomputePredictions(db: Db, today: string): Promise<string> {
  const computedAt = new Date();
  const rows = computePredictionRows(await readPredictionTables(db), today).map((r) => ({
    year: r.year,
    oscarCategory: r.oscarCategory,
    snapshot: r.snapshot,
    movieId: r.movieId,
    pWin: r.pWin,
    pNominate: r.pNominate,
    rank: r.rank,
    why: r.why,
    computedAt,
  }));
  await db.delete(predictions);
  for (let i = 0; i < rows.length; i += 500) await db.insert(predictions).values(rows.slice(i, i + 500));
  return `Predictions: ${rows.length} rows recomputed.`;
}
