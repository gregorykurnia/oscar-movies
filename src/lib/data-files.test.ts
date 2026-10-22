import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { awardsFileSchema, editionFileSchema, marksFileSchema, moviesFileSchema } from "./data-files";

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

describe("data file schemas", () => {
  it("accept the repo's awards, movies and edition files", () => {
    expect(awardsFileSchema.safeParse(readJson("data/awards.json")).success).toBe(true);
    expect(moviesFileSchema.safeParse(readJson("data/movies/2024.json")).success).toBe(true);
    expect(editionFileSchema.safeParse(readJson("data/editions/oscars/2024.json")).success).toBe(true);
  });

  const film = { slug: "flow", title: "Flow", countries: ["LV"] };
  it.each([
    ["a key that is neither an IMDb ID nor a QID", { "flow-2024": film }],
    ["a lowercase country", { tt1: { ...film, countries: ["lv"] } }],
    ["an original title without its language", { tt1: { ...film, originalTitle: "Straume" } }],
    ["a QID key with another wd", { Q1: { ...film, wd: "Q2" } }],
    ["a slug with spaces", { tt1: { ...film, slug: "Flow 2024" } }],
  ])("movies: refuse %s", (_, file) => {
    expect(moviesFileSchema.safeParse(file).success).toBe(false);
  });

  const edition = { award: "oscars", year: 2024, status: "loaded", sourceUrls: [], results: [], screenings: [] };
  const result = { category: "picture", title: "Flow", outcome: "nominated" };
  it.each([
    ["a result with no film ID", { results: [result] }],
    ["an unresolved result that has an ID", { results: [{ ...result, imdb: "tt1", unresolved: true }] }],
    ["an unknown outcome", { results: [{ ...result, imdb: "tt1", outcome: "lost" }] }],
    ["a bad date", { winnersOn: "2 March 2025" }],
    ["a year before 2012", { year: 2011 }],
  ])("editions: refuse %s", (_, change) => {
    expect(editionFileSchema.safeParse({ ...edition, ...change }).success).toBe(false);
  });

  it("editions: accept an unresolved film by its title", () => {
    const unresolved = { ...result, unresolved: true };
    expect(editionFileSchema.safeParse({ ...edition, results: [unresolved] }).success).toBe(true);
  });
});

describe("marksFileSchema", () => {
  it("accepts the test fixture", () => {
    const fixture: unknown = JSON.parse(readFileSync("tests/fixtures/marks.json", "utf8"));
    expect(marksFileSchema.safeParse(fixture).success).toBe(true);
  });

  it("accepts a full entry named by QID only", () => {
    const entry = { wd: "Q3", title: "Flow", year: 2024, watched: true, want: false, updatedAt: "2026-10-22T08:00:00.000Z" };
    expect(marksFileSchema.safeParse([entry]).success).toBe(true);
  });

  it.each([
    ["no id", { watched: true, want: false }],
    ["a bad IMDb ID", { imdb: "nm123", watched: true, want: false }],
    ["watched and want", { imdb: "tt1", watched: true, want: true }],
    ["an unknown field", { imdb: "tt1", watched: true, want: false, movieId: 4 }],
  ])("refuses an entry with %s", (_, entry) => {
    expect(marksFileSchema.safeParse([entry]).success).toBe(false);
  });

  it("refuses a film listed twice", () => {
    const twice = [
      { imdb: "tt1", watched: true, want: false },
      { imdb: "tt1", watched: false, want: true },
    ];
    expect(marksFileSchema.safeParse(twice).success).toBe(false);
  });
});
