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
  patternKey,
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
});
