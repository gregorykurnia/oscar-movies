import { describe, expect, it } from "vitest";
import type { FilmPatterns, SeasonPatterns } from "./index";
import { awardCategoryName, missedFilms, nomineesOf, parsePatternCategory, parsePatternYear, patternsHref, PATTERN_YEARS, picksOf } from "./page";

const film = (title: string, over: Partial<FilmPatterns> = {}): FilmPatterns => ({
  movie: title,
  title,
  results: {},
  nominations: 0,
  strongAwards: [],
  pattern: { strong: 0, usOnly: false },
  patternRate: 0.3,
  rate: 0.3,
  markedDown: false,
  busy: false,
  pick: null,
  pNominate: null,
  nominated: false,
  underdog: false,
  outside: false,
  snubRisk: [],
  reasons: [],
  ...over,
});

const season = (films: FilmPatterns[]): SeasonPatterns => ({
  year: 2024,
  category: "documentary",
  state: "nominations",
  slots: 2,
  history: [2023],
  base: { hits: 1, count: 3 },
  awards: [],
  patterns: [],
  snubRule: null,
  sweep: null,
  filmmakers: null,
  films,
});

describe("the address", () => {
  it("lists the live year down to 2015 and keeps Documentary out of the query", () => {
    expect(PATTERN_YEARS[0]).toBe(2026);
    expect(PATTERN_YEARS.at(-1)).toBe(2015);
    expect(patternsHref(2024)).toBe("/patterns/2024");
    expect(patternsHref("{year}", "international")).toBe("/patterns/{year}?category=international");
  });

  it("reads the category and year, and refuses what the page doesn't cover", () => {
    expect(parsePatternCategory(undefined)).toBe("documentary");
    expect(parsePatternCategory("international")).toBe("international");
    expect(parsePatternCategory("picture")).toBe("documentary");
    expect(parsePatternYear("2024")).toBe(2024);
    expect(parsePatternYear("2014")).toBeNull();
    expect(parsePatternYear("2099")).toBeNull();
    expect(parsePatternYear("abc")).toBeNull();
  });
});

describe("award names", () => {
  it("adds the category's name only where an award has several for the same Oscar category", () => {
    expect(awardCategoryName("ida/feature")).toBe("IDA Best Feature Documentary");
    expect(awardCategoryName("new-york-critics/documentary")).toBe("NYFCC");
    expect(awardCategoryName("nobody/nothing")).toBe("nobody/nothing");
  });
});

describe("a season's lists", () => {
  const films = [
    film("A", { pick: 1, nominated: true }),
    film("B", { pick: 2, nominated: false, nominations: 5 }),
    film("C", { pick: 3, nominated: true }),
    film("D", { pick: 4, nominated: false, nominations: 9 }),
    film("E", { pick: 5, nominated: false, nominations: 5, strongAwards: ["x/y"] }),
  ];

  it("picks the top slots in rank order", () => {
    expect(picksOf(season(films)).map((f) => f.title)).toEqual(["A", "B"]);
  });

  it("lists the misses most-nominated first, then strong awards, then pick", () => {
    expect(missedFilms(season(films)).map((f) => f.title)).toEqual(["D", "E", "B"]);
  });

  it("puts the winner first among the nominees, the rest by rank", () => {
    expect(nomineesOf(season(films), null).map((f) => f.title)).toEqual(["A", "C"]);
    expect(nomineesOf(season(films), 0).map((f) => f.title)).toEqual(["A", "C"]);
    const withWinner = [film("A", { movie: 1, pick: 1, nominated: true }), film("C", { movie: 2, pick: 3, nominated: true })];
    expect(nomineesOf(season(withWinner), 2).map((f) => f.title)).toEqual(["C", "A"]);
  });
});
