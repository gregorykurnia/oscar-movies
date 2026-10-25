// The movie page (task 1.13, guide §8.6): titles, flags, labelled marks, score tiles with a
// "–" and "No score yet" where a score is missing, and the Oscar result boxes. Reads only.
import { expect, test } from "@playwright/test";

test("/movies/im-still-here shows the titles, flags, marks and Oscar results", async ({ page }) => {
  await page.goto("/movies/im-still-here");
  await expect(page).toHaveTitle("I'm Still Here (2024) · Oscar Movies");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("I'm Still Here");
  await expect(page.getByText("Ainda Estou Aqui")).toHaveAttribute("lang", "pt-BR");
  await expect(page.getByText("2024 · Brazil, France · Portuguese")).toBeVisible();
  // One flag, the primary country's; every country is named in the text above.
  await expect(page.getByRole("img", { name: "Brazil" })).toBeVisible();
  await expect(page.getByRole("img", { name: "France" })).toHaveCount(0);
  // Labelled marks, not the round ones.
  await expect(page.getByRole("button", { name: /^(Mark as watched|Watched)$/ })).toHaveText("Watched");
  await expect(page.getByRole("button", { name: /^(Add to want to watch|Want to watch)$/ })).toHaveText("Want to watch");

  const oscars = page.getByRole("region", { name: "Oscars" });
  await expect(oscars.getByText("97th Academy Awards, 2 Mar 2025")).toBeVisible();
  const international = oscars.locator("li", { hasText: "Best International Feature" });
  await expect(international).toHaveAttribute("data-outcome", "won");
  await expect(international.getByText("Submitted by Brazil")).toBeVisible();
  await expect(international.getByText("Won", { exact: true })).toBeVisible();
  const picture = oscars.locator("li", { hasText: "Best Picture" });
  await expect(picture).toHaveAttribute("data-outcome", "nominated");
  await expect(picture.getByText("One of 10 nominees")).toBeVisible();
});

test("a 2024 Best Picture nominee lists its won, nominated and not nominated awards", async ({ page }) => {
  await page.goto("/movies/the-brutalist");
  const awards = page.getByRole("region", { name: "Awards" });
  const major = awards.getByRole("group", { name: "Major awards" });
  const row = (slug: string) => major.locator(`li:has(a[href="/awards/${slug}/2024"])`);
  await expect(row("golden-globes")).toHaveAttribute("data-result", "won");
  await expect(row("golden-globes").getByText("Won", { exact: true })).toBeVisible();
  await expect(row("bafta")).toHaveAttribute("data-result", "nominated");
  await expect(row("bafta").getByText("Nominated", { exact: true })).toBeVisible();
  await expect(row("spirit-awards")).toHaveAttribute("data-result", "not_nominated");
  await expect(row("spirit-awards").getByText("Not nominated", { exact: true })).toBeVisible();
  // Won first, not nominated last.
  const order = await major.getByRole("listitem").evaluateAll((items) => items.map((i) => i.getAttribute("data-result")));
  expect(order.indexOf("won")).toBeLessThan(order.indexOf("nominated"));
  expect(order.lastIndexOf("nominated")).toBeLessThan(order.indexOf("not_nominated"));
});

test("a 2024 film with no scores shows – and No score yet in every tile", async ({ page }) => {
  await page.goto("/movies/baghdad-messi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Baghdad Messi");
  for (const source of ["IMDb", "Rotten Tomatoes", "Metacritic", "TMDB"]) {
    const tile = page.locator("[data-missing]", { hasText: source });
    await expect(tile).toContainText("–");
    await expect(tile).toContainText("No score yet");
  }
  await expect(page.getByText("No scores yet")).toBeVisible();
});

test("a film with some scores shows the dates and the count of scores", async ({ page }) => {
  await page.goto("/movies/im-still-here");
  await expect(page.getByText(/^Updated \d+ \w{3}/).first()).toBeVisible();
  await expect(page.getByText(/^\d of 4 scores$/)).toBeVisible();
});

test("an unknown slug shows the 404 page", async ({ page }) => {
  await page.goto("/movies/no-such-film-2024");
  await expect(page.getByText("This page isn't here")).toBeVisible();
});

// Nomination patterns panel and Strong tag (task 8.7, guide §8.6). Figures are the seeded `test` data's.
test("a flagged shortlisted film shows its panel with Snub risk, its reasons and Strong tags", async ({ page }) => {
  await page.goto("/movies/my-undesirable-friends-part-i-last-air-in-moscow");
  const panel = page.getByRole("region", { name: "Nomination patterns" });
  await expect(panel.getByText("2025 · Best Documentary Feature")).toBeVisible();
  await expect(panel.getByText("Pattern", { exact: true })).toBeVisible();
  await expect(panel.getByText(/^Pick #\d+ of 15$/)).toBeVisible();
  await expect(panel.getByText("Oscar result")).toBeVisible();
  await expect(panel.getByText("Not nominated", { exact: true })).toBeVisible();
  await expect(panel.getByText("Snub risk", { exact: false }).first()).toContainText(/flagged, and missed/i);
  await expect(panel.locator("[data-risk-reason]", { hasText: "critics' sweep" })).toContainText("1 of 4");
  await expect(panel.getByRole("link", { name: /All of 2025.s nomination patterns/ })).toHaveAttribute("href", "/patterns/2025");
  // The panel sits between Oscars and Awards.
  const order = await page.locator("main h2").allTextContents();
  expect(order.indexOf("Oscars")).toBeLessThan(order.indexOf("Nomination patterns"));
  expect(order.indexOf("Nomination patterns")).toBeLessThan(order.indexOf("Awards"));

  // Strong tags on the results at the season's strong awards.
  const awards = page.getByRole("region", { name: "Awards" });
  for (const slug of ["new-york-critics", "los-angeles-critics", "national-society", "spirit-awards"]) {
    await expect(awards.locator(`li:has(a[href="/awards/${slug}/2025"])`).locator('[data-tag="strong"]')).toHaveText("Strong");
  }
});

test("an unflagged shortlisted film shows its panel with no flag", async ({ page }) => {
  await page.goto("/movies/the-perfect-neighbor");
  const panel = page.getByRole("region", { name: "Nomination patterns" });
  await expect(panel.getByText("Oscar result")).toBeVisible();
  await expect(panel.getByText(/Snub risk/)).toHaveCount(0);
  await expect(panel.locator("[data-risk-reason]")).toHaveCount(0);
});

test("a film never shortlisted has no panel and no Strong tag", async ({ page }) => {
  await page.goto("/movies/the-brutalist");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The Brutalist");
  await expect(page.getByRole("region", { name: "Nomination patterns" })).toHaveCount(0);
  await expect(page.locator('[data-tag="strong"]')).toHaveCount(0);
});
