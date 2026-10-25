// Which method gives the race's % to be nominated once the shortlist is out (IMPLEMENTATION_PLAN.md
// Phase 8 notes): the nomination patterns where their backtest picked more nominees than this
// engine's, otherwise the engine (a tie keeps it). Before the shortlist, always the engine.
import { isNomination } from "../stage";
import { predictCategory } from "./index";
import type { MovieKey, OscarCategory, Season } from "./types";

export type NominationMethod = "engine" | "patterns";

/**
 * Set by task 8.3 from the 2015–2025 backtests on `test` (each season from earlier seasons only;
 * `tests/db/patterns.test.ts` checks this follows `chooseMethod`): Documentary, patterns with the
 * snub rule 35 of 55 nominees against the engine's 31; International, 38 of 55 each (nearly the
 * same picks every year), so the engine stays. Picture and Animated have no shortlist.
 */
export const NOMINATION_METHOD: Record<OscarCategory, NominationMethod> = {
  picture: "engine",
  documentary: "patterns",
  international: "engine",
  animated: "engine",
};

/** Patterns only when they picked more nominees; a tie keeps the engine. */
export function chooseMethod(patternHits: number, engineHits: number): NominationMethod {
  return patternHits > engineHits ? "patterns" : "engine";
}

export type EngineBacktestRow = { year: number; hits: number; nominees: number; picks: MovieKey[] };
export type EngineBacktest = { rows: EngineBacktestRow[]; hits: number; nominees: number };

/**
 * This engine's picks on the eve of each season's nominations, learning only from the seasons
 * before it (`historyBefore`): the top slots by % to be nominated (ties by rank), and how many
 * were nominated. Seasons in `years` without a prediction or nominees are left out.
 */
export function engineBacktest(input: {
  category: OscarCategory;
  seasons: ReadonlyArray<Season>;
  years: readonly number[];
}): EngineBacktest {
  const rows: EngineBacktestRow[] = [];
  for (const year of input.years) {
    const season = input.seasons.find((s) => s.year === year);
    const nominees = new Set(season?.films.filter((f) => f.oscar !== null && isNomination(f.oscar)).map((f) => f.movie));
    if (!season || nominees.size === 0) continue;
    const p = predictCategory({ category: input.category, year, seasons: input.seasons, snapshot: { kind: "eve_nominations" }, historyBefore: year });
    if (!p) continue;
    const picks = [...p.contenders]
      .sort((a, b) => (b.pNominate ?? 0) - (a.pNominate ?? 0) || a.rank - b.rank)
      .slice(0, season.slots)
      .map((c) => c.movie);
    rows.push({ year, hits: picks.filter((m) => nominees.has(m)).length, nominees: nominees.size, picks });
  }
  return { rows, hits: rows.reduce((s, r) => s + r.hits, 0), nominees: rows.reduce((s, r) => s + r.nominees, 0) };
}
