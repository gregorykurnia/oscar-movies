// Task 10.3's focused gallery. Uses the guarded test build and restores all test marks.
import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { marks, movies } from "../../src/db/schema";
import { todayInJakarta } from "../../src/lib/watch-list";

const OUT = process.env.WATCH_RELEASE_OUT ?? "screenshots/phase-10/10.3";
const SHAPES = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 900 }];

test("release sort and filters gallery", async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(OUT, { recursive: true });
  const { db, close } = createScriptDb();
  const saved = await db.select().from(marks);
  const fixtures = [
    { slug: "the-secret-agent", releaseOn: todayInJakarta(new Date(Date.now() + 30 * 86_400_000)), platform: "Netflix" },
    { slug: "hamnet", releaseOn: null, platform: "Netflix" },
    { slug: "sentimental-value", releaseOn: "2025-10-03", platform: "Cinema XXI" },
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
        if (!before && viewport.width < 768) {
          const heading = await page.locator("#want-h").boundingBox();
          const count = await page.locator("#want-h + span").boundingBox();
          expect.soft(count!.y).toBeGreaterThanOrEqual(heading!.y + heading!.height);
        }
        if (!before && state === "release") {
          const winner = page.locator("[data-winner]").first();
          const box = await winner.boundingBox();
          const list = await winner.locator("..").boundingBox();
          expect.soft(box!.x).toBeCloseTo(list!.x, 0);
          expect.soft(box!.x + box!.width).toBeCloseTo(list!.x + list!.width, 0);
          const platformLines = await page.locator('button[aria-haspopup="dialog"]').filter({ hasText: "Cinema XXI" }).evaluate((button) => {
            const text = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
            while (text.nextNode()) {
              const value = text.currentNode.textContent ?? "";
              const index = value.indexOf("Cinema XXI");
              if (index < 0) continue;
              const range = document.createRange();
              range.setStart(text.currentNode, index);
              range.setEnd(text.currentNode, index + "Cinema XXI".length);
              return range.getClientRects().length;
            }
            return 0;
          });
          expect.soft(platformLines).toBe(1);
          const iconOffset = await page.locator('button[aria-haspopup="dialog"]').filter({ hasText: "Cinema XXI" }).evaluate((button) => {
            const text = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
            while (text.nextNode()) {
              if (!text.currentNode.textContent?.startsWith("Out ")) continue;
              const range = document.createRange();
              range.selectNodeContents(text.currentNode);
              const date = range.getBoundingClientRect();
              const icon = button.querySelector("svg")!.getBoundingClientRect();
              return Math.abs((icon.top + icon.height / 2) - (date.top + date.height / 2));
            }
            return 999;
          });
          expect.soft(iconOffset).toBeLessThanOrEqual(4);
        }
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
        if (!before && (state === "empty" || viewport.width === 844 || (state === "release" && viewport.width < 768))) {
          if (state === "empty") {
            const panel = page.getByRole("heading", { name: "No films match these filters" }).locator("..");
            await panel.evaluate((element) => element.scrollIntoView({ block: "center" }));
            const panelBox = await panel.boundingBox();
            expect(panelBox!.y).toBeGreaterThanOrEqual(8);
            expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(viewport.height - 8);
          }
          else await page.locator('nav[aria-label="Sort by"]').locator("../..").evaluate((toolbar) => toolbar.scrollIntoView({ block: "start" }));
          await page.screenshot({ path: `${OUT}/${state}-${viewport.width}-detail.png` });
        }
        if (!before && state === "filtered" && [360, 1280].includes(viewport.width)) {
          for (const label of ["Platform: Netflix", "Release: All"]) {
            const trigger = page.getByRole("button", { name: label, exact: true });
            await trigger.click();
            const menu = page.getByRole("menu");
            await expect(menu).toBeVisible();
            await menu.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
            const box = await menu.boundingBox();
            expect(box && box.x >= 0 && box.x + box.width <= viewport.width).toBeTruthy();
            expect(box?.width).toBe(248);
            if (viewport.width === 360 && label.startsWith("Release")) {
              const triggerBox = await trigger.boundingBox();
              expect.soft(box!.x + box!.width).toBeCloseTo(triggerBox!.x + triggerBox!.width, 0);
            }
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
  for (const [width, mode] of [[360, "p360"], [390, "phone"], [844, "desktop"], [1280, "desktop"]] as const) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator(`[data-w="${mode}"]`).click();
    const hiddenBar = await page.addStyleTag({ content: ".pv-bar { visibility: hidden !important; }" });
    const frame = page.locator("#wl-filter");
    await frame.evaluate((element, size) => { element.style.width = `${size}px`; element.style.maxWidth = `${size}px`; }, width);
    await page.evaluate(() => document.fonts.ready);
    await frame.screenshot({ path: `${OUT}/reference-${width}.png` });
    const row = frame.locator(".frow").filter({ has: page.getByRole("heading", { name: "Hamnet", exact: true }) });
    // Semantic crops include the whole row or release control, never half a neighbouring score line.
    await row.screenshot({ path: `${OUT}/reference-${width}-row.png` });
    await row.locator(".rel").screenshot({ path: `${OUT}/reference-${width}-release.png` });
    const geometry = await row.locator(".rel").evaluate((button) => {
      const icon = button.querySelector("svg")!.getBoundingClientRect();
      const date = button.querySelector("b")!.getBoundingClientRect();
      return { iconOffset: Math.abs(icon.y + icon.height / 2 - date.y - date.height / 2) };
    });
    expect.soft(geometry.iconOffset, `calendar aligns with first date line at ${width}px`).toBeLessThanOrEqual(4);
    await hiddenBar.evaluate((element) => { element.parentNode?.removeChild(element); });
  }
});
