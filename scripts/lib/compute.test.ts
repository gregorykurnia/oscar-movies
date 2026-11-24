import { describe, expect, it } from "vitest";
import { computeAccuracyRows, computePredictionRows, type Tables } from "./compute";

function tables(): Tables {
  const award = (id: number, slug: string, kind: Tables["awardRows"][number]["kind"]) => ({
    id, slug, kind, name: slug, shortName: slug, calendarOrder: id, url: null, winnersOnly: false, isSelection: false,
  });
  const category = (id: number, awardId: number, slug: string, oscarCategory: "international" | "picture") => ({
    id, awardId, slug, oscarCategory, name: slug, sortOrder: id, mappingNote: null, loose: false,
  });
  const edition = (id: number, awardId: number, winnersOn: string) => ({
    id, awardId, year: 2023, winnersOn, status: "loaded" as const, ordinal: null,
    shortlistOn: null, nominationsOn: null, sourceUrls: [], note: null,
  });
  return {
    awardRows: [award(1, "oscars", "oscars"), award(2, "cannes", "festival")],
    categoryRows: [
      category(10, 1, "international", "international"),
      category(11, 1, "picture", "picture"),
      category(20, 2, "ucr-prize", "international"),
      category(21, 2, "ucr-jury-prize", "international"),
      category(22, 2, "palme-dor", "picture"),
    ],
    editionRows: [edition(100, 1, "2024-03-10"), edition(200, 2, "2023-05-27")],
    movieRows: [
      { id: 1, title: "How to Have Sex", language: "en", countries: ["GB"] },
      { id: 2, title: "Hounds", language: "ary", countries: ["MA"] },
      { id: 3, title: "Film with no language recorded", language: null, countries: [] },
      { id: 4, title: "The Zone of Interest", language: "en", countries: ["GB"] },
    ],
    resultRows: [
      { editionId: 200, categoryId: 20, movieId: 1, outcome: "won" },
      { editionId: 200, categoryId: 21, movieId: 2, outcome: "won" },
      { editionId: 200, categoryId: 21, movieId: 3, outcome: "won" },
      { editionId: 200, categoryId: 22, movieId: 1, outcome: "won" },
    ],
  };
}

function contenders(input: Tables, category: "international" | "picture") {
  return computePredictionRows(input, "2023-06-01")
    .filter((r) => r.year === 2023 && r.oscarCategory === category && r.snapshot === "live")
    .map((r) => r.movieId)
    .sort();
}

describe("English-language films in the International race", () => {
  it("keeps an Arabic UCR winner and an unknown-language film, with the Picture race unaffected", () => {
    const input = tables();
    expect(contenders(input, "international")).toEqual([2, 3]);
    expect(contenders(input, "picture")).toEqual([1]);
  });

  it.each([
    { name: "a regional English code with padding", language: "  EN-gb ", included: false },
    { name: "a three-letter English code", language: "ENG", included: false },
    { name: "a blank code", language: "  ", included: true },
    { name: "a different code starting with en", language: "enm", included: true },
    { name: "a very long unrecognized code", language: "e".repeat(2048), included: true },
  ])("handles $name", ({ language, included }) => {
    const input = tables();
    input.movieRows![0].language = language;
    expect(contenders(input, "international").includes(1)).toBe(included);
  });

  it("uses confirmed Academy eligibility and leaves out provisional submissions tagged English", () => {
    const input = tables();
    input.resultRows.push(
      { editionId: 100, categoryId: 10, movieId: 1, outcome: "submitted" },
      { editionId: 100, categoryId: 10, movieId: 4, outcome: "won" },
    );
    expect(contenders(input, "international")).toEqual([4]);
  });

  it("excludes English-only precursor picks from International accuracy and keeps official hits", () => {
    const input = tables();
    input.resultRows = [
      { editionId: 100, categoryId: 10, movieId: 4, outcome: "won" },
      { editionId: 100, categoryId: 11, movieId: 1, outcome: "won" },
      { editionId: 200, categoryId: 20, movieId: 4, outcome: "won" },
      { editionId: 200, categoryId: 20, movieId: 1, outcome: "nominated" },
      { editionId: 200, categoryId: 22, movieId: 1, outcome: "won" },
    ];
    const figures = computeAccuracyRows(input, "2024-03-11");
    expect(figures).toContainEqual(expect.objectContaining({
      categoryId: 20, winHits: 1, winCount: 1, nomHits: 1, nomCount: 1, nomineesHits: null, caughtHits: null,
    }));
    expect(figures).toContainEqual(expect.objectContaining({ categoryId: 22, winHits: 1, winCount: 1 }));
  });
});
