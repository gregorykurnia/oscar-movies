// The nomination patterns page (task 8.5, guide §8.14): the five the patterns pick next to the
// real nominees, why the well-awarded films missed, the best predictors and the backtest, with the
// category in the address, reached from the race and the accuracy page. Reads only; no writes.
// 2024's own figures are fixed; the totals across seasons and the live year's state are read the
// way the page reads them (`live-patterns.ts`), as they move when a season's nominees load
// (on today's `test` data: 35 of 55 picked, 5 of 24 flagged got in, 2015–2025).
import { expect, test, type Page } from "@playwright/test";
import { LIVE_YEAR } from "../../src/lib/years";
import { backtestSpan, liveHeading, liveState, readPatterns } from "./live-patterns";

const title = (page: Page, scope: string, name: string) => page.locator(scope).getByRole("heading", { level: 3 }).filter({ has: page.getByRole("link", { name, exact: true }) });

test("2024 Documentary: the five it picked next to the real five, with hits and misses", async ({ page }) => {
  await page.goto("/patterns/2024");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("2024 nomination patterns");
  await expect(page.getByText("Best Documentary Feature · the films the patterns pick, and why the well-awarded ones miss")).toBeVisible();
  await expect(page.getByText("Worked out from earlier seasons only.")).toBeVisible();

  const five = page.locator("#five");
  await expect(five.getByRole("heading", { level: 2 })).toHaveText("The five it picked");
  await expect(five.getByText("4 of 5 were nominated")).toBeVisible();
  const [picked, nominated] = [five.locator("> div > div").nth(0), five.locator("> div > div").nth(1)];
  await expect(picked.locator("h3 a")).toHaveText(["No Other Land", "Soundtrack to a Coup d'Etat", "Dahomey", "Sugarcane", "Black Box Diaries"]);
  // The two hits and the miss among the five.
  await expect(title(page, "#five", "No Other Land").first()).toContainText("Nominated");
  await expect(picked.getByRole("heading", { level: 3 }).filter({ hasText: "Soundtrack to a Coup d'Etat" })).toContainText("Nominated");
  await expect(picked.getByRole("heading", { level: 3 }).filter({ hasText: "Dahomey" })).toContainText("Not nominated");
  // The Oscars' five: the winner first, the one the patterns ranked 8th not picked, an underdog.
  await expect(nominated.locator("h3 a").first()).toHaveText("No Other Land");
  await expect(nominated.locator("[data-winner]")).toHaveCount(1);
  await expect(nominated.getByRole("heading", { level: 3 }).filter({ hasText: "Porcelain War" })).toContainText("Not picked, ranked 8");
  await expect(nominated.getByRole("heading", { level: 3 }).filter({ hasText: "Black Box Diaries" })).toContainText("Picked #5");
  await expect(nominated.locator('[data-tag="underdog"]')).toHaveCount(3);
});

test("Will & Harper is among the misses with its reason, flagged Snub risk", async ({ page }) => {
  await page.goto("/patterns/2024");
  const missed = page.locator("#missed");
  await expect(missed.getByRole("heading", { level: 2 })).toHaveText("Why they missed");
  const row = missed.locator("[data-reasons]").first();
  await expect(row).toContainText("Among the most-nominated, but no Spirit or IDA nomination: 4 of 21 such films got in");
  // Most-nominated first: Will & Harper (41 nominations) leads, six rows then "Show all".
  await expect(missed.locator("h3 a").first()).toHaveText("Will & Harper");
  await expect(missed.locator("[data-snub-risk]").first()).toHaveText("Snub risk");
  await expect(missed.locator("h3 a")).toHaveCount(6);
  await missed.getByRole("button", { name: /Show all 10 films that missed/ }).click();
  await expect(missed.locator("h3 a")).toHaveCount(10);
  await expect(missed.getByRole("button", { name: /Show all/ })).toHaveCount(0);
});

