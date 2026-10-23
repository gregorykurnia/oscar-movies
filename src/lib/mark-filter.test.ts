import { describe, expect, it } from "vitest";
import {
  keepMarked,
  markChips,
  markFilterQuery,
  markSets,
  parseMarkFilter,
  passesMark,
  toggleFilterIn,
} from "./mark-filter";

const marks = markSets([
  { movieId: 1, watched: true, want: false },
  { movieId: 2, watched: false, want: true },
  { movieId: 3, watched: false, want: false },
]);

describe("passesMark", () => {
  it("Watched keeps watched films, Unwatched the rest (want to watch stays), Want to watch those", () => {
    expect([1, 2, 3].filter((id) => passesMark("watched", id, marks))).toEqual([1]);
    expect([1, 2, 3].filter((id) => passesMark("unwatched", id, marks))).toEqual([2, 3]);
    expect([1, 2, 3].filter((id) => passesMark("want", id, marks))).toEqual([2]);
  });
});

describe("address", () => {
  it("reads one mark filter and ignores anything else", () => {
    expect(parseMarkFilter({})).toBeNull();
    expect(parseMarkFilter({ filter: "nonsense" })).toBeNull();
    expect(parseMarkFilter({ filter: "want" })).toBe("want");
    expect(parseMarkFilter({ filter: ["unwatched", "watched"] })).toBe("watched");
    expect(markFilterQuery("want")).toBe("?filter=want");
    expect(markFilterQuery(null)).toBe("");
  });

  it("links each chip with itself flipped", () => {
    const chips = markChips("/awards/bafta/2025", "unwatched");
    expect(chips.map((c) => [c.label, c.href, c.pressed])).toEqual([
      ["Watched", "/awards/bafta/2025?filter=watched", false],
      ["Unwatched", "/awards/bafta/2025", true],
      ["Want to watch", "/awards/bafta/2025?filter=want", false],
    ]);
  });
});

describe("toggleFilterIn", () => {
  const order = ["shortlisted", "watched", "unwatched", "want"] as const;
  it("flips one chip in the chips' order, and a mark chip replaces the other mark chips", () => {
    expect(toggleFilterIn(order, ["unwatched"], "shortlisted")).toEqual(["shortlisted", "unwatched"]);
    expect(toggleFilterIn(order, ["shortlisted", "watched"], "want")).toEqual(["shortlisted", "want"]);
    expect(toggleFilterIn(order, ["want"], "want")).toEqual([]);
  });
});

describe("keepMarked", () => {
  it("returns every row with no filter", () => {
    const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(keepMarked(rows, null, marks, (r) => r.id)).toBe(rows);
    expect(keepMarked(rows, "want", marks, (r) => r.id)).toEqual([{ id: 2 }]);
  });
});
