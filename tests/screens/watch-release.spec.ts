// Task 10.3's focused gallery. Uses the guarded test build and restores all test marks.
import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { marks, movies } from "../../src/db/schema";

const OUT = "screenshots/phase-10/10.3";
const SHAPES = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 900 }];

test("release sort and filters gallery", async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(OUT, { recursive: true });
  const { db, close } = createScriptDb();
  const saved = await db.select().from(marks);
  const fixtures = [
    { slug: "the-secret-agent", releaseOn: "2099-12-12", platform: "Netflix" },
    { slug: "hamnet", releaseOn: null, platform: "Netflix" },
    { slug: "sentimental-value", releaseOn: "2020-10-03", platform: "Cinema XXI" },
    { slug: "anora", releaseOn: null, platform: null },
  ];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    const rows = await Promise.all(fixtures.map(async ({ slug, ...note }, i) => {
      const [film] = await db.select({ id: movies.id }).from(movies).where(eq(movies.slug, slug));
      if (!film) throw new Error(`Missing fixture ${slug}`);
      return { movieId: film.id, want: true, watched: false, wantRank: i + 1, ...note };
    }));
    await db.delete(marks);
    await db.insert(marks).values(rows);
    for (const viewport of process.env.WATCH_RELEASE_LONG_ONLY === "1" ? [] : SHAPES) {
      await page.setViewportSize(viewport);
      const before = process.env.WATCH_RELEASE_BEFORE === "1";
      const states = before ? ["before"] : ["release", "filtered", "empty"];
      for (const state of states) {
        const query = state === "filtered" ? "?sort=release&platform=Netflix" : state === "empty" ? "?sort=release&platform=Netflix&release=out" : "?sort=release";
        await page.goto(`/watch-list${query}`);
        await expect(page.getByRole("heading", { name: "Want to watch", exact: true })).toBeVisible();
        await expect(page.locator("#want-h + span")).toContainText(state === "filtered" ? "2 of 4 films" : state === "empty" ? "0 of 4 films" : "4 films");
        if (state === "filtered" || state === "empty") {
          expect(await page.getByRole("button", { name: "Platform: Netflix", exact: true }).evaluate((button) => {
            const sample = document.createElement("span");
            sample.style.backgroundColor = "var(--gold-wash)";
            document.body.append(sample);
            const matches = getComputedStyle(button).backgroundColor === getComputedStyle(sample).backgroundColor;
            sample.remove();
            return matches;
          })).toBe(true);
        }
        await page.evaluate(() => document.fonts.ready);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const covered = await page.locator('nav[aria-label="Sort by"] a, button[aria-haspopup="menu"]').evaluateAll((elements) => elements.flatMap((element) => {
          const box = element.getBoundingClientRect();
          if (!box.width || box.top < 0 || box.bottom > innerHeight) return [];
          const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          return element.contains(hit) ? [] : [element.textContent];
        }));
        expect(covered).toEqual([]);
        await page.screenshot({ path: `${OUT}/${state}-${viewport.width}.png` });
        if (!before && (state === "empty" || viewport.width === 844)) {
          if (state === "empty") await page.getByRole("heading", { name: "No films match these filters" }).locator("..").scrollIntoViewIfNeeded();
          else await page.locator('nav[aria-label="Sort by"]').locator("../..").evaluate((toolbar) => toolbar.scrollIntoView({ block: "start" }));
          await page.screenshot({ path: `${OUT}/${state}-${viewport.width}-detail.png` });
        }
        if (!before && state === "filtered" && [360, 1280].includes(viewport.width)) {
          for (const label of ["Platform: Netflix", "Release: All"]) {
            await page.getByRole("button", { name: label, exact: true }).click();
            const menu = page.getByRole("menu");
            await expect(menu).toBeVisible();
            await menu.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
            const box = await menu.boundingBox();
            expect(box && box.x >= 0 && box.x + box.width <= viewport.width).toBeTruthy();
            expect(box?.width).toBe(248);
            await page.screenshot({ path: `${OUT}/${label.startsWith("Platform") ? "platform" : "release-menu"}-${viewport.width}.png` });
            await page.keyboard.press("Escape");
          }
        }
      }
    }
    if (process.env.WATCH_RELEASE_BEFORE !== "1") {
      const longPlatform = "An exceptionally long platform name here";
      await db.update(marks).set({ platform: longPlatform }).where(eq(marks.movieId, rows[0].movieId));
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(`/watch-list?sort=release&platform=${encodeURIComponent(longPlatform)}`);
      await expect(page.getByRole("heading", { name: "Want to watch", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: `Platform: ${longPlatform}`, exact: true })).toBeVisible();
      await expect(page.locator("#want-h + span")).toContainText("1 of 4 films");
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `${OUT}/long-platform-360.png` });
    }
    expect(errors).toEqual([]);
  } finally {
    await db.delete(marks);
    if (saved.length) await db.insert(marks).values(saved);
    await close();
  }
});

test("open the binding 10.1 reference in the browser", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.route("**/task-10.3-reference", (route) => route.fulfill({ contentType: "text/html", body: readFileSync("design-preview.html", "utf8") }));
  await page.goto("/task-10.3-reference");
  for (const [width, mode] of [[1280, "desktop"], [360, "p360"]] as const) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator(`[data-w="${mode}"]`).click();
    const hiddenBar = await page.addStyleTag({ content: ".pv-bar { visibility: hidden !important; }" });
    await page.locator("#wl-filter").screenshot({ path: `${OUT}/reference-${width}.png` });
    await hiddenBar.evaluate((element) => { element.parentNode?.removeChild(element); });
  }
});
