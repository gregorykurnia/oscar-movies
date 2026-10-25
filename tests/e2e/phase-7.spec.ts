// Phase 7's Done-when scenario (task 7.13, IMPLEMENTATION_PLAN.md): one flag per row on the race,
// grid and Watch list; the 2025 Picture grid opens with its winner and nominees on top; Critics
// Choice's all-years page from its 2025 page, every year from the live year to 2012; the 2025
// Documentary signals page from the accuracy page's link; and a film typed into the Watch list,
// moved to second place by keyboard and given a date and platform, all three kept after a reload.
// The Watch list walk writes marks on the `test` branch and puts every one back as it was.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { marks, movies } from "../../src/db/schema";
import { LIVE_YEAR } from "../../src/lib/years";

const { db, close } = createScriptDb();
test.afterAll(() => close());

const section = (page: Page, name: string) => page.getByRole("region", { name });
const titlesIn = (region: Locator) => region.getByRole("heading", { level: 3 }).allTextContents();

async function movieId(slug: string) {
  const [row] = await db.select({ id: movies.id }).from(movies).where(eq(movies.slug, slug));
  expect(row, slug).toBeTruthy();
  return row.id;
}

/**
 * The flags in each film row of a list: a row is the largest ancestor of a title that holds no
 * other title. Returns each row's title and its flag count, so a row with two flags (or none) is named.
 */
function flagsPerRow(scope: Locator, titleSelector: string) {
  return scope.evaluate((root, selector) => {
    return [...root.querySelectorAll(selector)].map((title) => {
      let row: Element = title;
      while (row.parentElement && row.parentElement !== root && row.parentElement.querySelectorAll(selector).length === 1) {
        row = row.parentElement;
      }
      return { title: (title.textContent ?? "").trim(), flags: row.querySelectorAll("[data-flag]").length };
    });
  }, titleSelector);
}

function expectOneFlagEach(rows: { title: string; flags: number }[], what: string) {
  expect(rows.length, `${what}: rows`).toBeGreaterThan(2);
  expect(
    rows.filter((r) => r.flags !== 1),
    `${what}: rows without exactly one flag`,
  ).toEqual([]);
}

test("every row on the race, the grid and the Watch list shows one flag", async ({ page }) => {
  // The race: a finished year in every tab.
  await page.goto("/race/2025");
  for (const tab of ["Picture", "Documentary", "International", "Animated"]) {
    await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
    const panel = page.getByRole("tabpanel");
    await expect(panel.getByRole("heading", { level: 3 }).first()).toBeVisible();
    expectOneFlagEach(await flagsPerRow(panel, "h3"), `race 2025 ${tab}`);
  }

  // The year grid: one flag in each film's row header.
  await page.goto("/grid/2025");
  const heads = page.getByRole("table").getByRole("rowheader").filter({ has: page.getByRole("link") });
  await expect(heads.first()).toBeVisible();
  const grid = await heads.evaluateAll((els) => els.map((el) => ({ title: el.getAttribute("aria-label") ?? "", flags: el.querySelectorAll("[data-flag]").length })));
  expectOneFlagEach(grid, "grid 2025 Picture");

  // The Watch list: both sections.
  await page.goto("/watch-list");
  const season = section(page, `Not watched yet, ${LIVE_YEAR} season`);
  await expect(season.getByRole("heading", { level: 3 }).first()).toBeVisible();
  expectOneFlagEach(await flagsPerRow(season, "h3"), "Watch list season");
});

test("the 2025 Picture grid opens with its winner, then the other nominees", async ({ page }) => {
  await page.goto("/grid/2025");
  await expect(page.getByRole("button", { name: "Sort: Oscars" })).toBeVisible();
  const heads = page.getByRole("table").getByRole("rowheader").filter({ has: page.getByRole("link") });
  await expect(heads.first()).toBeVisible();
  const titles = (await heads.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""))).filter(Boolean);
  expect(titles[0]).toBe("One Battle After Another");
  // The ten Best Picture nominees are the first ten rows, whatever their order after the winner.
  expect([...titles.slice(0, 10)].sort()).toEqual(
    [
      "Bugonia",
      "F1",
      "Frankenstein",
      "Hamnet",
      "Marty Supreme",
      "One Battle After Another",
      "Sentimental Value",
      "Sinners",
      "The Secret Agent",
      "Train Dreams",
    ].sort(),
  );
  const table = page.getByRole("table");
  await expect(table.getByRole("img", { name: "Won: Best Picture" })).toHaveCount(1);
  await expect(table.getByRole("img", { name: "Nominated: Best Picture" })).toHaveCount(9);
});

