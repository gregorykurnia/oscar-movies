import { describe, expect, it } from "vitest";
import { buildBacktest, lostTo, noisePoints, topSlotHits, type BacktestFilm, type SeasonInput } from "./backtest";

const f = (id: number, title = `Film ${id}`): BacktestFilm => ({ id, title, slug: `film-${id}`, flag: null });

describe("topSlotHits", () => {
  it("counts the nominees among the top slots by chance to be nominated", () => {
    // Documentary has 5 slots: films 1–5 lead, nominees are 1, 2, 3, 6, 7.
    const eve = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ movieId: id, pNominate: 1 - id / 10, rank: id }));
    expect(topSlotHits("documentary", 2024, [1, 2, 3, 6, 7], eve)).toEqual({ hits: 3, slots: 5 });
  });

  it("breaks a tie by rank, and uses that year's nominee count for Picture before 2021", () => {
    const eve = [1, 2, 3].map((id) => ({ movieId: id, pNominate: 0.5, rank: 4 - id }));
    // 2015 had 8 nominees here, so 8 slots; only three contenders exist.
    expect(topSlotHits("picture", 2015, [1, 2, 3, 4, 5, 6, 7, 8], eve)).toEqual({ hits: 3, slots: 8 });
    expect(topSlotHits("picture", 2021, [1], eve).slots).toBe(10);
  });
});

describe("buildBacktest", () => {
  const seasons: SeasonInput[] = [
    { year: 2023, winners: [f(1)], nomineeIds: [1, 2], favourite: { film: f(1), pWin: 0.71 }, eveNominations: null },
    { year: 2024, winners: [f(3, "CODA")], nomineeIds: [2, 3], favourite: { film: f(2), pWin: 0.36 }, eveNominations: null },
    { year: 2022, winners: [f(9)], nomineeIds: [9], favourite: null, eveNominations: null },
  ];

  it("lists every season newest first, with the favourite's result or a gap", () => {
    const { rows, favouriteWon } = buildBacktest("documentary", seasons);
    expect(rows.map((r) => r.year)).toEqual([2024, 2023, 2022]);
    expect(rows[0].result).toEqual({ kind: "lost", to: [f(3, "CODA")] });
    expect(rows[1].result).toEqual({ kind: "won" });
    expect(rows[2]).toMatchObject({ favourite: null, result: null, topSlots: null });
    // A season with no stored prediction isn't a miss.
    expect(favouriteWon).toEqual({ hits: 1, count: 2 });
  });

  it("totals the nominees found over the seasons that have an eve of nominations", () => {
    const eve = [1, 2, 3, 4, 5].map((id) => ({ movieId: id, pNominate: 0.9 - id / 10, rank: id }));
    const { nominees } = buildBacktest("documentary", [
      { ...seasons[0], eveNominations: eve },
      { ...seasons[1], eveNominations: eve },
      seasons[2],
    ]);
    expect(nominees).toEqual({ hits: 4, count: 10 });
  });
});

describe("words", () => {
  it("writes the noise as one standard error at its widest", () => {
    expect(noisePoints(14)).toBe(13);
    expect(noisePoints(0)).toBeNull();
  });

  it("names who the favourite lost to", () => {
    expect(lostTo([f(1, "CODA")])).toBe("Lost to CODA");
    expect(lostTo([f(1, "A"), f(2, "B")])).toBe("Lost to A and B");
  });
});
