// Phase 3's Done-when scenario (task 3.9, IMPLEMENTATION_PLAN.md): each 2026 category shows
// chances that add to 100%; past years show the eve-of-ceremony favourite; an update adds a new
// award result and the chances change. The update is docs/update-the-race.md's sample file
// (tests/fixtures/race-sample/tiff-2026.json, a made-up TIFF 2026 with Fjord added) loaded on
// `test` through the loader, then taken out by loading the real `data/` again. The test checks
// the branch first, starts from a clean `test` (so a run that died half-way heals itself) and
// puts `data/` back in a `finally`.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { and, desc, eq } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { readDbBranch } from "../../src/db/meta";
import { movies, predictions } from "../../src/db/schema";
import { recomputeAccuracy, recomputePredictions } from "../../scripts/lib/compute";
import { readDataSet } from "../../scripts/lib/data-check";
import { revalidateAwards, runLoad } from "../../scripts/lib/load";

const { db, close } = createScriptDb();
test.afterAll(() => close());

const SEASON = 2026;
const SAMPLE_DIR = ".cache/phase-3-sample";
const TABS = { picture: "Picture", documentary: "Documentary", international: "International", animated: "Animated" } as const;
type Category = keyof typeof TABS;

const panel = (page: Page) => page.getByRole("tabpanel");

/** One category's live chances for the season, best first, with the film's title. */
async function chances(category: Category, year: number, snapshot: "live" | "eve_ceremony") {
  return db
    .select({ title: movies.title, pWin: predictions.pWin })
    .from(predictions)
    .innerJoin(movies, eq(movies.id, predictions.movieId))
    .where(and(eq(predictions.year, year), eq(predictions.oscarCategory, category), eq(predictions.snapshot, snapshot)))
    .orderBy(desc(predictions.pWin));
}

/** Loads a data directory on `test` the way `npm run load -- --target test` does. */
async function loadTest(dir: string) {
  const branch = await readDbBranch(db);
  expect(branch, "this spec writes, and only to the test branch").toBe("test");
  const { data, errors } = readDataSet(dir);
  expect(errors).toEqual([]);
  const today = new Date().toISOString().slice(0, 10);
  await runLoad(db, data, {
    target: "test",
    dryRun: false,
    today,
    afterWrites: async (tx) => {
      await recomputeAccuracy(tx, today);
      await recomputePredictions(tx, today);
    },
    revalidate: revalidateAwards,
    log: () => {},
  });
}

test("each 2026 category shows chances that add to 100%", async ({ page }) => {
  const categories = Object.keys(TABS) as Category[];
  let checked = 0;
  for (const category of categories) {
    const rows = await chances(category, SEASON, "live");
    if (rows.length === 0) continue;
    checked++;
    expect(rows.reduce((sum, r) => sum + r.pWin, 0), `${category} adds to 100%`).toBeCloseTo(1, 4);

    // The page shows every one of them (after Show all), the best first, each with a %.
    await page.goto(category === "picture" ? "/" : `/?category=${category}`);
    await expect(page.getByRole("tab", { name: new RegExp(`^${TABS[category]}`) })).toHaveAttribute("aria-selected", "true");
    const buttons = panel(page).getByRole("button", { name: /^(<1|\d+)% chance to win, show why$/ });
    const showAll = panel(page).getByRole("button", { name: /^Show all \d+ contenders/ });
    if (await showAll.count()) {
      await expect(async () => {
        await showAll.click({ timeout: 1000 });
        await expect(buttons).toHaveCount(rows.length, { timeout: 1000 });
      }).toPass();
    }
    await expect(buttons).toHaveCount(rows.length);
    const first = (await buttons.first().getAttribute("aria-label"))!;
    expect(first.startsWith(`${Math.round(rows[0].pWin * 100)}%`)).toBe(true);
  }
  // The season has its Picture, Documentary and International fields, whatever Animated has.
  expect(checked).toBeGreaterThanOrEqual(3);
});

