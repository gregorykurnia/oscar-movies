/* eslint-disable @typescript-eslint/no-explicit-any -- browser-side measurement code, one-off check */
// Launch checks (task 3.8), run once, not part of any other run: `npm run launch:check`.
// 1. Accessibility: axe-core on the main pages at 390 and 1280 (WCAG 2.0/2.1/2.2 A and AA rules).
// 2. Performance: `/` and the 2025 year grid on the production build, cold cache, with the phone
//    run slowed to 4x CPU: transfer, JS and DOM size, TTFB, FCP, LCP, CLS and long tasks.
// It writes test-results/launch/axe.json and perf.json (gitignored); docs/phase-checks/launch.md
// holds what the review sorts out of them. Same server and test branch as the end-to-end suite.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test, type Page } from "@playwright/test";

const OUT = "test-results/launch";
mkdirSync(OUT, { recursive: true });
const AXE_SOURCE = readFileSync(createRequire(`${process.cwd()}/package.json`).resolve("axe-core/axe.min.js"), "utf8");

const PAGES: { name: string; path: string; heading: string | RegExp }[] = [
  { name: "home", path: "/", heading: /^The \d{4} race$/ },
  { name: "race-2024", path: "/race/2024", heading: "The 2024 race" },
  { name: "oscars-2025", path: "/awards/oscars/2025", heading: "Oscars 2025" },
  { name: "awards-bafta-2025", path: "/awards/bafta/2025", heading: "BAFTA 2025" },
  { name: "awards-index-2025", path: "/awards/2025", heading: "Awards 2025" },
  { name: "festivals-index-2025", path: "/festivals/2025", heading: "Festivals 2025" },
  { name: "submissions", path: "/submissions/2024", heading: "2024 submissions" },
  { name: "movie", path: "/movies/the-brutalist", heading: "The Brutalist" },
  { name: "watch-list", path: "/watch-list", heading: "Watch list" },
  { name: "accuracy-picture", path: "/accuracy/picture", heading: "Accuracy: Best Picture" },
  { name: "grid-2025", path: "/grid/2025", heading: "2025 year grid" },
  { name: "year-summary-2025", path: "/years/2025", heading: "2025 year summary" },
  { name: "data", path: "/data", heading: "Data" },
  { name: "not-found", path: "/no-such-page", heading: "This page isn't here" },
];
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
];

async function open(page: Page, path: string, heading: string | RegExp) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
}

test("axe-core on the main pages", async ({ page }) => {
  test.setTimeout(300_000);
  const rows: unknown[] = [];
  for (const { width, height } of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    for (const p of PAGES) {
      await open(page, p.path, p.heading);
      await page.addScriptTag({ content: AXE_SOURCE });
      const result = await page.evaluate(async () => {
        // @ts-expect-error axe is injected above
        const r = await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
        });
        return r.violations.map((v: any) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.length,
          sample: v.nodes.slice(0, 3).map((n: any) => ({ target: n.target.join(" "), summary: n.failureSummary })),
        }));
      });
      rows.push({ page: p.name, path: p.path, width, violations: result });
    }
  }
  writeFileSync(`${OUT}/axe.json`, JSON.stringify(rows, null, 2));
});

test("performance of / and the grid", async ({ browser }) => {
  test.setTimeout(300_000);
  const rows: unknown[] = [];
  for (const target of [
    { name: "home", path: "/", heading: PAGES[0].heading },
    { name: "grid-2025", path: "/grid/2025", heading: "2025 year grid" },
  ]) {
    for (const mode of [
      { name: "phone (390, 4x CPU)", width: 390, height: 844, cpu: 4 },
      { name: "laptop (1280)", width: 1280, height: 900, cpu: 1 },
    ]) {
      for (let run = 1; run <= 3; run++) {
        const context = await browser.newContext({ viewport: { width: mode.width, height: mode.height } });
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        if (mode.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: mode.cpu });
        await page.addInitScript(() => {
          const w = window as any;
          w.__m = { lcp: 0, cls: 0, longTasks: 0, longMs: 0, shifts: [] };
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) w.__m.lcp = e.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((l) => {
            for (const e of l.getEntries() as any[]) {
              if (e.hadRecentInput) continue;
              w.__m.cls += e.value;
              w.__m.shifts.push({
                at: Math.round(e.startTime),
                value: Math.round(e.value * 1000) / 1000,
                nodes: e.sources.map((s: any) => `${s.node?.nodeName ?? "?"}.${(s.node as Element | null)?.className?.toString().slice(0, 60) ?? ""}`),
              });
            }
          }).observe({ type: "layout-shift", buffered: true });
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) {
              w.__m.longTasks++;
              w.__m.longMs += e.duration - 50;
            }
          }).observe({ type: "longtask", buffered: true });
        });
        let transfer = 0;
        let js = 0;
        let requests = 0;
        page.on("response", async (r) => {
          requests++;
          const len = Number((await r.allHeaders())["content-length"] ?? 0);
          transfer += len;
          if ((await r.allHeaders())["content-type"]?.includes("javascript")) js += len;
        });
        await open(page, target.path, target.heading);
        await page.waitForTimeout(1500);
        const m = await page.evaluate(() => {
          const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
          const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
          const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
          return {
            ...(window as any).__m,
            ttfb: nav.responseStart,
            fcp,
            domContentLoaded: nav.domContentLoadedEventEnd,
            load: nav.loadEventEnd,
            htmlBytes: nav.encodedBodySize,
            jsBytes: res.filter((r) => r.initiatorType === "script" || r.name.endsWith(".js")).reduce((a, r) => a + r.encodedBodySize, 0),
            resources: res.length,
            domNodes: document.getElementsByTagName("*").length,
          };
        });
        rows.push({ page: target.name, mode: mode.name, run, ...m, transferSeen: transfer, jsSeen: js, requests });
        await context.close();
      }
    }
  }
  writeFileSync(`${OUT}/perf.json`, JSON.stringify(rows, null, 2));
});
