// `race:check`'s pure parts: a load plan laid over the prediction tables in memory, the chances
// that move as the race shows them, and the report. The sample dry run on `test` is in
// docs/update-the-race.md.
import { describe, expect, it } from "vitest";
import type { PredictionRow, Tables } from "./compute";
import type { LoadPlan } from "./load";
import { chanceMoves, formatRaceCheck, tablesAfterPlan } from "./race-check";

function emptyPlan(): LoadPlan {
  return {
    awards: { inserts: [], updates: [] },
    categories: { inserts: [], updates: [] },
    movies: { inserts: [], updates: [] },
    editions: { inserts: [], updates: [] },
    results: { inserts: [], updates: [], deletes: [] },
    screenings: { inserts: [], updates: [], deletes: [] },
    editionKeys: [],
    problems: [],
  };
}

const award = { id: 1, slug: "tiff", name: "TIFF", shortName: "TIFF", kind: "festival" as const, calendarOrder: 1, winnersOnly: false, isSelection: false, url: null };
const category = { id: 10, awardId: 1, slug: "peoples-choice", name: "People's Choice", oscarCategory: "picture" as const, loose: false, mappingNote: null, sortOrder: 1 };
const edition = { id: 100, awardId: 1, year: 2026, ordinal: null, status: "loaded" as const, shortlistOn: null, nominationsOn: "2026-09-20", winnersOn: "2026-09-20", sourceUrls: [], note: null };

function tables(): Tables {
  return {
    awardRows: [award],
    categoryRows: [category],
    editionRows: [edition],
    resultRows: [
      { id: 1000, editionId: 100, categoryId: 10, movieId: 1, outcome: "won" },
      { id: 1001, editionId: 100, categoryId: 10, movieId: 2, outcome: "runner_up" },
      { id: 1002, editionId: 100, categoryId: 10, movieId: 3, outcome: "runner_up" },
    ],
  };
}

const films = [
  { id: 1, title: "One", imdbId: "tt0000001", wikidataId: null },
  { id: 2, title: "Two", imdbId: "tt0000002", wikidataId: null },
  { id: 3, title: "Three", imdbId: null, wikidataId: "Q3" },
];

describe("tablesAfterPlan", () => {
  it("applies changed, removed and new results, a new film among them, without touching the input", () => {
    const plan = emptyPlan();
    plan.results.updates.push(
      { id: 1000, label: "result tiff 2026 peoples-choice: One (tt0000001)", set: { outcome: "runner_up" }, changes: [] },
      { id: 1001, label: "result tiff 2026 peoples-choice: Two (tt0000002)", set: { outcome: "won" }, changes: [] },
    );
    plan.results.deletes.push({ id: 1002, label: "result tiff 2026 peoples-choice: Three (Q3), runner_up" });
    plan.movies.inserts.push({ key: "tt0000004", slug: "four", title: "Four", year: 2026, countries: ["FR"], imdbId: "tt0000004", wikidataId: null });
    plan.results.inserts.push(
      { award: "tiff", year: 2026, category: "peoples-choice", movie: "tt0000004", label: "result tiff 2026 peoples-choice: Four (tt0000004)", outcome: "runner_up", country: null },
    );
    const before = tables();
    const after = tablesAfterPlan(before, plan, films);

    expect(after.tables.resultRows.map((r) => [r.movieId, r.outcome])).toEqual([
      [1, "runner_up"],
      [2, "won"],
      [-1, "runner_up"],
    ]);
    expect(after.tables.resultRows[2]).toMatchObject({ editionId: 100, categoryId: 10 });
    expect(after.films.find((f) => f.id === -1)?.title).toBe("Four");
    expect(before.resultRows.map((r) => r.outcome)).toEqual(["won", "runner_up", "runner_up"]);
  });

  it("gives a new edition and its category ids the new results point at, and applies edition updates", () => {
    const plan = emptyPlan();
    plan.categories.inserts.push({ award: "tiff", slug: "midnight", name: "Midnight Madness", oscarCategory: "picture", sortOrder: 2 });
    plan.editions.inserts.push({ award: "tiff", year: 2027, status: "loaded", winnersOn: "2027-09-19", sourceUrls: [] });
    plan.editions.updates.push({ id: 100, label: "edition tiff 2026", set: { winnersOn: "2026-09-21" }, changes: [] });
    plan.results.inserts.push(
      { award: "tiff", year: 2027, category: "midnight", movie: "Q3", label: "result tiff 2027 midnight: Three (Q3)", outcome: "won", country: null },
    );
    const after = tablesAfterPlan(tables(), plan, films).tables;
    const newCategory = after.categoryRows.find((c) => c.slug === "midnight")!;
    const newEdition = after.editionRows.find((e) => e.year === 2027)!;
    expect(after.resultRows.at(-1)).toEqual({ editionId: newEdition.id, categoryId: newCategory.id, movieId: 3, outcome: "won" });
    expect(after.editionRows.find((e) => e.id === 100)?.winnersOn).toBe("2026-09-21");
  });
});

