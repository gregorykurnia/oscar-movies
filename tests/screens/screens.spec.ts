// Screenshots for the phase reviews (task 0.12, IMPLEMENTATION_PLAN.md §8 Visual): every page in
// ROUTES at 390 and 1280, light only, from the production build the global setup starts. Each test
// first checks that its page answers with the right status and shows its h1, so a picture is never
// of the wrong page, and that the page doesn't scroll sideways. Pictures go to screenshots/phase-2/
// (gitignored); the phase review judges them.
// One page: `npm run screens -- --grep <name>`.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { marks, movies } from "../../src/db/schema";

// Each phase's review judges its own folder. Phase 0's and Phase 1's pictures stay in their folders.
// The Phase 2 review runs the whole list into this one, so until then it holds only the new pages.
const OUT_DIR = "screenshots/phase-2";
mkdirSync(OUT_DIR, { recursive: true });

// 390 is a phone and 1280 a laptop. The height only sets the first screen: each picture is the whole page.
const VIEWPORTS = [
  { width: 390, height: 844, phone: true },
  { width: 1280, height: 900, phone: false },
];

type Mark = { watched: boolean; want: boolean };

/** Sets a film's mark on the test branch (null clears it) and returns the mark it had before. */
async function setMark(slug: string, value: Mark | null): Promise<Mark | null> {
  const { db, close } = createScriptDb();
  try {
    const [movie] = await db.select({ id: movies.id }).from(movies).where(eq(movies.slug, slug));
    if (!movie) throw new Error(`${slug} isn't on the test branch`);
    const [before] = await db
      .select({ watched: marks.watched, want: marks.want })
      .from(marks)
      .where(eq(marks.movieId, movie.id));
    if (value === null) {
      await db.delete(marks).where(eq(marks.movieId, movie.id));
    } else {
      await db
        .insert(marks)
        .values({ movieId: movie.id, ...value })
        .onConflictDoUpdate({ target: marks.movieId, set: value });
    }
    return before ?? null;
  } finally {
    await close();
  }
}

// Search as a visitor opens it: the Search button opens the full-screen sheet on a phone, `/` the
// popover on a laptop (as tests/e2e/search.spec.ts does). The query has a result, so the picture shows a row.
async function openSearch(page: Page, phone: boolean) {
  if (phone) await page.getByRole("button", { name: "Search", exact: true }).click();
  else await page.keyboard.press("/");
  await page.getByRole("combobox").fill("ainda estou");
  const option = page.getByRole("option", { name: /I'm Still Here/ });
  await expect(option).toBeVisible();
  // The flags load the first time search opens: wait for the row's flag, not its placeholder.
  await expect(option.getByRole("img")).toBeVisible();
}

// `name` is the file name and the `--grep` name. The error page has no address of its own, so
// `?error=1` throws on purpose (src/app/styleguide/page.tsx). `prepare` sets up data the picture
// needs and returns what puts it back; `open` opens a box over the page once its heading is checked.
type Route = {
  name: string;
  path: string;
  status: number;
  heading: string | RegExp;
  prepare?: () => Promise<() => Promise<void>>;
  open?: (page: Page, phone: boolean) => Promise<void>;
};

const ROUTES: Route[] = [
  { name: "styleguide", path: "/styleguide", status: 200, heading: "Styleguide" },
  { name: "styleguide-stress", path: "/styleguide?stress=1", status: 200, heading: "Styleguide" },
  { name: "not-found", path: "/no-such-page", status: 404, heading: "This page isn't here" },
  { name: "error", path: "/styleguide?error=1", status: 200, heading: "This page didn't load" },
  { name: "home", path: "/", status: 200, heading: /^The \d{4} race$/ },
  { name: "race-2024", path: "/race/2024", status: 200, heading: "The 2024 race" },
  { name: "oscars-2025", path: "/awards/oscars/2025", status: 200, heading: "Oscars 2025" },
  { name: "submissions", path: "/submissions/2024", status: 200, heading: "2024 submissions" },
  { name: "movie", path: "/movies/im-still-here", status: 200, heading: "I'm Still Here" },
  {
    name: "watch-list",
    path: "/watch-list",
    status: 200,
    heading: "Watch list",
    // The "Want to watch" section lists only wanted films, so the picture wants one, then puts it back.
    prepare: async () => {
      const before = await setMark("im-still-here", { watched: false, want: true });
      return async () => {
        await setMark("im-still-here", before);
      };
    },
  },
  { name: "search", path: "/", status: 200, heading: /^The \d{4} race$/, open: openSearch },
  // Phase 2 (task 2.13). The Brutalist is a 2024 Best Picture nominee with won, nominated and not
  // nominated awards. Until Phase 4 loads critics groups the two grid pictures look the same: folding
  // only changes the critics columns.
  { name: "awards-bafta-2025", path: "/awards/bafta/2025", status: 200, heading: "BAFTA 2025" },
  { name: "awards-index-2025", path: "/awards/2025", status: 200, heading: "Awards 2025" },
  { name: "festivals-index-2025", path: "/festivals/2025", status: 200, heading: "Festivals 2025" },
  { name: "accuracy-picture", path: "/accuracy/picture", status: 200, heading: "Accuracy: Best Picture" },
  { name: "grid-2025-folded", path: "/grid/2025", status: 200, heading: "2025 year grid" },
  { name: "grid-2025-open", path: "/grid/2025?critics=open", status: 200, heading: "2025 year grid" },
  { name: "year-summary-2025", path: "/years/2025", status: 200, heading: "2025 year summary" },
  { name: "movie-awards", path: "/movies/the-brutalist", status: 200, heading: "The Brutalist" },
];

for (const route of ROUTES) {
  test(route.name, async ({ page }) => {
    const undo = await route.prepare?.();
    try {
      for (const { width, height, phone } of VIEWPORTS) {
        await page.setViewportSize({ width, height });
        const response = await page.goto(route.path);
        expect(response?.status(), route.path).toBe(route.status);
        // Parts of a page stream in after `load` (the styleguide's sections): wait until the network is quiet.
        await page.waitForLoadState("networkidle");
        await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
        await route.open?.(page, phone);
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        // Guide §15: no sideways page scroll at any width (wide tables scroll inside their own frame).
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${route.path} scrolls sideways at ${width}px`).toBeLessThanOrEqual(0);
        await page.screenshot({
          path: join(OUT_DIR, `${route.name}-${width}.png`),
          fullPage: true,
          animations: "disabled",
          caret: "hide",
        });
      }
    } finally {
      await undo?.();
    }
  });
}
