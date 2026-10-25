// What the live year's patterns show today, read the way the pages read it, so the Phase 8 specs
// check the state the season is in (before the shortlist until mid-December, then the shortlist,
// then the nominations) instead of the state it was in when they were written (8.R).
import { createScriptDb } from "../../src/db";
import { queryPatterns, type PatternsData } from "../../src/data/patterns";
import type { PatternCategory, SeasonPatterns } from "../../src/lib/patterns";
import { LIVE_YEAR } from "../../src/lib/years";

export const today = () => new Date().toISOString().slice(0, 10);

/** The category's patterns as the page reads them today. */
export async function readPatterns(category: PatternCategory): Promise<PatternsData> {
  const { db, close } = createScriptDb();
  try {
    return await queryPatterns(db, category, today());
  } finally {
    await close();
  }
}

/** The live year's season state ("before", "shortlist", "nominations"), or null if it isn't loaded. */
export const liveState = (data: PatternsData): SeasonPatterns["state"] | null => data.seasons.find((s) => s.year === LIVE_YEAR)?.state ?? null;

/** The live year's section heading for its ranked list, by state. */
export const liveHeading = (state: SeasonPatterns["state"] | null) =>
  state === "before" ? "The contenders so far" : state === "shortlist" ? "The five it picks" : "The five it picked";

/** "2015–2025": the strip's span for the backtest's seasons. */
export const backtestSpan = (data: PatternsData) => `${data.backtest.rows[0].year}–${data.backtest.rows.at(-1)!.year}`;
