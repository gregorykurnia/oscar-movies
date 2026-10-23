// Phase 4's Done-when scenario (task 4.11, IMPLEMENTATION_PLAN.md): each critics group with data
// appears below the major awards in the grid and the accuracy page, and "no data" years are
// marked. One walk through the pages by their links; the groups and years that have data come
// from the `test` database. Reads only; no writes.
import { expect, test, type Page } from "@playwright/test";
import { and, eq, lte, ne } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { awardCategories, awards, editions } from "../../src/db/schema";

const { db, close } = createScriptDb();
test.afterAll(() => close());

const YEAR = 2025;

/** The critics groups with a category mapped to Best Picture (the grid's and accuracy page's rows), and whether each has a loaded edition in the film year. */
async function criticsOnPicture(year: number) {
  const loaded = new Set(
    (
      await db
        .select({ id: editions.awardId })
        .from(editions)
        .where(and(eq(editions.year, year), ne(editions.status, "no_data")))
    ).map((e) => e.id),
  );
  const groups = await db
    .selectDistinct({ id: awards.id, name: awards.name, shortName: awards.shortName, order: awards.calendarOrder })
    .from(awards)
    .innerJoin(awardCategories, eq(awardCategories.awardId, awards.id))
    .where(and(eq(awards.kind, "critics"), eq(awardCategories.oscarCategory, "picture")))
    .orderBy(awards.calendarOrder);
  return groups.map((g) => ({ name: g.name, shortName: g.shortName, hasData: loaded.has(g.id) }));
}

