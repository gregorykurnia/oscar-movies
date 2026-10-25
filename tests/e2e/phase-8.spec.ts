// Phase 8's Done-when scenario (task 8.8, IMPLEMENTATION_PLAN.md): from the race's Documentary tab
// to `/patterns/<live year>`; 2024's page with the five it picked, the misses and the underdogs;
// International's 2024 page; the accuracy page's footnote on the shortlist rule; the 2025
// Documentary shortlist on the Oscars year page with its flags, then a flagged film's movie page and
// its panel. Reads only. The expected rows come from the database through the same read the pages use
// (`queryPatterns`), so a change in the seeded data moves the page and the expectation together;
// only the stable anchors (the 2024 hits, the three flagged films) are written out.
import { expect, test, type Locator } from "@playwright/test";
import { createScriptDb } from "../../src/db";
import { queryPatterns, type PatternsData } from "../../src/data/patterns";
import { missedFilms, nomineesOf, picksOf } from "../../src/lib/patterns/page";
import type { PatternCategory } from "../../src/lib/patterns";
import { LIVE_YEAR } from "../../src/lib/years";
import { liveHeading, liveState } from "./live-patterns";

const { db, close } = createScriptDb();
test.afterAll(() => close());

const today = () => new Date().toISOString().slice(0, 10);
const read = (category: PatternCategory): Promise<PatternsData> => queryPatterns(db, category, today());
const seasonOf = (data: PatternsData, year: number) => {
  const season = data.seasons.find((s) => s.year === year);
  expect(season, `${data.category} ${year} season`).toBeTruthy();
  return season!;
};
const titleOf = (data: PatternsData, movie: string | number) => data.films[Number(movie)].title;
const titles = (region: Locator) => region.locator("h3 a").allTextContents();

