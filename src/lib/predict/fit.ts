// Fitting by leaving one season out (IMPLEMENTATION_PLAN.md §5.3): every history season is
// scored with weights learned from the other history seasons only, and α, the temperature and
// the logistic's a and b are chosen on those out-of-season scores.
import { combine, score, sigmoid, tally, weights, type Labelled, type Tally } from "./model";

/** One history season at its cutoff: its contenders' features and answers, per model. */
export type HistorySeason = { year: number; win: Labelled[]; nominate: Labelled[] };

/** α to try; the first wins a tie, so the plan's starting value comes first. */
export const ALPHAS = [3, 0.5, 1, 2, 5, 8, 13, 21];
const BETA_MIN = 0.01;
const BETA_MAX = 10;
const RIDGE = 0.01;

type Model = "win" | "nominate";

/** Each season's scores from weights that never saw it. */
export function outOfSeason(seasons: ReadonlyArray<HistorySeason>, model: Model, alpha: number): Array<{ scores: number[]; hits: boolean[] }> {
  const per = seasons.map((s) => tally(s[model]));
  const total = per.reduce<Tally>((acc, t) => combine(acc, t, 1), { n: 0, hits: 0, features: new Map() });
  return seasons.map((s, i) => {
    const w = weights(combine(total, per[i], -1), alpha);
    return { scores: s[model].map((r) => score(r.features, w)), hits: s[model].map((r) => r.hit) };
  });
}

/** Log loss of a softmax with inverse temperature β over seasons with a winner among the contenders. */
function softmaxLoss(folds: ReadonlyArray<{ scores: number[]; hits: boolean[] }>, beta: number): number {
  let loss = 0;
  for (const { scores, hits } of folds) {
    const max = Math.max(...scores);
    const lse = beta * max + Math.log(scores.reduce((sum, s) => sum + Math.exp(beta * (s - max)), 0));
    const won = scores.filter((_, i) => hits[i]);
    loss += won.reduce((sum, s) => sum + lse - beta * s, 0) / won.length;
  }
  return loss;
}

/** Minimum of a unimodal function on [low, high] (the softmax loss is convex in β). */
function goldenMin(f: (x: number) => number, low: number, high: number): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let a = low;
  let b = high;
  for (let i = 0; i < 80; i += 1) {
    const c = b - g * (b - a);
    const d = a + g * (b - a);
    if (f(c) <= f(d)) b = d;
    else a = c;
  }
  return (a + b) / 2;
}

export type WinFit = { alpha: number; temperature: number };

/** α and the temperature T for % to win; with no usable history, α = 3 and T = 1. */
export function fitWin(seasons: ReadonlyArray<HistorySeason>): WinFit {
  let best: (WinFit & { loss: number }) | null = null;
  for (const alpha of ALPHAS) {
    const folds = outOfSeason(seasons, "win", alpha).filter((f) => f.hits.some(Boolean));
    if (folds.length === 0) break;
    const beta = goldenMin((x) => softmaxLoss(folds, x), BETA_MIN, BETA_MAX);
    const loss = softmaxLoss(folds, beta);
    if (best === null || loss < best.loss) best = { alpha, temperature: 1 / beta, loss };
  }
  return best ? { alpha: best.alpha, temperature: best.temperature } : { alpha: ALPHAS[0], temperature: 1 };
}

/** Logistic regression of hits on one score (Newton's method, a small ridge so it never runs off). */
export function fitLogistic(scores: readonly number[], hits: readonly boolean[]): { a: number; b: number } {
  const mean = hits.filter(Boolean).length / hits.length;
  let a = 0;
  let b = Math.log(mean / (1 - mean));
  for (let iter = 0; iter < 100; iter += 1) {
    let ga = RIDGE * a;
    let gb = RIDGE * b;
    let haa = RIDGE;
    let hab = 0;
    let hbb = RIDGE;
    scores.forEach((s, i) => {
      const p = sigmoid(a * s + b);
      const r = p - (hits[i] ? 1 : 0);
      const v = p * (1 - p);
      ga += r * s;
      gb += r;
      haa += v * s * s;
      hab += v * s;
      hbb += v;
    });
    const det = haa * hbb - hab * hab;
    const da = (hbb * ga - hab * gb) / det;
    const db = (haa * gb - hab * ga) / det;
    a -= da;
    b -= db;
    if (Math.abs(da) + Math.abs(db) < 1e-10) break;
  }
  return { a, b };
}

function logisticLoss(scores: readonly number[], hits: readonly boolean[], a: number, b: number): number {
  return scores.reduce((sum, s, i) => {
    const p = Math.min(1 - 1e-12, Math.max(1e-12, sigmoid(a * s + b)));
    return sum - Math.log(hits[i] ? p : 1 - p);
  }, 0);
}

export type NominateFit = { alpha: number; a: number; b: number };

/** α, a and b for % to be nominated; with no usable history, α = 3, a = 1, b = 0 (the slots set the level). */
export function fitNominate(seasons: ReadonlyArray<HistorySeason>): NominateFit {
  let best: (NominateFit & { loss: number }) | null = null;
  for (const alpha of ALPHAS) {
    const folds = outOfSeason(seasons, "nominate", alpha);
    const scores = folds.flatMap((f) => f.scores);
    const hits = folds.flatMap((f) => f.hits);
    if (!hits.some(Boolean) || hits.every(Boolean)) break;
    const { a, b } = fitLogistic(scores, hits);
    const loss = logisticLoss(scores, hits, a, b);
    if (best === null || loss < best.loss) best = { alpha, a, b, loss };
  }
  return best ? { alpha: best.alpha, a: best.a, b: best.b } : { alpha: ALPHAS[0], a: 1, b: 0 };
}
