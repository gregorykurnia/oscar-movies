// Phase 6's Done-when scenario (task 6.6, IMPLEMENTATION_PLAN.md): /accuracy/documentary lists
// Cinema Eye's five categories, DOC NYC's two lists and every critics group that has Documentary
// results (the groups with none stay out and are counted), and their films show in the Documentary
// grid. One walk through the pages by their links; the expected rows come from the `test`
// database. Reads only; no writes.
import { expect, test, type Page } from "@playwright/test";
import { and, asc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { awardCategories, awards, editions, movies, results } from "../../src/db/schema";
import { AWARDS } from "../../src/lib/awards";

const { db, close } = createScriptDb();
test.afterAll(() => close());

const GRID_YEAR = 2024;

/** The newest finished season: the newest Oscars held by today with a Documentary winner (the page counts seasons up to it). */
async function lastFinished(): Promise<number> {
  const [row] = await db
    .select({ year: sql<number>`max(${editions.year})` })
    .from(results)
    .innerJoin(editions, eq(editions.id, results.editionId))
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
    .where(
      and(
        eq(awards.slug, "oscars"),
        eq(awardCategories.oscarCategory, "documentary"),
        eq(results.outcome, "won"),
        lte(editions.winnersOn, sql`current_date`),
      ),
    );
  return Number(row.year);
}

type Category = { slug: string; shortName: string; kind: string; category: string; years: number };

/** Every non-Oscar category mapped to Documentary, with the finished seasons that have results in it (the accuracy page's Years). */
async function documentaryCategories(): Promise<Category[]> {
  const last = await lastFinished();
  const rows = await db
    .select({
      slug: awards.slug,
      shortName: awards.shortName,
      kind: awards.kind,
      category: awardCategories.name,
      years: sql<number>`count(distinct ${editions.year}) filter (where ${editions.status} <> 'no_data' and ${editions.year} <= ${last})`,
    })
    .from(awardCategories)
    .innerJoin(awards, eq(awards.id, awardCategories.awardId))
    .leftJoin(results, eq(results.categoryId, awardCategories.id))
    .leftJoin(editions, eq(editions.id, results.editionId))
    .where(and(eq(awardCategories.oscarCategory, "documentary"), ne(awards.kind, "oscars")))
    .groupBy(awards.slug, awards.shortName, awards.kind, awards.calendarOrder, awardCategories.name, awardCategories.sortOrder, awardCategories.id)
    .orderBy(asc(awards.calendarOrder), asc(awardCategories.sortOrder), asc(awardCategories.id));
  return rows.map((r) => ({ ...r, years: Number(r.years) }));
}

/** Presses Enter on Show all until the list opens: a press before hydration does nothing (3-18). */
async function openShowAll(page: Page) {
  const show = page.getByRole("button", { name: /^Show all \d+ critics groups/ });
  await expect(async () => {
    if (await show.count()) {
      await show.focus();
      await page.keyboard.press("Enter");
    }
    await expect(page.getByRole("button", { name: "Show the first 8 critics groups" })).toBeVisible({ timeout: 1000 });
  }).toPass();
}

test("/accuracy/documentary lists Cinema Eye's five categories, DOC NYC's two lists and every critics group with results", async ({ page }) => {
  const all = await documentaryCategories();
  const cinemaEye = all.filter((c) => c.slug === "cinema-eye");
  const docNyc = all.filter((c) => c.slug === "doc-nyc");
  expect(cinemaEye.map((c) => c.category).sort()).toEqual(
    [
      "Audience Choice Prize",
      "Outstanding Achievement in Direction",
      "Outstanding Achievement in Nonfiction Feature Filmmaking",
      "Outstanding Achievement in Production",
      "The Unforgettables",
    ].sort(),
  );
  expect(docNyc.map((c) => c.category).sort()).toEqual(["Short List: Features", "Winner's Circle"]);

  // A critics group with no finished season of Documentary results has no row and is counted in the footnote.
  const critics = all.filter((c) => c.kind === "critics");
  const withResults = critics.filter((c) => c.years > 0);
  const without = new Set(critics.filter((c) => c.years === 0).map((c) => c.slug));
  const groupsWith = new Set(withResults.map((c) => c.slug));
  // New Jersey and Puerto Rico are not on IMDb or Wikipedia: they stay "no data".
  expect(without.has("new-jersey-critics")).toBe(true);
  expect(without.has("puerto-rico-critics")).toBe(true);
  expect(groupsWith.size).toBeGreaterThan(40);

  await page.goto("/accuracy");
  await page.getByRole("navigation", { name: "Category" }).getByRole("link", { name: "Documentary" }).click();
  await expect(page).toHaveURL(/\/accuracy\/documentary$/);
  const table = page.getByRole("table", { name: "How well each award foretells Best Documentary Feature" });
  await expect(table.getByRole("columnheader", { name: /^(Major awards|Festivals|Critics groups)$/ })).toHaveText([
    "Major awards",
    "Festivals",
    "Critics groups",
  ]);
  const show = page.getByRole("button", { name: /^Show all \d+ critics groups/ });
  const total = Number((await show.textContent())!.match(/Show all (\d+) critics groups/)![1]);
  expect(total).toBe(groupsWith.size);
  const footnote = page.getByText(/critics groups? (has|have) no Best Documentary Feature results/);
  await expect(footnote).toContainText(`${without.size} critics group`);

  await openShowAll(page);
  // Each row: the award's name, its category (the note's first part) and the Years cell.
  const rows = await page.evaluate(() => {
    const out: { group: string; award: string; note: string; years: string }[] = [];
    let group = "";
    for (const tr of document.querySelector("tbody")!.querySelectorAll("tr")) {
      const head = tr.querySelector('th[scope="colgroup"]');
      if (head) {
        group = head.textContent ?? "";
        continue;
      }
      const cells = tr.querySelectorAll("td");
      const name = cells[0].firstElementChild!;
      out.push({
        group,
        award: name.firstChild?.textContent ?? "",
        note: name.querySelector("span")?.textContent ?? "",
        years: cells[cells.length - 1].textContent ?? "",
      });
    }
    return out;
  });

  const find = (c: Category) => rows.find((r) => r.award === c.shortName && r.note.startsWith(c.category));
  for (const c of [...cinemaEye, ...docNyc]) {
    const row = find(c);
    expect(row, `${c.shortName}: ${c.category} has a row`).toBeDefined();
    expect(row!.years, `${c.shortName}: ${c.category} years`).toBe(String(c.years));
  }
  expect(rows.filter((r) => r.award === "Cinema Eye")).toHaveLength(5);
  expect(rows.filter((r) => r.award === "DOC NYC")).toHaveLength(2);
  // Cinema Eye is a major award, DOC NYC a festival; the critics groups come after both.
  expect(find(cinemaEye[0])!.group).toBe("Major awards");
  expect(find(docNyc[0])!.group).toBe("Festivals");
  for (const c of withResults) {
    const row = find(c);
    expect(row, `${c.shortName} has a row`).toBeDefined();
    expect(row!.group, `${c.shortName} is under Critics groups`).toBe("Critics groups");
  }
  for (const c of critics.filter((c) => without.has(c.slug))) {
    expect(rows.some((r) => r.award === c.shortName), `${c.shortName} has no row`).toBe(false);
  }
});

test("the 2024 Documentary grid has a column for Cinema Eye and DOC NYC with each film's result, and critics groups after the festivals", async ({ page }) => {
  // The films with a Cinema Eye or DOC NYC result that year, with their furthest outcomes per award.
  const rows = await db
    .select({ title: movies.title, award: awards.slug, category: awardCategories.name, outcome: results.outcome })
    .from(results)
    .innerJoin(editions, eq(editions.id, results.editionId))
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
    .innerJoin(movies, eq(movies.id, results.movieId))
    .where(and(eq(editions.year, GRID_YEAR), inArray(awards.slug, ["cinema-eye", "doc-nyc"]), eq(awardCategories.oscarCategory, "documentary")));
  const expected = new Map<string, { won: boolean; categories: Set<string> }>();
  for (const r of rows.filter((r) => ["won", "nominated", "runner_up"].includes(r.outcome))) {
    const key = `${r.award}|${r.title}`;
    const entry = expected.get(key) ?? { won: false, categories: new Set<string>() };
    entry.won ||= r.outcome === "won";
    entry.categories.add(r.category);
    expected.set(key, entry);
  }
  // The Short List has 15 films a year; a Winner's Circle film that is also on it is one row, with the first list's name.
  expect(rows.filter((r) => r.award === "doc-nyc" && r.category === "Short List: Features")).toHaveLength(15);
  expect([...expected.keys()].filter((k) => k.startsWith("doc-nyc|")).length).toBeGreaterThanOrEqual(15);

  await page.goto(`/grid/${GRID_YEAR}`);
  await page.getByRole("navigation", { name: "Category" }).getByRole("link", { name: "Documentary" }).click();
  await expect(page).toHaveURL(/category=documentary/);
  // A press before hydration does nothing: press until the address says the critics groups are open.
  const fold = page.getByRole("group", { name: "Filter" }).getByRole("button", { name: "Critics groups folded" });
  await expect(async () => {
    if (await fold.count()) await fold.click();
    await expect(page).toHaveURL(/critics=open/, { timeout: 1000 });
  }).toPass();

  const table = page.getByRole("table");
  const readHeads = () =>
    table.locator('th[scope="col"]').evaluateAll((els) => els.map((el) => ({ text: el.textContent ?? "", title: el.getAttribute("title") ?? "" })));
  // Wait for the opened table: the critics groups' columns follow DOC NYC's.
  await expect.poll(async () => (await readHeads()).length).toBeGreaterThan(50);
  const heads = await readHeads();
  const index = (name: string) => heads.findIndex((h) => h.text === name);
  const [eye, nyc] = [index("Cinema Eye"), index("DOC NYC")];
  expect(eye).toBeGreaterThan(0);
  expect(nyc).toBeGreaterThan(eye);
  // DOC NYC is the last festival column: every column after it is a critics group.
  const after = heads.slice(nyc + 1).map((h) => h.text);
  expect(after.length).toBeGreaterThan(40);
  const critics = new Set(AWARDS.filter((a) => a.kind === "critics").map((a) => a.shortName));
  expect(after.filter((name) => !critics.has(name))).toEqual([]);

  // Every film's cells by award column: the head row has Film, Wins, Noms, then the awards; a row has Wins and Noms as its first two cells.
  const cells = await page.evaluate(
    ([eyeCol, nycCol]) => {
      const out: Record<string, { eye: string; nyc: string }> = {};
      for (const tr of document.querySelectorAll("tbody tr")) {
        const title = tr.querySelector('th[scope="row"]')?.getAttribute("aria-label") ?? "";
        const tds = tr.querySelectorAll("td");
        const label = (col: number) => tds[col - 1]?.querySelector('[role="img"]')?.getAttribute("aria-label") ?? "";
        out[title] = { eye: label(eyeCol), nyc: label(nycCol) };
      }
      return out;
    },
    [eye, nyc] as [number, number],
  );
  for (const [key, entry] of expected) {
    const [award, title] = [key.slice(0, key.indexOf("|")), key.slice(key.indexOf("|") + 1)];
    const label = cells[title]?.[award === "cinema-eye" ? "eye" : "nyc"];
    expect(label, `${title} has a row with a ${award} cell`).toBeTruthy();
    const word = award === "doc-nyc" ? "Selected" : entry.won ? "Won" : "Nominated";
    expect(label.startsWith(`${word}: `), `${title} at ${award}: ${label}`).toBe(true);
    expect([...entry.categories].some((c) => label.endsWith(`: ${c}`)), label).toBe(true);
  }
});

test("the festivals index opens DOC NYC's award page, which lists both lists from the database, and the lineup address is a 404", async ({ page }) => {
  const rows = await db
    .select({ category: awardCategories.name, order: awardCategories.sortOrder, n: sql<number>`count(*)` })
    .from(results)
    .innerJoin(editions, eq(editions.id, results.editionId))
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
    .where(and(eq(awards.slug, "doc-nyc"), eq(editions.year, 2025)))
    .groupBy(awardCategories.name, awardCategories.sortOrder, awardCategories.id);
  expect(rows.map((r) => r.category).sort()).toEqual(["Short List: Features", "Winner's Circle"]);

  await page.goto("/festivals/2025");
  await page.getByRole("region", { name: "Festivals" }).getByRole("link", { name: /DOC NYC/ }).click();
  await expect(page).toHaveURL(/\/awards\/doc-nyc\/2025$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("DOC NYC 2025");
  for (const r of rows) {
    const region = page.getByRole("region", { name: r.category, exact: true });
    await expect(region.getByRole("heading", { level: 3 })).toHaveCount(Number(r.n));
  }

  // The 404 page streams in with a 200 status (a prerendered shell), as on the award pages.
  await page.goto("/festivals/doc-nyc/2025");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page isn't here");
});
