import { describe, expect, it } from "vitest";
import {
  DEFAULT_SORT,
  figureCell,
  groupRows,
  parseSort,
  rowNote,
  seasonsSpan,
  sortQuery,
  sortRows,
  type AccuracyRow,
} from "./accuracy-page";

const row = (award: string, win: [number, number] | null, extra: Partial<AccuracyRow> = {}): AccuracyRow => ({
  key: award,
  award,
  kind: "major",
  note: "Best Film",
  win: win && { hits: win[0], count: win[1] },
  nomination: { hits: 1, count: 2 },
  nominees: null,
  years: 14,
  ...extra,
});

describe("parseSort and sortQuery", () => {
  it("falls back to winner-won, highest first, for anything unknown", () => {
    expect(parseSort(undefined, undefined)).toEqual(DEFAULT_SORT);
    expect(parseSort("nonsense", "asc")).toEqual(DEFAULT_SORT);
  });

  it("reads the column and direction; the award's name starts A to Z, a figure highest first", () => {
    expect(parseSort("nominees", "asc")).toEqual({ key: "nominees", direction: "ascending" });
    expect(parseSort("award", undefined)).toEqual({ key: "award", direction: "ascending" });
    expect(parseSort("years", undefined)).toEqual({ key: "years", direction: "descending" });
  });

  it("writes nothing for the default and round-trips the rest", () => {
    expect(sortQuery(DEFAULT_SORT)).toBe("");
    const sort = { key: "nomination", direction: "ascending" } as const;
    expect(parseSort("nomination", "asc")).toEqual(sort);
    expect(sortQuery(sort)).toBe("?sort=nomination&dir=asc");
  });
});

describe("sortRows", () => {
  const rows = [row("B", [1, 4]), row("A", [3, 4]), row("D", null), row("C", [1, 4])];

  it("sorts by the share, not the count, and ties by name", () => {
    expect(sortRows(rows, { key: "win", direction: "descending" }).map((r) => r.award)).toEqual(["A", "B", "C", "D"]);
  });

  it("keeps a figure that doesn't apply last whichever way it sorts", () => {
    expect(sortRows(rows, { key: "win", direction: "ascending" }).map((r) => r.award)).toEqual(["B", "C", "A", "D"]);
  });

  it("treats a count of 0 as not applying", () => {
    const list = [row("A", [0, 0]), row("B", [0, 5])];
    expect(sortRows(list, { key: "win", direction: "descending" }).map((r) => r.award)).toEqual(["B", "A"]);
  });

  it("sorts by name and by years, and leaves the input alone", () => {
    const list = [row("B", [1, 1], { years: 3 }), row("A", [1, 1], { years: 9 })];
    expect(sortRows(list, { key: "award", direction: "ascending" }).map((r) => r.award)).toEqual(["A", "B"]);
    expect(sortRows(list, { key: "years", direction: "ascending" }).map((r) => r.award)).toEqual(["B", "A"]);
    expect(list.map((r) => r.award)).toEqual(["B", "A"]);
  });
});

describe("groupRows", () => {
  it("groups in the guide's order and leaves out empty groups", () => {
    const rows = [row("Cannes", [1, 1], { kind: "festival" }), row("BAFTA", [1, 1])];
    expect(groupRows(rows, DEFAULT_SORT).map((g) => [g.label, g.rows.map((r) => r.award)])).toEqual([
      ["Major awards", ["BAFTA"]],
      ["Festivals", ["Cannes"]],
    ]);
  });
});

describe("words", () => {
  it("figureCell gives a share and count, or nothing", () => {
    expect(figureCell({ hits: 11, count: 14 })).toEqual({ pct: (11 / 14) * 100, count: "11 of 14" });
    expect(figureCell(null)).toEqual({ pct: null });
    expect(figureCell({ hits: 0, count: 0 })).toEqual({ pct: null });
  });

  it("rowNote says what is special about the category", () => {
    expect(rowNote({ name: "Best Film", loose: false, winnersOnly: false, isSelection: false })).toBe("Best Film");
    expect(rowNote({ name: "Outstanding Cast", loose: true, winnersOnly: false, isSelection: false })).toBe(
      "Outstanding Cast · looser match",
    );
    expect(rowNote({ name: "Top 10", loose: false, winnersOnly: false, isSelection: true })).toBe("Top 10 · a list, no winner");
    expect(rowNote({ name: "Best Film", loose: false, winnersOnly: true, isSelection: false })).toBe("Best Film · winners only");
  });

  it("seasonsSpan names the span and counts the seasons", () => {
    expect(seasonsSpan([])).toBe("no finished seasons yet");
    expect(seasonsSpan([2020])).toBe("2020 (1 finished season)");
    expect(seasonsSpan([2012, 2013, 2025])).toBe("2012–2025 (3 finished seasons)");
  });
});
