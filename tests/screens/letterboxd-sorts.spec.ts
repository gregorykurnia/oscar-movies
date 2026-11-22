// Phase 12 check (12.R): every sort by average still runs highest first with "No scores yet" last,
// now that Letterboxd counts in the stored average. The Secret Agent (IMDb 7.2, RT 98, MC 91,
// TMDB 7.1, Letterboxd 3.80) fell from 83.0 to 81.6, so it now follows Train Dreams (82.1) and
// still leads Hamnet (81.3, no Letterboxd) in the 2025 Picture grid.
import { mkdirSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const out = "screenshots/phase-12/12.R";

/** The leading number of each line, or null for "No scores yet", in page order. */
async function averages(lines: Locator, pattern: RegExp): Promise<Array<number | null>> {
  const texts = await lines.allInnerTexts();
  return texts.map((text) => {
    const flat = text.replace(/\s+/g, " ").trim();
    if (/No scores yet/.test(flat)) return null;
    const match = flat.match(pattern);
    expect(match, `no average in "${flat}"`).not.toBeNull();
    return Number(match![1]);
  });
}

function expectHighestFirst(values: Array<number | null>, atLeast = 2) {
  expect(values.length).toBeGreaterThanOrEqual(atLeast);
  const firstMissing = values.indexOf(null);
  const scored = firstMissing === -1 ? values : values.slice(0, firstMissing);
  // Nothing scored after the first film with no scores.
  if (firstMissing !== -1) expect(values.slice(firstMissing).every((v) => v === null)).toBe(true);
  for (let i = 1; i < scored.length; i++) expect(scored[i]!).toBeLessThanOrEqual(scored[i - 1]!);
}

async function shot(page: Page, name: string) {
  mkdirSync(out, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `${out}/${name}-${page.viewportSize()!.width}.png` });
}

test.use({ viewport: { width: 1280, height: 900 } });

test("the year grid's average sort follows the Letterboxd average", async ({ page }) => {
  await page.goto("/grid/2025?category=picture&sort=average");
  const rows = page.locator("tbody th[scope=row]");
  const values = await averages(rows.locator("span.block.text-micro"), /^(\d+) average/);
  expectHighestFirst(values);
  const titles = (await rows.allInnerTexts()).map((t) => t.split("\n")[0].trim());
  const at = (title: string) => {
    const index = titles.indexOf(title);
    expect(index, title).toBeGreaterThanOrEqual(0);
    return index;
  };
  expect(at("Train Dreams")).toBeLessThan(at("The Secret Agent"));
  expect(at("The Secret Agent")).toBeLessThan(at("Hamnet"));
  const moved = rows.filter({ hasText: "The Secret Agent" });
  await expect(moved).toContainText("82 average · Letterboxd 3.8");
  // Frame the moved film between the films around it.
  await moved.evaluate((row) => row.scrollIntoView({ block: "center", behavior: "instant" }));
  await shot(page, "grid-picture-average");
});

test("the submissions average sort follows the Letterboxd average", async ({ page }) => {
  await page.goto("/submissions/2025?sort=average");
  const lines = page.locator("main p").filter({ hasText: /^IMDb / });
  expectHighestFirst(await averages(lines, /(\d+) · [1-5] of 5$/));
  await shot(page, "submissions-average");
});

test("the Watch list average sort follows the Letterboxd average", async ({ page }) => {
  await page.goto("/watch-list?sort=average");
  const lines = (id: string) => page.locator(`section[aria-labelledby='${id}-h'] p`).filter({ hasText: /^IMDb / });
  // Want to watch holds a film or two on test; the season section holds the live year's films.
  expectHighestFirst(await averages(lines("want"), /(\d+) · [1-5] of 5$/), 1);
  expectHighestFirst(await averages(lines("season"), /(\d+) · [1-5] of 5$/));
  await shot(page, "watch-list-average");
});
