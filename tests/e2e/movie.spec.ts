// The movie page (task 1.13, guide §8.6): titles, flags, labelled marks, score tiles with a
// "–" and "No score yet" where a score is missing, and the Oscar result boxes. Reads only.
import { expect, test } from "@playwright/test";

test("/movies/im-still-here shows the titles, flags, marks and Oscar results", async ({ page }) => {
  await page.goto("/movies/im-still-here");
  await expect(page).toHaveTitle("I'm Still Here (2024) · Oscar Movies");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("I'm Still Here");
  await expect(page.getByText("Ainda Estou Aqui")).toHaveAttribute("lang", "pt-BR");
  await expect(page.getByText("2024 · Brazil, France · Portuguese")).toBeVisible();
  await expect(page.getByRole("img", { name: "Brazil" })).toBeVisible();
  await expect(page.getByRole("img", { name: "France" })).toBeVisible();
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
