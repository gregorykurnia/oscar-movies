import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { and, eq, isNull } from "drizzle-orm";
import { revalidateTags } from "../../scripts/lib/load";
import { createScriptDb } from "../../src/db";
import { movies } from "../../src/db/schema";

const SHAPES = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 900 },
];
const FILM = { slug: "you-can-see-everything", title: "You Can See Everything" };
const fixtureScore = 4.13;
const fixtureDate = new Date("2026-11-21T00:00:00Z");
const out = "screenshots/phase-12/12.1";

async function shot(page: Page, name: string, crop?: Locator) {
  mkdirSync(out, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  const options = { path: `${out}/${name}-${page.viewportSize()!.width}.png`, animations: "disabled" } as const;
  if (crop) await crop.screenshot(options);
  else await page.screenshot(options);
}

async function showInLandscape(page: Page, content: Locator, start?: Locator) {
  const viewport = page.viewportSize()!;
  if (viewport.width !== 844) return;
  const box = (await content.boundingBox())!;
  const first = start ? (await start.boundingBox())!.y - 16 : 0;
  const scroll = Math.max(first, box.y + box.height + 12 - viewport.height);
  if (scroll > 0) await page.evaluate((top) => window.scrollBy({ top, behavior: "instant" }), scroll);
}

async function expectSingleLine(average: Locator) {
  await expect(average).toBeVisible();
  expect(await average.evaluate(async (element) => {
    await document.fonts.ready;
    const text = document.createRange();
    text.selectNodeContents(element);
    const line = element.parentElement!.getBoundingClientRect();
    return { lines: text.getClientRects().length, fits: text.getBoundingClientRect().right <= line.right + 0.5 };
  })).toEqual({ lines: 1, fits: true });
}

async function expectAlignedTiles(tiles: Locator) {
  const tops = await tiles.locator(":scope > div > div:nth-child(2)").evaluateAll(async (values) => {
    await document.fonts.ready;
    return values.map((value) => Math.round(value.getBoundingClientRect().top));
  });
  expect(tops).toHaveLength(6);
  expect(tops).toEqual(Array(6).fill(tops[0]));
  expect(await tiles.evaluate((strip) => strip.scrollWidth - strip.clientWidth)).toBeLessThanOrEqual(1);
}

test("Letterboxd average across the Documentary race, movie and styleguide", async ({ page }) => {
  test.setTimeout(180_000);
  // The guarded test branch has no 2026 film with all five sources. Supply just the
  // Documentary leader's missing Letterboxd rating, then remove this fixture alone.
  const { db, close } = createScriptDb();
  const slug = eq(movies.slug, FILM.slug);
  try {
    const [film] = await db.update(movies).set({ lbRating: fixtureScore, lbAt: fixtureDate })
      .where(and(slug, isNull(movies.lbRating), isNull(movies.lbAt))).returning();
    expect(film).toMatchObject({ year: 2026, imdbRating: 9, rtScore: 100, mcScore: 98, tmdbScore: 8.9 });
    expect(await revalidateTags(["scores"])).toMatch(/^Expired/);

    // (90 + 100 + 98 + 89 + 82.6) / 5 = 91.92. The stored 91.9 displays as 92.
    const filmAverage = "92 · 5 of 5";
    for (const shape of SHAPES) {
      await page.setViewportSize(shape);
      await page.goto("/race/2026?category=documentary");
      const panel = page.getByRole("tabpanel");
      const raceTitle = panel.getByRole("heading", { name: FILM.title, exact: true });
      const row = raceTitle.locator("../../..");
      const raceAverage = raceTitle.locator("..").getByText(filmAverage, { exact: true });
      await expectSingleLine(raceAverage);
      const scoreSpans = raceAverage.locator("..").locator("span");
      await expect(scoreSpans).toHaveText([
        "IMDb 9.0", "RT 100", "MC 98", "TMDB 8.9", "Letterboxd 4.1", filmAverage,
      ]);
      const scrollRight = page.getByRole("button", { name: "Scroll categories right" });
      if (shape.width < 761) await expect(scrollRight).toBeVisible();
      if (shape.width === 844) {
        const scoreLines = await scoreSpans.evaluateAll((items) => new Set(items.map((item) => item.getBoundingClientRect().top)).size);
        expect(scoreLines).toBe(1);
        const precursor = raceTitle.locator("..").locator("[data-precursors]");
        expect(await precursor.evaluate((line) => line.getBoundingClientRect().height / parseFloat(getComputedStyle(line).lineHeight))).toBeLessThan(1.5);
        const label = (await panel.locator("[data-columns] > span").first().boundingBox())!;
        const chance = (await row.locator("p").filter({ hasText: "87%" }).boundingBox())!;
        expect(Math.abs(label.x + label.width - chance.x - chance.width)).toBeLessThan(1);
      }
      await showInLandscape(page, row, page.getByRole("tablist"));
      await shot(page, "documentary");
      if (shape.width === 360) {
        await scrollRight.click();
        const scrollLeft = page.getByRole("button", { name: "Scroll categories left" });
        await expect(scrollLeft).toBeVisible();
        await expect(scrollRight).toBeHidden();
        const animated = page.getByRole("tab", { name: "Animated", exact: true });
        const end = (await animated.boundingBox())!;
        expect(end.x + end.width).toBeLessThan(shape.width);
        await expect(page.getByRole("tab", { name: "Documentary", exact: true })).toHaveAttribute("aria-selected", "true");
        await shot(page, "documentary-tabs-end", page.getByRole("tablist").locator(".."));
        await scrollLeft.click();
        await expect(scrollRight).toBeVisible();
      }
      await shot(page, "documentary-row", row);

      await raceTitle.getByRole("link").click();
      await expect(page).toHaveURL(new RegExp(`/movies/${FILM.slug}$`));
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(FILM.title);
      const tiles = page.getByText("5 of 5 scores", { exact: true }).locator("../..");
      await expect(tiles.locator(":scope > div > div:first-child")).toHaveText([
        "IMDb", "Rotten Tomatoes", "Metacritic", "TMDB", "Letterboxd", "Average",
      ]);
      await expect(tiles.getByText("92", { exact: true })).toBeVisible();
      if (shape.width >= 761) await expectAlignedTiles(tiles);
      const date = tiles.getByText("Updated 23 Oct", { exact: true });
      const gap = await date.evaluate(async (element) => {
        await document.fonts.ready;
        const range = document.createRange();
        const text = element.firstChild!;
        range.setStart(text, 8);
        range.setEnd(text, 10);
        const day = range.getBoundingClientRect();
        range.setStart(text, 11);
        range.setEnd(text, 14);
        return range.getBoundingClientRect().left - day.right;
      });
      expect(gap).toBeGreaterThan(3);
      await showInLandscape(page, tiles);
      await shot(page, "movie");
      await shot(page, "movie-tiles", tiles);

      await page.goto("/styleguide#scores");
      const board = page.locator("#scores");
      await expectSingleLine(board.getByText("84 · 5 of 5", { exact: true }));
      await expectSingleLine(board.getByText("83 · 4 of 5", { exact: true }));
      const empty = board.getByText("No scores yet", { exact: true });
      await expect(empty.locator("..").locator("span")).toHaveText([
        "IMDb –", "RT –", "MC –", "TMDB –", "Letterboxd –", "No scores yet",
      ]);
      if (shape.width >= 761) await expectAlignedTiles(board.getByText("4 of 5 scores", { exact: true }).locator("../.."));
      await shot(page, "styleguide", board);
    }

    await page.route("**/task-12.1-reference", (route) => route.fulfill({
      contentType: "text/html",
      body: readFileSync("design-preview.html", "utf8"),
    }));
    await page.setViewportSize(SHAPES[3]);
    await page.goto("/task-12.1-reference");
    await page.locator(".tiles").screenshot({ path: `${out}/reference-tiles.png` });
    await page.locator('[data-w="p360"]').click();
    const referenceTabs = page.locator(".frame .tabs-frame").first();
    await expect(referenceTabs.getByRole("button", { name: "Scroll categories right" })).toBeVisible();
    await referenceTabs.screenshot({ path: `${out}/reference-tabs-360.png` });
  } finally {
    try {
      await db.update(movies).set({ lbRating: null, lbAt: null })
        .where(and(slug, eq(movies.lbRating, fixtureScore), eq(movies.lbAt, fixtureDate)));
      expect(await revalidateTags(["scores"])).toMatch(/^Expired/);
    } finally {
      await close();
    }
  }
});

test("race tab and chance layout in Picture, International and a finished Animated race", async ({ page }) => {
  test.setTimeout(150_000);
  const races = [
    { name: "picture", url: "/race/2026", category: "Picture" },
    { name: "international", url: "/race/2026?category=international", category: "International" },
    { name: "animated", url: "/race/2024?category=animated", category: "Animated" },
  ];
  for (const shape of SHAPES) {
    await page.setViewportSize(shape);
    for (const race of races) {
      await page.goto(race.url);
      const tab = page.getByRole("tab", { name: new RegExp(`^${race.category}`) });
      await expect(tab).toHaveAttribute("aria-selected", "true");
      const row = page.getByRole("tabpanel").getByRole("heading", { level: 3 }).first().locator("../../..");
      await expect(row.getByText(/^IMDb /).first()).toBeVisible();
      if (shape.width < 761) {
        const previous = page.getByRole("button", { name: "Scroll categories left" });
        const next = page.getByRole("button", { name: "Scroll categories right" });
        await expect(race.name === "animated" ? previous : next).toBeVisible();
        const left = await previous.isVisible() ? await previous.boundingBox() : null;
        const right = await next.isVisible() ? await next.boundingBox() : null;
        const box = (await tab.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(left ? left.x + left.width : 0);
        expect(box.x + box.width).toBeLessThanOrEqual(right?.x ?? shape.width);
      }
      await showInLandscape(page, row, page.getByRole("tablist"));
      await shot(page, `race-${race.name}`);
    }
  }
});

test("score tile layout on three other films with full, partial and missing scores", async ({ page }) => {
  test.setTimeout(150_000);
  const films = [
    { slug: "conclave", title: "Conclave", count: "5 of 5 scores" },
    { slug: "im-still-here", title: "I'm Still Here", count: "4 of 5 scores" },
    { slug: "baghdad-messi", title: "Baghdad Messi", count: "No scores yet" },
  ];
  for (const shape of SHAPES) {
    await page.setViewportSize(shape);
    for (const film of films) {
      await page.goto(`/movies/${film.slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(film.title);
      const tiles = page.getByText(film.count, { exact: true }).locator("../..");
      await expect(tiles.getByText("Letterboxd", { exact: true })).toBeVisible();
      if (film.slug === "baghdad-messi") await expect(tiles.getByText("No score yet", { exact: true })).toHaveCount(5);
      if (shape.width >= 761) await expectAlignedTiles(tiles);
      await showInLandscape(page, tiles);
      await shot(page, film.slug === "baghdad-messi" ? "no-scores" : `movie-${film.slug}`);
    }
  }
});

test("Letterboxd average on the Watch list", async ({ page }) => {
  test.setTimeout(90_000);
  for (const shape of SHAPES) {
    await page.setViewportSize(shape);
    await page.goto("/watch-list");
    const watchTitle = page.getByRole("heading", { name: "Conclave", exact: true });
    // Conclave: (74 + 93 + 79 + 72 + 78.4) / 5 = 79.28.
    await expectSingleLine(watchTitle.locator("..").getByText("79 · 5 of 5", { exact: true }));
    await shot(page, "watch-list");
    await shot(page, "watch-list-row", watchTitle.locator("../../.."));
  }
});
