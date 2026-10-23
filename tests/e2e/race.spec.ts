// The race (tasks 1.8 and 3.3, guide §8.1, §6.5–6.6, §8.12): a finished year shows the real
// Oscar nominees with the winner marked and the final prediction in all four tabs, the "why"
// opens and closes by keyboard, the tab is kept in the address through a reload, and the live
// season shows its contenders with their chances. Reads only; no writes.
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
  await expect(page.getByText("97th Academy Awards. Final prediction, made 1 Mar 2025.")).toBeVisible();

  for (const { tab, nominees, winner, oscar } of RACE_2024) {
    await page.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
    await expect(page.getByRole("tab", { name: new RegExp(`^${tab}`) })).toHaveAttribute("aria-selected", "true");
    await expect(panel(page).getByRole("heading", { level: 3 })).toHaveCount(nominees);
    await expect(panel(page).getByText(`Ceremony 2 Mar 2025 · ${winner} won ${oscar}`)).toBeVisible();
    const winnerRow = panel(page).getByRole("heading", { level: 3, name: `${winner} Won` });
    await expect(winnerRow).toBeVisible();
    await expect(winnerRow.getByRole("link", { name: winner })).toHaveAttribute("href", /^\/movies\//);
    await expect(panel(page).getByText("Nominated", { exact: true })).toHaveCount(nominees - 1);
    // The final prediction: one % per nominee, the favourite first.
    const chances = panel(page).getByRole("button", { name: /^(<1|\d+)% final prediction, show why$/ });
    await expect(chances).toHaveCount(nominees);
    await expect(panel(page).getByText("final prediction", { exact: true })).toHaveCount(nominees);
    await expect(chances.first().locator("[data-leader]")).toHaveCount(1);
    await expect(panel(page).getByText("To be nominated", { exact: true })).toHaveCount(0);
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

test("the why behind a % opens and closes by keyboard", async ({ page }) => {
  await page.goto("/race/2024");
  const anora = panel(page).getByRole("heading", { level: 3, name: "Anora Won" }).locator("xpath=../../..");
  const pct = anora.getByRole("button", { name: /% final prediction, show why$/ });
  const label = (await pct.getAttribute("aria-label"))!;
  const shown = label.slice(0, label.indexOf("%"));
  await expect(pct).toHaveAttribute("aria-expanded", "false");

  // The page hydrates before the button answers; Enter opens it and focus stays on the %.
  await expect(async () => {
    await pct.focus();
    await page.keyboard.press("Enter");
    await expect(pct).toHaveAttribute("aria-expanded", "true", { timeout: 1000 });
  }).toPass();
  await expect(pct).toBeFocused();
  const why = page.locator(`#${await pct.getAttribute("aria-controls")}`);
  await expect(why.getByRole("heading", { level: 4 })).toHaveText(`Why ${shown}%`);
  await expect(why).toContainText(/won Best Picture\./);
  await expect(why).toContainText("Won PGA");
  await expect(why).toContainText(/Similar seasons: \d/);
  const method = why.getByRole("link", { name: "How the % chance works" });
  await expect(method).toHaveAttribute("href", "/accuracy/picture#method");

  // Tab reaches the link inside it; Esc closes it and returns focus to the %.
  await page.keyboard.press("Tab");
  await expect(method).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(pct).toHaveAttribute("aria-expanded", "false");
  await expect(why.getByRole("heading")).toHaveCount(0);
  await expect(pct).toBeFocused();

  // Space opens it again; opening another % closes the first (one at a time).
  await page.keyboard.press("Space");
  await expect(pct).toHaveAttribute("aria-expanded", "true");
  const other = panel(page).getByRole("button", { name: /% final prediction, show why$/ }).nth(1);
  await other.focus();
  await page.keyboard.press("Enter");
  await expect(other).toHaveAttribute("aria-expanded", "true");
  await expect(pct).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(other).toHaveAttribute("aria-expanded", "false");
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

test("the live season shows its contenders with their chances", async ({ page }) => {
  await page.goto("/?category=international");
  await expect(panel(page).getByText(/^Shortlist \d{1,2} [A-Z][a-z]{2}/)).toBeVisible();
  const chances = panel(page).getByRole("button", { name: /^(<1|\d+)% chance to win, show why$/ });
  await expect(chances.first()).toBeVisible();
  await expect(panel(page).getByText("to win", { exact: true }).first()).toBeVisible();
  await expect(panel(page).getByText("To be nominated", { exact: true })).toBeVisible();
  // Every submission is a contender; the long tail waits behind Show all.
  const showAll = panel(page).getByRole("button", { name: /^Show all \d+ contenders · .* under 3%$/ });
  await expect(showAll).toBeVisible();
  const total = Number((await showAll.textContent())!.match(/Show all (\d+)/)![1]);
  const before = await chances.count();
  expect(before).toBeLessThan(total);
  await expect(async () => {
    if (await showAll.count()) await showAll.click({ timeout: 1000 });
    await expect(chances).toHaveCount(total, { timeout: 1000 });
  }).toPass();
  await expect(showAll).toHaveCount(0);
});

// The years' shell is prerendered, so an unlisted year streams the 404 page after a 200 status.
test("a year the app doesn't cover is not found", async ({ page }) => {
  await page.goto("/race/2011");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page isn't here");
});
