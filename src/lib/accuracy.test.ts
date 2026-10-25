import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  computeAccuracy,
  finishedYears,
  formatFigure,
  formatFigureCount,
  oscarNomineesByYear,
  oscarOutcomes,
  oscarShortlistsByYear,
  shortlistRule,
  SHORTLIST_RULE_CATEGORIES,
  type AccuracyEdition,
  type EditionStatus,
  type OscarEdition,
} from "./accuracy";
import type { Outcome } from "./stage";

type Expected = {
  win: { hits: number; count: number };
  nomination: { hits: number; count: number };
  nominees: { hits: number; count: number } | null;
  years: number[];
  noDataYears: number[];
  formatted: { win: string; nomination: string; nominees: string };
};
type Fixture = {
  oscarCategory: string;
  kind: string;
  winnersOnly: boolean;
  today: string;
  /** Under the shortlist rule (task 8.1). */
  expected: Expected;
  expectedWithoutShortlistRule: Expected;
  years: Array<{
    year: number;
    status: EditionStatus;
    oscars: { status: EditionStatus; winnersOn: string | null; winner: { imdb: string } | null };
    results: Array<{ imdb: string; outcome: Outcome; oscar: Outcome | null }>;
  }>;
};

// Each fixture's films reached the Oscars in the season of their award year.
describe.each([
  ["Cinema Eye feature → Oscar Documentary", "tests/fixtures/accuracy-cinema-eye.json"],
  ["Sundance U.S. Documentary jury → Oscar Documentary (a festival, winners only)", "tests/fixtures/accuracy-sundance-us-documentary.json"],
])("the hand-checked fixture (%s)", (_, path) => {
  const fixture = JSON.parse(readFileSync(path, "utf8")) as Fixture;
  const editions: AccuracyEdition[] = fixture.years.map((y) => ({
    year: y.year,
    status: y.status,
    results: y.results.map((r) => ({ movie: r.imdb, outcome: r.outcome })),
  }));
  const oscars: OscarEdition[] = fixture.years.map((y) => {
    const results = y.results.flatMap((r) => (r.oscar ? [{ movie: r.imdb, outcome: r.oscar }] : []));
    if (y.oscars.winner && !results.some((r) => r.movie === y.oscars.winner?.imdb)) {
      results.push({ movie: y.oscars.winner.imdb, outcome: "won" });
    }
    return { year: y.year, status: y.oscars.status, winnersOn: y.oscars.winnersOn, results };
  });
  const figures = (withRule: boolean) =>
    computeAccuracy({
      winnersOnly: fixture.winnersOnly,
      editions,
      oscars: oscarOutcomes(oscars),
      oscarNominees: oscarNomineesByYear(oscars),
      finished: finishedYears(oscars, fixture.today),
      shortlist: withRule ? shortlistRule(fixture.oscarCategory, fixture.kind, oscarShortlistsByYear(oscars)) : null,
    });
  const check = (got: ReturnType<typeof figures>, { formatted, ...expected }: Expected) => {
    // The fixture lists only the award's films, not every Oscar nominee, so `caught` is tested below.
    expect({ ...got, caught: undefined }).toEqual(expected);
    expect(formatFigure(got.win)).toBe(formatted.win);
    expect(formatFigure(got.nomination)).toBe(formatted.nomination);
    expect(formatFigure(got.nominees)).toBe(formatted.nominees);
  };

  it("matches the worked figures exactly, under the shortlist rule", () => check(figures(true), fixture.expected));
  it("matches the worked figures without the rule", () => check(figures(false), fixture.expectedWithoutShortlistRule));
});

// Small synthetic seasons for the rules the fixture doesn't reach.
const oscarYear = (year: number, results: Array<[string, Outcome]>, winnersOn = `${year + 1}-03-01`): OscarEdition => ({
  year,
  status: "loaded",
  winnersOn,
  results: results.map(([movie, outcome]) => ({ movie, outcome })),
});
const edition = (year: number, results: Array<[string, Outcome]>, status: EditionStatus = "loaded"): AccuracyEdition => ({
  year,
  status,
  results: results.map(([movie, outcome]) => ({ movie, outcome })),
});
const TODAY = "2026-10-23";
const OSCARS = [
  oscarYear(2020, [["a", "won"], ["b", "nominated"], ["c", "shortlisted"]]),
  oscarYear(2021, [["d", "won"], ["e", "nominated"], ["f", "nominated"]]),
  oscarYear(2022, [["g", "won"], ["h", "nominated"]]),
];
const run = (editions: AccuracyEdition[], winnersOnly = false, oscars = OSCARS, rule?: { category: string; kind: string }) =>
  computeAccuracy({
    winnersOnly,
    editions,
    oscars: oscarOutcomes(oscars),
    oscarNominees: oscarNomineesByYear(oscars),
    finished: finishedYears(oscars, TODAY),
    shortlist: rule ? shortlistRule(rule.category, rule.kind, oscarShortlistsByYear(oscars)) : null,
  });

