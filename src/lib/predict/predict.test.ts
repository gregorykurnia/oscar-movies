import { describe, expect, it } from "vitest";
import type { Outcome } from "../stage";
import { outOfSeason, type HistorySeason } from "./fit";
import { predictCategory, type OscarCategory, type PrecursorResult, type Season, type SeasonFilm, type Snapshot } from "./index";
import { capEarly, fillSlots, score, softmax, tally, weights, EARLY_CAP, LATE_CAP } from "./model";
import { historyCutoff, nominationSlots, oscarStatusAsOf, resultAsOf, seasonAsOf } from "./season";

// A seeded random history: each film has a hidden strength; precursors and the Oscars favour the
// strong ones with noise, so precursors predict the Oscars about as loosely as real ones do.
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Precursor = { award: string; category: string; nominees: number; winnersOnly?: boolean; festival?: boolean };

const PRECURSORS: Record<OscarCategory, Precursor[]> = {
  picture: [
    { award: "pga", category: "pga/film", nominees: 10 },
    { award: "dga", category: "dga/film", nominees: 5 },
    { award: "bafta", category: "bafta/film", nominees: 5 },
    { award: "golden-globes", category: "golden-globes/drama", nominees: 5 },
    { award: "golden-globes", category: "golden-globes/comedy", nominees: 5 },
    { award: "cannes", category: "cannes/palme", nominees: 1, winnersOnly: true, festival: true },
  ],
  documentary: [
    { award: "cinema-eye", category: "cinema-eye/feature", nominees: 6 },
    { award: "dga", category: "dga/documentary", nominees: 5 },
    { award: "bafta", category: "bafta/documentary", nominees: 5 },
    { award: "sundance", category: "sundance/documentary", nominees: 1, winnersOnly: true, festival: true },
  ],
  international: [
    { award: "golden-globes", category: "golden-globes/non-english", nominees: 5 },
    { award: "bafta", category: "bafta/non-english", nominees: 5 },
    { award: "european-film-awards", category: "european-film-awards/film", nominees: 5 },
    { award: "cannes", category: "cannes/palme", nominees: 1, winnersOnly: true, festival: true },
  ],
  animated: [
    { award: "annie", category: "annie/feature", nominees: 6 },
    { award: "golden-globes", category: "golden-globes/animated", nominees: 5 },
    { award: "bafta", category: "bafta/animated", nominees: 4 },
  ],
};

function oscarDates(year: number) {
  return { shortlistOn: `${year}-12-15`, nominationsOn: `${year + 1}-01-20`, winnersOn: `${year + 1}-03-01` };
}

function makeSeason(category: OscarCategory, year: number, finished: boolean, seed = year): Season {
  const next = random(seed * 31 + category.length);
  const count = category === "international" ? 40 : 24;
  const strength = Array.from({ length: count }, (_, i) => count - i + next() * 6);
  const noisy = (spread: number) => strength.map((s, i) => ({ i, v: s + next() * spread })).sort((a, b) => b.v - a.v);
  const results: PrecursorResult[][] = strength.map(() => []);

  for (const p of PRECURSORS[category]) {
    const order = noisy(10);
    order.slice(0, p.nominees).forEach(({ i }, place) => {
      results[i].push({
        award: p.award,
        category: p.category,
        outcome: place === 0 ? "won" : "nominated",
        nominationsOn: p.winnersOnly ? null : `${year + 1}-01-05`,
        winnersOn: p.festival ? `${year}-05-25` : `${year + 1}-02-10`,
      });
    });
  }

  const nominees = category === "picture" ? nominationSlots(category, year, year >= 2021 ? 10 : 8 + (year % 2)) : 5;
  const oscarOrder = noisy(8).map((o) => o.i);
  const outcome: Array<Outcome | null> = strength.map(() => null);
  oscarOrder.forEach((i, place) => {
    if (place === 0) outcome[i] = "won";
    else if (place < nominees) outcome[i] = "nominated";
    else if (category === "documentary" && place < 15) outcome[i] = "shortlisted";
    else if (category === "international") outcome[i] = place < 15 ? "shortlisted" : place < 37 ? "eligible" : place < 39 ? "submitted" : null;
    else if (category === "animated" && place < 18) outcome[i] = "eligible";
  });

  const films: SeasonFilm[] = strength.map((_, i) => ({ movie: `${year}-f${i}`, results: results[i], oscar: outcome[i] }));
  return { year, finished, slots: nominationSlots(category, year, nominees), oscar: oscarDates(year), films };
}

