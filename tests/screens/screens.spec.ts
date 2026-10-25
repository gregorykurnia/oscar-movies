// Screenshots for the phase reviews (task 0.12, IMPLEMENTATION_PLAN.md §8 Visual): every page in
// ROUTES at 390 and 1280, light only, from the production build the global setup starts. Each test
// first checks that its page answers with the right status and shows its h1, so a picture is never
// of the wrong page, and that the page doesn't scroll sideways. Pictures go to `OUT_DIR` (gitignored);
// the phase review judges them.
// One page: `npm run screens -- --grep <name>`.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { marks, movies } from "../../src/db/schema";

// Each phase's review judges its own folder. Phases 0 to 7 keep theirs. The Phase 8 review runs the
// whole list into this one, so until then it holds only the pages task 8.9 added (`--grep` them).
const OUT_DIR = "screenshots/phase-8";
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

type WantedFilm = { slug: string; releaseOn?: string; platform?: string };

// The Watch list's four wanted films in order, one for each kind of release line: a date and a platform,
// a platform with TBD, a date already past ("Out 3 Oct") and none ("Add release date") (task 7.14).
const WATCH_ORDER: WantedFilm[] = [
  { slug: "the-secret-agent", releaseOn: "2026-12-12", platform: "Netflix" },
  { slug: "hamnet", platform: "Netflix" },
  { slug: "sentimental-value", releaseOn: "2026-10-03", platform: "Cinema XXI" },
  { slug: "anora" },
];

/**
 * Sets the test branch's marks to `wanted` (in that order, with their release notes) and no others.
 * Returns the function that puts every mark back as it was.
 */
async function setWatchList(wanted: WantedFilm[]): Promise<() => Promise<void>> {
  const { db, close } = createScriptDb();
  try {
    const saved = await db.select().from(marks);
    const rows: (typeof marks.$inferInsert)[] = [];
    for (const [i, film] of wanted.entries()) {
      const [movie] = await db.select({ id: movies.id }).from(movies).where(eq(movies.slug, film.slug));
      if (!movie) throw new Error(`${film.slug} isn't on the test branch`);
      rows.push({
        movieId: movie.id,
        watched: false,
        want: true,
        wantRank: i + 1,
        releaseOn: film.releaseOn ?? null,
        platform: film.platform ?? null,
      });
    }
    await db.delete(marks);
    await db.insert(marks).values(rows);
    return async () => {
      const back = createScriptDb();
      try {
        await back.db.delete(marks);
        if (saved.length > 0) await back.db.insert(marks).values(saved);
      } finally {
        await back.close();
      }
    };
  } finally {
    await close();
  }
}

// My order: every Want to watch row starts with its drag handle (task 7.9).
async function expectMyOrder(page: Page) {
  await expect(page.getByRole("button", { name: /^Reorder / })).toHaveCount(WATCH_ORDER.length);
}

