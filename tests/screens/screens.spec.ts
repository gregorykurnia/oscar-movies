// Screenshots for the phase reviews (task 0.12, IMPLEMENTATION_PLAN.md §8 Visual): every page in
// ROUTES at 390 and 1280, light only, from the production build the global setup starts. Each test
// first checks that its page answers with the right status and shows its h1, so a picture is never
// of the wrong page. Pictures go to screenshots/phase-0/ (gitignored); the phase review judges them.
// One page: `npm run screens -- --grep <name>`.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// Later phases change this folder.
const OUT_DIR = "screenshots/phase-0";
mkdirSync(OUT_DIR, { recursive: true });

// 390 is a phone and 1280 a laptop. The height only sets the first screen: each picture is the whole page.
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
];

// `name` is the file name and the `--grep` name. The error page has no address of its own, so
// `?error=1` throws on purpose (src/app/styleguide/page.tsx).
const ROUTES = [
  { name: "styleguide", path: "/styleguide", status: 200, heading: "Styleguide" },
  { name: "not-found", path: "/no-such-page", status: 404, heading: "This page isn't here" },
  { name: "error", path: "/styleguide?error=1", status: 200, heading: "This page didn't load" },
  { name: "home", path: "/", status: 200, heading: /^The \d{4} race$/ },
];

for (const route of ROUTES) {
  test(route.name, async ({ page }) => {
    for (const { width, height } of VIEWPORTS) {
      await page.setViewportSize({ width, height });
      const response = await page.goto(route.path);
      expect(response?.status(), route.path).toBe(route.status);
      // Parts of a page stream in after `load` (the styleguide's sections): wait until the network is quiet.
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
      await page.evaluate(async () => {
        await document.fonts.ready;
      });
      await page.screenshot({
        path: join(OUT_DIR, `${route.name}-${width}.png`),
        fullPage: true,
        animations: "disabled",
        caret: "hide",
      });
    }
  });
}
