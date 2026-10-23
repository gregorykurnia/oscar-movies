// The race (task 1.8, guide §8.1, §8.12): a finished year shows the real Oscar nominees with the
// winner marked in all four tabs, the tab is kept in the address through a reload, and the live
// season shows what it has so far. Reads only; no writes.
import { expect, test, type Page } from "@playwright/test";

// The 97th Academy Awards (2024 films): the Academy's nominees and winners.
const RACE_2024 = [
  { tab: "Picture", nominees: 10, winner: "Anora", oscar: "Best Picture" },
  { tab: "Documentary", nominees: 5, winner: "No Other Land", oscar: "Best Documentary Feature" },
  { tab: "International", nominees: 5, winner: "I'm Still Here", oscar: "Best International Feature" },
  { tab: "Animated", nominees: 5, winner: "Flow", oscar: "Best Animated Feature" },
];

const panel = (page: Page) => page.getByRole("tabpanel");

test("/race/2024 shows the nominees and the winner in every tab", async ({ page }) => {
  await page.goto("/race/2024");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The 2024 race");
  await expect(page.getByText("97th Academy Awards.")).toBeVisible();

  for (const { tab, nominees, winner, oscar } of RACE_2024) {
    await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
    await expect(page.getByRole("tab", { name: new RegExp(`^${tab}`) })).toHaveAttribute("aria-selected", "true");
    await expect(panel(page).getByRole("heading", { level: 3 })).toHaveCount(nominees);
    await expect(panel(page).getByText(`Ceremony 2 Mar 2025 · ${winner} won ${oscar}`)).toBeVisible();
    const winnerRow = panel(page).getByRole("heading", { level: 3, name: `${winner} Won` });
    await expect(winnerRow).toBeVisible();
    await expect(winnerRow.getByRole("link", { name: winner })).toHaveAttribute("href", /^\/movies\//);
    await expect(panel(page).getByText("Nominated", { exact: true })).toHaveCount(nominees - 1);
  }
  // International leads with the submitting country's flag.
  await expect(panel(page).getByRole("img", { name: "Brazil, submitting country" })).toHaveCount(0);
  await page.getByRole("tab", { name: /^International/ }).click();
  await expect(panel(page).getByRole("img", { name: "Brazil, submitting country" })).toBeVisible();
});

test("each 2024 Picture nominee shows the awards it won and was nominated for", async ({ page }) => {
  await page.goto("/race/2024");
  const anora = panel(page).locator("[data-precursors]").first();
  await expect(anora).toContainText("Won: ");
  const anoraRow = panel(page).getByRole("heading", { level: 3, name: "Anora Won" });
  await expect(anoraRow.locator("xpath=..").locator("[data-precursors]")).toContainText(/Won: .*PGA/);
  const brutalist = panel(page).getByRole("heading", { level: 3, name: "The Brutalist Nominated" });
  await expect(brutalist.locator("xpath=..").locator("[data-precursors]")).toContainText(/Won: .*Globes.* · Nominated: .*BAFTA/);
});

test("the tab is kept in the address and survives a reload", async ({ page }) => {
  await page.goto("/race/2024");
  await page.getByRole("tab", { name: /^Animated/ }).click();
  await expect(page).toHaveURL(/\/race\/2024\?category=animated$/);
  await page.reload();
  await expect(page.getByRole("tab", { name: /^Animated/ })).toHaveAttribute("aria-selected", "true");
  await expect(panel(page).getByRole("heading", { level: 3, name: "Flow Won" })).toBeVisible();

  // Arrow keys move along the tabs and select them; Picture leaves the address clean.
  await page.getByRole("tab", { name: /^Animated/ }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: /^Picture/ })).toBeFocused();
  await expect(page).toHaveURL(/\/race\/2024$/);

  // The year switcher keeps the tab.
  await page.getByRole("tab", { name: /^Picture/ }).press("End");
  await page.getByRole("button", { name: "Year: 2024" }).click();
  await page.getByRole("dialog", { name: "Choose a year" }).getByRole("link", { name: "2023" }).click();
  await expect(page).toHaveURL(/\/race\/2023\?category=animated$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The 2023 race");
});

test("the live season shows its stage and what's in so far", async ({ page }) => {
  await page.goto("/?category=international");
  await expect(panel(page).getByText(/^Shortlist \d{1,2} [A-Z][a-z]{2}/)).toBeVisible();
  await expect(panel(page).getByRole("heading", { name: "No contenders yet" })).toBeVisible();
  await expect(panel(page).getByText(/\d+ countries have submitted a film so far\./)).toBeVisible();
  await expect(panel(page).getByRole("link", { name: /^See the \d{4} submissions$/ })).toBeVisible();
});

// The years' shell is prerendered, so an unlisted year streams the 404 page after a 200 status.
test("a year the app doesn't cover is not found", async ({ page }) => {
  await page.goto("/race/2011");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page isn't here");
});
