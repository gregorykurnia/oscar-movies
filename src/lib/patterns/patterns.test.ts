import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Figure } from "../accuracy";
import type { PrecursorResult } from "../predict";
import { addDays } from "../predict/season";
import type { Outcome } from "../stage";
import {
  analyzeSeason,
  backtest,
  bestPredictors,
  flaggedRecord,
  mostAwardedMisses,
  pastSeasons,
  patternChances,
  patternKey,
  patternSeasons,
  scaleToSlots,
  underdogRecord,
  type PatternCategory,
  type PatternSeason,
  type SeasonPatterns,
} from "./index";
import { patternLabel, predictorLabel, reasonText, snubRiskText } from "./words";

type FixtureFilm = {
  title: string;
  countries: string[] | null;
  oscar: Outcome | null;
  noms: string[];
  wins?: string[];
  lateWins?: string[];
  after?: string[];
};
type Fixture = {
  category: PatternCategory;
  awards: Record<string, string>;
  seasons: { year: number; finished: boolean; nominationsOn: string; undated?: string[]; films: FixtureFilm[] }[];
  expected: {
    noAnalysis: number[];
    results: Record<string, string[]>;
    seasons: Record<string, unknown>;
    backtest: unknown;
    mostAwardedMisses: string[];
    flaggedRecord: string;
    underdogRecord: string;
    bestPredictors: unknown;
  };
};

const fixture = JSON.parse(readFileSync("tests/fixtures/patterns-documentary.json", "utf8")) as Fixture;
const alias = new Map(Object.entries(fixture.awards).map(([short, key]) => [key, short]));
const short = (key: string) => alias.get(key) ?? key;

/** The fixture's short form as the seasons the data layer will give. */
function seasons(f: Fixture = fixture): PatternSeason[] {
  return f.seasons.map((s) => {
    const dayAfter = addDays(s.nominationsOn, 1);
    const result = (a: string, film: FixtureFilm): PrecursorResult => {
      const category = f.awards[a];
      const base = { award: category.split("/")[0], category };
      if (s.undated?.includes(a)) return { ...base, outcome: film.wins?.includes(a) ? "won" : "nominated", nominationsOn: null, winnersOn: null };
      if (film.lateWins?.includes(a)) return { ...base, outcome: "won", nominationsOn: `${s.year}-12-01`, winnersOn: dayAfter };
      if (film.after?.includes(a)) return { ...base, outcome: "nominated", nominationsOn: dayAfter, winnersOn: dayAfter };
      return { ...base, outcome: film.wins?.includes(a) ? "won" : "nominated", nominationsOn: `${s.year}-12-01`, winnersOn: `${s.year + 1}-01-05` };
    };
    return {
      year: s.year,
      finished: s.finished,
      slots: 5,
      oscar: { shortlistOn: `${s.year}-12-15`, nominationsOn: s.nominationsOn, winnersOn: `${s.year + 1}-03-01` },
      films: s.films.map((film) => ({
        movie: film.title,
        title: film.title,
        countries: film.countries,
        oscar: film.oscar,
        results: [...film.noms, ...(film.lateWins ?? []), ...(film.after ?? [])].map((a) => result(a, film)),
      })),
    };
  });
}

const fig = (f: Figure | null) => (f ? `${f.hits}/${f.count}` : null);

function summarise(a: SeasonPatterns) {
  return {
    state: a.state,
    history: a.history,
    base: fig(a.base),
    awards: a.awards.map((r) => `${short(r.category)} ${fig(r.figure)} ${r.rate.toFixed(4)}${r.strong ? " strong" : ""}`),
    patterns: a.patterns.map((p) => `${patternKey(p.pattern)} ${fig(p.figure)} ${p.rate.toFixed(4)}`),
    snubRule: fig(a.snubRule),
    sweep: fig(a.sweep),
    filmmakers: fig(a.filmmakers),
    films: a.films.map((f) => ({
      pick: f.pick,
      title: f.title,
      pattern: patternKey(f.pattern),
      patternRate: f.patternRate.toFixed(4),
      rate: f.rate.toFixed(4),
      markedDown: f.markedDown,
      strong: f.strongAwards.map(short).sort(),
      nominations: f.nominations,
      busy: f.busy,
      percent: f.pNominate === null ? null : Math.round(f.pNominate * 100),
      nominated: f.nominated,
      underdog: f.underdog,
      outside: f.outside,
      snubRisk: f.snubRisk.map(snubRiskText),
      reasons: f.reasons.map(reasonText),
    })),
  };
}

const all = seasons();
const analyze = (year: number, snubRule?: boolean) => analyzeSeason({ category: "documentary", year, seasons: all, snubRule });

