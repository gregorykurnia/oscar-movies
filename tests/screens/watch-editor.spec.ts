// Task 10.4: focused editor/row gallery, on the guarded Neon test branch only.
import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { eq } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { marks, movies } from "../../src/db/schema";

const OUT = process.env.WATCH_EDITOR_OUT ?? "screenshots/phase-10/10.4";
const SHAPES = [{ width: 360, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 900 }];

test("date status editor and release row gallery", async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(OUT, { recursive: true });
  const { db, close } = createScriptDb();
  const saved = await db.select().from(marks);
  const before = process.env.WATCH_EDITOR_BEFORE === "1";
  try {
    // Open the binding reference in the same browser before comparing the actual editor.
    await page.goto(`file://${process.cwd()}/design-preview.html`);
    await expect(page.locator('#wl-editor [role="radiogroup"]')).toContainText("Confirmed");
    const [film] = await db.select({ id: movies.id }).from(movies).where(eq(movies.slug, "the-secret-agent"));
    await db.delete(marks);
    await db.insert(marks).values({ movieId: film.id, want: true, watched: false, wantRank: 1, releaseOn: "2030-12-12", releaseTentative: true, platform: "Cinépolis Lippo Mall Kemang IMAX Laser" });
    for (const viewport of SHAPES.filter((shape) => !process.env.WATCH_EDITOR_SHAPES || process.env.WATCH_EDITOR_SHAPES.split(",").includes(String(shape.width)))) {
      await page.setViewportSize(viewport);
      await page.goto("/watch-list?sort=release");
      await page.evaluate(() => document.fonts.ready);
      const row = page.locator('section[aria-labelledby="want-h"]');
      await row.evaluate((element) => element.scrollIntoView({ block: "center" }));
      const line = row.getByRole("button", { name: /12 Dec 2030/ });
      const shot = async (state: string) => {
        await page.evaluate(() => Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished)));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `${OUT}/${before ? "before-" : ""}${state}-${viewport.width}.png` });
      };
      if (!before) await expect(line).toHaveAccessibleName(/12 Dec 2030, tentative · Cinépolis/);
      await shot("row");
      await line.click();
      const editor = page.getByRole("dialog", { name: "Release date and platform" });
      await editor.evaluate((element) => element.scrollIntoView({ block: "center" }));
      if (!before) await expect(editor.getByRole("radio", { name: "Tentative" })).toBeChecked();
      await shot("editor");
      const box = await editor.boundingBox();
      if (!before && box && box.y >= 0 && box.y + box.height <= viewport.height) {
        await page.screenshot({ path: `${OUT}/editor-${viewport.width}-crop-actions.png`, clip: { x: Math.floor(box.x), y: Math.floor(box.y + box.height - 95), width: Math.floor(box.width), height: 95 } });
      }
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);

      if (!before && viewport.width === 360) {
        await editor.getByText("Confirmed", { exact: true }).click();
        await shot("confirmed");
        await editor.getByLabel("Date", { exact: true }).fill("");
        await expect(editor.getByRole("radiogroup")).toHaveCount(0);
        await shot("tbd");
        await editor.getByLabel("Date", { exact: true }).fill("2030-12-12");
        await editor.getByRole("combobox").fill("net");
        await expect(editor.getByRole("listbox")).toBeVisible();
        await shot("suggestions");
        await editor.getByLabel("Date", { exact: true }).focus();
        let failSave!: () => void;
        const held = new Promise<void>((resolve) => { failSave = resolve; });
        await page.route("**/watch-list?sort=release", async (route) => {
          if (route.request().method() !== "POST") return route.continue();
          await held;
          await route.abort();
        });
        await editor.getByRole("button", { name: "Save", exact: true }).click();
        await expect(editor).toHaveAttribute("aria-busy", "true");
        await shot("saving");
        failSave();
        await expect(editor.getByRole("alert")).toBeVisible();
        await shot("failed");
        await page.unroute("**/watch-list?sort=release");
      }
      await page.keyboard.press("Escape");
    }
  } finally {
    await db.delete(marks);
    if (saved.length) await db.insert(marks).values(saved);
    await close();
  }
});

// The fresh-eyes pass also reviews the binding reference; keep its row wrapping honest.
for (const width of [360, 390, 844, 1280]) {
  test(`release editor reference at ${width}px`, async ({ page }) => {
    const out = `${OUT}/fresh-check`;
    mkdirSync(out, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1200 });
    await page.goto(`file://${process.cwd()}/design-preview.html`);
    await page.locator(`[data-w="${width === 360 ? "p360" : width === 390 ? "phone" : "desktop"}"]`).click();
    await page.addStyleTag({ content: ".pv-bar { visibility: hidden !important; }" });
    const frame = page.locator("#wl-editor");
    await frame.evaluate((element, size) => { element.style.width = `${size}px`; element.style.maxWidth = `${size}px`; }, width);
    await page.evaluate(() => document.fonts.ready);
    // The reference is a full-page drawing, not the actual landscape viewport. Its
    // 1100px canvas needs more height when narrower columns make the film rows taller.
    if (width > 760) await frame.locator(".app").evaluate((element) => {
      const editor = element.querySelector(".rel-pop")!.getBoundingClientRect();
      const app = element.getBoundingClientRect();
      if (editor.bottom > app.bottom) element.style.minHeight = `${Math.ceil(editor.bottom - app.top + 24)}px`;
    });
    const prefix = process.env.WATCH_EDITOR_REFERENCE_BEFORE === "1" ? "before" : "reference";
    await frame.screenshot({ path: `${out}/${prefix}-${width}.png` });
    const editorBox = await frame.locator(".rel-pop").boundingBox();
    const frameBox = await frame.boundingBox();
    expect(editorBox!.y + editorBox!.height).toBeLessThanOrEqual(frameBox!.y + frameBox!.height);
    const first = frame.locator(".frow.wl.drag:not(.head)").first();
    await first.screenshot({ path: `${out}/${prefix}-${width}-crop-row.png` });
    const lineRects = await first.locator(".rel .txt").evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const index = (walker.currentNode.textContent ?? "").indexOf("Cinema XXI");
        if (index < 0) continue;
        const range = document.createRange();
        range.setStart(walker.currentNode, index);
        range.setEnd(walker.currentNode, index + "Cinema XXI".length);
        return range.getClientRects().length;
      }
      return 0;
    });
    expect.soft(lineRects, "Cinema XXI stays together when it fits on one line").toBe(1);
    expect.soft(await first.locator(".res .n").first().evaluate((element) => {
      const ink = document.createElement("span");
      ink.style.color = "var(--ink)";
      document.body.append(ink);
      const matches = getComputedStyle(element).color === getComputedStyle(ink).color;
      ink.remove();
      return matches;
    }), "My order does not highlight one chance figure in gold").toBe(true);
  });
}
