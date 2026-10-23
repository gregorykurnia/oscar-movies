// The year summary's figures (task 2.10) against the seeded `test` data: 2025's films on the grids,
// each category's, the watched figure and the most-nominated film, all read as the page reads them.
import { afterAll, describe, expect, it } from "vitest";
import { createScriptDb } from "../../src/db";
import { queryMarks } from "../../src/data/watch-list";
import { queryYearGrid } from "../../src/data/year-grid";
import { RACE_CATEGORIES } from "../../src/lib/race";
import { mostNominated, yearSummary } from "../../src/lib/year-summary";
import { majorsOnly } from "./majors-only";

const { db, close } = createScriptDb();
afterAll(() => close());

async function summaryOf(year: number) {
  const all = majorsOnly(await queryYearGrid(db, year, "all"));
  const categories = [];
  for (const c of RACE_CATEGORIES) categories.push({ slug: c.slug, grid: majorsOnly(await queryYearGrid(db, year, c.slug)) });
  const watched = new Set((await queryMarks(db)).filter((m) => m.watched).map((m) => m.movieId));
  return { all, categories, summary: yearSummary(all, categories, watched) };
}

describe("the year summary for 2025", () => {
  it("counts each film on the grids once: 90 films, with 31, 32, 20 and 14 in the four categories", async () => {
    const { all, summary } = await summaryOf(2025);
    expect(summary.films).toBe(all.films.length);
    expect(summary.films).toBe(90);
    expect(summary.rows.map((r) => [r.slug, r.films])).toEqual([
      ["picture", 31],
      ["documentary", 32],
      ["international", 20],
      ["animated", 14],
    ]);
  });

  it("counts the watched films among them, in all and in each category, from the marks table", async () => {
    const { all, categories, summary } = await summaryOf(2025);
    const marked = new Set((await queryMarks(db)).filter((m) => m.watched).map((m) => m.movieId));
    const watchedIn = (films: { film: { id: number } }[]) => films.filter((f) => marked.has(f.film.id)).length;
    expect(summary.watched).toBe(watchedIn(all.films));
    expect(summary.rows.map((r) => r.watched)).toEqual(categories.map((c) => watchedIn(c.grid.films)));
  });

  it("names the most-nominated film: Hamnet, nominated by nine awards and winning three", async () => {
    const { all } = await summaryOf(2025);
    expect(mostNominated(all)).toEqual({
      count: 9,
      films: [{ title: "Hamnet", wins: 3, awards: ["Globes", "Satellite", "TIFF"] }],
    });
  });
});

describe("the year summary for 2026, the live season", () => {
  it("counts the films so far, and an empty category as 0 films", async () => {
    const { summary } = await summaryOf(2026);
    expect(summary.films).toBe(20);
    expect(summary.rows.find((r) => r.slug === "animated")).toMatchObject({ films: 0, watched: 0 });
  });
});