describe("nomination patterns: the hand-worked Documentary fixture", () => {
  it("has nothing for a season with no earlier season to learn from", () => {
    for (const year of fixture.expected.noAnalysis) expect(analyze(year)).toBeNull();
  });

  it("counts results announced before the Oscar nominations (a late win as a nomination, undated as announced)", () => {
    for (const [at, expected] of Object.entries(fixture.expected.results)) {
      const [year, title] = at.split(" ");
      const film = analyze(Number(year))!.films.find((f) => f.title === title)!;
      expect(Object.entries(film.results).map(([c, s]) => `${short(c)} ${s}`).sort(), at).toEqual(expected);
    }
  });

  for (const year of Object.keys(fixture.expected.seasons)) {
    it(`works out ${year} from its earlier seasons`, () => {
      expect(summarise(analyze(Number(year))!)).toEqual(fixture.expected.seasons[year]);
    });
  }

  it("backtests each season from its earlier seasons, with and without the snub rule", () => {
    const run = (snubRule: boolean) => {
      const b = backtest({ category: "documentary", seasons: all, snubRule });
      return {
        rows: b.rows.map((r) => `${r.year} ${r.hits}/${r.nominees} ${r.picks.join(" ")}`),
        total: `${b.hits}/${b.nominees}`,
      };
    };
    expect({ withSnubRule: run(true), withoutSnubRule: run(false) }).toEqual(fixture.expected.backtest);
  });

  it("lists the most-awarded misses, the flagged films' record and the underdogs", () => {
    const past = pastSeasons({ category: "documentary", seasons: all });
    expect(mostAwardedMisses(past).map((m) => `${m.year} ${m.film.title}`)).toEqual(fixture.expected.mostAwardedMisses);
    expect(fig(flaggedRecord(past))).toBe(fixture.expected.flaggedRecord);
    expect(fig(underdogRecord(past))).toBe(fixture.expected.underdogRecord);
  });

  it("groups the best predictors over every finished season", () => {
    const best = bestPredictors({ category: "documentary", seasons: all });
    const key = (k: string) => k.replace(/^award:([^:]+)/, (_, c: string) => `award:${short(c)}`);
    expect({
      seasons: best.seasons,
      shortlist: fig(best.shortlist),
      strong: best.strong.map(short),
      groups: Object.fromEntries(
        best.groups.map((g) => [g.group, g.rows.map((r) => `${key(r.key)} ${fig(r.gotIn)} caught ${fig(r.caught)}`)]),
      ),
    }).toEqual(fixture.expected.bestPredictors);
  });
});

