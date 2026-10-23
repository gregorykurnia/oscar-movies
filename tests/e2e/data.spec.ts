// The data coverage page (task 3.5, guide §8.9): the stats strip, the coverage strips with their
// legend, and each source's credit word for word, with TMDB's official logo. Reads only. The scores
// notice depends on when `test` last refreshed scores, so the spec checks it against the figure
// beside it rather than a fixed state (its rule is unit tested in `src/lib/coverage.test.ts`).
import { expect, test } from "@playwright/test";

test("/data shows the stats strip and a coverage strip per award with a legend", async ({ page }) => {
  await page.goto("/data");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Data and sources");
  await expect(page.getByText("Award years loaded")).toBeVisible();
  await expect(page.getByText("Films", { exact: true })).toBeVisible();
  await expect(page.getByText("Scores last refreshed")).toBeVisible();

  const table = page.getByRole("table", { name: "Which award years are loaded" });
  const oscars = table.getByRole("row", { name: /Academy Awards/ }).filter({ has: page.getByRole("img") });
  await expect(oscars).toHaveCount(1);
  await expect(oscars.getByRole("img")).toHaveAttribute("aria-label", /Academy Awards: \d+ of 15 years loaded/);
  await expect(oscars.locator("i[data-cell]")).toHaveCount(15);
  await expect(oscars.locator('i[data-cell="live"], i[data-cell="none"]').last()).toBeVisible();

  const legend = page.getByRole("list", { name: "Legend" });
  for (const word of ["Loaded", "Partly loaded", "No data", "Live season"]) {
    await expect(legend.getByText(word, { exact: true })).toBeVisible();
  }
});

test("/data's scores notice appears only when scores are missing or more than 3 days old", async ({ page }) => {
  await page.goto("/data");
  const notice = page.locator('[data-tone="neutral"]').filter({ hasText: /Scores (are \d+ days old|haven't been refreshed yet)\./ });
  const refreshed = await page.getByText("Scores last refreshed").locator("xpath=preceding-sibling::p[1]").innerText();
  if (refreshed.trim() === "–") {
    await expect(notice).toContainText("Films show “–” for each score until the first refresh.");
  } else {
    // A date shows; the notice is there only when that date is more than 3 days back.
    const shown = new Date(`${refreshed.trim()} ${refreshed.trim().length > 6 ? "" : new Date().getUTCFullYear()} UTC`);
    const old = Date.now() - shown.getTime() > 4 * 24 * 60 * 60 * 1000;
    const fresh = Date.now() - shown.getTime() < 3 * 24 * 60 * 60 * 1000;
    if (old) await expect(notice).toContainText("The daily refresh may have stopped.");
    if (fresh) await expect(notice).toHaveCount(0);
  }
});

test("/data's Sources read as the guide gives them, with TMDB's logo unaltered", async ({ page }) => {
  await page.goto("/data");
  const sources = page.getByRole("region", { name: "Sources" });
  const card = (name: string) => sources.getByRole("article").filter({ has: page.getByRole("heading", { name, exact: true }) });

  await expect(card("TMDB")).toContainText(
    "This product uses the TMDB API but is not endorsed or certified by TMDB. Film details and the TMDB user score.",
  );
  const logo = card("TMDB").getByRole("img", { name: "TMDB" });
  await expect(logo).toHaveAttribute("src", /tmdb-logo\.svg/);
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  await expect(card("Wikipedia")).toContainText(
    "Award results, shortlists, submissions and lineups are based on Wikipedia articles, used under CC BY-SA 4.0.",
  );
  await expect(card("Wikipedia").getByRole("link", { name: "CC BY-SA 4.0" })).toHaveAttribute("href", /creativecommons\.org/);
  await expect(card("IMDb")).toContainText(
    "Information courtesy of IMDb (imdb.com). Used with permission. IMDb ratings from IMDb's non-commercial datasets.",
  );
  await expect(card("OMDb API")).toContainText("Rotten Tomatoes (Tomatometer) and Metacritic scores.");
  await expect(card("Wikidata")).toContainText("Links between Wikipedia, IMDb and TMDB, under CC0.");
});

test("the footer's link reaches /data", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Data coverage and sources" }).click();
  await expect(page).toHaveURL(/\/data$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Data and sources");
});
