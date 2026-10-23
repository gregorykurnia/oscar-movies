// Phase 2's Done-when scenario (task 2.12, IMPLEMENTATION_PLAN.md): BAFTA 2025's page lists its
// nominees and winners with their Oscar results; the accuracy figures for a hand-checked award
// match; the 2025 grid shows every nominated movie with its awards coloured. One walk through
// the new pages by their links. Reads only; no writes.
import { expect, test } from "@playwright/test";

test("BAFTA 2025's page lists its nominees and winners with their Oscar results", async ({ page }) => {
  // From the Awards index, the way a visitor gets there.
  await page.goto("/awards/2025");
  await page.getByRole("link", { name: /BAFTA/ }).first().click();
  await expect(page).toHaveURL(/\/awards\/bafta\/2025$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("BAFTA 2025");

  const picture = page.getByRole("region", { name: "Best Film" });
  await expect(picture.getByRole("heading", { level: 3 })).toHaveCount(5);
  const winner = picture.locator("[data-winner]");
  await expect(winner).toHaveCount(1);
  await expect(winner.getByRole("heading", { level: 3, name: "One Battle After Another" })).toBeVisible();
  // The BAFTA result and the Oscar result side by side: the winner won both, the rest were nominated.
  await expect(winner.getByText("Won", { exact: true })).toHaveCount(2);
  await expect(picture.getByText("Nominated", { exact: true })).toHaveCount(8);
  await expect(picture.getByText("Counts towards Best Picture")).toBeVisible();
});

test("the accuracy figures for a hand-checked award match", async ({ page }) => {
  // Cinema Eye Honors' feature prize against Best Documentary Feature, worked out by hand in
  // tests/fixtures/accuracy-cinema-eye.json: 3 of 14, 12 of 14 and 16 of 33.
  await page.goto("/awards/cinema-eye/2025");
  await page.getByRole("link", { name: "Best Documentary Feature", exact: true }).click();
  await expect(page).toHaveURL(/\/accuracy\/documentary$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Accuracy: Best Documentary Feature");

  const row = page.getByRole("table").getByRole("row", { name: /Cinema Eye/ });
  const cells = row.getByRole("cell");
  await expect(cells.nth(1)).toHaveText("21% 3 of 14");
  await expect(cells.nth(2)).toHaveText("86% 12 of 14");
  await expect(cells.nth(3)).toHaveText("48% 16 of 33");
  await expect(cells.nth(4)).toHaveText("14");

  // A winners-only award has no nominee figure, so the dash is explained.
  await page.goto("/accuracy/picture");
  await expect(
    page.getByRole("row", { name: /Cannes/ }).getByTitle("Not counted: only the winners are known").first(),
  ).toBeVisible();
});

test("the 2025 grid shows every nominated movie with its awards coloured", async ({ page }) => {
  await page.goto("/grid/2025");
  const table = page.getByRole("table");
  // One row per film the sub line counts (31 from the majors and festivals, more since Phase 4's critics groups).
  const sub = await page.getByText(/^Best Picture · \d+ films with a nomination$/).textContent();
  const films = Number(sub!.match(/(\d+) films/)![1]);
  expect(films).toBeGreaterThanOrEqual(31);
  await expect(table.getByRole("rowheader")).toHaveCount(films);

  // The ten Best Picture nominees are all rows, one cell won and nine nominated.
  const oscarNominees = [
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
  ];
  for (const title of oscarNominees) {
    await expect(table.getByRole("rowheader", { name: title, exact: true })).toHaveCount(1);
  }
  const won = table.locator('[data-c="won"][aria-label="Won: Best Picture"]');
  const nominated = table.locator('[data-c="nom"][aria-label="Nominated: Best Picture"]');
  await expect(won).toHaveCount(1);
  await expect(nominated).toHaveCount(9);

  // Coloured: a won cell and a nominated cell are filled differently, and neither is empty.
  const fill = (cell: typeof won) => cell.evaluate((el) => getComputedStyle(el).backgroundColor);
  const wonFill = await fill(won);
  const nominatedFill = await fill(nominated.first());
  expect(wonFill).not.toBe(nominatedFill);
  for (const colour of [wonFill, nominatedFill]) expect(colour).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);

  // The winner's row carries a won cell in every award that picked it, and links on to the summary.
  const row = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "One Battle After Another" }) });
  await expect(row.locator('[data-c="won"]').first()).toBeVisible();
  await page.getByRole("link", { name: "Year summary" }).click();
  await expect(page).toHaveURL(/\/years\/2025$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("2025");
});
