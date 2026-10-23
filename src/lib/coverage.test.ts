import { describe, expect, it } from "vitest";
import type { AwardSummary } from "./awards";
import { awardYearsLoaded, coverageRows, refreshedLabel, scoresNotice, statusText } from "./coverage";

const award = (slug: string, kind: AwardSummary["kind"], calendarOrder: number): AwardSummary => ({
  slug,
  name: slug.toUpperCase(),
  shortName: slug,
  kind,
  calendarOrder,
  winnersOnly: false,
  isSelection: false,
  oscarCategories: [],
});

const YEARS = [2023, 2024, 2025, 2026];

describe("coverageRows", () => {
  const awards = [award("late", "festival", 5), award("globes", "major", 2), award("oscars", "oscars", 9), award("bafta", "major", 1)];
  const rows = coverageRows(
    awards,
    [
      { slug: "oscars", year: 2023, status: "loaded" },
      { slug: "oscars", year: 2024, status: "loaded" },
      { slug: "oscars", year: 2025, status: "loaded" },
      { slug: "oscars", year: 2026, status: "partial" },
      { slug: "bafta", year: 2024, status: "loaded" },
      { slug: "bafta", year: 2025, status: "partial" },
      { slug: "bafta", year: 2026, status: "no_data" },
    ],
    YEARS,
    2026,
  );
  const of = (slug: string) => rows.find((r) => r.slug === slug)!;

  it("orders by kind, then the season's order", () => {
    expect(rows.map((r) => r.slug)).toEqual(["oscars", "bafta", "globes", "late"]);
  });

  it("marks each year loaded, partly loaded or no data, and the live season gold once it has data", () => {
    expect(of("oscars").cells.map((c) => c.kind)).toEqual(["loaded", "loaded", "loaded", "live"]);
    expect(of("bafta").cells.map((c) => c.kind)).toEqual(["none", "loaded", "partial", "none"]);
    expect(of("oscars").cells[3].label).toBe("2026: Partly loaded (live season)");
  });

  it("counts a year with no edition as no data", () => {
    expect(of("late").cells.every((c) => c.kind === "none")).toBe(true);
    expect(of("late").status).toBe("No data");
  });

  it("totals fully loaded award years against every cell", () => {
    expect(awardYearsLoaded(rows)).toEqual({ loaded: 4, total: 16 });
  });
});

describe("statusText", () => {
  it("reads as the preview does", () => {
    expect(statusText(15, 0, 0)).toBe("Loaded");
    expect(statusText(0, 0, 15)).toBe("No data");
    expect(statusText(5, 2, 8)).toBe("Partly, 8 years no data");
    expect(statusText(14, 0, 1)).toBe("Partly, 1 year no data");
    expect(statusText(10, 5, 0)).toBe("Partly");
  });
});

describe("scoresNotice", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  it("stays quiet up to exactly 3 days", () => {
    expect(scoresNotice(new Date("2026-10-20T12:00:00Z"), now)).toBeNull();
    expect(scoresNotice(new Date("2026-10-22T08:00:00Z"), now)).toBeNull();
  });
  it("speaks once scores are more than 3 days old, with the age in whole days", () => {
    const notice = scoresNotice(new Date("2026-10-18T12:00:00Z"), now);
    expect(notice?.title).toBe("Scores are 5 days old.");
    expect(scoresNotice(new Date("2026-10-20T11:59:00Z"), now)?.title).toBe("Scores are 3 days old.");
  });
  it("says so when scores were never refreshed", () => {
    expect(scoresNotice(null, now)?.title).toBe("Scores haven't been refreshed yet.");
  });
});

describe("refreshedLabel", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  it("is the day and month, with the year from another year, and a dash before the first refresh", () => {
    expect(refreshedLabel(new Date("2026-10-22T03:00:00Z"), now)).toBe("22 Oct");
    expect(refreshedLabel(new Date("2025-12-30T03:00:00Z"), now)).toBe("30 Dec 2025");
    expect(refreshedLabel(null, now)).toBe("–");
  });
});