describe("computeAccuracy", () => {
  it("gives – for the nominees figure of a winners-only award, and still works out the winner figures", () => {
    const figures = run([edition(2020, [["a", "won"]]), edition(2021, [["e", "won"]])], true);
    expect(figures.nominees).toBeNull();
    expect(formatFigure(figures.nominees)).toBe("–");
    expect(formatFigureCount(figures.nominees)).toBe("–");
    expect(figures.caught).toBeNull();
    expect(figures.win).toEqual({ hits: 1, count: 2 });
    expect(figures.nomination).toEqual({ hits: 2, count: 2 });
  });

  it("counts a tie as a hit when any winner did it", () => {
    const figures = run([edition(2020, [["b", "won"], ["a", "won"], ["x", "nominated"]])]);
    expect(figures.win).toEqual({ hits: 1, count: 1 });
    expect(figures.nomination).toEqual({ hits: 1, count: 1 });
    expect(figures.nominees).toEqual({ hits: 2, count: 3 });
  });

  it("counts runners-up as nominees, and an Oscar shortlist is not a nomination", () => {
    const figures = run([edition(2020, [["x", "won"], ["b", "runner_up"], ["c", "runner_up"]])]);
    expect(figures.nomination).toEqual({ hits: 0, count: 1 });
    expect(figures.nominees).toEqual({ hits: 1, count: 3 });
  });

  it("leaves out no_data years and lists them", () => {
    const figures = run([edition(2020, [["a", "won"]]), edition(2021, [], "no_data"), edition(2022, [["g", "won"]])]);
    expect(figures.years).toEqual([2020, 2022]);
    expect(figures.noDataYears).toEqual([2021]);
    expect(figures.win).toEqual({ hits: 2, count: 2 });
  });

  it("skips years whose Oscars aren't over, and editions with nothing in this category", () => {
    const oscars = [...OSCARS, oscarYear(2023, [["i", "nominated"]], "2024-03-10"), oscarYear(2024, [["j", "won"]], "2027-03-14")];
    const figures = run(
      [edition(2020, []), edition(2021, [["d", "won"]]), edition(2023, [["i", "won"]]), edition(2024, [["j", "won"]], "no_data")],
      false,
      oscars,
    );
    // 2023 has no Oscar winner loaded yet, 2024's ceremony is after today.
    expect(figures.years).toEqual([2021]);
    expect(figures.noDataYears).toEqual([]);
  });

  it("counts the nominees of a partial edition that names them, but not a partial edition with only its winner", () => {
    const figures = run([edition(2020, [["a", "won"]], "partial"), edition(2021, [["d", "won"], ["x", "nominated"]], "partial")]);
    expect(figures.win).toEqual({ hits: 2, count: 2 });
    expect(figures.nominees).toEqual({ hits: 1, count: 2 });
  });

  it("skips a loaded edition that names only winners in the nominees figure, and has none when no edition names a nominee", () => {
    const mixed = run([edition(2020, [["a", "won"]]), edition(2021, [["d", "won"], ["x", "nominated"]])]);
    expect(mixed.win).toEqual({ hits: 2, count: 2 });
    expect(mixed.nominees).toEqual({ hits: 1, count: 2 });
    const winnersOnly = run([edition(2020, [["a", "won"]]), edition(2021, [["d", "won"]])]);
    expect(winnersOnly.nominees).toBeNull();
    expect(winnersOnly.win).toEqual({ hits: 2, count: 2 });
  });

  it("has no winner figures for a list with no winner (AFI)", () => {
    const figures = run([edition(2021, [["d", "nominated"], ["e", "nominated"], ["x", "nominated"]])]);
    expect(figures.win).toEqual({ hits: 0, count: 0 });
    expect(formatFigure(figures.win)).toBe("–");
    expect(figures.nominees).toEqual({ hits: 2, count: 3 });
  });

  it("counts the Oscar nominees it caught, the other way round from the nominees figure", () => {
    // A picky award: one nominee a year, always Oscar-nominated (100%), catches 2 of 5 Oscar nominees.
    const picky = run([edition(2020, [["a", "won"], ["x", "nominated"]]), edition(2021, [["d", "won"], ["y", "nominated"]])]);
    expect(picky.caught).toEqual({ hits: 2, count: 5 });
    // A broad one: many nominees, every Oscar nominee among them. An Oscar shortlist isn't counted.
    const broad = run([edition(2020, [["a", "won"], ["b", "nominated"], ["c", "nominated"], ["x", "nominated"], ["y", "nominated"]])]);
    expect(broad.nominees).toEqual({ hits: 2, count: 5 });
    expect(broad.caught).toEqual({ hits: 2, count: 2 });
  });

  it("counts caught Oscar nominees only in years that name nominees, from any of the award's editions", () => {
    // 2020 names only its winner, so its Oscar nominees aren't counted; e (Oscar 2021) was nominated in 2020.
    const figures = run([edition(2020, [["e", "won"]]), edition(2021, [["d", "won"], ["x", "nominated"]])]);
    expect(figures.caught).toEqual({ hits: 2, count: 3 });
    expect(run([edition(2020, [["a", "won"]]), edition(2021, [["d", "won"]])]).caught).toBeNull();
  });

  it("matches a film to the Oscars of any year (a festival film can get there a year later)", () => {
    const figures = run([edition(2020, [["e", "won"]])]);
    expect(figures.nomination).toEqual({ hits: 1, count: 1 });
  });
});

