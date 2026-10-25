// The Oscars' year page (task 1.9, guide §8.2): all four categories list the real nominees with
// the winner marked, flags, scores and marks; International names the submitting country.
// Reads only; no writes.
import { expect, test } from "@playwright/test";

// The 97th Academy Awards (2024 films): the Academy's nominees and winners.
const OSCARS_2024 = [
  { id: "picture", heading: "Best Picture", nominees: 10, winner: "Anora" },
  { id: "documentary", heading: "Best Documentary Feature", nominees: 5, winner: "No Other Land" },
  { id: "international", heading: "Best International Feature", nominees: 5, winner: "I'm Still Here" },
  { id: "animated", heading: "Best Animated Feature", nominees: 5, winner: "Flow" },
];

test("/awards/oscars/2024 lists the nominees and winner in all four categories", async ({ page }) => {
  await page.goto("/awards/oscars/2024");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Oscars 2024");
  await expect(page.getByText("97th Academy Awards · 2 Mar 2025")).toBeVisible();
  await expect(page.getByRole("link", { name: "Awards 2024" })).toHaveAttribute("href", "/awards/2024");

  for (const { id, heading, nominees, winner } of OSCARS_2024) {
    const section = page.getByRole("region", { name: heading });
    await expect(section).toHaveAttribute("id", id);
    // Documentary and International also list the shortlisted films that missed (their own test below).
    const missed = await section.getByText("Shortlisted", { exact: true }).count();
    await expect(section.getByText(/^(Won|Nominated)$/)).toHaveCount(nominees);
    const winnerRow = section.locator("[data-winner]");
    await expect(winnerRow).toHaveCount(1);
    await expect(winnerRow.getByRole("heading", { level: 3, name: winner })).toBeVisible();
    await expect(winnerRow.getByText("Won", { exact: true })).toBeVisible();
    await expect(section.getByText("Nominated", { exact: true })).toHaveCount(nominees - 1);
    // Every row has the two marks.
    await expect(section.getByRole("button", { name: /^(Mark as watched|Watched)$/ })).toHaveCount(nominees + missed);
  }

  // International: the submitting country's flag and "for <country>".
  const international = page.getByRole("region", { name: "Best International Feature" });
  await expect(international.getByRole("img", { name: "Brazil, submitting country" })).toBeVisible();
  await expect(international.getByText("for Brazil")).toBeVisible();
  // No accuracy figures on the Oscars' own page.
  await expect(page.getByText(/Winner won|Winner was nominated/)).toHaveCount(0);
});

// The 98th Academy Awards (2025 films): the shortlists sit under the nominees, with a caption line
// and the Snub risk flag on the films the patterns flag (task 8.6).
test("/awards/oscars/2025 lists Documentary's and International's whole shortlists", async ({ page }) => {
  await page.goto("/awards/oscars/2025");
  const documentary = page.getByRole("region", { name: "Best Documentary Feature" });
  await expect(documentary.getByText("Nominees and winner · 15 shortlisted")).toBeVisible();
  await expect(documentary.getByText(/^(Won|Nominated)$/)).toHaveCount(5);
  await expect(documentary.getByRole("heading", { level: 3, name: "Shortlisted, not nominated (10)" })).toBeVisible();
  await expect(documentary.getByText("Shortlisted", { exact: true })).toHaveCount(10);

  const row = (title: string) => documentary.locator("div:has(> div > div > h3)").filter({ has: page.getByRole("link", { name: title, exact: true }) }).last();
  for (const title of ["Cover-Up", "My Undesirable Friends: Part I — Last Air in Moscow"]) {
    await expect(row(title).locator("[data-snub-risk]")).toHaveText("Snub risk");
  }
  const neighbor = row("The Perfect Neighbor");
  await expect(neighbor.locator("[data-snub-risk]")).toHaveCount(0);
  await expect(neighbor.getByText(/\d+ nominations · \d+ strong awards · Pick #\d+/)).toBeVisible();

  // International lists its full shortlist the same way, and never carries the flag.
  const international = page.getByRole("region", { name: "Best International Feature" });
  await expect(international.getByRole("heading", { level: 3, name: /^Shortlisted, not nominated \(\d+\)$/ })).toBeVisible();
  await expect(international.getByText(/^(Won|Nominated)$/)).toHaveCount(5);
  await expect(international.getByText(/Pick #\d+/).first()).toBeVisible();
  await expect(international.locator("[data-snub-risk]")).toHaveCount(0);
});

test("the live year before its shortlist looks as it did", async ({ page }) => {
  await page.goto("/awards/oscars/2026");
  const documentary = page.getByRole("region", { name: "Best Documentary Feature" });
  await expect(documentary.getByText("Shortlisted, not nominated")).toHaveCount(0);
  await expect(documentary.locator("[data-snub-risk]")).toHaveCount(0);
  await expect(documentary.getByText("The shortlist comes out", { exact: false })).toBeVisible();
});

test("the jump control links to each category and the year switcher keeps the page", async ({ page }) => {
  await page.goto("/awards/oscars/2024");
  await expect(page.getByRole("navigation", { name: "Jump to category" }).getByRole("link", { name: "Animated" })).toHaveAttribute("href", "#animated");
  await page.getByRole("button", { name: "Year: 2024" }).click();
  await page.getByRole("dialog", { name: "Choose a year" }).getByRole("link", { name: "2023" }).click();
  await expect(page).toHaveURL(/\/awards\/oscars\/2023$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Oscars 2023");
});

test("an unlisted year is the 404 page", async ({ page }) => {
  await page.goto("/awards/oscars/2011");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page isn't here");
});
