// The all-years page (task 7.12, guide §8.2): from BAFTA 2025's page to its history, the category
// tabs, a year heading opening that year's page, the no-data and no-results lines, a tab with two
// categories, the Oscars' footnote and the phone width. Reads only; no writes.
import { expect, test } from "@playwright/test";
import { LIVE_YEAR } from "../../src/lib/years";

test("from BAFTA 2025, All years opens the history; a tab switches the category and a year opens its page", async ({ page }) => {
  await page.goto("/awards/bafta/2025");
  await page.getByRole("link", { name: "All years" }).click();
  await expect(page).toHaveURL(/\/awards\/bafta\/all$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("BAFTA, all years");
  await expect(page.getByText("Major award · every year since 2012, newest first")).toBeVisible();
  await expect(page.getByRole("link", { name: `BAFTA ${LIVE_YEAR}` }).first()).toHaveAttribute("href", `/awards/bafta/${LIVE_YEAR}`);

  const tabs = page.getByRole("navigation", { name: "Category" });
  await expect(tabs.getByRole("link")).toHaveText(["Picture", "Documentary", "International", "Animated"]);
  await expect(tabs.getByRole("link", { name: "Picture" })).toHaveAttribute("aria-current", "page");
  // Newest first: 2025's block comes before 2024's, and the live year has no data yet.
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveAccessibleName(`BAFTA ${LIVE_YEAR}`);
  const block2025 = page.getByRole("region", { name: "BAFTA 2025" });
  await expect(block2025.locator("[data-winner]").getByRole("heading", { name: "One Battle After Another" })).toBeVisible();
  await expect(block2025.getByText("22 Feb 2026")).toBeVisible();

  await tabs.getByRole("link", { name: "Documentary" }).click();
  await expect(page).toHaveURL(/\/awards\/bafta\/all\?category=documentary$/);
  await expect(tabs.getByRole("link", { name: "Documentary" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: "BAFTA 2025" }).getByText("Cover-Up")).toBeVisible();
  // (The Picture tab's page stays in the document, hidden, after a soft navigation.)
  await expect(page.getByText("One Battle After Another").locator("visible=true")).toHaveCount(0);

  await page.getByRole("heading", { level: 2, name: "BAFTA 2023" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/awards\/bafta\/2023$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("BAFTA 2023");
});

test("a year with no data and a year with no results each read as one line", async ({ page }) => {
  // A past year with no data (the live year's would fill up when its results load, 7.R).
  await page.goto("/awards/critics-choice-documentary/all");
  const none = page.getByRole("region", { name: "Critics Choice Doc 2012" });
  await expect(none.getByText("No data", { exact: true })).toBeVisible();
  await expect(none.getByRole("row")).toHaveCount(0);

  await page.goto("/awards/critics-choice/all?category=documentary");
  const empty = page.getByRole("region", { name: "Critics Choice 2020" });
  await expect(empty.getByText("No results this year")).toBeVisible();
  await expect(empty.getByRole("heading", { level: 3 })).toHaveCount(0);
  // The prize ran to the 2015 films.
  const old = page.getByRole("region", { name: "Critics Choice 2015" });
  await expect(old.getByRole("heading", { level: 3 }).first()).toBeVisible();
  await expect(old.getByText("No results this year")).toHaveCount(0);
  // A single category in the tab: no subheading in the year.
  await expect(old.getByRole("heading", { level: 4 })).toHaveCount(0);
});

test("Golden Globes Picture names both categories as subheadings", async ({ page }) => {
  await page.goto("/awards/golden-globes/all");
  const block = page.getByRole("region", { name: "Globes 2024" });
  await expect(block.getByRole("heading", { level: 3 })).toHaveCount(2);
  await expect(block.getByRole("heading", { level: 3 }).first()).toContainText("Drama");
  await expect(block.locator("[data-winner]")).toHaveCount(2);
});

test("the Oscars list nominees and winners, and say where the rest is", async ({ page }) => {
  await page.goto("/awards/oscars/all?category=international");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Oscars, all years");
  await expect(page.getByText("Academy Awards · every year since 2012, newest first")).toBeVisible();
  const block = page.getByRole("region", { name: "Oscars 2025" });
  await expect(block.getByText("for Norway")).toBeVisible();
  await expect(block.getByText("Shortlisted", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Only nominees and winners are listed here.")).toBeVisible();
  await page.getByRole("heading", { level: 2, name: "Oscars 2025" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/awards\/oscars\/2025$/);
  await page.getByRole("link", { name: "All years" }).click();
  await expect(page).toHaveURL(/\/awards\/oscars\/all$/);
});

test("an unknown award is the 404 page", async ({ page }) => {
  // The 404 page streams in with a 200 status (a prerendered shell), as on the year page.
  await page.goto("/awards/no-such-award/all");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page isn't here");
});

test("/awards/critics-choice/all never scrolls sideways on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/awards/critics-choice/all", "/awards/critics-choice/all?category=documentary", "/awards/golden-globes/all"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: /2024$/ })).toBeVisible();
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(widths.scroll, path).toBeLessThanOrEqual(widths.client);
  }
});
