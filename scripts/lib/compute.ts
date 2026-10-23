// The computed tables (IMPLEMENTATION_PLAN.md §5.2–5.3): accuracy now, predictions in task 3.2.
// Run by the loader inside its transaction (`afterWrites`) and by `npm run compute`.
import type { ScriptDb } from "../../src/db";
import { accuracy, awardCategories, awards, editions, results } from "../../src/db/schema";
import {
  computeAccuracy,
  finishedYears,
  oscarOutcomes,
  type AccuracyEdition,
  type OscarEdition,
} from "../../src/lib/accuracy";
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

  // Per Oscar category: the finished seasons and each film's furthest outcome.
  const oscarSide = new Map<string, { finished: Set<number>; outcomes: ReturnType<typeof oscarOutcomes> }>();
  for (const c of categoryRows.filter((c) => c.awardId === oscarsAward.id)) {
    const seasons: OscarEdition[] = editionsOf(oscarsAward.id).map((e) => ({
      year: e.year,
      status: e.status,
      winnersOn: e.winnersOn,
      results: resultsOf(e.id, c.id),
    }));
    oscarSide.set(c.oscarCategory, { finished: finishedYears(seasons, today), outcomes: oscarOutcomes(seasons) });
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
    const f = computeAccuracy({ winnersOnly: award.winnersOnly, editions: awardEditions, oscars: oscar.outcomes, finished: oscar.finished });
    return [
      {
        categoryId: c.id,
        winHits: f.win.hits,
        winCount: f.win.count,
        nomHits: f.nomination.hits,
        nomCount: f.nomination.count,
        nomineesHits: f.nominees?.hits ?? null,
        nomineesCount: f.nominees?.count ?? null,
      },
    ];
  });

  await db.delete(accuracy);
  if (rows.length > 0) await db.insert(accuracy).values(rows);
  return `Accuracy: ${rows.length} categories recomputed.`;
}

