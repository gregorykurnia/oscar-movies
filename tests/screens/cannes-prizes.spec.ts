import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

const OUT = "screenshots/phase-13";
const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 900 },
];
const FORTNIGHT = "Directors' Fortnight Audience Award";
const NOMINEE_STAT = "Award nominees with Oscar nominations";
const LOADED_AWARDS = [
  { slug: "bafta", title: "BAFTA 2025", year: 2025, category: "Best Film" },
  { slug: "golden-globes", title: "Globes 2024", year: 2024, category: "Best Motion Picture – Drama" },
  { slug: "doc-nyc", title: "DOC NYC 2025", year: 2025, category: "Winner's Circle" },
];
const EMPTY_AWARDS = [
  { slug: "bafta", title: "BAFTA 2026" },
  { slug: "golden-globes", title: "Globes 2026" },
  { slug: "pga", title: "PGA 2026" },
];

mkdirSync(`${OUT}/fresh-eyes`, { recursive: true });

async function open(page: Page, path: string, heading: string) {
  expect((await page.goto(path))?.ok(), path).toBe(true);
  await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
  const gutter = page.viewportSize()!.width >= 761 ? "32px" : "16px";
  await expect(page.getByRole("main")).toHaveCSS("padding-left", gutter);
}

async function capture(page: Page, name: string, focus?: Locator, fullPage = false) {
  if (focus) {
    await expect(focus).toBeVisible();
    await focus.evaluate((el) => el.scrollIntoView({ block: "start", behavior: "instant" }));
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
  await page.screenshot({ path: `${OUT}/${name}-${page.viewportSize()!.width}.png`, fullPage, scale: "css" });
}

async function showWhy(page: Page, title: string) {
  const panel = page.getByRole("tabpanel", { name: "International" });
  await expect(panel.getByRole("button", { name: /show why/ }).first()).toBeVisible();
  const film = panel.getByRole("link", { name: title, exact: true });
  if (!(await film.count())) await panel.getByRole("button", { name: /^Show all/ }).click();
  const row = film.locator("xpath=ancestor::div[.//button[contains(@aria-label, 'show why')]][1]");
  await row.getByRole("button", { name: /show why/ }).click();
  await expect(row.locator("[data-why]")).toBeVisible();
  return row;
}

function awardStats(category: Locator) {
  return category.getByText(NOMINEE_STAT, { exact: true }).locator("xpath=../..");
}

async function checkEmptyAward(page: Page) {
  await expect(page.getByRole("link", { name: "All years", exact: true })).toHaveCSS("white-space", "nowrap");
  const empty = page.getByRole("heading", { name: "No data for this year" }).locator("..");
  await expect(empty.locator("p")).toHaveCSS("text-wrap-style", "balance");
}

for (const viewport of VIEWPORTS) {
  test(`Cannes prizes at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);

    // The URL opens straight into a long prize name, even when results stream in below the header.
    await open(page, "/awards/cannes/2024#fortnight-audience-award", "Cannes 2024");
    await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveCount(10);
    const fortnight = page.getByRole("region", { name: FORTNIGHT, exact: true });
    const fortnightWinner = fortnight.locator("[data-winner]");
    await expect(fortnightWinner).toHaveCount(1);
    const figures = fortnight.getByText("Oscar nominees it caught").locator("xpath=../..");
    await expect.poll(() => figures.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").length))
      .toBe(viewport.width >= 1101 ? 4 : 1);
    await capture(page, "cannes-2024-fortnight", fortnight);
    if (viewport.width === 844) await capture(page, "cannes-2024-fortnight-winner", fortnightWinner);
    await capture(page, "cannes-2024", undefined, true);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    const jump = page.getByRole("navigation", { name: "Jump to category" });
    if (viewport.width >= 761) {
      await expect.poll(() => jump.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
    }
    await capture(page, "cannes-2024-navigation");
    await capture(page, "cannes-2024-first-prize", page.getByRole("region", { name: "Palme d'Or", exact: true }));
    await capture(page, "cannes-2024-last-prize", page.getByRole("region", { name: "Prize of the Ecumenical Jury" }));

    await open(page, "/awards/cannes/2023", "Cannes 2023");
    await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveCount(9);
    await expect(page.getByRole("region", { name: FORTNIGHT, exact: true })).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Jump to category" }).getByText(FORTNIGHT)).toHaveCount(0);
    await capture(page, "cannes-2023", undefined, true);
    await capture(page, "cannes-2023-last-prize", page.getByRole("region", { name: "Prize of the Ecumenical Jury" }));

    await open(page, "/awards/cannes/2020", "Cannes 2020");
    await expect(page.getByRole("heading", { name: "No data for this year" })).toBeVisible();
    await capture(page, "cannes-2020");

    // The seven new categories have no recorded ties. Use the Competition's actual 2025 tie.
    await open(page, "/awards/cannes/2025#jury-prize", "Cannes 2025");
    const tie = page.getByRole("region", { name: "Jury Prize", exact: true });
    await expect(tie.locator("[data-winner]").getByRole("heading")).toHaveText(["Sirāt", "Sound of Falling"]);
    await capture(page, "cannes-2025-tie", tie);

    await open(page, "/movies/the-zone-of-interest#awards-h", "The Zone of Interest");
    const zone = page.getByRole("group", { name: "Festivals" });
    await expect(zone.getByText(/Grand Prix/)).toHaveCount(1);
    await expect(zone.getByText(/FIPRESCI Prize: Competition/)).toHaveCount(1);
    await expect(zone.locator('[data-result="won"]')).toHaveCount(2);
    await capture(page, "movie-two-prizes", zone);

    await open(page, "/movies/a-poet#awards-h", "A Poet");
    const poet = page.getByRole("group", { name: "Festivals" });
    await expect(poet.getByText(/Un Certain Regard Jury Prize/)).toHaveCount(1);
    await expect(poet.getByText(/Un Certain Regard · Jury Prize/)).toHaveCount(0);
    await expect(poet.locator('[data-result="selected"]').getByText(/^(?:2025 · )?Un Certain Regard$/)).toBeVisible();
    await capture(page, "movie-a-poet", page.getByRole("region", { name: "Awards", exact: true }));

    await open(page, "/awards/2025", "Awards 2025");
    const festivals = page.getByRole("region", { name: "Festivals" });
    const cannes = festivals.getByRole("link", { name: /Cannes Film Festival/ });
    await expect(cannes.getByText("Picture, International", { exact: true })).toBeVisible();
    await capture(page, "awards-index-festivals", festivals);

    await open(page, "/festivals/cannes/2025", "Cannes 2025");
    const prized = page.locator('section[id^="section-"] [data-winner]');
    await expect(prized).toHaveCount(22);
    const captions = await prized.evaluateAll((rows) => rows.map((row) => ({
      section: row.closest("section")!.querySelector("h2")!.textContent!,
      title: row.querySelector("h3")!.textContent!,
      prizes: Array.from(row.querySelectorAll('[data-stage="won"]'), (pill) => pill.textContent!.replace(/^;\s*/, "")),
    })));
    for (const { title, prizes } of captions) {
      expect(prizes.length, title).toBeGreaterThan(0);
      expect(new Set(prizes.map((p) => p.toLowerCase())).size, title).toBe(prizes.length);
    }
    if (viewport.width === 390) {
      writeFileSync(`${OUT}/cannes-2025-lineup.tsv`, captions.map(({ section, title, prizes }) => [section, title, prizes.join("; ")].join("\t")).join("\n") + "\n");
      await prized.first().screenshot({ path: `${OUT}/lineup-first-prize-390.png`, scale: "css" });
      await prized.last().screenshot({ path: `${OUT}/lineup-last-prize-390.png`, scale: "css" });
    }
    await capture(page, "cannes-2025-lineup", undefined, true);
    const cake = prized.filter({ has: page.getByRole("heading", { name: "The President's Cake", exact: true }) });
    await expect(cake.locator('[data-stage="won"]')).toHaveText(["Caméra d'Or", "; Audience Award"]);
    await capture(page, "lineup-two-prizes", cake);

    await open(page, "/race/2025?category=international", "The 2025 race");
    await capture(page, "international-2025-why", await showWhy(page, "The Secret Agent"));
    // No 2025 finalist has a new Cannes prize among its top four results in the final forecast.
    await open(page, "/race/2026?category=international", "The 2026 race");
    const elephant = await showWhy(page, "Elephants in the Fog");
    await expect(elephant.locator("[data-why]").getByText("Won Cannes Un Certain Regard Jury Prize", { exact: true })).toBeVisible();
    await capture(page, "international-2026-why", elephant);
  });

  test(`Cannes fresh-eyes fixes at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);

    await open(page, "/awards/cannes/2020", "Cannes 2020");
    await checkEmptyAward(page);
    await capture(page, "cannes-2020", undefined, viewport.width === 844);

    await open(page, "/awards/cannes/2024#fortnight-audience-award", "Cannes 2024");
    const fortnight = page.getByRole("region", { name: FORTNIGHT, exact: true });
    const stats = awardStats(fortnight);
    await expect(stats.getByText("0 of 2", { exact: true })).toHaveCount(2);
    await expect(stats.locator(".bg-track")).toHaveCount(0);
    await capture(page, "cannes-2024-fortnight", fortnight);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await capture(page, "cannes-2024-navigation");

    await open(page, "/movies/a-poet#awards-h", "A Poet");
    const festivals = page.getByRole("group", { name: "Festivals" });
    await expect(festivals.getByText("Un Certain Regard Jury Prize", { exact: true })).toHaveCount(1);
    await expect(festivals.getByText("Un Certain Regard", { exact: true })).toBeVisible();
    // Match the baseline frame at the Awards heading, including the whole first award row.
    await capture(page, "movie-a-poet", page.getByRole("region", { name: "Awards", exact: true }));

    await open(page, "/awards/2025", "Awards 2025");
    const index = page.getByRole("region", { name: "Festivals" });
    await expect(index.getByRole("link", { name: /Cannes Film Festival/ })).toContainText("May 2025");
    await capture(page, "awards-index-festivals", index);

    for (const award of LOADED_AWARDS) {
      await open(page, `/awards/${award.slug}/${award.year}`, award.title);
      await expect(page.getByRole("link", { name: "All years", exact: true })).toHaveCSS("white-space", "nowrap");
      const category = page.getByRole("region", { name: award.category, exact: true });
      await expect(category.getByText(NOMINEE_STAT, { exact: true })).toBeVisible();
      await capture(page, `fresh-eyes/${award.slug}-${award.year}`, viewport.width === 844 ? awardStats(category) : category);
    }

    for (const award of EMPTY_AWARDS) {
      await open(page, `/awards/${award.slug}/2026`, award.title);
      await checkEmptyAward(page);
      await capture(page, `fresh-eyes/${award.slug}-2026`, undefined, true);
    }
  });
}
