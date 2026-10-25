// The prediction engine (IMPLEMENTATION_PLAN.md §5.3, product plan §3.4). Pure: `scripts/compute.ts`
// (task 3.2) reads the seasons, calls `predictCategory` per year, category and snapshot, and stores
// the result in `predictions`; pages never compute.
import { isNomination } from "../stage";
import { fitNominate, fitWin, type HistorySeason } from "./fit";
import { capEarly, EARLY_CAP, fillSlots, LATE_CAP, score, softmax, tally, weights } from "./model";
import { historyCutoff, seasonAsOf, targetCutoff } from "./season";
import type { CategoryPrediction, ContenderPrediction, OscarCategory, Season, Snapshot } from "./types";
import { buildWhy, type PastContender } from "./why";

export type * from "./types";
export { nominationSlots, eve } from "./season";
export { buildSeasons, type SeasonTables } from "./tables";

/**
 * One category's chances in one season. History is every finished season except `year` (leave
 * one season out), each read at the same point of its season as the target. With
 * `historyBefore`, only the finished seasons before that year (as it would have run live: the
 * backtests that choose `NOMINATION_METHOD`). Null when the snapshot's Oscar date isn't known,
 * or the season isn't in `seasons`.
 */
export function predictCategory(input: {
  category: OscarCategory;
  year: number;
  seasons: ReadonlyArray<Season>;
  snapshot: Snapshot;
  historyBefore?: number;
}): CategoryPrediction | null {
  const { category, year, snapshot } = input;
  const target = input.seasons.find((s) => s.year === year);
  if (!target) return null;
  const cutoff = targetCutoff(snapshot, target.oscar);
  if (cutoff === undefined) return null;
  const now = seasonAsOf(target, category, cutoff);

  const history: HistorySeason[] = [];
  const past: PastContender[] = [];
  for (const season of input.seasons) {
    if (!season.finished || season.year === year) continue;
    if (input.historyBefore !== undefined && season.year >= input.historyBefore) continue;
    const at = historyCutoff(snapshot, now.phase, target.oscar, season.oscar);
    if (at === undefined) continue;
    const then = seasonAsOf(season, category, at);
    if (then.phase !== now.phase) continue;
    const answers = then.contenders.map((c) => ({
      won: c.film.oscar === "won",
      nominated: c.film.oscar !== null && isNomination(c.film.oscar),
    }));
    history.push({
      year: season.year,
      win: then.contenders.map((c, i) => ({ features: c.winFeatures, hit: answers[i].won })),
      nominate: then.contenders.map((c, i) => ({ features: c.nomFeatures, hit: answers[i].nominated })),
    });
    then.contenders.forEach((c, i) => past.push({ movie: c.movie, year: season.year, features: c.winFeatures, won: answers[i].won }));
  }

  const winFit = fitWin(history);
  const winTally = tally(history.flatMap((s) => s.win));
  const winWeights = weights(winTally, winFit.alpha);
  const scores = now.contenders.map((c) => score(c.winFeatures, winWeights));
  const raw = softmax(scores, winFit.temperature);
  const pWin = capEarly(raw, now.phase === "before" ? EARLY_CAP : LATE_CAP);

  let pNominate: Array<number | null> = now.contenders.map(() => null);
  let nominate: CategoryPrediction["params"]["nominate"] = null;
  if (now.phase === "before") {
    nominate = fitNominate(history);
    const nomWeights = weights(tally(history.flatMap((s) => s.nominate)), nominate.alpha);
    const nomScores = now.contenders.map((c) => score(c.nomFeatures, nomWeights));
    pNominate = fillSlots(nomScores, nominate.a, nominate.b, target.slots);
  }

  const contenders: ContenderPrediction[] = now.contenders.map((c, i) => ({
    movie: c.movie,
    pWin: pWin[i],
    pNominate: pNominate[i],
    rank: 0,
    score: scores[i],
    why: buildWhy(c.winFeatures, winWeights, winTally, past),
  }));
  contenders
    .sort(
      (x, y) =>
        y.pWin - x.pWin || (y.pNominate ?? 0) - (x.pNominate ?? 0) || y.score - x.score || String(x.movie).localeCompare(String(y.movie)),
    )
    .forEach((c, i) => (c.rank = i + 1));

  return {
    year,
    phase: now.phase,
    early: now.early,
    history: history.map((s) => s.year).sort((a, b) => a - b),
    params: { win: winFit, nominate },
    contenders,
  };
}