test("the strip counts the flag, the tables show the learned figures and the best all-round predictors", async ({ page }) => {
  const data = await readPatterns("documentary");
  const span = backtestSpan(data);
  await page.goto("/patterns/2024");
  await expect(page.getByText(`Flagged films got in (Snub risk), ${span}`)).toBeVisible();
  await expect(page.getByText(`${data.flagged.hits} of ${data.flagged.count}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`Nominees the patterns picked, ${span}`)).toBeVisible();
  await expect(page.getByText(`${data.backtest.hits} of ${data.backtest.nominees}`, { exact: true }).first()).toBeVisible();

  const learned = page.locator("#learned");
  await expect(learned.getByRole("heading", { level: 2 })).toHaveText("What the patterns learned");
  await expect(learned.getByText("From the 12 seasons before 2024, 2012–2023")).toBeVisible();
  await expect(learned.getByRole("table", { name: "Patterns" }).getByRole("row")).toHaveCount(9);

  const predictors = page.locator("#predictors");
  const allRound = predictors.getByRole("row").filter({ has: page.getByRole("columnheader", { name: /Best all-round/ }) });
  await expect(allRound).toHaveCount(1);
  // The Spirit Awards nomination sits under best all-round (the rows after its group row, before the next).
  const names = await predictors.getByRole("row").evaluateAll((rows) =>
    rows.map((r) => (r.querySelector("th[scope=colgroup]") ? `# ${r.textContent}` : r.querySelector("td")?.textContent ?? "")),
  );
  const start = names.findIndex((n) => n.startsWith("# Best all-round"));
  const end = names.findIndex((n, i) => i > start && n.startsWith("# "));
  expect(names.slice(start + 1, end)).toContain("Spirit nominee");
  await expect(predictors.getByRole("columnheader", { name: /Wide nets/ })).toBeVisible();
  await expect(predictors.getByRole("columnheader", { name: /Warning signs/ })).toBeVisible();

  await expect(page.locator("#how li")).toHaveCount(5);
  const strip = page.locator("[data-backtest]");
  await expect(strip.getByRole("link", { name: /^2024/ })).toHaveAttribute("aria-current", "page");
  await expect(strip.getByText(`Current ${data.engineBacktest.hits}`, { exact: true })).toBeVisible();
  await expect(strip.getByText(span)).toBeVisible();
});

test("International has no Snub risk flag and two figures in its strip", async ({ page }) => {
  const data = await readPatterns("international");
  await page.goto("/patterns/2024?category=international");
  await expect(page.getByRole("link", { name: "International" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Best International Feature · the films the patterns pick")).toBeVisible();
  await expect(page.getByText(`${data.backtest.hits} of ${data.backtest.nominees}`, { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Flagged films got in")).toHaveCount(0);
  await expect(page.locator("[data-snub-risk]")).toHaveCount(0);
  await expect(page.locator("#how")).toContainText("New York critics");
  // The year switcher and the category control keep each other.
  await page.getByRole("button", { name: "Year: 2024" }).click();
  await page.getByRole("link", { name: "2023", exact: true }).click();
  await expect(page).toHaveURL(/\/patterns\/2023\?category=international$/);
  await page.getByRole("link", { name: "Documentary" }).click();
  await expect(page).toHaveURL(/\/patterns\/2023$/);
});

test("/patterns opens the live year in the state its season is in", async ({ page }) => {
  const state = liveState(await readPatterns("documentary"));
  await page.goto("/patterns");
  await expect(page).toHaveURL(new RegExp(`/patterns/${LIVE_YEAR}$`));
  await expect(page.getByRole("heading", { level: 2, name: liveHeading(state) })).toBeVisible();
  if (state === "before") {
    // Before the shortlist: the ranked contenders, no %, no flag (the most-awarded misses' flags are past years').
    await expect(page.getByText("The shortlist isn't out yet.")).toBeVisible();
    await expect(page.locator("#five [data-snub-risk]")).toHaveCount(0);
    await expect(page.getByText("To be nominated")).toHaveCount(0);
  } else if (state === "shortlist") {
    await expect(page.getByText("The shortlist is out.")).toBeVisible();
    await expect(page.locator("#five").getByText("To be nominated").first()).toBeVisible();
  }
  // Years the page doesn't cover are the 404 page.
  // (The 404 page streams in with a 200 status, as on the award pages.)
  await page.goto("/patterns/2014");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page isn't here");
});

test("the race's Documentary and International stage lines and the accuracy page lead to the page", async ({ page }) => {
  await page.goto(`/?category=documentary`);
  // All four categories' panels are in the page; only the open one shows.
  const link = page.locator("[data-patterns-link]:visible");
  await link.getByRole("link", { name: `Nomination patterns, ${LIVE_YEAR}` }).click();
  await expect(page).toHaveURL(new RegExp(`/patterns/${LIVE_YEAR}$`));
  await page.goto(`/?category=international`);
  await expect(link.getByRole("link")).toHaveAttribute("href", `/patterns/${LIVE_YEAR}?category=international`);
  await page.goto("/?category=picture");
  await expect(link).toHaveCount(0);
  await page.goto("/accuracy/documentary");
  await expect(page.getByRole("link", { name: `Nomination patterns, ${LIVE_YEAR}` })).toHaveAttribute("href", `/patterns/${LIVE_YEAR}`);
  await page.goto("/accuracy/international");
  await expect(page.getByRole("link", { name: `Nomination patterns, ${LIVE_YEAR}` })).toHaveAttribute("href", `/patterns/${LIVE_YEAR}?category=international`);
  await page.goto("/accuracy/picture");
  await expect(page.getByRole("link", { name: /Nomination patterns/ })).toHaveCount(0);
});

test.describe("at 390px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of ["/patterns/2024", "/patterns/2024?category=international", `/patterns/${LIVE_YEAR}`, "/patterns/2022"]) {
    test(`${path} never scrolls sideways`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // Open every "Show all" so the longest rows are measured too.
      const more = page.getByRole("button", { name: /^Show all/ });
      while ((await more.count()) > 0) await more.first().click();
      const wide = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(wide.scroll).toBeLessThanOrEqual(wide.client);
    });
  }
});
