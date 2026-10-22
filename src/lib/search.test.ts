import { describe, expect, it } from "vitest";
import {
  escapeLike,
  escapeRegex,
  highlightParts,
  matchAwards,
  matchRange,
  normalizeQuery,
  SEARCH_MAX_LENGTH,
  type SearchableAward,
} from "./search";

describe("normalizeQuery", () => {
  it("ignores case, accents, curly apostrophes and extra spaces", () => {
    expect(normalizeQuery("  AINDA   Estou ")).toBe("ainda estou");
    expect(normalizeQuery("Emilia Pérez")).toBe("emilia perez");
    expect(normalizeQuery("I’m Still Here")).toBe("i'm still here");
    expect(normalizeQuery("Søren Łódź Straße")).toBe("soren lodz strasse");
  });

  it("is empty for nothing but spaces and capped in length", () => {
    expect(normalizeQuery("   ")).toBe("");
    expect(normalizeQuery("a".repeat(500))).toHaveLength(SEARCH_MAX_LENGTH);
  });
});

describe("escaping", () => {
  it("escapes LIKE wildcards and regex characters so a query is only text", () => {
    expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
    expect(escapeRegex("a.b(c)+[d]")).toBe("a\\.b\\(c\\)\\+\\[d\\]");
  });
});

describe("matchRange and highlightParts", () => {
  it("finds the match in the original text, through accents and case", () => {
    expect(matchRange("Ainda Estou Aqui", "ainda estou")).toEqual([0, 11]);
    expect(matchRange("Emilia Pérez", "perez")).toEqual([7, 12]);
    expect(matchRange("Soundtrack To A Coup D'État", "d'etat")).toEqual([21, 27]);
  });

  it("prefers the start of a word to the middle of one", () => {
    expect(matchRange("Chain Reaction", "ain")).toEqual([2, 5]);
    expect(matchRange("Chain Ainda", "ain")).toEqual([6, 9]);
    expect(matchRange("Anora", "zz")).toBeNull();
    expect(matchRange("Anora", "")).toBeNull();
  });

  it("cuts a title into the matched part and the rest", () => {
    expect(highlightParts("Anatomy of a Fall", "an")).toEqual([
      { text: "An", match: true },
      { text: "atomy of a Fall", match: false },
    ]);
    expect(highlightParts("Anora", "nor")).toEqual([
      { text: "A", match: false },
      { text: "nor", match: true },
      { text: "a", match: false },
    ]);
    expect(highlightParts("Flow", "x")).toEqual([{ text: "Flow", match: false }]);
  });
});

const list: SearchableAward[] = [
  { slug: "oscars", name: "Academy Awards", shortName: "Oscars", kind: "oscars", year: 2025, calendarOrder: 100 },
  { slug: "annie", name: "Annie Awards", shortName: "Annie", kind: "major", year: 2025, calendarOrder: 50 },
  { slug: "bafta", name: "British Academy Film Awards", shortName: "BAFTA", kind: "major", year: 2025, calendarOrder: 90 },
  { slug: "cannes", name: "Cannes Film Festival", shortName: "Cannes", kind: "festival", year: 2025, calendarOrder: 10 },
  { slug: "lafca", name: "Los Angeles Film Critics Association", shortName: "LAFCA", kind: "critics", year: 2024, calendarOrder: 20 },
];

describe("matchAwards", () => {
  it("matches names and short names, with the newest year in the link", () => {
    expect(matchAwards(list, "oscar")).toEqual([
      { slug: "oscars", name: "Academy Awards", shortName: "Oscars", kindLabel: "Oscars", href: "/awards/oscars/2025" },
    ]);
    expect(matchAwards(list, "lafca")[0].href).toBe("/awards/lafca/2024");
  });

  it("puts a name that starts with the query first, then a word that starts with it, then calendar order", () => {
    expect(matchAwards(list, "an").map((a) => a.slug)).toEqual(["annie", "lafca"]);
    expect(matchAwards(list, "film").map((a) => a.slug)).toEqual(["cannes", "lafca", "bafta"]);
    expect(matchAwards(list, "academy").map((a) => a.slug)).toEqual(["oscars", "bafta"]);
  });

  it("returns nothing for an empty or unknown query, and at most five", () => {
    expect(matchAwards(list, " ")).toEqual([]);
    expect(matchAwards(list, "parasyte")).toEqual([]);
    expect(matchAwards(list, "a", 2)).toHaveLength(2);
  });
});
