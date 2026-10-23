// The year summary (task 2.10, guide §8.8) for 2025: the stats strip and the table of each category's
// films and watched films. Every count links to the grid view it counts, and the grid shows exactly
// that many films. Reads only; the watched figures come from the marks on the `test` branch, so the
// spec checks each figure against its own list rather than a fixed number.
import { expect, test } from "@playwright/test";

const TABLE = "Films and watched by category";

// The four categories' films for 2025 (the same rows the grid pages show), with the address each
// count opens.
const CATEGORIES = [
  { name: "Best Picture", films: 31, href: "/grid/2025", watchedHref: "/grid/2025?filter=watched" },
  {
    name: "Best Documentary Feature",
    films: 32,
    href: "/grid/2025?category=documentary",
    watchedHref: "/grid/2025?category=documentary&filter=watched",
  },
  {
    name: "Best International Feature",
    films: 20,
    href: "/grid/2025?category=international",
    watchedHref: "/grid/2025?category=international&filter=watched",
  },
  {
    name: "Best Animated Feature",
    films: 14,
    href: "/grid/2025?category=animated",
    watchedHref: "/grid/2025?category=animated&filter=watched",
  },
];

test("/years/2025 shows the season in numbers: films, watched and the most nominated film", async ({ page }) => {
  await page.goto("/years/2025");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("2025 year summary");
  await expect(page.getByRole("link", { name: "2025 year grid" })).toHaveAttribute("href", "/grid/2025");

  const films = page.locator('a[href="/grid/2025?category=all"]');
  await expect(films).toContainText("Films with a nomination");
  await expect(films).toContainText("90");
  await expect(films).not.toContainText("of 90");

  const watched = page.locator('a[href="/grid/2025?category=all&filter=watched"]');
  await expect(watched).toContainText("of 90");
  await expect(watched).toContainText("Watched");

  const most = page.locator('a[href="/grid/2025?category=all&sort=noms"]');
  await expect(most).toContainText("Nominations for Hamnet, the most");
  await expect(most).toContainText("3 wins at Globes, Satellite and TIFF");

  const table = page.getByRole("table", { name: TABLE });
  await expect(table.getByRole("columnheader", { name: "Films" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Watched" })).toBeVisible();
  for (const category of CATEGORIES) {
    const row = table.getByRole("row").filter({ hasText: category.name });
    const counts = row.getByRole("link");
    await expect(counts.nth(0)).toHaveText(String(category.films));
    await expect(counts.nth(0)).toHaveAttribute("href", category.href);
    await expect(counts.nth(1)).toHaveAttribute("href", category.watchedHref);
  }
});

test("a count opens the grid view it counts, and the grid lists as many films as the count says", async ({ page }) => {
  await page.goto("/years/2025");
  const table = page.getByRole("table", { name: TABLE });
  await table.getByRole("row").filter({ hasText: "Best Picture" }).getByRole("link").nth(0).click();
  await expect(page).toHaveURL(/\/grid\/2025$/);
  await expect(page.getByText("Best Picture · 31 films with a nomination")).toBeVisible();

  await page.goto("/years/2025");
  await page.locator('a[href="/grid/2025?category=all"]').click();
  await expect(page).toHaveURL(/\/grid\/2025\?category=all$/);
  await expect(page.getByText("All categories · 90 films with a nomination")).toBeVisible();
  await expect(page.getByRole("table").getByRole("rowheader")).toHaveCount(90);

  // The watched figure is the number of films its list shows, and the Watched chip says so.
  await page.goto("/years/2025");
  const watched = page.locator('a[href="/grid/2025?category=all&filter=watched"]');
  const count = Number.parseInt((await watched.locator("p").first().textContent()) ?? "", 10);
  await watched.click();
  await expect(page).toHaveURL(/\/grid\/2025\?category=all&filter=watched$/);
  await expect(page.getByRole("group", { name: "Filter" }).getByRole("button", { name: "Watched", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("table").getByRole("rowheader")).toHaveCount(count);

  // A category's watched figure opens that category's watched films the same way.
  await page.goto("/years/2025");
  const internationalWatched = table.getByRole("row").filter({ hasText: "Best International Feature" }).getByRole("link").nth(1);
  const internationalCount = Number.parseInt((await internationalWatched.textContent()) ?? "", 10);
  await internationalWatched.click();
  await expect(page).toHaveURL(/\/grid\/2025\?category=international&filter=watched$/);
  await expect(page.getByRole("table").getByRole("rowheader")).toHaveCount(internationalCount);
});

test("the year switcher keeps the summary, and an unknown year is not found", async ({ page }) => {
  await page.goto("/years/2025");
  await page.getByRole("button", { name: "Year: 2025" }).click();
  await page.getByRole("dialog", { name: "Choose a year" }).getByRole("link", { name: "2024" }).click();
  await expect(page).toHaveURL(/\/years\/2024$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("2024 year summary");

  // Like an unlisted year on the other pages, the 404 page streams in with a 200 status (a prerendered shell).
  await page.goto("/years/2011");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page isn't here");
});

test("at 390 the page never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/years/2025");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("2025 year summary");

  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
});