// The add box with results: a title the box would add ("I'm Still Here" isn't in WATCH_ORDER).
async function typeInAddBox(page: Page) {
  const box = page.getByRole("combobox", { name: "Add a film" });
  const option = page.getByRole("option", { name: /I'm Still Here/ });
  // Typed again until the option shows: typing before the box hydrates fires no search (7.R).
  await expect(async () => {
    await box.fill("");
    await box.fill("ainda estou");
    await expect(option).toBeVisible({ timeout: 2_000 });
  }).toPass();
  // The result's flag loads after the row (7.R: the picture showed its placeholder).
  await expect(option.locator("[data-flag]")).toBeVisible();
}

// The first Want to watch row is The Secret Agent: its release line opens the editor, a popover on a laptop and a
// sheet on a phone (task 7.10). Found by its "Release:" label, not its date, which reads "Out" once the date passes.
async function openReleaseEditor(page: Page) {
  await page.getByRole("button", { name: /^Release: / }).first().click();
  await expect(page.getByRole("dialog", { name: "Release date and platform" })).toBeVisible();
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

// The open grid's frame scrolls sideways: bring the critics groups' columns into the picture (Phase 4 review).
async function showCriticsColumns(page: Page) {
  const head = page.getByRole("table").locator('th[scope="colgroup"]', { hasText: "Critics groups" });
  await expect(head).toBeVisible();
  await head.evaluate((el) => el.scrollIntoView({ block: "nearest", inline: "start" }));
}

// The accuracy page's "Show all N critics groups" (task 4.12). A click before hydration does nothing:
// click again only while the button still says Show all.
async function showAllCritics(page: Page) {
  const show = page.getByRole("button", { name: /^Show all \d+ critics groups/ });
  await expect(async () => {
    if (await show.count()) await show.click();
    await expect(page.getByRole("button", { name: "Show the first 8 critics groups" })).toBeVisible({ timeout: 1000 });
  }).toPass();
}

// The Documentary grid with critics open: center DOC NYC's column (the last festival; the critics groups
// follow it). `inline: "start"` would put it under the sticky Film column (task 6.7).
async function showDocNycColumn(page: Page) {
  const head = page.getByRole("table").getByRole("columnheader", { name: "DOC NYC", exact: true });
  await expect(head).toBeVisible();
  await head.evaluate((el) => el.scrollIntoView({ block: "nearest", inline: "center" }));
}

// `name` is the file name and the `--grep` name. The error page has no address of its own, so
// `?error=1` throws on purpose (src/app/styleguide/page.tsx). `prepare` sets up data the picture
// needs and returns what puts it back; `open` opens a box over the page once its heading is checked.
// `ready` waits for the words of the state the picture is of (so a picture can't drift to another state).
type Route = {
  name: string;
  path: string;
  status: number;
  heading: string | RegExp;
  prepare?: () => Promise<() => Promise<void>>;
  ready?: (page: Page) => Promise<void>;
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
  // nominated awards. Folding changes only the critics columns, which hold data from Phase 4 on.
  { name: "awards-bafta-2025", path: "/awards/bafta/2025", status: 200, heading: "BAFTA 2025" },
  { name: "awards-index-2025", path: "/awards/2025", status: 200, heading: "Awards 2025" },
  {
    name: "festivals-index-2025",
    path: "/festivals/2025",
    status: 200,
    heading: "Festivals 2025",
    // Re-shot in Phase 5 (task 5.5): from 2025 a festival row opens its lineup (task 5.3).
    ready: async (page) => {
      await expect(page.getByRole("region", { name: "Festivals" }).getByRole("link", { name: /Cannes/ })).toHaveAttribute(
        "href",
        "/festivals/cannes/2025",
      );
    },
  },
  { name: "accuracy-picture", path: "/accuracy/picture", status: 200, heading: "Accuracy: Best Picture" },
  { name: "grid-2025-folded", path: "/grid/2025", status: 200, heading: "2025 year grid" },
  {
    name: "grid-2025-open",
    path: "/grid/2025?critics=open",
    status: 200,
    heading: "2025 year grid",
    // Unfolded: the critics groups have their own column group (re-shot in Phase 4, task 4.12).
    ready: showCriticsColumns,
  },
  { name: "year-summary-2025", path: "/years/2025", status: 200, heading: "2025 year summary" },
  { name: "movie-awards", path: "/movies/the-brutalist", status: 200, heading: "The Brutalist" },
  // Phase 3 (task 3.10). The 2026 race in its live states: Picture with chances from the precursors, the
  // "why" open on its leader, International "Early" (two precursor awards with results), and Animated with
  // no contenders yet. `race-2024` (above) is a finished season. The shortlist and nomination states need
  // 2026's Oscar lists (15 Dec 2026, 21 Jan 2027); until then the styleguide's race boards show them from
  // fixtures. `data` is the coverage page (task 3.5).
  { name: "race-2026", path: "/race/2026", status: 200, heading: "The 2026 race" },
  {
    name: "race-2026-why",
    path: "/race/2026",
    status: 200,
    heading: "The 2026 race",
    open: async (page) => {
      await page.getByRole("button", { name: /chance to win, show why/ }).first().click();
      await expect(page.getByRole("heading", { name: /^Why \d+%$/ })).toBeVisible();
    },
  },
  {
    name: "race-2026-animated",
    path: "/race/2026?category=animated",
    status: 200,
    heading: "The 2026 race",
    ready: async (page) => {
      await expect(page.getByRole("heading", { level: 3, name: "No contenders yet" })).toBeVisible();
    },
  },
  {
    name: "race-2026-early",
    // International: two precursor awards with results (Documentary left "Early" when Phase 4 loaded
    // the Critics Choice Documentary nominees).
    path: "/race/2026?category=international",
    status: 200,
    heading: "The 2026 race",
    ready: async (page) => {
      // Every category's panel is in the page, the others hidden: check the one on screen.
      const panel = page.getByRole("tabpanel", { name: "International" });
      await expect(panel.getByText("Early: few results yet.", { exact: true })).toBeVisible();
    },
  },
  { name: "data", path: "/data", status: 200, heading: "Data and sources" },
  // Phase 4 (task 4.12). The open grid and the accuracy page carry the critics groups.
  // `grid-2018-open` shows the gaps: a group with no edition that year gets a "No data" cell, and the
  // legend says "No data that year" (Astra's column says it began in 2019). `accuracy-picture` (above)
  // shows the first eight critics rows; `accuracy-picture-critics` opens "Show all". `awards-nbr-2025` is
  // a critics award page with data (Best Film with its top ten), and `awards-san-francisco-critics-2016`
  // is the same page for a year with no data.
  {
    name: "grid-2018-open",
    path: "/grid/2018?critics=open",
    status: 200,
    heading: "2018 year grid",
    ready: async (page) => {
      await expect(page.getByRole("list", { name: "Legend" })).toContainText("No data that year");
      await showCriticsColumns(page);
    },
  },
  {
    name: "accuracy-picture-critics",
    path: "/accuracy/picture",
    status: 200,
    heading: "Accuracy: Best Picture",
    open: showAllCritics,
  },
  {
    name: "awards-nbr-2025",
    path: "/awards/nbr/2025",
    status: 200,
    heading: "NBR 2025",
    ready: async (page) => {
      await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    },
  },
  {
    name: "awards-san-francisco-critics-2016",
    path: "/awards/san-francisco-critics/2016",
    status: 200,
    heading: "SF Bay Area 2016",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "No data for this year" })).toBeVisible();
    },
  },
  // Phase 4 review (triage 2-9): `movie-awards` (above) shows the capped critics list; this one opens it.
  {
    name: "movie-awards-critics-open",
    path: "/movies/the-brutalist",
    status: 200,
    heading: "The Brutalist",
    open: async (page) => {
      const group = page.getByRole("group", { name: "Critics groups" });
      const show = group.getByRole("button", { name: /^Show all \d+ critics groups$/ });
      await expect(async () => {
        if (await show.count()) await show.click();
        await expect(group.getByRole("button", { name: "Show fewer" })).toBeVisible({ timeout: 1000 });
      }).toPass();
    },
  },
  // Phase 5 (task 5.5). The lineup page in a year with films (Cannes 2025: sections, flags, scores) and in
  // 2024, which says "Lineups start in 2025". `movie-screenings` is a film with two screenings and a prize:
  // the Palme d'Or at Cannes 2025 and TIFF 2025's Special Presentations, both listed in its Festivals group.
  {
    name: "festival-lineup-cannes-2025",
    path: "/festivals/cannes/2025",
    status: 200,
    heading: "Cannes 2025",
    // The lineup streams in after the page: wait for its first section.
    ready: async (page) => {
      await expect(page.locator('section[id^="section-"]').first()).toBeVisible();
    },
  },
  {
    name: "festival-lineup-cannes-2024",
    path: "/festivals/cannes/2024",
    status: 200,
    heading: "Cannes 2024",
    ready: async (page) => {
      await expect(page.getByRole("heading", { name: "Lineups start in 2025" })).toBeVisible();
    },
  },
  {
    name: "movie-screenings",
    path: "/movies/it-was-just-an-accident",
    status: 200,
    heading: "It Was Just an Accident",
    ready: async (page) => {
      const festivals = page.getByRole("group", { name: "Festivals" });
      await expect(festivals).toContainText("Palme d'Or");
      await expect(festivals).toContainText("Special Presentations");
    },
  },
  // Phase 6 (task 6.7). The Documentary accuracy page with every critics group open; DOC NYC's award page
  // with its two lists; and the 2024 year grid on the Documentary tab with critics open, centered on DOC NYC's
  // column (task 6.5) so the critics groups after it show too.
  {
    name: "accuracy-documentary-critics",
    path: "/accuracy/documentary",
    status: 200,
    heading: "Accuracy: Best Documentary Feature",
    open: showAllCritics,
  },
  {
    name: "awards-doc-nyc-2025",
    path: "/awards/doc-nyc/2025",
    status: 200,
    heading: "DOC NYC 2025",
    ready: async (page) => {
      await expect(page.getByRole("region", { name: "Short List: Features", exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "Winner's Circle", exact: true })).toBeVisible();
    },
  },
  {
    name: "grid-2024-documentary-open",
    path: "/grid/2024?category=documentary&critics=open",
    status: 200,
    heading: "2024 year grid",
    ready: async (page) => {
      await expect(page.getByRole("table").getByRole("columnheader", { name: "Cinema Eye", exact: true })).toBeVisible();
      await showDocNycColumn(page);
    },
  },
  // Phase 7 (task 7.14). Signals: Documentary 2025 in both views (the accuracy page's link). All years: Critics
  // Choice's Picture and Documentary tabs, then the Oscars. The 2025 Picture grid in Oscar order. The Watch list in
  // its add box with results, in My order with the handles, and with the release editor open (WATCH_ORDER). A
  // co-production's movie page: The Secret Agent (Brazil, France, Germany), one flag and every country in its text.
  {
    name: "signals-2025-documentary-award",
    path: "/signals/2025?category=documentary",
    status: 200,
    heading: "2025 strong signals",
    ready: async (page) => {
      await expect(page.locator('[data-award="cinema-eye/feature"]')).toBeVisible();
    },
  },
  {
    name: "signals-2025-documentary-film",
    path: "/signals/2025?category=documentary&view=film",
    status: 200,
    heading: "2025 strong signals",
    ready: async (page) => {
      await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
    },
  },
  {
    name: "awards-critics-choice-all-picture",
    path: "/awards/critics-choice/all",
    status: 200,
    heading: "Critics Choice, all years",
    ready: async (page) => {
      await expect(page.getByRole("region", { name: "Critics Choice 2025" }).locator("[data-winner]").first()).toBeVisible();
    },
  },
  {
    name: "awards-critics-choice-all-documentary",
    path: "/awards/critics-choice/all?category=documentary",
    status: 200,
    heading: "Critics Choice, all years",
    ready: async (page) => {
      const tabs = page.getByRole("navigation", { name: "Category" });
      await expect(tabs.getByRole("link", { name: "Documentary" })).toHaveAttribute("aria-current", "page");
      const old = page.getByRole("region", { name: "Critics Choice 2015" });
      await expect(old.getByRole("heading", { level: 3 }).first()).toBeVisible();
    },
  },
  {
    name: "awards-oscars-all",
    path: "/awards/oscars/all",
    status: 200,
    heading: "Oscars, all years",
    ready: async (page) => {
      await expect(page.getByRole("region", { name: "Oscars 2025" })).toBeVisible();
    },
  },
  {
    name: "grid-2025-oscar",
    path: "/grid/2025?sort=oscar",
    status: 200,
    heading: "2025 year grid",
    // Oscar order leads with the winner (task 7.7); the sort button names it.
    ready: async (page) => {
      await expect(page.getByRole("button", { name: "Sort: Oscars" })).toBeVisible();
      const winner = page.getByRole("table").getByRole("rowheader").filter({ has: page.getByRole("link") }).first();
      await expect(winner).toHaveAttribute("aria-label", "One Battle After Another");
    },
  },
  {
    // The sort menu open over the grid's group rows (7.R: no shot showed either).
    name: "grid-2025-sort-menu",
    path: "/grid/2025",
    status: 200,
    heading: "2025 year grid",
    ready: async (page) => {
      await expect(page.locator("th[scope=rowgroup]").first()).toHaveText(/^Oscar winner and nominees/);
    },
    open: async (page) => {
      const button = page.getByRole("button", { name: "Sort: Oscars" });
      const menu = page.getByRole("menu", { name: "Sort the films by" });
      // Pressed again until it opens: a press before hydration does nothing.
      await expect(async () => {
        if (!(await menu.isVisible())) await button.click();
        await expect(menu).toBeVisible({ timeout: 2_000 });
      }).toPass();
    },
  },
  {
    name: "watch-list-add",
    path: "/watch-list",
    status: 200,
    heading: "Watch list",
    prepare: () => setWatchList(WATCH_ORDER),
    ready: expectMyOrder,
    open: typeInAddBox,
  },
  {
    name: "watch-list-order",
    path: "/watch-list",
    status: 200,
    heading: "Watch list",
    prepare: () => setWatchList(WATCH_ORDER),
    ready: expectMyOrder,
  },
  {
    name: "watch-list-editor",
    path: "/watch-list",
    status: 200,
    heading: "Watch list",
    prepare: () => setWatchList(WATCH_ORDER),
    ready: expectMyOrder,
    open: openReleaseEditor,
  },
  {
    name: "movie-co-production",
    path: "/movies/the-secret-agent",
    status: 200,
    heading: "The Secret Agent",
    ready: async (page) => {
      await expect(page.getByText("Brazil, France, Germany")).toBeVisible();
    },
  },
  // Phase 8 (task 8.9). The 2024 patterns page in Documentary and in International: the five next to the nominees,
  // the misses with their reasons, the backtest. The live year's page before the shortlist (Documentary, the default).
  // The Documentary shortlist on the Oscars page with its flags, and a flagged film's page with its panel. No "Why
  // they missed" row opens (each shows its reasons already), so no route expands one.
  {
    name: "patterns-2024-documentary",
    path: "/patterns/2024",
    status: 200,
    heading: "2024 nomination patterns",
    ready: async (page) => {
      await expect(page.locator("#missed").getByRole("heading", { level: 2 })).toHaveText("Why they missed");
    },
  },
  {
    name: "patterns-2024-international",
    path: "/patterns/2024?category=international",
    status: 200,
    heading: "2024 nomination patterns",
    ready: async (page) => {
      await expect(page.getByRole("link", { name: "International" })).toHaveAttribute("aria-current", "page");
      await expect(page.locator("#missed").getByRole("heading", { level: 2 })).toHaveText("Why they missed");
    },
  },
  {
    name: "patterns-live",
    path: "/patterns/2026",
    status: 200,
    heading: "2026 nomination patterns",
    ready: async (page) => {
      await expect(page.getByRole("heading", { level: 2, name: "The contenders so far" })).toBeVisible();
    },
  },
  {
    name: "oscars-2025-shortlist",
    path: "/awards/oscars/2025",
    status: 200,
    heading: "Oscars 2025",
    ready: async (page) => {
      const documentary = page.getByRole("region", { name: "Best Documentary Feature" });
      await expect(documentary.getByRole("heading", { level: 3, name: /^Shortlisted, not nominated \(\d+\)$/ })).toBeVisible();
      await expect(documentary.locator("[data-snub-risk]").first()).toBeVisible();
    },
  },
  {
    name: "movie-undesirable-friends",
    path: "/movies/my-undesirable-friends-part-i-last-air-in-moscow",
    status: 200,
    heading: "My Undesirable Friends: Part I — Last Air in Moscow",
    ready: async (page) => {
      const panel = page.getByRole("region", { name: "Nomination patterns" });
      await expect(panel.getByText("Snub risk", { exact: false }).first()).toContainText(/flagged, and missed/i);
    },
  },
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
        await route.ready?.(page);
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
