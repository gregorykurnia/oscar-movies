// The "why" behind a film's % (IMPLEMENTATION_PLAN.md §5.3): its four strongest results with
// their record, and the past contenders with the same top two results.
import { weightOf, type Tally } from "./model";
import { parseFeature } from "./season";
import type { MovieKey, ResultState, Why, WhyResult } from "./types";

export type PastContender = { movie: MovieKey; year: number; features: readonly string[]; won: boolean };

export function buildWhy(
  features: readonly string[],
  w: ReadonlyMap<string, number>,
  history: Tally,
  past: ReadonlyArray<PastContender>,
): Why {
  const ranked = [...features].sort((x, y) => {
    const byWeight = weightOf(y, w) - weightOf(x, w);
    return byWeight !== 0 ? byWeight : (history.features.get(y)?.n ?? 0) - (history.features.get(x)?.n ?? 0);
  });
  const top: WhyResult[] = ranked.slice(0, 4).map((key) => {
    const { category, state } = parseFeature(key);
    const record = history.features.get(key);
    return { category, result: state as ResultState, weight: weightOf(key, w), hits: record?.hits ?? 0, count: record?.n ?? 0 };
  });

  const run = ranked.slice(0, 2);
  if (run.length === 0) return { top, similar: null };
  const films = past
    .filter((p) => run.every((key) => p.features.includes(key)))
    .map((p) => ({ movie: p.movie, year: p.year, won: p.won }))
    .sort((x, y) => x.year - y.year);
  return { top, similar: { count: films.length, won: films.filter((f) => f.won).length, films } };
}