function row(p: Partial<PredictionRow> & Pick<PredictionRow, "movieId" | "pWin">): PredictionRow {
  return { year: 2026, oscarCategory: "picture", snapshot: "live", pNominate: null, rank: 1, why: null, finished: false, ...p };
}

describe("chanceMoves", () => {
  it("lists only chances that move in whole points, new and dropped contenders included", () => {
    const before = [row({ movieId: 1, pWin: 0.401 }), row({ movieId: 2, pWin: 0.3, pNominate: 0.9 }), row({ movieId: 3, pWin: 0.299 })];
    const after = [row({ movieId: 1, pWin: 0.404 }), row({ movieId: 2, pWin: 0.3, pNominate: 0.95 }), row({ movieId: 4, pWin: 0.296 })];
    expect(chanceMoves(before, after)).toEqual([
      { year: 2026, category: "picture", movieId: 3, win: [30, null], nominate: [null, null] },
      { year: 2026, category: "picture", movieId: 4, win: [null, 30], nominate: [null, null] },
      { year: 2026, category: "picture", movieId: 2, win: [30, 30], nominate: [90, 95] },
    ]);
  });

  it("reads a finished season's eve-of-ceremony snapshot, as the race shows it", () => {
    const before = [
      row({ year: 2024, finished: true, snapshot: "live", movieId: 1, pWin: 0.5 }),
      row({ year: 2024, finished: true, snapshot: "eve_ceremony", movieId: 1, pWin: 0.5 }),
    ];
    const after = [
      row({ year: 2024, finished: true, snapshot: "live", movieId: 1, pWin: 0.7 }),
      row({ year: 2024, finished: true, snapshot: "eve_ceremony", movieId: 1, pWin: 0.5 }),
    ];
    expect(chanceMoves(before, after)).toEqual([]);
  });
});

describe("formatRaceCheck", () => {
  it("lists the new results, the season's moves by category, and one line per other season", () => {
    const plan = emptyPlan();
    plan.results.inserts.push(
      { award: "tiff", year: 2026, category: "peoples-choice", movie: "tt0000004", label: "result tiff 2026 peoples-choice: Four (tt0000004)", outcome: "runner_up", country: null },
    );
    const text = formatRaceCheck({
      planText: "PLAN",
      plan,
      season: 2026,
      titleOf: (id) => ["", "One", "Two", "Three", "Four"][id] ?? `film #${id}`,
      moves: [
        { year: 2026, category: "picture", movieId: 4, win: [null, 12], nominate: [null, 60] },
        { year: 2026, category: "picture", movieId: 1, win: [40, 35], nominate: [99, 99] },
        { year: 2025, category: "picture", movieId: 2, win: [20, 23], nominate: [null, null] },
      ],
    });
    expect(text.split("\n")).toEqual([
      "PLAN",
      "New results:",
      "  tiff 2026 peoples-choice: Four (tt0000004), runner_up",
      "Chances in 2026 that move (% to win; % to be nominated):",
      "  Best Picture",
      "    Four: win new, 12%; nominated new, 60%",
      "    One: win 40% → 35% (-5)",
      "Other seasons (each is history for the others):",
      "  2025: 1 film moves, the most 3 points to win",
    ]);
  });

  it("says when nothing moves", () => {
    expect(formatRaceCheck({ planText: "PLAN", plan: emptyPlan(), season: 2026, titleOf: String, moves: [] })).toBe(
      "PLAN\nChances in 2026: none move.",
    );
  });
});
