// International submissions (task 1.10, guide §8.3): every submission of a year with its submitting
// country's flag and name, sorted and filtered from the address. Reads only; no writes.
// The expected rows come from the `test` branch's 2024 and 2026 data (the 1.4 import).
import { expect, test } from "@playwright/test";

test("/submissions/2024 lists the year's submissions by country, A to Z, with each stage", async ({ page }) => {
  await page.goto("/submissions/2024");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("2024 submissions");
  await expect(page.getByText("Best International Feature · 97th Academy Awards · 2 Mar 2025")).toBeVisible();

  const rows = page.getByRole("main").getByRole("heading", { level: 2 });
  await expect(rows).toHaveCount(89);
  await expect(rows.first()).toHaveText("Waterdrop");
  // One mark per row, and the Watched chip answers to the same name.
  await expect(page.getByRole("button", { name: /^(Mark as watched|Watched)$/ })).toHaveCount(89 + 1);

  // The winner: the gold wash, the country's flag and name in the first column, "Won".
  const winner = page.locator("[data-winner]");
  await expect(winner).toHaveCount(1);
  await expect(winner.getByRole("heading", { level: 2, name: "I'm Still Here" })).toBeVisible();
  await expect(winner.getByRole("img", { name: "Brazil" })).toBeVisible();
  await expect(winner.getByText("Won", { exact: true })).toBeVisible();

  // Stages: Not nominated is the research's "eligible", Submitted the rest.
  await expect(page.locator('[data-stage="won"]')).toHaveCount(1);
  await expect(page.locator('[data-stage="nominated"]')).toHaveCount(4);
  await expect(page.locator('[data-stage="shortlisted"]')).toHaveCount(10);
  await expect(page.locator('[data-stage="not-nominated"]')).toHaveCount(70);
  await expect(page.locator('[data-stage="submitted"]')).toHaveCount(4);
});

test("the sort and the chips are kept in the address, and survive a reload", async ({ page }) => {
  await page.goto("/submissions/2024");
  const rows = page.getByRole("main").getByRole("heading", { level: 2 });
  const sort = page.getByRole("navigation", { name: "Sort by" });
  const chips = page.getByRole("group", { name: "Filter" });

  await sort.getByRole("link", { name: "Oscar stage" }).click();
  await expect(page).toHaveURL(/\/submissions\/2024\?sort=stage$/);
  await expect(sort.getByRole("link", { name: "Oscar stage" })).toHaveAttribute("aria-current", "page");
  await expect(rows.first()).toHaveText("I'm Still Here");

  await chips.getByRole("button", { name: "Shortlisted" }).click();
  await expect(page).toHaveURL(/\/submissions\/2024\?sort=stage&filter=shortlisted$/);
  await expect(chips.getByRole("button", { name: "Shortlisted" })).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(15);

  await page.reload();
  await expect(rows).toHaveCount(15);
  await expect(rows.first()).toHaveText("I'm Still Here");
  await expect(sort.getByRole("link", { name: "Oscar stage" })).toHaveAttribute("aria-current", "page");
  await expect(chips.getByRole("button", { name: "Shortlisted" })).toHaveAttribute("aria-pressed", "true");

  // Both chips on, then Shortlisted off: the address keeps Unwatched and the sort.
  await chips.getByRole("button", { name: "Unwatched" }).click();
  await expect(page).toHaveURL(/\/submissions\/2024\?sort=stage&filter=shortlisted&filter=unwatched$/);
  await chips.getByRole("button", { name: "Shortlisted" }).click();
  await expect(page).toHaveURL(/\/submissions\/2024\?sort=stage&filter=unwatched$/);
  await expect(chips.getByRole("button", { name: "Unwatched" })).toHaveAttribute("aria-pressed", "true");
  await expect(chips.getByRole("button", { name: "Shortlisted" })).toHaveAttribute("aria-pressed", "false");
});

test("the average score sort puts the highest first and keeps the chips in the address", async ({ page }) => {
  await page.goto("/submissions/2024?sort=average");
  const rows = page.getByRole("main").getByRole("heading", { level: 2 });
  await expect(rows.nth(0)).toHaveText("In the Arms of the Tree");
  await expect(rows.nth(1)).toHaveText("Laapataa Ladies");

  await page.getByRole("group", { name: "Filter" }).getByRole("button", { name: "Shortlisted" }).click();
  await expect(page).toHaveURL(/\/submissions\/2024\?sort=average&filter=shortlisted$/);
  await expect(rows).toHaveCount(15);
  await expect(rows.first()).toHaveText("Flow");
});

test("the year switcher keeps the sort and the chips", async ({ page }) => {
  await page.goto("/submissions/2024?sort=stage&filter=shortlisted");
  await page.getByRole("button", { name: "Year: 2024" }).click();
  await page.getByRole("dialog", { name: "Choose a year" }).getByRole("link", { name: "2023" }).click();
  await expect(page).toHaveURL(/\/submissions\/2023\?sort=stage&filter=shortlisted$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("2023 submissions");
});

test("a filter with nothing to show says so, and links back to all of the year", async ({ page }) => {
  // 2026's submissions are all still submitted: no shortlist yet.
  await page.goto("/submissions/2026?filter=shortlisted");
  await expect(page.getByRole("heading", { level: 2, name: "No submissions match" })).toBeVisible();
  await expect(page.getByText("Nothing in the 2026 submissions is shortlisted.")).toBeVisible();
  await page.getByRole("link", { name: "Show all submissions" }).click();
  await expect(page).toHaveURL(/\/submissions\/2026$/);
  await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveCount(100);
});

test("/submissions opens the live season, and an unlisted year is the 404 page", async ({ page }) => {
  await page.goto("/submissions");
  await expect(page).toHaveURL(/\/submissions\/2026$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("2026 submissions");

  await page.goto("/submissions/2011");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page isn't here");
});
