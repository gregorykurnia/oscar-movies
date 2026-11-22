import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Locator } from "@playwright/test";
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
}

test("Letterboxd average across the Documentary race, movie, Watch list and styleguide", async ({ page }) => {
  test.setTimeout(180_000);
  mkdirSync(out, { recursive: true });
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
    // Conclave's test scores: (74 + 93 + 79 + 72 + 78.4) / 5 = 79.28.
    const watchAverage = "79 · 5 of 5";

    for (const shape of SHAPES) {
      const shot = async (name: string, crop?: Locator) => {
        await page.evaluate(() => document.fonts.ready);
        const options = { path: `${out}/${name}-${shape.width}.png`, animations: "disabled" } as const;
        if (crop) await crop.screenshot(options);
        else await page.screenshot(options);
      };

      await page.setViewportSize(shape);
      await page.goto("/race/2026?category=documentary");
      const raceTitle = page.getByRole("tabpanel").getByRole("heading", { name: FILM.title, exact: true });
      const raceAverage = raceTitle.locator("..").getByText(filmAverage, { exact: true });
      await expectSingleLine(raceAverage);
      await expect(raceAverage.locator("..").locator("span")).toHaveText([
        "IMDb 9.0", "RT 100", "MC 98", "TMDB 8.9", "Letterboxd 4.1", filmAverage,
      ]);
      await shot("documentary");
      await shot("documentary-row", raceTitle.locator("../../.."));

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
      await shot("movie");
      await shot("movie-tiles", tiles);

      await page.goto("/watch-list");
      const watchTitle = page.getByRole("heading", { name: "Conclave", exact: true });
      const watchAverageText = watchTitle.locator("..").getByText(watchAverage, { exact: true });
      await expectSingleLine(watchAverageText);
      await shot("watch-list");
      await shot("watch-list-row", watchTitle.locator("../../.."));

      await page.goto("/styleguide#scores");
      const board = page.locator("#scores");
      await expectSingleLine(board.getByText("84 · 5 of 5", { exact: true }));
      await expectSingleLine(board.getByText("83 · 4 of 5", { exact: true }));
      const empty = board.getByText("No scores yet", { exact: true });
      await expect(empty.locator("..").locator("span")).toHaveText([
        "IMDb –", "RT –", "MC –", "TMDB –", "Letterboxd –", "No scores yet",
      ]);
      if (shape.width >= 761) await expectAlignedTiles(board.getByText("4 of 5 scores", { exact: true }).locator("../.."));
      await shot("styleguide", board);
    }

    await page.setViewportSize(SHAPES[0]);
    await page.goto("/movies/baghdad-messi");
    await expect(page.getByRole("heading", { name: "Baghdad Messi", exact: true })).toBeVisible();
    await expect(page.getByText("No score yet", { exact: true })).toHaveCount(5);
    await expect(page.getByText("No scores yet", { exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${out}/no-scores-360.png`, animations: "disabled" });

    await page.route("**/task-12.1-reference", (route) => route.fulfill({
      contentType: "text/html",
      body: readFileSync("design-preview.html", "utf8"),
    }));
    await page.setViewportSize(SHAPES[3]);
    await page.goto("/task-12.1-reference");
    await page.locator(".tiles").screenshot({ path: `${out}/reference-tiles.png` });
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
