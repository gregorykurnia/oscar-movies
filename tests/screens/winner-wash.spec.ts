// Task 10.F2: the winner's gold wash stays inside the list rules, in the app and in the reference.
import { expect, test, type Locator } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";

const OUT = "screenshots/phase-10/10.F2";
const SHAPES = [{ width: 390, height: 844 }, { width: 1280, height: 900 }];

/** The winner row and the next row share both edges: the wash never bleeds past the rules. */
async function expectInsideRules(winner: Locator, next: Locator, where: string) {
  const [w, n] = [await winner.boundingBox(), await next.boundingBox()];
  expect(w && n, `${where}: rows found`).toBeTruthy();
  expect.soft(Math.abs(w!.x - n!.x), `${where}: left edge`).toBeLessThanOrEqual(0.5);
  expect.soft(Math.abs(w!.x + w!.width - n!.x - n!.width), `${where}: right edge`).toBeLessThanOrEqual(0.5);
}

test("winner row on an award page", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  for (const viewport of SHAPES) {
    await page.setViewportSize(viewport);
    await page.goto("/awards/bafta/2025");
    const winner = page.locator("[data-winner]").first();
    await winner.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.evaluate(() => document.fonts.ready);
    await expectInsideRules(winner, winner.locator("xpath=following-sibling::div[1]"), `app ${viewport.width}`);
    const box = (await winner.boundingBox())!;
    const nextHeight = (await winner.locator("xpath=following-sibling::div[1]").boundingBox())!.height;
    // From just above the list's ink rule (never through the text above it) to under the next row's rule.
    const listTop = (await winner.locator("xpath=..").boundingBox())!.y - 12;
    const scrollY = await page.evaluate(() => window.scrollY);
    await page.screenshot({ path: `${OUT}/app-${viewport.width}.png`, fullPage: true, clip: { x: 0, y: listTop + scrollY, width: viewport.width, height: box.y + box.height + nextHeight + 1 - listTop } });
  }
});

test("winner row in the reference award frame", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await page.route("**/task-10.F2-reference", (route) => route.fulfill({ contentType: "text/html", body: readFileSync("design-preview.html", "utf8") }));
  await page.goto("/task-10.F2-reference");
  for (const [width, mode] of [[390, "phone"], [1280, "desktop"]] as const) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator(`[data-w="${mode}"]`).click();
    const hiddenBar = await page.addStyleTag({ content: ".pv-bar { visibility: hidden !important; }" });
    const frame = page.locator(".pv-label:has-text('Award page, one year') + .frame");
    await frame.evaluate((element, size) => { element.style.width = `${size}px`; element.style.maxWidth = `${size}px`; }, width);
    await page.evaluate(() => document.fonts.ready);
    const winner = frame.locator(".frow.winner").first();
    await winner.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await expectInsideRules(winner, winner.locator("xpath=following-sibling::div[1]"), `reference ${width}`);
    const f = (await frame.boundingBox())!;
    const box = (await winner.boundingBox())!;
    const nextHeight = (await winner.locator("xpath=following-sibling::div[1]").boundingBox())!.height;
    const listTop = (await winner.locator("xpath=..").boundingBox())!.y - 12;
    await page.screenshot({ path: `${OUT}/reference-${width}.png`, clip: { x: f.x, y: listTop, width: f.width, height: box.y + box.height + nextHeight + 1 - listTop } });
    await hiddenBar.evaluate((element) => { element.parentNode?.removeChild(element); });
  }
});