test("Critics Choice's all-years page lists every year from the live year back to 2012", async ({ page }) => {
  // /signals opens on the live season.
  await page.goto("/signals");
  await expect(page).toHaveURL(/\/signals\/\d{4}$/);
  const live = Number(page.url().match(/(\d{4})$/)?.[1]);
  expect(live).toBeGreaterThan(2024);

  await page.goto("/awards/critics-choice/2025");
  await page.getByRole("link", { name: "All years" }).click();
  await expect(page).toHaveURL(/\/awards\/critics-choice\/all$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Critics Choice, all years");

  await expect(section(page, `Critics Choice ${live}`)).toBeVisible();
  const years = await page.getByRole("heading", { level: 2 }).allTextContents();
  const expected = Array.from({ length: live - 2012 + 1 }, (_, i) => String(live - i));
  expect(years.map((t) => t.trim())).toEqual(expected);
  // The 2025 block shows its Picture nominees with a winner. (The live year's block reads "No data"
  // until its results load: not checked, so the test holds through the season, 7.R.)
  await expect(section(page, "Critics Choice 2025").locator("[data-winner]").first()).toBeVisible();
});

test("the accuracy page's link opens the 2025 Documentary signals with a strong award's figure and films", async ({ page }) => {
  await page.goto("/accuracy/documentary");
  await page.getByRole("link", { name: /^Strong signals, \d{4}$/ }).click();
  await expect(page).toHaveURL(/\/signals\/\d{4}\?category=documentary$/);

  // The year switcher keeps the category.
  await page.getByRole("button", { name: /^Year: \d{4}$/ }).click();
  await page.getByRole("link", { name: "2025", exact: true }).click();
  await expect(page).toHaveURL(/\/signals\/2025\?category=documentary$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("2025 strong signals");

  // By role, not `[data-award]`: while 2025 streams in, the live year's sections stay in the DOM hidden.
  const feature = section(page, "Cinema Eye · Outstanding");
  await expect(feature.locator('[data-figure="caught"]')).toHaveText(/^Caught \d+% of Oscar nominees · \d+ of \d+ over \d+ years$/);
  await expect(feature.locator('[data-figure="winner"]')).toHaveText(/^Its winner was Oscar-nominated \d+% of years · \d+ of \d+$/);
  await expect(feature.locator("[data-winner]")).toHaveCount(1);
  expect(await feature.getByRole("heading", { level: 3 }).count()).toBeGreaterThan(2);
  await expect(feature.getByRole("heading", { level: 3 }).first().getByRole("link")).toHaveAttribute("href", /^\/movies\//);
});

test("a film typed into the Watch list, moved to second place and given a date and platform, keeps all three after a reload", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 1000 });
  const saved = await db.select().from(marks);
  const [anora, hamnet, secret] = await Promise.all(["anora", "hamnet", "the-secret-agent"].map(movieId));
  try {
    // Two films already wanted, in a known order; every other mark is set aside.
    await db.delete(marks);
    await db.insert(marks).values([
      { movieId: anora, watched: false, want: true, wantRank: 1 },
      { movieId: hamnet, watched: false, want: true, wantRank: 2 },
    ]);
    await page.goto("/watch-list");
    const want = section(page, "Want to watch");
    await expect.poll(() => titlesIn(want)).toEqual(["Anora", "Hamnet"]);

    // Type part of its original title; Enter adds it at the top.
    const box = page.getByRole("combobox", { name: "Add a film" });
    // Typed again until the option shows: typing before the box hydrates fires no search (7.R).
    await expect(async () => {
      await box.fill("");
      await box.fill("agente secre");
      await expect(page.getByRole("option", { name: /The Secret Agent/ })).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await box.press("Enter");
    await expect.poll(() => titlesIn(want)).toEqual(["The Secret Agent", "Anora", "Hamnet"]);

    // Space lifts it, the down arrow moves it to second place, Space drops it.
    const handle = want.getByRole("button", { name: "Reorder The Secret Agent" });
    await handle.focus();
    await page.keyboard.press("Space");
    await expect(page.getByText("Moving The Secret Agent.")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByText("Moving The Secret Agent. Position 2 of 3.")).toBeVisible();
    await page.keyboard.press("Space");
    await expect.poll(() => titlesIn(want)).toEqual(["Anora", "The Secret Agent", "Hamnet"]);

    // A date and a platform from the release line's editor.
    const row = want.getByRole("heading", { level: 3, name: "The Secret Agent" }).locator("xpath=ancestor::div[contains(@class,'border-b')][1]");
    await row.getByRole("button", { name: "Add release date" }).click();
    const editor = page.getByRole("dialog", { name: "Release date and platform" });
    await editor.getByLabel("Date").fill("2030-12-12");
    await editor.getByRole("combobox", { name: "Platform" }).fill("Netflix");
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(editor).toHaveCount(0);
    await expect(row.getByRole("button", { name: /12 Dec 2030 · Netflix/ })).toBeVisible();

    // All three survive a reload: the film's place, its date and its platform.
    await expect
      .poll(async () => (await db.select({ r: marks.wantRank, d: marks.releaseOn, p: marks.platform }).from(marks).where(eq(marks.movieId, secret)))[0])
      .toEqual({ r: 2, d: "2030-12-12", p: "Netflix" });
    await page.reload();
    const reloaded = section(page, "Want to watch");
    await expect.poll(() => titlesIn(reloaded)).toEqual(["Anora", "The Secret Agent", "Hamnet"]);
    const row2 = reloaded.getByRole("heading", { level: 3, name: "The Secret Agent" }).locator("xpath=ancestor::div[contains(@class,'border-b')][1]");
    await expect(row2.getByRole("button", { name: /12 Dec 2030 · Netflix/ })).toBeVisible();
  } finally {
    // Every mark back as it was, new fields included.
    await db.delete(marks);
    if (saved.length > 0) await db.insert(marks).values(saved);
  }
});
