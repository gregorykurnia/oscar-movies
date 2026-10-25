import { describe, expect, it } from "vitest";
import type { FilmPatterns, SeasonPatterns } from "./index";
import { nominationPanel, panelCategory, strongKey, strongKeys } from "./movie";

const film = (movie: number, over: Partial<FilmPatterns> = {}): FilmPatterns => ({
  movie,
  title: `Film ${movie}`,
  results: {},
  nominations: 3,
  strongAwards: [],
  pattern: { strong: 1, usOnly: true },
  patternRate: 0.4,
  rate: 0.4,
  markedDown: false,
  busy: false,
  pick: 4,
  pNominate: 0.4,
  nominated: false,
  underdog: false,
  outside: false,
  snubRisk: [],
  reasons: [{ kind: "pattern", pattern: { strong: 1, usOnly: true }, figure: { hits: 5, count: 12 } }],
  ...over,
});

const season = (films: FilmPatterns[], over: Partial<SeasonPatterns> = {}): SeasonPatterns => ({
  year: 2025,
  category: "documentary",
  state: "nominations",
  slots: 5,
  history: [2024],
  base: { hits: 5, count: 15 },
  awards: [
    { category: "nyfcc/documentary", figure: { hits: 7, count: 8 }, rate: 0.8, strong: true },
    { category: "dga/documentary", figure: { hits: 1, count: 8 }, rate: 0.2, strong: false },
  ],
  patterns: [],
  snubRule: null,
  sweep: null,
  filmmakers: null,
  films,
  ...over,
});

const box = (outcome: "shortlisted" | "nominated", year = 2025) => ({ year, category: "documentary" as const, outcome });

describe("nominationPanel", () => {
  it("a flagged miss: its pattern, pick, Oscar result and each sign's sentence", () => {
    const flagged = film(1, {
      pick: 2,
      nominated: false,
      snubRisk: [
        { sign: "sweep", figure: { hits: 1, count: 4 } },
        { sign: "busy", figure: { hits: 4, count: 23 } },
      ],
    });
    const panel = nominationPanel({ movieId: 1, box: box("shortlisted"), season: season([film(2), flagged]) });
    expect(panel.pattern).toEqual({ label: "1 strong award, US-only", record: "5 of 12 nominated" });
    expect(panel.pick).toEqual({ rank: 2, of: 2 });
    expect(panel.stage).toBe("not-nominated");
    expect(panel.flag).toEqual({
      result: "missed",
      signs: [
        "A critics' sweep with no filmmakers' group: 1 of 4 got in (few films).",
        "Among the most-nominated, but no Spirit or IDA nomination: 4 of 23 such films got in.",
      ],
    });
    expect(panel.categoryName).toBe("Best Documentary Feature");
    expect(panel.href).toBe("/patterns/2025");
  });

  it("a flagged nominee got in anyway; a live season gives no result", () => {
    const sign = [{ sign: "sweep" as const, figure: { hits: 2, count: 6 } }];
    const got = nominationPanel({ movieId: 1, box: box("nominated"), season: season([film(1, { nominated: true, snubRisk: sign })]) });
    expect(got.flag?.result).toBe("got-in");
    const live = nominationPanel({ movieId: 1, box: box("shortlisted"), season: season([film(1, { nominated: null, snubRisk: sign })]) });
    expect(live.flag?.result).toBeNull();
    // Shortlisted while the nominees aren't out.
    expect(nominationPanel({ movieId: 1, box: box("shortlisted"), season: season([film(1)], { state: "shortlist" }) }).stage).toBe("shortlisted");
  });

  it("an unflagged nominee has no flag", () => {
    const panel = nominationPanel({ movieId: 1, box: box("nominated"), season: season([film(1, { nominated: true })]) });
    expect(panel.flag).toBeNull();
    expect(panel.stage).toBe("nominated");
  });

  it("a film shortlisted before 2015 has its pattern but no pick", () => {
    const panel = nominationPanel({
      movieId: 1,
      box: box("shortlisted", 2014),
      season: season([film(1, { pick: null })], { year: 2014 }),
    });
    expect(panel.pick).toBeNull();
    expect(panel.pattern?.label).toBe("1 strong award, US-only");
    expect(panel.href).toBe("/patterns/2014");
  });

  it("a season the patterns can't work out (2012) keeps only the Oscar result", () => {
    const panel = nominationPanel({ movieId: 1, box: box("shortlisted", 2012), season: null });
    expect(panel).toMatchObject({ pattern: null, pick: null, flag: null, stage: "not-nominated" });
  });

  it("International's pattern has no US split", () => {
    const f = film(1, { reasons: [{ kind: "pattern", pattern: { strong: 0, usOnly: null }, figure: { hits: 0, count: 0 } }] });
    const panel = nominationPanel({
      movieId: 1,
      box: { year: 2025, category: "international", outcome: "shortlisted" },
      season: season([f], { category: "international" }),
    });
    expect(panel.pattern).toEqual({ label: "No strong awards", record: "no films before" });
    expect(panel.href).toBe("/patterns/2025?category=international");
  });
});

describe("panelCategory", () => {
  it("is a shortlist place or better in Documentary or International from 2012, else none", () => {
    expect(panelCategory({ year: 2025, category: "documentary", outcome: "shortlisted" })).toBe("documentary");
    expect(panelCategory({ year: 2025, category: "international", outcome: "won" })).toBe("international");
    expect(panelCategory({ year: 2025, category: "international", outcome: "submitted" })).toBeNull();
    expect(panelCategory({ year: 2025, category: "documentary", outcome: "eligible" })).toBeNull();
    expect(panelCategory({ year: 2011, category: "documentary", outcome: "won" })).toBeNull();
    expect(panelCategory({ year: 2025, category: "picture", outcome: "won" })).toBeNull();
  });
});

describe("strongKeys", () => {
  it("lists only the season's strong award categories, keyed by year and Oscar category", () => {
    expect(strongKeys(season([]))).toEqual([strongKey(2025, "documentary", "nyfcc/documentary")]);
    expect(strongKeys(null)).toEqual([]);
  });
});
