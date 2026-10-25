// The all-years page's query (task 7.12) against the seeded `test` data: Critics Choice's
// Documentary prize that stops after 2015, a year with no data, Golden Globes Picture's two
// categories, and the Oscars' nominees and winners only.
import { afterAll, describe, expect, it } from "vitest";
import { createScriptDb } from "../../src/db";
import { queryAwardHistory } from "../../src/data/awards";
import { isNomination } from "../../src/lib/stage";
import { LIVE_YEAR, OLDEST_YEAR } from "../../src/lib/years";

const { db, close } = createScriptDb();
afterAll(() => close());

describe("queryAwardHistory", () => {
  it("is null for an award that isn't there", async () => {
    expect(await queryAwardHistory(db, "no-such-award")).toBeNull();
  });

  it("lists every film year from the live year to 2012, newest first, and the Oscar categories as tabs in race order", async () => {
    const history = await queryAwardHistory(db, "critics-choice");
    expect(history!.years.map((y) => y.year)).toEqual(
      Array.from({ length: LIVE_YEAR - OLDEST_YEAR + 1 }, (_, i) => LIVE_YEAR - i),
    );
    expect(history!.tabs).toEqual(["picture", "documentary", "international", "animated"]);
  });

  it("gives Critics Choice's documentary results through 2015 and none after", async () => {
    const history = await queryAwardHistory(db, "critics-choice");
    const documentary = (year: number) =>
      history!.years.find((y) => y.year === year)!.categories.filter((c) => c.category.oscarCategory === "documentary");
    for (const year of [2012, 2013, 2014, 2015]) {
      expect(documentary(year)).toHaveLength(1);
      expect(documentary(year)[0].entries.length).toBeGreaterThan(0);
    }
    for (const year of [2016, 2020, 2025]) {
      // The edition is there, with nothing in the category: "No results this year".
      expect(history!.years.find((y) => y.year === year)!.edition!.status).toBe("loaded");
      expect(documentary(year)).toEqual([]);
    }
  });

  it("has the edition but no categories for a year with no data", async () => {
    const history = await queryAwardHistory(db, "critics-choice");
    const live = history!.years[0];
    expect(live.year).toBe(LIVE_YEAR);
    expect(live.edition!.status).toBe("no_data");
    expect(live.categories).toEqual([]);
  });

  it("gives Golden Globes Picture its two categories, with the Oscar result of each film's year", async () => {
    const history = await queryAwardHistory(db, "golden-globes");
    const picture = history!.years
      .find((y) => y.year === 2024)!
      .categories.filter((c) => c.category.oscarCategory === "picture");
    expect(picture).toHaveLength(2);
    expect(picture.map((c) => c.category.slug)).toContain("drama");
    expect(picture[0].category.name).not.toBe(picture[1].category.name);
    // Winners first, and every film carries the Oscar result of the same film year or none.
    for (const c of picture) {
      expect(c.entries[0].outcome).toBe("won");
      expect(c.oscarState).toBe("finished");
    }
    const winner = picture.find((c) => c.category.slug === "drama")!.entries[0];
    expect(winner.film.title).toBe("The Brutalist");
    expect(winner.oscar?.outcome).toBe("nominated");
  });

  it("gives the Oscars nominees and winners only, with the submitting country on International", async () => {
    const history = await queryAwardHistory(db, "oscars");
    expect(history!.tabs).toEqual(["picture", "documentary", "international", "animated"]);
    const entries = history!.years.flatMap((y) => y.categories.flatMap((c) => c.entries));
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => isNomination(e.outcome) && e.oscar?.outcome === e.outcome)).toBe(true);
    const international = history!.years
      .find((y) => y.year === 2025)!
      .categories.find((c) => c.category.oscarCategory === "international")!;
    expect(international.entries[0]).toMatchObject({ outcome: "won", oscar: { outcome: "won", country: "NO" } });
    expect(international.entries[0].film.title).toBe("Sentimental Value");
  });
});