describe("the shortlist rule (Documentary and International)", () => {
  const DOC = { category: "documentary", kind: "major" };
  // 2020's shortlist is a, b, c; 2021's d, e, f, plus k (a 2020 festival film shortlisted a year later).
  const oscars = [
    oscarYear(2020, [["a", "won"], ["b", "nominated"], ["c", "shortlisted"], ["s", "submitted"]]),
    oscarYear(2021, [["d", "won"], ["e", "nominated"], ["f", "shortlisted"], ["k", "nominated"]]),
  ];

  it("leaves out a winner not shortlisted, and its year doesn't count for the winner figures", () => {
    const figures = run([edition(2020, [["a", "won"]]), edition(2021, [["x", "won"]])], true, oscars, DOC);
    expect(figures.win).toEqual({ hits: 1, count: 1 });
    expect(figures.nomination).toEqual({ hits: 1, count: 1 });
    // The year is still one with results.
    expect(figures.years).toEqual([2020, 2021]);
    // A tie: the shortlisted winner counts; a submitted film is not on the shortlist.
    const tie = run([edition(2020, [["s", "won"], ["c", "won"]])], true, oscars, DOC);
    expect(tie.win).toEqual({ hits: 0, count: 1 });
    expect(tie.nomination).toEqual({ hits: 0, count: 1 });
    expect(run([edition(2020, [["s", "won"]])], true, oscars, DOC).win).toEqual({ hits: 0, count: 0 });
  });

  it("leaves out a nominee not shortlisted, but caught is unchanged", () => {
    const editions = [edition(2020, [["a", "won"], ["c", "nominated"], ["x", "nominated"], ["y", "runner_up"]])];
    const figures = run(editions, false, oscars, DOC);
    expect(figures.nominees).toEqual({ hits: 1, count: 2 });
    expect(figures.caught).toEqual({ hits: 1, count: 2 });
    const without = run(editions, false, oscars);
    expect(without.nominees).toEqual({ hits: 1, count: 4 });
    expect(without.caught).toEqual(figures.caught);
  });

  it("counts a festival film shortlisted the next season, and only for a festival", () => {
    const editions = [edition(2020, [["k", "won"], ["x", "nominated"]])];
    const festival = run(editions, false, oscars, { category: "documentary", kind: "festival" });
    expect(festival.win).toEqual({ hits: 0, count: 1 });
    expect(festival.nomination).toEqual({ hits: 1, count: 1 });
    expect(festival.nominees).toEqual({ hits: 1, count: 1 });
    const critics = run(editions, false, oscars, { category: "documentary", kind: "critics" });
    expect(critics.win).toEqual({ hits: 0, count: 0 });
    expect(critics.nominees).toBeNull();
  });

  it("applies to International the same way", () => {
    const figures = run([edition(2020, [["x", "won"]]), edition(2021, [["d", "won"]])], true, oscars, { category: "international", kind: "major" });
    expect(figures.win).toEqual({ hits: 1, count: 1 });
  });

  it("leaves Picture and Animated unchanged", () => {
    expect([...SHORTLIST_RULE_CATEGORIES].sort()).toEqual(["documentary", "international"]);
    expect(shortlistRule("picture", "major", oscarShortlistsByYear(oscars))).toBeNull();
    expect(shortlistRule("animated", "festival", oscarShortlistsByYear(oscars))).toBeNull();
    const editions = [edition(2020, [["x", "won"], ["b", "nominated"], ["y", "nominated"]]), edition(2021, [["d", "won"]])];
    expect(run(editions, false, oscars, { category: "picture", kind: "major" })).toEqual(run(editions, false, oscars));
    expect(run(editions, false, oscars, { category: "picture", kind: "major" }).win).toEqual({ hits: 1, count: 2 });
  });
});

describe("oscarShortlistsByYear", () => {
  it("has each season's films shortlisted or further, not those only submitted or eligible", () => {
    const lists = oscarShortlistsByYear([oscarYear(2020, [["a", "won"], ["b", "runner_up"], ["c", "shortlisted"], ["d", "eligible"], ["e", "submitted"]])]);
    expect([...lists.get(2020)!].sort()).toEqual(["a", "b", "c"]);
  });
});

describe("oscarOutcomes", () => {
  it("keeps each film's furthest outcome", () => {
    const outcomes = oscarOutcomes([oscarYear(2020, [["a", "shortlisted"]]), oscarYear(2021, [["a", "won"]]), oscarYear(2022, [["a", "submitted"]])]);
    expect(outcomes.get("a")).toBe("won");
  });
});

describe("formatFigure", () => {
  it("rounds to a whole percent and says the count with 'of'", () => {
    expect(formatFigure({ hits: 11, count: 14 })).toBe("79%");
    expect(formatFigureCount({ hits: 11, count: 14 })).toBe("11 of 14");
    expect(formatFigure({ hits: 0, count: 0 })).toBe("–");
  });
});
