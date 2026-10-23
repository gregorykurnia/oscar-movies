// The data coverage page's figures (task 3.5) against the seeded `test` data: every edition's status
// from the database, the film count and the score refresh the page reads.
import { afterAll, describe, expect, it } from "vitest";
import { createScriptDb } from "../../src/db";
import { queryCoverage } from "../../src/data/coverage";
import { AWARDS } from "../../src/lib/awards";
import { awardYearsLoaded, coverageRows } from "../../src/lib/coverage";
import { LIVE_YEAR, OLDEST_YEAR, yearRange } from "../../src/lib/years";

const { db, close } = createScriptDb();
afterAll(() => close());

describe("queryCoverage", () => {
  it("reads every edition's status, so the Academy Awards show loaded for the finished years", async () => {
    const data = await queryCoverage(db);
    const rows = coverageRows(AWARDS, data.editions, yearRange(LIVE_YEAR, OLDEST_YEAR).reverse(), LIVE_YEAR);
    const oscars = rows.find((r) => r.slug === "oscars")!;
    expect(oscars.cells.find((c) => c.year === 2025)?.kind).toBe("loaded");
    expect(awardYearsLoaded(rows).loaded).toBeGreaterThan(0);
    expect(rows).toHaveLength(AWARDS.length);
  });

  it("counts the films, and the scores refresh when one was recorded", async () => {
    const data = await queryCoverage(db);
    expect(data.films).toBeGreaterThan(0);
    if (data.scoresAt) {
      expect(Number.isNaN(Date.parse(data.scoresAt))).toBe(false);
      expect(data.scoresFilms).toBeGreaterThanOrEqual(0);
    } else {
      expect(data.scoresFilms).toBe(0);
    }
  });
});