test("past years show the eve-of-ceremony favourite", async ({ page }) => {
  for (const year of [2024, 2023]) {
    const [favourite] = await chances("picture", year, "eve_ceremony");

    // On the race page: the favourite leads the Picture tab with the chance the app gave it.
    await page.goto(`/race/${year}`);
    const row = panel(page).getByRole("heading", { level: 3, name: new RegExp(`^${favourite.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).locator("xpath=../../..");
    const leader = row.getByRole("button", { name: /% final prediction, show why$/ });
    await expect(leader.locator("[data-leader]")).toHaveCount(1);
    await expect(leader).toHaveAccessibleName(new RegExp(`^${Math.round(favourite.pWin * 100)}% final prediction`));
    await expect(panel(page).locator("[data-leader]")).toHaveCount(1);

    // And in the Accuracy page's backtest, with how it ended.
    await page.goto("/accuracy/picture");
    const backtestRow = page.locator("#backtest").getByRole("row", { name: new RegExp(`^${year} `) });
    await expect(backtestRow.getByRole("link", { name: favourite.title })).toBeVisible();
    await expect(backtestRow.getByRole("cell").nth(2)).toHaveText(`${Math.round(favourite.pWin * 100)}%`);
    await expect(backtestRow.getByRole("cell").nth(3)).toHaveText(/^(Won|Lost to .+)$/);
  }
});

test("an update that adds an award result changes the chances", async ({ page }) => {
  test.setTimeout(240_000);
  // The sample: Fjord is added to TIFF 2026 as a People's Choice runner-up.
  rmSync(SAMPLE_DIR, { recursive: true, force: true });
  mkdirSync(`${SAMPLE_DIR}/data`, { recursive: true });
  cpSync("data", `${SAMPLE_DIR}/data`, { recursive: true });
  cpSync("tests/fixtures/race-sample/tiff-2026.json", `${SAMPLE_DIR}/data/editions/tiff/2026.json`);

  const share = (title: string, rows: { title: string; pWin: number }[]) => rows.find((r) => r.title === title)!.pWin;
  const fjordRow = (page: Page) =>
    panel(page).getByRole("heading", { level: 3, name: /^Fjord/ }).locator("xpath=../../..");
  const fjordChance = (page: Page, pct: number) =>
    fjordRow(page).getByRole("button", { name: `${pct}% chance to win, show why` });

  try {
    // Start from the real files, so the "before" is the state the owner would see.
    await loadTest("data");
    const before = await chances("picture", SEASON, "live");
    const fjordBefore = Math.round(share("Fjord", before) * 100);
    await page.goto("/");
    await expect(fjordChance(page, fjordBefore)).toBeVisible();

    // The update: the sample's results go in, and the chances are recomputed.
    await loadTest(`${SAMPLE_DIR}/data`);
    const after = await chances("picture", SEASON, "live");
    const fjordAfter = Math.round(share("Fjord", after) * 100);
    expect(fjordAfter).toBeGreaterThan(fjordBefore);
    expect(after.reduce((sum, r) => sum + r.pWin, 0)).toBeCloseTo(1, 4);
    await page.goto("/");
    await expect(fjordChance(page, fjordAfter)).toBeVisible();
    await expect(fjordChance(page, fjordBefore)).toHaveCount(0);

    // Its "why" now counts the new result.
    await fjordChance(page, fjordAfter).click();
    await expect(fjordRow(page)).toContainText(/TIFF/);
  } finally {
    // Take the sample out: the real files go back in and the chances return to where they were.
    await loadTest("data");
    rmSync(SAMPLE_DIR, { recursive: true, force: true });
  }

  const restored = await chances("picture", SEASON, "live");
  await page.goto("/");
  await expect(fjordChance(page, Math.round(share("Fjord", restored) * 100))).toBeVisible();
});
