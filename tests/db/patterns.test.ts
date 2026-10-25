// The nomination patterns on the seeded `test` data (IMPLEMENTATION_PLAN.md Phase 8, task 8.3):
// the 2015–2025 backtests of both methods, each season from earlier seasons only, the choice in
// `NOMINATION_METHOD` they make, and the race's % to be nominated taken from it. Reads only.
import { afterAll, describe, expect, it } from "vitest";
import { computePredictionRows, readPredictionTables } from "../../scripts/lib/compute";
import { queryPatterns, queryPatternSeasons } from "../../src/data/patterns";
import { createScriptDb } from "../../src/db";
import { backtest, type PatternCategory } from "../../src/lib/patterns";
import { chooseMethod, engineBacktest, NOMINATION_METHOD } from "../../src/lib/predict/method";

const { db, close } = createScriptDb();
afterAll(() => close());

const TODAY = "2026-10-25";
const YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

async function backtests(category: PatternCategory) {
  const { seasons } = await queryPatternSeasons(db, category, TODAY);
  const patterns = backtest({ category, seasons });
  return {
    patterns,
    withoutSnubRule: backtest({ category, seasons, snubRule: false }),
    engine: engineBacktest({ category, seasons, years: patterns.rows.map((r) => r.year) }),
  };
}

describe("the backtests, 2015–2025", () => {
  it("Documentary: the patterns pick 35 of 55 with the snub rule and 33 without (the planning check); the engine 31", async () => {
    const b = await backtests("documentary");
    expect(b.patterns.rows.map((r) => r.year)).toEqual(YEARS);
    expect([b.patterns.hits, b.patterns.nominees]).toEqual([35, 55]);
    expect(b.patterns.rows.map((r) => r.hits)).toEqual([2, 4, 3, 3, 4, 3, 3, 4, 3, 4, 2]);
    expect([b.withoutSnubRule.hits, b.withoutSnubRule.nominees]).toEqual([33, 55]);
    expect(b.engine.rows.map((r) => r.year)).toEqual(YEARS);
    expect([b.engine.hits, b.engine.nominees]).toEqual([31, 55]);
    expect(NOMINATION_METHOD.documentary).toBe(chooseMethod(b.patterns.hits, b.engine.hits));
    expect(NOMINATION_METHOD.documentary).toBe("patterns");
  }, 120_000);

  it("International: 38 of 55 each (no snub rule there), so the engine stays", async () => {
    const b = await backtests("international");
    expect(b.patterns.rows.map((r) => r.year)).toEqual(YEARS);
    expect([b.patterns.hits, b.patterns.nominees]).toEqual([38, 55]);
    expect(b.withoutSnubRule.hits).toBe(38);
    expect([b.engine.hits, b.engine.nominees]).toEqual([38, 55]);
    expect(NOMINATION_METHOD.international).toBe(chooseMethod(b.patterns.hits, b.engine.hits));
    expect(NOMINATION_METHOD.international).toBe("engine");
  }, 120_000);
});

describe("queryPatterns", () => {
  it("Documentary 2024: the five it picks, every film named, the backtest and the flagged films' record", async () => {
    const data = await queryPatterns(db, "documentary", TODAY);
    const s2024 = data.seasons.find((s) => s.year === 2024)!;
    expect(s2024.state).toBe("nominations");
    const title = (m: string | number) => data.films[Number(m)]?.title;
    expect(s2024.films.slice(0, 5).map((f) => title(f.movie))).toEqual([
      "No Other Land",
      "Soundtrack to a Coup d'Etat",
      "Dahomey",
      "Sugarcane",
      "Black Box Diaries",
    ]);
    expect(s2024.films.find((f) => title(f.movie) === "Will & Harper")!.snubRisk.map((r) => r.sign)).toEqual(["busy"]);
    for (const s of data.seasons) for (const f of s.films) expect(data.films[Number(f.movie)]).toBeDefined();
    expect([data.backtest.hits, data.backtest.nominees]).toEqual([35, 55]);
    // The planning check's "27 flagged, 7 got in" doesn't recount: judged as the page judges it
    // (2015–2025, each season from earlier seasons only) it is 24 and 5; 2014 adds 3 misses.
    expect(data.flagged).toEqual({ hits: 5, count: 24 });
  }, 120_000);
});

describe("the race's % to be nominated (recomputePredictions' rows)", () => {
  it("Documentary takes it from the patterns once the shortlist is out; International keeps the engine's", async () => {
    const rows = computePredictionRows(await readPredictionTables(db), TODAY);
    const eve = (category: string, year: number) =>
      rows.filter((r) => r.oscarCategory === category && r.year === year && r.snapshot === "eve_nominations");
    const { seasons } = await queryPatternSeasons(db, "documentary", TODAY);
    const picks = backtest({ category: "documentary", seasons }).rows.find((r) => r.year === 2024)!.picks;
    const doc = eve("documentary", 2024).sort((a, b) => (b.pNominate ?? 0) - (a.pNominate ?? 0));
    expect(doc.slice(0, 5).map((r) => r.movieId).sort()).toEqual(picks.map(Number).sort());
    for (const category of ["documentary", "international"]) {
      const sum = eve(category, 2024).reduce((s, r) => s + (r.pNominate ?? 0), 0);
      expect(sum).toBeCloseTo(5, 6);
    }
    const intl = eve("international", 2024);
    const intlSeasons = (await queryPatternSeasons(db, "international", TODAY)).seasons;
    const engine = engineBacktest({ category: "international", seasons: intlSeasons, years: [2024] });
    expect(intl.length).toBeGreaterThan(0);
    expect(engine.rows).toHaveLength(1);
    // Before the shortlist (the earliest seasons), Documentary still has the engine's chances.
    expect(eve("documentary", 2013).every((r) => r.pNominate !== null)).toBe(true);
  }, 300_000);
});
