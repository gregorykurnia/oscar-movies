// The award page (task 2.6, guide §8.2): BAFTA 2025 lists its nominees and winners with their
// Oscar results and the accuracy strip; a winners-only festival, a year with no data and an
// unknown award. Reads only; no writes.
import { expect, test } from "@playwright/test";

test("/awards/bafta/2025 lists nominees and winners with their Oscar results", async ({ page }) => {
  await page.goto("/awards/bafta/2025");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("BAFTA 2025");
  await expect(page.getByText("79th BAFTA Film Awards · 22 Feb 2026 · Major award")).toBeVisible();
  await expect(page.getByRole("link", { name: "Awards 2025" })).toHaveAttribute("href", "/awards/2025");

  const picture = page.getByRole("region", { name: "Best Film" });
  await expect(picture.getByText("Counts towards Best Picture")).toBeVisible();
  await expect(picture.getByRole("heading", { level: 3 })).toHaveCount(5);
  const winner = picture.locator("[data-winner]");
  await expect(winner).toHaveCount(1);
  await expect(winner.getByRole("heading", { level: 3, name: "One Battle After Another" })).toBeVisible();
  // The award's own result and the Oscar result sit side by side on the winner's row.
  await expect(winner.getByText("Won", { exact: true })).toHaveCount(2);
  await expect(picture.getByText("Nominated", { exact: true })).toHaveCount(8);
  await expect(picture.getByRole("button", { name: /^(Mark as watched|Watched)$/ })).toHaveCount(5);

  // The accuracy strip: four figures with their counts.
  await expect(picture.getByText("Winner won the Oscar")).toBeVisible();
  await expect(picture.getByText("Winner was nominated")).toBeVisible();
  await expect(picture.getByText("Nominees were nominated")).toBeVisible();
  await expect(picture.getByText("Oscar nominees it caught")).toBeVisible();
  await expect(picture.getByText(/^\d+ of \d+$/)).toHaveCount(4);

  // The documentary shortlist shows as a shortlist; International names the Oscar's country.
  const documentary = page.getByRole("region", { name: "Documentary", exact: true });
  await expect(documentary.getByText("Shortlisted", { exact: true })).toHaveCount(3);
  const international = page.getByRole("region", { name: "Film Not in the English Language" });
  await expect(international.getByText("for Norway")).toBeVisible();
});

test("the jump control and the year switcher keep the award", async ({ page }) => {
  await page.goto("/awards/bafta/2025");
  await expect(
    page.getByRole("navigation", { name: "Jump to category" }).getByRole("link", { name: "Best Film" }),
  ).toHaveAttribute("href", "#film");
  await page.getByRole("button", { name: "Year: 2025" }).click();
  await page.getByRole("dialog", { name: "Choose a year" }).getByRole("link", { name: "2024" }).click();
  await expect(page).toHaveURL(/\/awards\/bafta\/2024$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("BAFTA 2024");
  await expect(page.getByRole("region", { name: "Best Film" }).locator("[data-winner]").getByRole("heading", { level: 3 })).toHaveText("Conclave");
});

test("a film off the Oscar list reads Not nominated; a list with no winner says so in its footnote", async ({ page }) => {
  await page.goto("/awards/afi/2024");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("AFI 2024");
  const row = page.getByRole("heading", { level: 3, name: "A Real Pain" }).locator("xpath=ancestor::div[contains(@class,'border-b')][1]");
  await expect(row.getByText("Not nominated")).toBeVisible();
  await expect(page.getByText("names a list of films and no winner")).toBeVisible();
  // Nothing to count for the winner figures.
  await expect(page.getByText("–", { exact: true })).toHaveCount(2);
});

test("a winners-only award has no nominee figure", async ({ page }) => {
  await page.goto("/awards/cannes/2024");
  await expect(page.getByText("announces its winners only")).toBeVisible();
  await expect(page.getByText("–", { exact: true }).first()).toBeVisible();
});

test("a year with no data and an unknown award", async ({ page }) => {
  await page.goto("/awards/bafta/2026");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("BAFTA 2026");
  await expect(page.getByRole("heading", { name: "No data for this year" })).toBeVisible();

  // Like an unlisted year, the 404 page streams in with a 200 status (a prerendered shell).
  await page.goto("/awards/no-such-award/2025");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page isn't here");
});
