import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { marksFileSchema } from "./data-files";

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