test("the race's Documentary tab leads to the live year's patterns page", async ({ page }) => {
  await page.goto("/?category=documentary");
  await page.locator("[data-patterns-link]:visible").getByRole("link", { name: `Nomination patterns, ${LIVE_YEAR}` }).click();
  await expect(page).toHaveURL(new RegExp(`/patterns/${LIVE_YEAR}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${LIVE_YEAR} nomination patterns`);
  await expect(page.getByRole("heading", { level: 2, name: liveHeading(liveState(await read("documentary"))) })).toBeVisible();
});

test("2024 Documentary: the five it picked, the misses and the underdogs match the database", async ({ page }) => {
  const data = await read("documentary");
  const season = seasonOf(data, 2024);
  const winner = data.info[2024].winner;
  const picks = picksOf(season);
  const nominees = nomineesOf(season, winner);
  const missed = missedFilms(season);
  expect(picks).toHaveLength(5);
  expect(nominees).toHaveLength(5);
  expect(picks.filter((f) => f.nominated)).toHaveLength(4);

  await page.goto("/patterns/2024");
  const five = page.locator("#five");
  await expect(five.getByText(`${picks.filter((f) => f.nominated).length} of ${picks.length} were nominated`)).toBeVisible();
  const [pickedList, nomineeList] = [five.locator("> div > div").nth(0), five.locator("> div > div").nth(1)];
  expect(await titles(pickedList)).toEqual(picks.map((f) => titleOf(data, f.movie)));
  expect(await titles(nomineeList)).toEqual(nominees.map((f) => titleOf(data, f.movie)));
  // The anchors the plan names: two hits at the top of the five.
  expect(picks.slice(0, 2).map((f) => titleOf(data, f.movie))).toEqual(["No Other Land", "Soundtrack to a Coup d'Etat"]);
  for (const film of picks) {
    const row = pickedList.getByRole("heading", { level: 3 }).filter({ hasText: titleOf(data, film.movie) });
    await expect(row).toContainText(film.nominated ? "Nominated" : "Not nominated");
  }
  await expect(nomineeList.locator("[data-winner] h3 a, h3 a").first()).toHaveText(titleOf(data, winner!));
  await expect(nomineeList.locator("[data-winner]")).toHaveCount(1);

  // Underdogs: the nominees marked as such are the database's.
  const underdogs = nominees.filter((f) => f.underdog).map((f) => titleOf(data, f.movie));
  expect(underdogs.length).toBeGreaterThan(0);
  await expect(nomineeList.locator('[data-tag="underdog"]')).toHaveCount(underdogs.length);
  for (const name of underdogs) {
    await expect(nomineeList.getByRole("heading", { level: 3 }).filter({ hasText: name })).toBeVisible();
  }

  // The misses: most-nominated first, six rows then every one after "Show all".
  const misses = page.locator("#missed");
  await expect(misses.getByRole("heading", { level: 2 })).toHaveText("Why they missed");
  expect(missed.length).toBeGreaterThan(6);
  expect(await titles(misses)).toEqual(missed.slice(0, 6).map((f) => titleOf(data, f.movie)));
  await misses.getByRole("button", { name: new RegExp(`Show all ${missed.length} films that missed`) }).click();
  expect(await titles(misses)).toEqual(missed.map((f) => titleOf(data, f.movie)));
  // Every row gives its reasons; the flagged ones carry the flag.
  await expect(misses.locator("[data-reasons]")).toHaveCount(missed.length);
  await expect(misses.locator("[data-snub-risk]")).toHaveCount(missed.filter((f) => f.snubRisk.length > 0).length);
  expect(missed[0] && titleOf(data, missed[0].movie)).toBe("Will & Harper");
  expect(missed[0].snubRisk.length).toBeGreaterThan(0);

  // The strip's records are the database's.
  await expect(page.getByText(`${data.flagged.hits} of ${data.flagged.count}`).first()).toBeVisible();
  await expect(page.getByText(`${data.backtest.hits} of ${data.backtest.nominees}`).first()).toBeVisible();
});

test("2024 International: its five and its misses, with no Snub risk flag", async ({ page }) => {
  const data = await read("international");
  const season = seasonOf(data, 2024);
  const picks = picksOf(season);
  const nominees = nomineesOf(season, data.info[2024].winner);
  const missed = missedFilms(season);

  await page.goto("/patterns/2024?category=international");
  await expect(page.getByRole("link", { name: "International" })).toHaveAttribute("aria-current", "page");
  const five = page.locator("#five");
  await expect(five.getByText(`${picks.filter((f) => f.nominated).length} of ${picks.length} were nominated`)).toBeVisible();
  const [pickedList, nomineeList] = [five.locator("> div > div").nth(0), five.locator("> div > div").nth(1)];
  expect(await titles(pickedList)).toEqual(picks.map((f) => titleOf(data, f.movie)));
  expect(await titles(nomineeList)).toEqual(nominees.map((f) => titleOf(data, f.movie)));
  const misses = page.locator("#missed");
  expect(missed.length).toBeGreaterThan(0);
  expect((await titles(misses))[0]).toBe(titleOf(data, missed[0].movie));
  expect(season.films.filter((f) => f.snubRisk.length > 0)).toHaveLength(0);
  await expect(page.locator("[data-snub-risk]")).toHaveCount(0);
  await expect(page.getByText("Flagged films got in")).toHaveCount(0);
  await expect(page.getByText(`${data.backtest.hits} of ${data.backtest.nominees}`).first()).toBeVisible();
});

test("the accuracy page footnotes the shortlist rule for Documentary and International only", async ({ page }) => {
  for (const category of ["documentary", "international"]) {
    await page.goto(`/accuracy/${category}`);
    await expect(page.getByText(/^Documentary and International count only films that made the Oscar shortlist\./)).toBeVisible();
    await expect(page.getByText(/A winner or nominee that didn't make that season's shortlist/)).toBeVisible();
  }
  await page.goto("/accuracy/picture");
  await expect(page.getByText("count only films that made the Oscar shortlist")).toHaveCount(0);
});

test("/awards/oscars/2025 lists Documentary's shortlist with its flags, and a flagged film's page shows its panel", async ({ page }) => {
  const data = await read("documentary");
  const season = seasonOf(data, 2025);
  const shortlisted = season.films.filter((f) => f.nominated === false);
  const flagged = season.films.filter((f) => f.nominated === false && f.snubRisk.length > 0).map((f) => titleOf(data, f.movie));
  expect(season.films).toHaveLength(15);
  expect(shortlisted).toHaveLength(10);
  for (const name of ["Cover-Up", "My Undesirable Friends: Part I — Last Air in Moscow"]) expect(flagged).toContain(name);
  expect(flagged).not.toContain("The Perfect Neighbor");

  await page.goto("/awards/oscars/2025");
  const documentary = page.getByRole("region", { name: "Best Documentary Feature" });
  await expect(documentary.getByRole("heading", { level: 3, name: `Shortlisted, not nominated (${shortlisted.length})` })).toBeVisible();
  // Every flag on the section belongs to a flagged film, and none is missing.
  await expect(documentary.locator("[data-snub-risk]")).toHaveCount(season.films.filter((f) => f.snubRisk.length > 0).length);
  const row = (title: string) =>
    documentary.locator("div:has(> div > div > h3)").filter({ has: page.getByRole("link", { name: title, exact: true }) }).last();
  for (const name of flagged) await expect(row(name).locator("[data-snub-risk]")).toHaveText("Snub risk");
  await expect(row("The Perfect Neighbor").locator("[data-snub-risk]")).toHaveCount(0);

  // From the flagged film's row to its movie page and the panel.
  const slug = data.films[Number(season.films.find((f) => titleOf(data, f.movie).startsWith("My Undesirable Friends"))!.movie)].slug;
  await row("My Undesirable Friends: Part I — Last Air in Moscow").getByRole("link", { name: "My Undesirable Friends: Part I — Last Air in Moscow", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/movies/${slug}$`));
  const panel = page.getByRole("region", { name: "Nomination patterns" });
  await expect(panel.getByText("2025 · Best Documentary Feature")).toBeVisible();
  const film = season.films.find((f) => titleOf(data, f.movie).startsWith("My Undesirable Friends"))!;
  await expect(panel.getByText(`Pick #${film.pick} of 15`)).toBeVisible();
  await expect(panel.getByText("Not nominated", { exact: true })).toBeVisible();
  await expect(panel.getByText("Snub risk", { exact: false }).first()).toContainText(/flagged, and missed/i);
  await expect(panel.locator("[data-risk-reason]")).toHaveCount(film.snubRisk.length);
  await expect(panel.locator("[data-risk-reason]", { hasText: "critics' sweep" })).toContainText("1 of 4");
  await expect(panel.getByRole("link", { name: /All of 2025.s nomination patterns/ })).toHaveAttribute("href", "/patterns/2025");
});
