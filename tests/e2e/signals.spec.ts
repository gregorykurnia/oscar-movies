// The strong signals page (task 7.6, guide §8.13): the awards that predict an Oscar category
// best and the films they picked, by award or by film, with both controls in the address, reached
// from the accuracy page and the race. Reads only; no writes.
import { expect, test } from "@playwright/test";
import { LIVE_YEAR } from "../../src/lib/years";

test("2025 Documentary lists each strong award with its figure sentence and films", async ({ page }) => {
  await page.goto("/signals/2025?category=documentary");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("2025 strong signals");
  await expect(page.getByText("Best Documentary Feature · the films picked by the awards that predict it best")).toBeVisible();

  const feature = page.locator('[data-award="cinema-eye/feature"]');
  await expect(feature.getByRole("heading", { level: 2 })).toContainText("Cinema Eye");
  await expect(feature.locator('[data-figure="caught"]')).toHaveText(/^Caught \d+% of Oscar nominees · \d+ of \d+ over \d+ years$/);
  await expect(feature.locator('[data-figure="winner"]')).toHaveText(/^Its winner was Oscar-nominated \d+% of years · \d+ of \d+$/);
  // Winner first, each film with its result and its Oscar stage.
  const rows = feature.getByRole("heading", { level: 3 });
  const winner = feature.locator("[data-winner]");
  await expect(winner).toHaveCount(1);
  await expect(winner.getByText("Won", { exact: true })).toBeVisible();
  await expect(winner.getByRole("heading", { level: 3 }).getByRole("link")).toHaveAttribute("href", /^\/movies\//);
  await expect(rows.first()).toHaveText((await winner.getByRole("heading", { level: 3 }).textContent()) ?? "");
  expect(await rows.count()).toBeGreaterThan(2);
  await expect(feature.getByText("Shortlisted").first()).toBeVisible();
  // Every strong award of the page has a figure sentence.
  const awards = page.locator("[data-award]");
  expect(await awards.count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator("[data-figure]")).not.toHaveCount(0);
});

test("By film puts the film with the most strong awards first, and the view is in the address", async ({ page }) => {
  await page.goto("/signals/2025?category=documentary");
  await page.getByRole("link", { name: "By film" }).click();
  await expect(page).toHaveURL(/\/signals\/2025\?category=documentary&view=film$/);
  await expect(page.getByRole("link", { name: "By film" })).toHaveAttribute("aria-current", "page");

  // Each film row's heading sits beside its list of picks.
  const counts = await page.getByRole("heading", { level: 2 }).evaluateAll((headings) =>
    headings.map((h) => h.parentElement!.querySelectorAll("[data-picks] > span").length),
  );
  expect(counts.length).toBeGreaterThan(2);
  expect(counts[0]).toBe(Math.max(...counts));
  expect(counts).toEqual([...counts].sort((a, b) => b - a));
  await expect(page.locator("[data-picks]").first()).toContainText(/Won|Nominated/);

  // A reload and the other control keep the view and the category.
  await page.reload();
  await expect(page.getByRole("link", { name: "By film" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "International" }).click();
  await expect(page).toHaveURL(/\/signals\/2025\?category=international&view=film$/);
});

test("the year switcher keeps the category and view", async ({ page }) => {
  await page.goto("/signals/2025?category=documentary&view=film");
  await page.getByRole("button", { name: "Year: 2025" }).click();
  await page.getByRole("link", { name: "2024", exact: true }).click();
  await expect(page).toHaveURL(/\/signals\/2024\?category=documentary&view=film$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("2024 strong signals");
});

test("/signals opens on the live season", async ({ page }) => {
  await page.goto("/signals?category=documentary");
  await expect(page).toHaveURL(new RegExp(`/signals/${LIVE_YEAR}\\?category=documentary$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${LIVE_YEAR} strong signals`);
});

// The years' shell is prerendered, so an unlisted year streams the 404 page after a 200 status.
test("a year the app doesn't cover is not found", async ({ page }) => {
  await page.goto("/signals/2011");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page isn't here");
});

test("the accuracy page and the race link to it", async ({ page }) => {
  await page.goto("/accuracy/documentary");
  await page.getByRole("link", { name: `Strong signals, ${LIVE_YEAR}` }).click();
  await expect(page).toHaveURL(new RegExp(`/signals/${LIVE_YEAR}\\?category=documentary$`));

  await page.goto("/race/2024");
  await page.getByRole("tab", { name: /^Documentary/ }).click();
  const link = page.getByRole("tabpanel").getByRole("link", { name: "Strong signals, 2024" });
  await expect(link).toHaveAttribute("href", "/signals/2024?category=documentary");
  await link.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("2024 strong signals");
});