/** The names of the critics groups with at least one loaded edition in any year, or up to `upTo`. */
async function criticsEverLoaded(upTo?: number) {
  const rows = await db
    .selectDistinct({ name: awards.name })
    .from(awards)
    .innerJoin(editions, eq(editions.awardId, awards.id))
    .where(and(eq(awards.kind, "critics"), ne(editions.status, "no_data"), upTo ? lte(editions.year, upTo) : undefined));
  return new Set(rows.map((r) => r.name));
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

test("every critics group with data has its own grid column after the majors, and a year without data is marked", async ({ page }) => {
  // A group with no data in any year has no column (Phase 4 review): it would read "No data" all down.
  const everLoaded = await criticsEverLoaded();
  const groups = (await criticsOnPicture(YEAR)).filter((g) => everLoaded.has(g.name));
  expect(groups.filter((g) => g.hasData).length).toBeGreaterThan(30);

  await page.goto(`/grid/${YEAR}?critics=open`);
  const table = page.getByRole("table");
  await expect(table.locator('th[scope="colgroup"]')).toHaveText(["Totals", "Oscars", "Major awards", "Festivals", "Critics groups"]);
  const titles = await table.locator('th[scope="col"]').evaluateAll((els) => els.map((el) => el.getAttribute("title") ?? ""));

  // The festivals' columns come first and each critics group is a column after them, in calendar
  // order: a group with a 2025 edition is a plain column, the others are marked "no data this year".
  const criticsTitles = titles.slice(-groups.length);
  expect(criticsTitles).toEqual(groups.map((g) => (g.hasData ? g.name : `${g.name}: no data this year`)));
  expect(titles.slice(0, -groups.length).at(-1)).toBe("Toronto International Film Festival");

  // The Astra Film Awards (formerly Hollywood Critics Association) began in 2019: in 2018 its column says so, and a cell reads "No data".
  await page.goto("/grid/2018?critics=open");
  await expect(page.locator('th[scope="col"][title="Astra Film Awards (formerly Hollywood Critics Association): no data this year"]')).toHaveCount(1);
  await expect(page.getByRole("table").getByRole("img", { name: "No data" }).first()).toBeVisible();
  await expect(page.getByRole("list", { name: "Legend" })).toContainText("No data that year");
});

test("the accuracy page lists every critics group with data below the majors and festivals, and counts the rest", async ({ page }) => {
  const onPage = await criticsOnPicture(YEAR);
  // Finished seasons only: the accuracy figures count those (YEAR's season is over).
  const everLoaded = await criticsEverLoaded(YEAR);
  const expected = onPage.filter((g) => everLoaded.has(g.name));
  expect(expected.length).toBeGreaterThan(30);

  await page.goto("/accuracy/picture");
  const table = page.getByRole("table", { name: "How well each award foretells Best Picture" });
  await expect(table.getByRole("columnheader", { name: /^(Major awards|Festivals|Critics groups)$/ })).toHaveText([
    "Major awards",
    "Festivals",
    "Critics groups",
  ]);
  const show = page.getByRole("button", { name: /^Show all \d+ critics groups/ });
  const total = Number((await show.textContent())!.match(/Show all (\d+) critics groups/)![1]);
  // The groups with no finished season of results are left out of the rows and counted in the footnote.
  const footnote = await page.getByText(/critics groups? (has|have) no Best Picture results/).textContent();
  const noData = Number(footnote?.match(/^(\d+) critics/)?.[1] ?? 0);
  expect(noData).toBeGreaterThan(0);
  expect(total + noData).toBe(onPage.length);

  await openShowAll(page);
  // After the Critics groups heading: one row per group, none of the majors or festivals among them.
  const rows = await page.evaluate(() => {
    const trs = [...document.querySelector("tbody")!.querySelectorAll("tr")];
    const start = trs.findIndex((tr) => tr.querySelector('th[scope="colgroup"]')?.textContent === "Critics groups");
    return trs.slice(start + 1).map((tr) => tr.querySelector("td")?.firstElementChild?.firstChild?.textContent ?? "");
  });
  expect(rows.length).toBeGreaterThanOrEqual(total);
  for (const { shortName } of expected) {
    expect(rows, `${shortName} has a row`).toContain(shortName);
  }
  expect(rows.filter((r) => ["Oscars", "BAFTA", "Cannes", "Globes"].includes(r))).toEqual([]);
});

test("a group with no years loaded and a group with a gap are marked No data in the awards index, the award page and /data", async ({ page }) => {
  // San Francisco Bay Area Film Critics Circle: 2018 to 2025 only.
  const sf = await db
    .select({ year: editions.year, status: editions.status })
    .from(editions)
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .where(eq(awards.slug, "san-francisco-critics"));
  const loaded = sf.filter((e) => e.status !== "no_data").map((e) => e.year).sort();
  expect(loaded[0]).toBe(2018);

  // The index of a year with data links to the group's page; the index of an earlier year has no link.
  await page.goto("/awards/2018");
  const critics = (p: typeof page) => p.getByRole("region", { name: "Critics groups" });
  const sfLink = critics(page).getByRole("link", { name: /San Francisco Bay Area/ });
  await expect(sfLink).toHaveAttribute("href", "/awards/san-francisco-critics/2018");

  await page.goto("/awards/2016");
  const sfItem = critics(page).getByRole("listitem").filter({ hasText: "San Francisco Bay Area" });
  await expect(sfItem.getByText("No data", { exact: true })).toBeVisible();
  await expect(sfItem.getByRole("link")).toHaveCount(0);

  // IDA has nothing loaded in any year, so every year's index marks it.
  await expect(critics(page).getByRole("listitem").filter({ hasText: "International Documentary Association" }).getByText("No data", { exact: true })).toBeVisible();

  // The group's own page for a year without an edition says so.
  await page.goto("/awards/san-francisco-critics/2016");
  await expect(page.getByRole("heading", { name: "No data for this year" })).toBeVisible();

  // /data: its coverage strip counts the loaded years out of the fifteen.
  await page.goto("/data");
  const row = page.getByRole("table", { name: "Which award years are loaded" }).getByRole("row", { name: /San Francisco Bay Area/ });
  await expect(row.getByRole("img")).toHaveAttribute("aria-label", new RegExp(`: ${loaded.length} of 15 years loaded`));
  // The film years before the live season that have no edition are the "none" cells; the live season's own cell is "live".
  await expect(row.locator('i[data-cell="none"]')).toHaveCount(14 - loaded.filter((y) => y < 2026).length);
});
