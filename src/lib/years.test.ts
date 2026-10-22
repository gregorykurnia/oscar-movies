import { describe, expect, it } from "vitest";
import { editionLabel, parseFilmYear, yearRange } from "./years";

describe("editionLabel", () => {
  it("numbers the Academy Awards from 1927", () => {
    expect(editionLabel(2025)).toBe("98th Academy Awards");
    expect(editionLabel(2026)).toBe("99th Academy Awards");
    expect(editionLabel(2024)).toBe("97th Academy Awards");
    expect(editionLabel(2012)).toBe("85th Academy Awards");
  });

  it("uses st, nd and rd where English does, and th for the teens", () => {
    expect(editionLabel(1927 + 1)).toBe("1st Academy Awards");
    expect(editionLabel(1927 + 2)).toBe("2nd Academy Awards");
    expect(editionLabel(1927 + 3)).toBe("3rd Academy Awards");
    expect(editionLabel(1927 + 11)).toBe("11th Academy Awards");
    expect(editionLabel(1927 + 112)).toBe("112th Academy Awards");
  });
});

describe("yearRange", () => {
  it("runs newest first", () => {
    expect(yearRange(2026, 2024)).toEqual([2026, 2025, 2024]);
  });
});

describe("parseFilmYear", () => {
  it("reads the years the app covers and nothing else", () => {
    expect(parseFilmYear("2024")).toBe(2024);
    expect(parseFilmYear("2012")).toBe(2012);
    expect(parseFilmYear("2026")).toBe(2026);
    expect(parseFilmYear("2011")).toBeNull();
    expect(parseFilmYear("2027")).toBeNull();
    expect(parseFilmYear("2024.0")).toBeNull();
    expect(parseFilmYear("abc")).toBeNull();
  });
});