describe("nomination patterns: other cases", () => {
  it("International has no US-only split, no snub rule and no Snub risk", () => {
    const intl: PatternSeason[] = all.map((s) => ({ ...s, films: s.films.map((f) => ({ ...f, countries: ["US"] })) }));
    const a = analyzeSeason({ category: "international", year: 2016, seasons: intl })!;
    expect(a.patterns.map((p) => patternKey(p.pattern))).toEqual(["3", "2", "1", "0"]);
    expect(a.snubRule).toBeNull();
    expect(a.films.every((f) => f.pattern.usOnly === null && !f.markedDown && f.snubRisk.length === 0)).toBe(true);
    expect(a.films.flatMap((f) => f.reasons.map((r) => r.kind))).not.toContain("filmmakers");
  });

  it("International before its shortlist ranks only its submissions, once any are known", () => {
    const live = all.find((s) => s.year === 2017)!;
    const withSubmissions: PatternSeason = {
      ...live,
      films: live.films.map((f) => ({ ...f, oscar: f.title === "D4" || f.title === "D6" ? "submitted" : null })),
    };
    const a = analyzeSeason({ category: "international", year: 2017, seasons: [...all.filter((s) => s.year !== 2017), withSubmissions] })!;
    expect(a.films.map((f) => f.title)).toEqual(["D4", "D6"]);
  });

  it("gives no pick before 2015", () => {
    const shifted = all.map((s) => ({ ...s, year: s.year - 1 }));
    const a = analyzeSeason({ category: "documentary", year: 2014, seasons: shifted })!;
    expect(a.films.every((f) => f.pick === null && !f.outside)).toBe(true);
    expect(pastSeasons({ category: "documentary", seasons: shifted }).map((p) => p.year)).toEqual([2015]);
  });

  it("scales rates to the slots, capping at 99% and refilling from the rest", () => {
    const p = scaleToSlots([0.9, 0.9, 0.1, 0.1, 0.1, 0.1, 0.1], 5);
    expect(p.slice(0, 2)).toEqual([0.99, 0.99]);
    expect(p.reduce((s, v) => s + v, 0)).toBeCloseTo(5);
    expect(scaleToSlots([0.2, 0.1], 5)).toEqual([0.99, 0.99]);
    expect(scaleToSlots([0, 0, 0, 0, 0, 0], 3)).toEqual([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  });

  it("labels patterns and predictors", () => {
    expect(patternLabel({ strong: 3, usOnly: false })).toBe("3+ strong awards, not US-only");
    expect(patternLabel({ strong: 0, usOnly: null })).toBe("No strong awards");
    const name = (c: string) => (c === "spirit-awards/documentary" ? "Spirit Awards documentary" : c);
    expect(predictorLabel({ kind: "award", category: "spirit-awards/documentary", result: "nominee" }, name)).toBe(
      "Spirit Awards documentary nominee",
    );
    expect(reasonText({ kind: "pattern", pattern: { strong: 2, usOnly: true }, figure: { hits: 0, count: 0 } })).toBe(
      "2 strong awards, US-only: no films before",
    );
  });

  it("gives the race the patterns' % from the shortlist on, from 2015, and nothing before", () => {
    const live = all.find((s) => s.year === 2017)!;
    const a = analyzeSeason({ category: "documentary", year: 2017, seasons: all })!;
    const chances = patternChances({ category: "documentary", year: 2017, seasons: all });
    if (a.state === "before") expect(chances).toBeNull();
    else expect(chances).toEqual(new Map(a.films.map((f) => [f.movie, f.pNominate])));
    const before = all.map((s) => (s.year !== 2017 ? s : { ...s, films: live.films.map((f) => ({ ...f, oscar: null })) }));
    expect(patternChances({ category: "documentary", year: 2017, seasons: before })).toBeNull();
    const shifted = all.map((s) => ({ ...s, year: s.year - 1 }));
    expect(patternChances({ category: "documentary", year: 2014, seasons: shifted })).toBeNull();
    const past = patternChances({ category: "documentary", year: 2016, seasons: all })!;
    expect([...past.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(5);
  });

  it("pools the base over the earlier seasons only, and never reads the season's own outcomes", () => {
    // The fixture's seasons all have 5 nominees in 10, so a wrong base (the season's own, or an
    // average of shares) would match by chance: make 2014 4 in 10 and recount.
    const demoted = all.map((s) =>
      s.year !== 2014 ? s : { ...s, films: s.films.map((f, i) => (i === s.films.findIndex((g) => g.oscar === "nominated") ? { ...f, oscar: "shortlisted" as const } : f)) },
    );
    const shortlisted = (s: PatternSeason) => s.films.filter((f) => f.oscar === "shortlisted" || f.oscar === "nominated" || f.oscar === "won");
    const nominated = (s: PatternSeason) => shortlisted(s).filter((f) => f.oscar === "nominated" || f.oscar === "won");
    const earlier = demoted.filter((s) => s.year < 2016);
    const a = analyzeSeason({ category: "documentary", year: 2016, seasons: demoted })!;
    expect(a.base).toEqual({
      hits: earlier.reduce((n, s) => n + nominated(s).length, 0),
      count: earlier.reduce((n, s) => n + shortlisted(s).length, 0),
    });
    expect(a.base).not.toEqual(analyze(2016)!.base);
    // 2016's own outcomes turned around: its base, strong awards, rates and picks stay the same.
    const flipped = demoted.map((s) =>
      s.year !== 2016 ? s : { ...s, films: s.films.map((f) => ({ ...f, oscar: f.oscar === "nominated" ? ("shortlisted" as const) : f.oscar === "shortlisted" ? ("nominated" as const) : f.oscar })) },
    );
    const b = analyzeSeason({ category: "documentary", year: 2016, seasons: flipped })!;
    expect(b.base).toEqual(a.base);
    expect(b.awards).toEqual(a.awards);
    expect(b.films.map((f) => [f.title, f.rate, f.pick])).toEqual(a.films.map((f) => [f.title, f.rate, f.pick]));
  });

  it("adds titles and countries to the engine's seasons", () => {
    const [s] = patternSeasons([{ ...all[0], films: [{ movie: 7, results: [], oscar: null }, { movie: 8, results: [], oscar: null }] }], new Map([[7, { title: "Seven", countries: ["FR"] }]]));
    expect(s.films).toEqual([
      { movie: 7, results: [], oscar: null, title: "Seven", countries: ["FR"] },
      { movie: 8, results: [], oscar: null, title: "8", countries: null },
    ]);
  });
});
