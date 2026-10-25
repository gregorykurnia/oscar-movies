// The race's chances (guide §6.5, §8.12, IMPLEMENTATION_PLAN.md §5.3): which snapshot a season
// shows, the rows in their order with their chances, the rows a "Show all" keeps back, and how a
// chance is written. Pure, shared by the race page and its tests.
import type { Outcome } from "@/lib/stage";
import type { Why } from "@/lib/predict/types";
import { raceEntries, type SeasonState } from "./race";

export type RaceSnapshot = "live" | "eve_ceremony";

type Film = { id: number };

/** Past seasons show the eve-of-ceremony prediction ("final prediction"); the others the live one. */
export function raceSnapshot(state: SeasonState): RaceSnapshot {
  return state === "finished" ? "eve_ceremony" : "live";
}

/**
 * From the nominations on, the % to be nominated a row shows is the one from the eve of the
 * nominations: what the app gave each nominee before it was one. Before, the shown snapshot's own.
 */
export function nominateSnapshot(state: SeasonState): "eve_nominations" | null {
  return state === "nominations" || state === "finished" ? "eve_nominations" : null;
}

/** `stored` with each film's % to be nominated from `eve` (null for a film that wasn't a contender then). */
export function withEveNominations<P extends { film: Film; pNominate: number | null }>(
  stored: P[],
  eve: Array<{ film: Film; pNominate: number | null }>,
): P[] {
  const byFilm = new Map(eve.map((e) => [e.film.id, e.pNominate]));
  return stored.map((p) => ({ ...p, pNominate: byFilm.get(p.film.id) ?? null }));
}

/** "41", "<1" for a chance that rounds to nothing but isn't nothing, "0" for none. */
export function formatChance(p: number): string {
  const pct = Math.round(p * 100);
  return pct === 0 && p > 0 ? "<1" : String(pct);
}

/** A film's stored prediction (`predictions`) for the snapshot shown. */
export type Chance = { pWin: number; pNominate: number | null; rank: number; why: Why };

/**
 * The rows a category shows, in the order of their chances. Before any Oscar list rules films
 * out, the contenders are the prediction's (every film with a precursor result, or on an Oscar
 * list); from the shortlist on, the race's own rows (`raceEntries`), each with its chance where
 * one is stored. A row without one goes last, in the given order.
 */
export function raceRows<F extends Film, E extends { film: F; outcome: Outcome }>({
  state,
  entries,
  predictions,
}: {
  state: SeasonState;
  /** Every Oscar result in the category that year, submissions included, furthest first. */
  entries: E[];
  /** The stored predictions with their films, by rank. */
  predictions: Array<{ film: F } & Chance>;
}): Array<{ film: F; entry: E | null; chance: Chance | null }> {
  const byFilm = new Map(entries.map((e) => [e.film.id, e]));
  if (state === "before") {
    return predictions.map(({ film, ...chance }) => ({ film, entry: byFilm.get(film.id) ?? null, chance }));
  }
  const chances = new Map(predictions.map(({ film, ...chance }) => [film.id, chance]));
  const rows = raceEntries(entries, state).map((e) => ({ film: e.film, entry: e, chance: chances.get(e.film.id) ?? null }));
  const ranked = rows.filter((r) => r.chance !== null).sort((a, b) => a.chance!.rank - b.chance!.rank);
  return [...ranked, ...rows.filter((r) => r.chance === null)];
}

/**
 * Stage pills (guide §6.5: when the stage isn't the same for every row). From the shortlist on,
 * as before (`showsStagePills`); before it, only when the contenders' Oscar stages differ, and
 * then only on the rows that have one.
 */
export function stagePillsBefore(outcomes: Array<Outcome | null>): boolean {
  return new Set(outcomes).size > 1;
}

/** At least this many rows stay in view before "Show all". */
export const MIN_SHOWN = 5;

/**
 * The rows in view and the ones "Show all" keeps back (guide §6.5: "… and 33 more under 3%").
 * Before the nominations, a row whose chance to win rounds under 3% and whose chance to be
 * nominated is under 50% waits behind it, as long as at least five rows stay in view and at
 * least two would wait. From the nominations on, every nominee shows.
 */
export function splitRows<R extends { chance: Chance | null }>(rows: R[], state: SeasonState): { shown: R[]; more: R[] } {
  if (state === "nominations" || state === "finished") return { shown: rows, more: [] };
  const keep = (r: R) => r.chance !== null && (Math.round(r.chance.pWin * 100) >= 3 || (r.chance.pNominate ?? 0) >= 0.5);
  let cut = 0;
  rows.forEach((r, i) => {
    if (keep(r)) cut = i + 1;
  });
  cut = Math.max(cut, MIN_SHOWN);
  if (rows.length - cut < 2) return { shown: rows, more: [] };
  return { shown: rows.slice(0, cut), more: rows.slice(cut) };
}

/** The "Show all" row's words: "Show all 38 contenders" · "Bugonia, Train Dreams, The Secret Agent and 33 more under 3%". */
export function showAllText(total: number, more: Array<{ title: string; noChance?: boolean }>): { label: string; rest: string } {
  const named = more.slice(0, 3).map((m) => m.title);
  const others = more.length - named.length;
  const list = others > 0 ? `${named.join(", ")} and ${others.toLocaleString("en-US")} more` : joinAnd(named);
  // "under 3%" only when it's true of every row kept back (a row with no stored chance waits there too).
  const under = more.some((m) => m.noChance) ? "" : " under 3%";
  return { label: `Show all ${total.toLocaleString("en-US")} contenders`, rest: `${list}${under}` };
}

function joinAnd(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The race's column labels on the stage line (desktop), by the columns the rows show and the
 * snapshot they come from (a finished season with no eve stored shows live chances: "To win").
 */
export function chanceColumns(snapshot: RaceSnapshot, rows: Array<{ chance: Chance | null }>): { nominate: boolean; win: string } | null {
  if (!rows.some((r) => r.chance !== null)) return null;
  return {
    nominate: rows.some((r) => r.chance?.pNominate != null),
    win: snapshot === "eve_ceremony" ? "Final prediction" : "To win",
  };
}

/** The favourite: the best-ranked row shown (`raceRows` puts it first). */
export function leaderOf<R extends { chance: Chance | null }>(rows: R[]): R | null {
  return rows.find((r) => r.chance !== null) ?? null;
}

/**
 * Every row whose % reads the same as the favourite's: a tie at the top is gold on each row (guide
 * §2: "the leader"). When every row ties there is no favourite, so none is gold.
 */
export function leadersOf<R extends { chance: Chance | null }>(rows: R[]): Set<R> {
  const top = leaderOf(rows);
  if (!top) return new Set();
  const shown = formatChance(top.chance!.pWin);
  const withChance = rows.filter((r) => r.chance !== null);
  const tied = withChance.filter((r) => formatChance(r.chance!.pWin) === shown);
  return tied.length > 1 && tied.length === withChance.length ? new Set() : new Set(tied);
}
