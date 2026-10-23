// The computed tables (IMPLEMENTATION_PLAN.md §5.2–5.3): accuracy and predictions. Run by the
// loader inside its transaction (`afterWrites`) and by `npm run compute`.
import type { ScriptDb } from "../../src/db";
import { accuracy, awardCategories, awards, editions, predictions, results } from "../../src/db/schema";
import {
  computeAccuracy,
  finishedYears,
  oscarOutcomes,
  type AccuracyEdition,
  type OscarEdition,
} from "../../src/lib/accuracy";
import {
  eve,
  nominationSlots,
  predictCategory,
  type OscarCategory,
  type PrecursorResult,
  type Season,
  type SeasonFilm,
  type Snapshot,
} from "../../src/lib/predict";
import { isNomination, type Outcome } from "../../src/lib/stage";

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


const OSCAR_CATEGORIES: OscarCategory[] = ["picture", "documentary", "international", "animated"];

export type Tables = {
  awardRows: Array<typeof awards.$inferSelect>;
  categoryRows: Array<typeof awardCategories.$inferSelect>;
  editionRows: Array<typeof editions.$inferSelect>;
  resultRows: Array<ResultRow & { id?: number }>;
};

/**
 * Every season of one Oscar category, as the engine reads it: per Oscars edition, each film with
 * a result at an award category mapped to it that film year (with its edition's dates), and its
 * Oscar outcome. `today` decides which seasons are finished (history).
 */
export function buildSeasons(t: Tables, category: OscarCategory, today: string): Season[] {
  const oscarsAward = t.awardRows.find((a) => a.kind === "oscars");
  if (!oscarsAward) throw new Error("No Oscars award in the database, so no predictions can be worked out.");
  const oscarCategory = t.categoryRows.find((c) => c.awardId === oscarsAward.id && c.oscarCategory === category);
  const awardSlug = new Map(t.awardRows.map((a) => [a.id, a.slug]));
  const mapped = new Map(
    t.categoryRows
      .filter((c) => c.awardId !== oscarsAward.id && c.oscarCategory === category)
      .map((c) => [c.id, `${awardSlug.get(c.awardId)}/${c.slug}`]),
  );
  const editionById = new Map(t.editionRows.map((e) => [e.id, e]));
  const oscarEditions = t.editionRows.filter((e) => e.awardId === oscarsAward.id);
  const finished = finishedYears(
    oscarEditions.map((e) => ({
      year: e.year,
      status: e.status,
      winnersOn: e.winnersOn,
      results: t.resultRows
        .filter((r) => r.editionId === e.id && r.categoryId === oscarCategory?.id)
        .map((r) => ({ movie: r.movieId, outcome: r.outcome })),
    })),
    today,
  );

  return oscarEditions
    .map((oscars) => {
      const films = new Map<number, { results: PrecursorResult[]; oscar: Outcome | null }>();
      const film = (movie: number) => {
        let f = films.get(movie);
        if (!f) films.set(movie, (f = { results: [], oscar: null }));
        return f;
      };
      for (const r of t.resultRows) {
        const edition = editionById.get(r.editionId);
        if (!edition || edition.year !== oscars.year) continue;
        if (edition.id === oscars.id) {
          if (r.categoryId === oscarCategory?.id) film(r.movieId).oscar = r.outcome;
          continue;
        }
        const key = mapped.get(r.categoryId);
        if (key === undefined) continue;
        film(r.movieId).results.push({
          award: awardSlug.get(edition.awardId)!,
          category: key,
          outcome: r.outcome,
          nominationsOn: edition.nominationsOn,
          winnersOn: edition.winnersOn,
        });
      }
      const seasonFilms: SeasonFilm[] = [...films].map(([movie, f]) => ({ movie, ...f }));
      const nominees = seasonFilms.filter((f) => f.oscar !== null && isNomination(f.oscar)).length;
      return {
        year: oscars.year,
        finished: finished.has(oscars.year),
        slots: nominationSlots(category, oscars.year, nominees),
        oscar: { shortlistOn: oscars.shortlistOn, nominationsOn: oscars.nominationsOn, winnersOn: oscars.winnersOn },
        films: seasonFilms,
      };
    })
    .sort((a, b) => a.year - b.year);
}

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
  };
}

export type PredictionRow = Omit<typeof predictions.$inferInsert, "computedAt"> & {
  oscarCategory: OscarCategory;
  pWin: number;
  pNominate: number | null;
  /** Its season is finished (history), so the race shows its `eve_ceremony` snapshot. */
  finished: boolean;
};

/** The predictions of every season, Oscar category and stored snapshot, from `tables`. Writes nothing. */
export function computePredictionRows(tables: Tables, today: string): PredictionRow[] {
  const rows: PredictionRow[] = [];
  for (const category of OSCAR_CATEGORIES) {
    const seasons = buildSeasons(tables, category, today);
    for (const season of seasons) {
      for (const snapshot of snapshotsFor(season, today)) {
        const p = predictCategory({ category, year: season.year, seasons, snapshot });
        if (!p) continue;
        for (const c of p.contenders) {
          rows.push({
            year: season.year,
            oscarCategory: category,
            snapshot: snapshot.kind,
            movieId: Number(c.movie),
            pWin: c.pWin,
            pNominate: c.pNominate,
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