const CATEGORIES: OscarCategory[] = ["picture", "documentary", "international", "animated"];
const PAST = Array.from({ length: 13 }, (_, i) => 2012 + i);

function history(category: OscarCategory, extra: Season[] = []): Season[] {
  return [...PAST.map((y) => makeSeason(category, y, true)), ...extra];
}

/** The current season before the nominations: everything announced, no Oscar results but the lists. */
function current(category: OscarCategory): Season {
  const s = makeSeason(category, 2025, false);
  return {
    ...s,
    films: s.films.map((f) => ({
      ...f,
      oscar: f.oscar === null ? null : category === "international" || category === "animated" ? (f.oscar === "submitted" ? "submitted" : "eligible") : null,
    })),
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("% to win adds to 100", () => {
  const snapshots: Array<[string, Snapshot]> = [
    ["live, before the nominations", { kind: "live", today: "2026-01-15" }],
    ["eve of the nominations", { kind: "eve_nominations" }],
    ["eve of the ceremony", { kind: "eve_ceremony" }],
  ];
  for (const category of CATEGORIES) {
    for (const [name, snapshot] of snapshots) {
      it(`${category}, ${name}`, () => {
        const seasons = snapshot.kind === "live" ? history(category, [current(category)]) : history(category);
        const year = snapshot.kind === "live" ? 2025 : 2018;
        const p = predictCategory({ category, year, seasons, snapshot })!;
        expect(p.contenders.length).toBeGreaterThan(1);
        expect(sum(p.contenders.map((c) => c.pWin))).toBeCloseTo(1, 10);
        for (const c of p.contenders) expect(c.pWin).toBeGreaterThan(0);
      });
    }
  }

  it("after the nominations the contenders are the nominees, each with a % to win and no % to be nominated", () => {
    const p = predictCategory({ category: "picture", year: 2018, seasons: history("picture"), snapshot: { kind: "eve_ceremony" } })!;
    expect(p.phase).toBe("after");
    expect(p.contenders).toHaveLength(8);
    expect(p.params.nominate).toBeNull();
    for (const c of p.contenders) expect(c.pNominate).toBeNull();
    expect(p.contenders.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("adds to 100 for one category's raw softmax too", () => {
    expect(sum(softmax([3, 1.2, 0, -1, 0], 0.7))).toBeCloseTo(1, 12);
    expect(softmax([], 1)).toEqual([]);
  });
});

describe("% to be nominated adds to the slots", () => {
  for (const category of CATEGORIES) {
    it(`${category}: ${category === "picture" ? 10 : 5} slots, live and on the eve of the nominations`, () => {
      const slots = category === "picture" ? 10 : 5;
      const live = predictCategory({ category, year: 2025, seasons: history(category, [current(category)]), snapshot: { kind: "live", today: "2026-01-15" } })!;
      const eveNoms = predictCategory({ category, year: 2016, seasons: history(category), snapshot: { kind: "eve_nominations" } })!;
      for (const p of [live, eveNoms]) {
        expect(p.phase).toBe("before");
        const chances = p.contenders.map((c) => c.pNominate!);
        expect(sum(chances)).toBeCloseTo(category === "picture" && p === eveNoms ? 8 : slots, 8);
        for (const c of chances) {
          expect(c).toBeGreaterThan(0);
          expect(c).toBeLessThanOrEqual(0.99);
        }
      }
    });
  }

  it("Picture's slots are that year's nominees until 2020, then 10; the others 5", () => {
    expect(nominationSlots("picture", 2015, 8)).toBe(8);
    expect(nominationSlots("picture", 2020, 8)).toBe(8);
    expect(nominationSlots("picture", 2021, 10)).toBe(10);
    expect(nominationSlots("picture", 2026, 0)).toBe(10);
    expect(nominationSlots("documentary", 2015, 5)).toBe(5);
  });

  it("fills the slots with every chance at most 99%, and gives 99% to all when there are too few contenders", () => {
    const filled = fillSlots([2.5, 2.4, 2.3, 2.2, 2.1, 2.0, 0, 0, -1], 3, -2, 5);
    expect(sum(filled)).toBeCloseTo(5, 10);
    expect(Math.max(...filled)).toBeLessThanOrEqual(0.99);
    expect(fillSlots([1, 0, 0], 1, 0, 5)).toEqual([0.99, 0.99, 0.99]);
    expect(fillSlots([], 1, 0, 5)).toEqual([]);
  });
});

describe("the early cap", () => {
  const majors = PRECURSORS.picture.filter((p) => !p.festival);
  const nomination = (p: Precursor, year: number): PrecursorResult => ({
    award: p.award,
    category: p.category,
    outcome: "nominated",
    nominationsOn: `${year + 1}-01-05`,
    winnersOn: `${year + 1}-02-10`,
  });
  /** Every season, one film is nominated everywhere and wins; the rest have one nomination each. */
  function dominant(year: number, finished: boolean): Season {
    const others: SeasonFilm[] = Array.from({ length: 9 }, (_, i) => ({
      movie: `${year}-o${i}`,
      results: [nomination(majors[i % majors.length], year)],
      oscar: finished ? (i < 4 ? "nominated" : null) : null,
    }));
    const sweeper: SeasonFilm = { movie: `${year}-sweeper`, results: majors.map((p) => nomination(p, year)), oscar: finished ? "won" : null };
    return { year, finished, slots: 5, oscar: oscarDates(year), films: [sweeper, ...others] };
  }
  const seasons = [...PAST.map((y) => dominant(y, true)), dominant(2025, false)];

  it("holds before the nominations: nobody above 90%, still adding to 100", () => {
    const p = predictCategory({ category: "picture", year: 2025, seasons, snapshot: { kind: "live", today: "2026-01-15" } })!;
    expect(p.phase).toBe("before");
    const top = p.contenders[0];
    expect(top.movie).toBe("2025-sweeper");
    expect(top.pWin).toBeCloseTo(EARLY_CAP, 12);
    for (const c of p.contenders) expect(c.pWin).toBeLessThanOrEqual(EARLY_CAP + 1e-12);
    expect(sum(p.contenders.map((c) => c.pWin))).toBeCloseTo(1, 10);
  });

  it("holds on the eve of the nominations of a past season", () => {
    const p = predictCategory({ category: "picture", year: 2016, seasons, snapshot: { kind: "eve_nominations" } })!;
    expect(p.contenders[0].pWin).toBeCloseTo(EARLY_CAP, 12);
    expect(sum(p.contenders.map((c) => c.pWin))).toBeCloseTo(1, 10);
  });

  it("is raised to 97% after the nominations", () => {
    const p = predictCategory({ category: "picture", year: 2016, seasons, snapshot: { kind: "eve_ceremony" } })!;
    expect(p.phase).toBe("after");
    expect(p.contenders[0].pWin).toBeGreaterThan(EARLY_CAP);
    for (const c of p.contenders) expect(c.pWin).toBeLessThanOrEqual(LATE_CAP + 1e-12);
    expect(sum(p.contenders.map((c) => c.pWin))).toBeCloseTo(1, 10);
  });

  it("cuts the favourite to 90% and the rest keep their proportions", () => {
    const capped = capEarly([0.97, 0.02, 0.01]);
    expect(capped[0]).toBe(0.9);
    expect(capped[1] / capped[2]).toBeCloseTo(2, 12);
    expect(sum(capped)).toBeCloseTo(1, 12);
    expect(capEarly([0.6, 0.4])).toEqual([0.6, 0.4]);
    expect(capEarly([1])).toEqual([1]);
  });
});

describe("leave one season out never sees the held-out season", () => {
  /** The same seasons with `year`'s Oscar answers changed: the winner becomes a nominee and the last nominee wins. */
  function swapAnswers(seasons: Season[], year: number): Season[] {
    return seasons.map((s) => {
      if (s.year !== year) return s;
      const lastNominee = [...s.films].reverse().find((f) => f.oscar === "nominated")!.movie;
      return {
        ...s,
        films: s.films.map((f) =>
          f.oscar === "won" ? { ...f, oscar: "nominated" as Outcome } : f.movie === lastNominee ? { ...f, oscar: "won" as Outcome } : f,
        ),
      };
    });
  }

  for (const category of CATEGORIES) {
    it(`${category}: the history is every finished season but the held-out one`, () => {
      const p = predictCategory({ category, year: 2017, seasons: history(category), snapshot: { kind: "eve_ceremony" } })!;
      expect(p.history).toEqual(PAST.filter((y) => y !== 2017));
    });

    it(`${category}: changing the held-out season's winner changes nothing, changing another season's does`, () => {
      for (const snapshot of [{ kind: "eve_nominations" }, { kind: "eve_ceremony" }, { kind: "live", today: "2030-01-01" }] as Snapshot[]) {
        const seasons = history(category);
        const base = predictCategory({ category, year: 2017, seasons, snapshot });
        expect(predictCategory({ category, year: 2017, seasons: swapAnswers(seasons, 2017), snapshot })).toEqual(base);
        expect(predictCategory({ category, year: 2017, seasons: swapAnswers(seasons, 2019), snapshot })).not.toEqual(base);
      }
    });
  }

  it("on the eve of the nominations, changing who the held-out season nominated changes nothing", () => {
    const seasons = history("picture");
    const base = predictCategory({ category: "picture", year: 2014, seasons, snapshot: { kind: "eve_nominations" } });
    const reshuffled = seasons.map((s) =>
      s.year !== 2014 ? s : { ...s, films: s.films.map((f, i) => ({ ...f, oscar: (i % 3 === 0 ? "nominated" : null) as Outcome | null })) },
    );
    expect(predictCategory({ category: "picture", year: 2014, seasons: reshuffled, snapshot: { kind: "eve_nominations" } })).toEqual(base);
  });

  it("with historyBefore, learns only from the seasons before it (later seasons' answers change nothing)", () => {
    const seasons = history("documentary");
    const p = predictCategory({ category: "documentary", year: 2017, seasons, snapshot: { kind: "eve_nominations" }, historyBefore: 2017 })!;
    expect(p.history).toEqual(PAST.filter((y) => y < 2017));
    const later = predictCategory({
      category: "documentary",
      year: 2017,
      seasons: swapAnswers(swapAnswers(seasons, 2019), 2022),
      snapshot: { kind: "eve_nominations" },
      historyBefore: 2017,
    });
    expect(later).toEqual(p);
    expect(predictCategory({ category: "documentary", year: 2017, seasons: swapAnswers(seasons, 2015), snapshot: { kind: "eve_nominations" }, historyBefore: 2017 })).not.toEqual(p);
  });

  it("gives the same answer whether or not the held-out season counts as finished", () => {
    const seasons = history("documentary");
    const asUnfinished = seasons.map((s) => (s.year === 2020 ? { ...s, finished: false } : s));
    for (const snapshot of [{ kind: "eve_nominations" }, { kind: "eve_ceremony" }] as Snapshot[]) {
      expect(predictCategory({ category: "documentary", year: 2020, seasons, snapshot })).toEqual(
        predictCategory({ category: "documentary", year: 2020, seasons: asUnfinished, snapshot }),
      );
    }
  });

  it("scores each history season, while fitting, with weights from the other seasons only", () => {
    const seasons: HistorySeason[] = PAST.map((y) => {
      const at = seasonAsOf(makeSeason("picture", y, true), "picture", "2100-01-01");
      const rows = at.contenders.map((c) => ({ features: c.winFeatures, hit: c.film.oscar === "won" }));
      return { year: y, win: rows, nominate: rows };
    });
    const folds = outOfSeason(seasons, "win", 3);
    seasons.forEach((s, i) => {
      const others = weights(tally(seasons.filter((_, j) => j !== i).flatMap((o) => o.win)), 3);
      expect(folds[i].scores).toEqual(s.win.map((r) => score(r.features, others)));
      const flipped = seasons.map((o, j) => (j === i ? { ...o, win: o.win.map((r) => ({ ...r, hit: !r.hit })) } : o));
      expect(outOfSeason(flipped, "win", 3)[i].scores).toEqual(folds[i].scores);
    });
  });
});

describe("weights", () => {
  it("smooths each result's hit rate towards the base rate and clips ln(h / p0) to [−1, 3]", () => {
    // 20 contenders, 2 hits: p0 = 0.1. "a|won": 2 of 2 → h = (2 + 0.3) / 5 = 0.46 → ln 4.6.
    const rows = [
      { features: ["a|won"], hit: true },
      { features: ["a|won"], hit: true },
      ...Array.from({ length: 18 }, () => ({ features: ["b|nominated"], hit: false })),
    ];
    const w = weights(tally(rows), 3);
    expect(w.get("a|won")).toBeCloseTo(Math.log(4.6), 12);
    // "b|nominated": 0 of 18 → h = 0.3 / 21 → ln(1/7) < −1, clipped.
    expect(w.get("b|nominated")).toBe(-1);
    // 2 hits in 60: with no smoothing, "a|won" is ln(1 / (1/30)) = ln 30 > 3, clipped.
    const rare = [...rows, ...Array.from({ length: 40 }, () => ({ features: [], hit: false }))];
    expect(weights(tally(rare), 0).get("a|won")).toBe(3);
  });

  it("weighs nothing without hits", () => {
    expect(weights(tally([{ features: ["a|won"], hit: false }]), 3).size).toBe(0);
  });
});

describe("a season as of a date", () => {
  const bafta: PrecursorResult = { award: "bafta", category: "bafta/film", outcome: "won", nominationsOn: "2025-01-07", winnersOn: "2025-02-16" };

  it("shows a winner as a nominee until its winners day, and nothing before its nominations", () => {
    expect(resultAsOf(bafta, "2025-01-01")).toBeNull();
    expect(resultAsOf(bafta, "2025-01-20")).toBe("nominated");
    expect(resultAsOf(bafta, "2025-03-01")).toBe("won");
    expect(resultAsOf(bafta, null)).toBe("won");
  });

  it("shows a festival's winners and runners-up on its last day, and counts an unknown date as announced", () => {
    const palme: PrecursorResult = { award: "cannes", category: "cannes/palme", outcome: "won", nominationsOn: null, winnersOn: "2024-05-25" };
    expect(resultAsOf(palme, "2024-05-20")).toBeNull();
    expect(resultAsOf(palme, "2024-06-01")).toBe("won");
    expect(resultAsOf({ ...palme, outcome: "runner_up" }, "2024-06-01")).toBe("nominated");
    expect(resultAsOf({ ...palme, outcome: "runner_up" }, "2024-05-20")).toBeNull();
    expect(resultAsOf({ ...bafta, winnersOn: null }, "2025-01-01")).toBe("won");
    expect(resultAsOf({ ...bafta, outcome: "shortlisted" }, null)).toBeNull();
  });

  it("counts an undated result only once the season says so (from the eve of its nominations)", () => {
    const undated: PrecursorResult = { award: "cinema-eye", category: "cinema-eye/feature", outcome: "won", nominationsOn: null, winnersOn: null };
    expect(resultAsOf(undated, "2024-10-23", false)).toBeNull();
    expect(resultAsOf(undated, "2024-10-23", true)).toBe("won");
    expect(resultAsOf(undated, null, false)).toBe("won");
  });

  it("reads Oscar lists as of the date: International's submissions from the start, the shortlist on its day", () => {
    const dates = oscarDates(2024);
    expect(oscarStatusAsOf("international", "won", dates, "2024-11-01")).toBe("submitted");
    expect(oscarStatusAsOf("international", "won", dates, "2025-01-01")).toBe("shortlisted");
    expect(oscarStatusAsOf("international", "eligible", dates, "2025-01-01")).toBe("eligible");
    expect(oscarStatusAsOf("international", "won", dates, "2025-02-01")).toBe("nominated");
    expect(oscarStatusAsOf("international", "won", dates, "2025-03-02")).toBe("won");
    expect(oscarStatusAsOf("animated", "nominated", dates, "2025-01-01")).toBe("eligible");
    expect(oscarStatusAsOf("picture", "nominated", dates, "2025-01-01")).toBeNull();
    expect(oscarStatusAsOf("documentary", "nominated", dates, "2024-12-01")).toBeNull();
    expect(oscarStatusAsOf("picture", "won", { ...dates, nominationsOn: null }, "2025-02-01")).toBeNull();
  });

  it("keeps International to its submissions, then to the shortlist", () => {
    const s = makeSeason("international", 2024, true);
    const notSubmitted = s.films.filter((f) => f.oscar === null && f.results.length > 0).map((f) => f.movie);
    const before = seasonAsOf(s, "international", "2024-11-01");
    expect(before.contenders.length).toBe(s.films.filter((f) => f.oscar !== null).length);
    for (const movie of notSubmitted) expect(before.contenders.map((c) => c.movie)).not.toContain(movie);
    const shortlist = seasonAsOf(s, "international", "2025-01-01");
    expect(shortlist.phase).toBe("before");
    expect(shortlist.contenders).toHaveLength(15);
    expect(shortlist.contenders.every((c) => c.nomFeatures.includes("oscar|shortlisted"))).toBe(true);
    expect(seasonAsOf(s, "international", "2025-02-01").contenders).toHaveLength(5);
  });

  it("is early with fewer than 3 precursor awards announced", () => {
    const s = makeSeason("picture", 2024, true);
    // Only Cannes by June; Golden Globes, PGA, DGA, BAFTA nominations by mid-January.
    expect(seasonAsOf(s, "picture", "2024-06-01").early).toBe(true);
    expect(seasonAsOf(s, "picture", "2025-01-10").early).toBe(false);
    const p = predictCategory({ category: "picture", year: 2024, seasons: history("picture"), snapshot: { kind: "live", today: "2024-06-01" } })!;
    expect(p.early).toBe(false);
  });

  it("lines live history up with the same point of the season", () => {
    // Cutoffs are exclusive and the live target counts today, so the matching day is one day on.
    const target = oscarDates(2025);
    expect(historyCutoff({ kind: "live", today: "2025-12-01" }, "before", target, oscarDates(2015))).toBe("2015-12-02");
    expect(historyCutoff({ kind: "live", today: "2026-01-19" }, "before", target, oscarDates(2015))).toBe("2016-01-19");
    expect(historyCutoff({ kind: "live", today: "2026-02-10" }, "after", target, oscarDates(2015))).toBe("2016-02-12");
    expect(historyCutoff({ kind: "live", today: "2026-01-21" }, "after", target, oscarDates(2015))).toBe("2016-01-23");
    expect(historyCutoff({ kind: "live", today: "2026-06-01" }, "after", target, oscarDates(2015))).toBe("2016-02-29");
    expect(historyCutoff({ kind: "eve_nominations" }, "before", target, oscarDates(2015))).toBe("2016-01-19");
    expect(historyCutoff({ kind: "eve_ceremony" }, "after", target, { ...oscarDates(2015), winnersOn: null })).toBeUndefined();
  });
});

describe("the why", () => {
  it("lists up to four results by weight with their record, and past films with the same top two", () => {
    const p = predictCategory({ category: "picture", year: 2018, seasons: history("picture"), snapshot: { kind: "eve_ceremony" } })!;
    for (const c of p.contenders) {
      const { top, similar } = c.why;
      expect(top.length).toBeLessThanOrEqual(4);
      for (let i = 1; i < top.length; i += 1) expect(top[i - 1].weight).toBeGreaterThanOrEqual(top[i].weight);
      for (const r of top) expect(r.hits).toBeLessThanOrEqual(r.count);
      if (similar) {
        expect(similar.count).toBe(similar.films.length);
        expect(similar.won).toBe(similar.films.filter((f) => f.won).length);
        expect(similar.films.every((f) => f.year !== 2018)).toBe(true);
      }
    }
    const favourite = p.contenders[0].why;
    expect(favourite.top[0].weight).toBeGreaterThan(0);
    expect(favourite.similar!.count).toBeGreaterThan(0);
  });

  it("returns null without a season or a date", () => {
    expect(predictCategory({ category: "picture", year: 2030, seasons: history("picture"), snapshot: { kind: "eve_ceremony" } })).toBeNull();
    const undated = history("picture").map((s) => (s.year === 2015 ? { ...s, oscar: { ...s.oscar, winnersOn: null } } : s));
    expect(predictCategory({ category: "picture", year: 2015, seasons: undated, snapshot: { kind: "eve_ceremony" } })).toBeNull();
  });
});
