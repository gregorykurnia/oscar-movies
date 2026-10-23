// The maths of IMPLEMENTATION_PLAN.md §5.3: smoothed hit-rate weights, the softmax for % to win
// with the early cap, and the logistic for % to be nominated shifted to fill the slots.

/** Contenders and hits overall and per feature, for one model (win or nominate). */
export type Tally = { n: number; hits: number; features: Map<string, { n: number; hits: number }> };

export type Labelled = { features: readonly string[]; hit: boolean };

export function tally(rows: ReadonlyArray<Labelled>): Tally {
  const t: Tally = { n: 0, hits: 0, features: new Map() };
  for (const row of rows) {
    t.n += 1;
    if (row.hit) t.hits += 1;
    for (const f of row.features) {
      const c = t.features.get(f) ?? { n: 0, hits: 0 };
      c.n += 1;
      if (row.hit) c.hits += 1;
      t.features.set(f, c);
    }
  }
  return t;
}

/** `a` with `b`'s counts added (`sign` 1) or taken away (`sign` −1). */
export function combine(a: Tally, b: Tally, sign: 1 | -1): Tally {
  const features = new Map([...a.features].map(([k, c]) => [k, { ...c }]));
  for (const [k, c] of b.features) {
    const into = features.get(k) ?? { n: 0, hits: 0 };
    into.n += sign * c.n;
    into.hits += sign * c.hits;
    if (into.n === 0) features.delete(k);
    else features.set(k, into);
  }
  return { n: a.n + sign * b.n, hits: a.hits + sign * b.hits, features };
}

export const WEIGHT_MIN = -1;
export const WEIGHT_MAX = 3;

/**
 * `h = (hits + α·p0) / (n + α)`, `w = ln(h / p0)` clipped to [−1, 3], with `p0` the base rate
 * among all contenders. A feature the history never saw weighs 0; so does everything when the
 * history has no hits (or nothing else).
 */
export function weights(t: Tally, alpha: number): Map<string, number> {
  const w = new Map<string, number>();
  if (t.n === 0 || t.hits === 0 || t.hits === t.n) return w;
  const p0 = t.hits / t.n;
  for (const [k, c] of t.features) {
    const h = (c.hits + alpha * p0) / (c.n + alpha);
    w.set(k, Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, Math.log(h / p0))));
  }
  return w;
}

/**
 * A feature's weight. A win the history hasn't seen yet (live, the award announced earlier than
 * in past seasons) weighs as the nomination it replaced, never less.
 */
export function weightOf(feature: string, w: ReadonlyMap<string, number>): number {
  const own = w.get(feature);
  if (own !== undefined) return own;
  return feature.endsWith("|won") ? (w.get(`${feature.slice(0, -"won".length)}nominated`) ?? 0) : 0;
}

export function score(features: readonly string[], w: ReadonlyMap<string, number>): number {
  return features.reduce((sum, f) => sum + weightOf(f, w), 0);
}

/** Softmax of `scores / temperature`: adds to 1. */
export function softmax(scores: readonly number[], temperature: number): number[] {
  if (scores.length === 0) return [];
  const z = scores.map((s) => s / temperature);
  const max = Math.max(...z);
  const e = z.map((v) => Math.exp(v - max));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

export const EARLY_CAP = 0.9;

/**
 * Before the Oscar nominations no film is above 90%: the favourite is cut to 90% and the rest
 * share the other 10% in proportion. A lone contender keeps 100% (the chances must add up).
 */
export function capEarly(p: readonly number[], cap = EARLY_CAP): number[] {
  if (p.length < 2) return [...p];
  const top = p.indexOf(Math.max(...p));
  if (p[top] <= cap) return [...p];
  // The others' own sum, not 1 − top, which loses them to rounding when the favourite is near 100%.
  const rest = p.reduce((sum, v, i) => (i === top ? sum : sum + v), 0);
  // Everyone else at 0 (only possible by underflow): share the rest evenly.
  const scale = rest > 0 ? (1 - cap) / rest : 0;
  return p.map((v, i) => (i === top ? cap : rest > 0 ? v * scale : (1 - cap) / (p.length - 1)));
}

export function sigmoid(x: number): number {
  return x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
}

export const NOMINATE_CAP = 0.99;

/**
 * `min(0.99, σ(a·score + b + shift))`, with the shift found so the chances add to the slots.
 * With too few contenders to fill the slots, everyone gets 99%.
 */
export function fillSlots(scores: readonly number[], a: number, b: number, slots: number): number[] {
  if (scores.length === 0) return [];
  const at = (shift: number) => scores.map((s) => Math.min(NOMINATE_CAP, sigmoid(a * s + b + shift)));
  if (NOMINATE_CAP * scores.length <= slots) return scores.map(() => NOMINATE_CAP);
  let low = -100;
  let high = 100;
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (at(mid).reduce((x, y) => x + y, 0) < slots) low = mid;
    else high = mid;
  }
  return at((low + high) / 2);
}
