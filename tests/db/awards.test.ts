// The award page's query (task 2.6) and the awards index's editions (task 2.7) against the seeded
// `test` data: BAFTA 2025's lists with their Oscar results, the accuracy figures, and the editions
// with nothing to list.
import { afterAll, describe, expect, it } from "vitest";
import { createScriptDb } from "../../src/db";
import { queryAwardYear, queryYearEditions } from "../../src/data/awards";

const { db, close } = createScriptDb();
afterAll(() => close());

describe("queryAwardYear", () => {
  it("is null for an award that isn't there", async () => {
    expect(await queryAwardYear(db, "no-such-award", 2025)).toBeNull();
  });

  it("lists BAFTA 2025's nominees, the winner first, with the Oscar result of the mapped category", async () => {
    const data = await queryAwardYear(db, "bafta", 2025);
    expect(data!.edition).toMatchObject({ year: 2025, ordinal: "79th", status: "loaded", winnersOn: "2026-02-22" });
    const picture = data!.categories.find((c) => c.category.slug === "film")!;
    expect(picture.category.oscarCategory).toBe("picture");
    expect(picture.oscarState).toBe("finished");
    expect(picture.entries.map((e) => [e.film.title, e.outcome, e.oscar?.outcome])).toEqual([
      ["One Battle After Another", "won", "won"],
      ["Hamnet", "nominated", "nominated"],
      ["Marty Supreme", "nominated", "nominated"],
      ["Sentimental Value", "nominated", "nominated"],
      ["Sinners", "nominated", "nominated"],
    ]);
    expect(picture.category.figures!.nominees).not.toBeNull();
  });

  it("carries the submitting country of an International film and the shortlist stage of a documentary", async () => {
    const data = await queryAwardYear(db, "bafta", 2025);
    const international = data!.categories.find((c) => c.category.oscarCategory === "international")!;
    expect(international.entries[0].film.title).toBe("Sentimental Value");
    expect(international.entries[0].oscar).toEqual({ outcome: "won", country: "NO" });
    const documentary = data!.categories.find((c) => c.category.oscarCategory === "documentary")!;
    expect(documentary.entries.find((e) => e.film.title === "Cover-Up")!.oscar?.outcome).toBe("shortlisted");
  });

  it("leaves the Oscar result empty for a film off the list", async () => {
    const data = await queryAwardYear(db, "afi", 2024);
    const top10 = data!.categories[0];
    expect(top10.entries.find((e) => e.film.title === "A Real Pain")!.oscar).toBeNull();
    expect(top10.entries.every((e) => e.outcome === "nominated")).toBe(true);
    // A list with no winner: the winner figures have nothing to count.
    expect(top10.category.figures!.win.count).toBe(0);
  });

  it("gives a winners-only award no nominee figure", async () => {
    const data = await queryAwardYear(db, "cannes", 2024);
    expect(data!.categories.length).toBeGreaterThan(0);
    expect(data!.categories[0].category.figures!.nominees).toBeNull();
  });

  it("has the edition but no categories for a year with no data", async () => {
    const data = await queryAwardYear(db, "bafta", 2026);
    expect(data!.edition!.status).toBe("no_data");
    expect(data!.categories).toEqual([]);
  });
});

describe("queryYearEditions", () => {
  it("lists every award's edition in a year, the Oscars included, with their statuses", async () => {
    const rows = await queryYearEditions(db, 2026);
    expect(rows.find((r) => r.slug === "oscars")).toMatchObject({
      year: 2026,
      ordinal: "99th",
      status: "partial",
      winnersOn: "2027-03-14",
    });
    expect(rows.find((r) => r.slug === "bafta")).toMatchObject({ status: "no_data", winnersOn: null });
    expect(rows.find((r) => r.slug === "cannes")).toMatchObject({ status: "loaded", winnersOn: "2026-05-23" });
    // A partly loaded award keeps its row (the index links to it).
    const rows2012 = await queryYearEditions(db, 2012);
    expect(rows2012.find((r) => r.slug === "cinema-eye")).toMatchObject({ status: "partial" });
  });
});
