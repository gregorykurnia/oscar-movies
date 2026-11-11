// The Watch list (task 1.14, guide §8.3): both sections, the sort in the address, and marks that
// change the list only on the next visit, never under the tap; Add a film (7.8) and My order's
// drag handles (7.9) and the release editor (7.10). It writes marks on the `test` branch and puts each one back as it was.
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { lockFilmWrites } from "../../src/db/write-lock";
import { marks, movies } from "../../src/db/schema";
import { LIVE_YEAR } from "../../src/lib/years";
import { addFilmSlug, type AddFilmInput } from "../../src/lib/add-film";

const { db, close } = createScriptDb();
test.afterAll(() => close());

test("film save actions invalidate cached misses, preserve notes and safely retry manual/catalogue additions", async ({ page, request }) => {
  test.setTimeout(90_000);
  const savedMarks = await db.select().from(marks);
  const identities = Array.from({ length: 4 }, () => randomUUID());
  const title = `Atomic save ${identities[0]}`;
  const manual: AddFilmInput = { kind: "manual", localId: identities[0], title, year: 2030 };
  const slug = addFilmSlug(title, 2030, identities[0]);
  const openChecks = async () => {
    await page.goto("/styleguide/film-saves");
    await expect.poll(() => page.evaluate(() => !!window.filmSaveChecks)).toBe(true);
  };
  const save = (input: AddFilmInput) => page.evaluate((value) => window.filmSaveChecks!.addFilm(value), input);
  try {
    // Cache the missing movie first; saving must expire this exact miss.
    await page.goto(`/movies/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page isn't here");
    await openChecks();
    const added = await save(manual);
    expect(added).toMatchObject({ ok: true, created: true, refreshRequired: false, film: { slug, title } });
    if (!added.ok) throw new Error(added.reason);
    const id = added.film.id;
    const retries = await page.evaluate((value) => Promise.all([
      window.filmSaveChecks!.addFilm(value), window.filmSaveChecks!.addFilm(value),
    ]), manual);
    expect(retries).toEqual(retries.map(() => ({ ok: true, created: false, refreshRequired: false, film: added.film })));
    await page.evaluate(async (movieId) => {
      await window.filmSaveChecks!.setRelease(movieId, "2030-12-12", "MUBI");
      await window.filmSaveChecks!.saveMark({ movieId, watched: true, want: false });
    }, id);
    expect(await save(manual)).toMatchObject({ ok: true, film: { id }, created: false });
    expect(await save({ ...manual, title: "Changed after uncertain response" })).toEqual({ ok: false, reason: "draft-changed" });
    expect((await db.select().from(marks).where(eq(marks.movieId, id)))[0]).toMatchObject({ want: true, watched: false, wantRank: 1, releaseOn: "2030-12-12", platform: "MUBI" });
    const duplicate: AddFilmInput = { ...manual, localId: identities[1] };
    expect(await save(duplicate)).toEqual({ ok: false, reason: "duplicate", matches: [added.film] });
    expect(await save({ ...duplicate, duplicate: { kind: "use", movieId: id } })).toMatchObject({ ok: true, created: false, film: { id } });
    const different = await save({ ...duplicate, duplicate: { kind: "different" } });
    expect(different).toMatchObject({ ok: true, created: true });
    if (!different.ok) throw new Error(different.reason);
    expect(different.film.id).not.toBe(id);
    expect(await save({ ...manual, duplicate: { kind: "use", movieId: different.film.id } }))
      .toEqual({ ok: false, reason: "draft-changed" });
    const catalogue: AddFilmInput = { kind: "catalogue", localId: identities[2], tmdbId: 99004003 };
    expect(await save(catalogue)).toMatchObject({ ok: true, film: { title: "Upcoming fixture", year: 2030 } });
    expect(await save(catalogue)).toMatchObject({ ok: true, created: false });
    const unknown: AddFilmInput = { kind: "catalogue", localId: identities[3], tmdbId: 99004004 };
    expect(await save(unknown)).toEqual({ ok: false, reason: "missing-year" });
    expect(await save({ ...unknown, year: 2033 })).toMatchObject({ ok: true, film: { year: 2033 } });
    expect(await save({ ...unknown, tmdbId: 99004005 })).toEqual({ ok: false, reason: "not-found" });
    await page.goto(`/movies/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    const search = await (await request.get(`/api/search?${new URLSearchParams({ q: title })}`)).json();
    expect(search.films).toEqual(expect.arrayContaining([expect.objectContaining({ id, slug })]));
    await page.goto("/watch-list?sort=mine");
    await expect(page.locator(`a[href="/movies/${slug}"]`)).toBeVisible();
  } finally {
    await db.transaction(async (tx) => {
      await lockFilmWrites(tx);
      const films = await tx.select({ id: movies.id }).from(movies).where(inArray(movies.localId, identities));
      const ids = films.map((f) => f.id);
      if (ids.length) {
        await tx.delete(marks).where(inArray(marks.movieId, ids));
        await tx.delete(movies).where(inArray(movies.id, ids));
      }
      for (const row of savedMarks) await tx.insert(marks).values(row).onConflictDoUpdate({ target: marks.movieId, set: row });
    });
  }
});

test("catalogue route uses server fixtures, pages results and never writes films or marks", async ({ request }) => {
  const before = await db.select({ id: movies.id }).from(movies);
  const savedMarks = await db.select().from(marks);
  const search = async (q: string, page = 1) => request.get(`/api/movie-catalogue?${new URLSearchParams({ q, page: String(page) })}`);
  const response = await search("fixture:all");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const body = await response.json();
  expect(body).toMatchObject({ ok: true, value: { page: 1, nextPage: null } });
  expect(body.value.films.map((film: { title: string; year: number | null }) => [film.title, film.year])).toEqual([
    ["Mother", 2009], ["Mother", 1926], ["Upcoming fixture", 2030], ["Unknown year fixture", null], ["Deleted fixture", 2024],
  ]);
  const first = await (await search("fixture:pages")).json();
  const second = await (await search("fixture:pages", first.value.nextPage)).json();
  expect(first.value.films).toHaveLength(3);
  expect(second.value.films).toHaveLength(2);
  expect(second.value.nextPage).toBeNull();
  expect(await (await search("fixture:empty")).json()).toEqual({ ok: true, value: { films: [], page: 1, nextPage: null } });
  for (const [query, error, status] of [
    ["fixture:malformed", "invalid-response", 502], ["fixture:401", "refused", 503],
    ["fixture:429", "rate-limited", 429], ["fixture:timeout", "timeout", 504], ["fixture:offline", "network", 502],
  ] as const) {
    const failure = await search(query);
    expect(failure.status()).toBe(status);
    expect(await failure.json()).toMatchObject({ ok: false, error });
  }
  expect((await search("Mother", 501)).status()).toBe(400);
  const local = await request.get("/api/search?q=anora");
  expect(await local.json()).toMatchObject({ films: expect.any(Array), awards: expect.any(Array) });
  expect((await db.select({ id: movies.id }).from(movies)).sort((a, b) => a.id - b.id)).toEqual(before.sort((a, b) => a.id - b.id));
  expect((await db.select().from(marks)).sort((a, b) => a.movieId - b.movieId)).toEqual(savedMarks.sort((a, b) => a.movieId - b.movieId));
});

async function movieId(slug: string) {
  const [row] = await db.select({ id: movies.id }).from(movies).where(eq(movies.slug, slug));
  expect(row, slug).toBeTruthy();
  return row.id;
}

const readMark = async (id: number) =>
  (await db.select({ watched: marks.watched, want: marks.want }).from(marks).where(eq(marks.movieId, id)))[0] ?? null;

async function setMark(id: number, value: { watched: boolean; want: boolean } | null) {
  if (value === null) {
    await db.delete(marks).where(eq(marks.movieId, id));
    return;
  }
  await db
    .insert(marks)
    .values({ movieId: id, ...value })
    .onConflictDoUpdate({ target: marks.movieId, set: value });
}

/**
 * Puts every mark back as `saved` (a `select().from(marks)` taken before the test): the film's
 * whole row, and the places a want or unwant moved the other films to (7.R).
 */
async function putBack(id: number, saved: (typeof marks.$inferSelect)[]) {
  if (!saved.some((row) => row.movieId === id)) await db.delete(marks).where(eq(marks.movieId, id));
  for (const row of saved) {
    await db.insert(marks).values(row).onConflictDoUpdate({ target: marks.movieId, set: row });
  }
}

/**
 * Types into the Add a film box until `option` shows: typing before the box has hydrated
 * fires no search (7.R), so it is typed again.
 */
async function typeToFind(box: import("@playwright/test").Locator, text: string, option: import("@playwright/test").Locator) {
  await expect(async () => {
    await box.fill("");
    await box.fill(text);
    await expect(option).toBeVisible({ timeout: 2_000 });
  }).toPass();
}

/** The row a title heading sits in. */
const rowOf = (heading: import("@playwright/test").Locator) => heading.locator("xpath=ancestor::div[contains(@class,'border-b')][1]");
const section = (page: import("@playwright/test").Page, name: string) => page.getByRole("region", { name });
const titlesIn = (region: import("@playwright/test").Locator) => region.getByRole("heading", { level: 3 }).allTextContents();

test("both sections list their films, and the sort is kept in the address", async ({ page }) => {
  const id = await movieId("im-still-here");
  const saved = await db.select().from(marks);
  try {
    await setMark(id, { watched: false, want: true });
    await page.goto("/watch-list");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Watch list");
    await expect(page).toHaveTitle("Watch list · Oscar Movies");

    // A film wanted from an earlier year, at the furthest stage it reached.
    const want = section(page, "Want to watch");
    const row = want.getByRole("heading", { level: 3, name: "I'm Still Here" });
    await expect(row).toBeVisible();
    await expect(want.locator("[data-stage]").first()).toBeVisible();

    // The season section: films of the live season, the first twenty until "Show all".
    const season = section(page, `Not watched yet, ${LIVE_YEAR} season`);
    await expect(season.getByRole("heading", { level: 3 })).toHaveCount(20);
    await expect(season.getByText(/^\d+ films?$/)).toHaveText("100 films");
    await season.getByRole("link", { name: "Show all 100 films" }).click();
    await expect(page).toHaveURL(/\/watch-list\?all=1$/);
    await expect(season.getByRole("heading", { level: 3 })).toHaveCount(100);

    // Sort: kept in the address with "show all", and after a reload.
    const sort = page.getByRole("navigation", { name: "Sort by" });
    await sort.getByRole("link", { name: "Average score" }).click();
    await expect(page).toHaveURL(/\/watch-list\?sort=average&all=1$/);
    await expect(sort.getByRole("link", { name: "Average score" })).toHaveAttribute("aria-current", "page");
    await page.reload();
    await expect(sort.getByRole("link", { name: "Average score" })).toHaveAttribute("aria-current", "page");
    await expect(season.getByRole("heading", { level: 3 })).toHaveCount(100);
  } finally {
    await putBack(id, saved);
  }
});

test("sorted by % chance, the season's films run from the best chance down, and the figure shows", async ({ page }) => {
  await page.goto("/watch-list?sort=chance&all=1");
  await expect(page.getByRole("navigation", { name: "Sort by" }).getByRole("link", { name: "% chance" })).toHaveAttribute("aria-current", "page");
  const season = section(page, `Not watched yet, ${LIVE_YEAR} season`);
  const rows = season.getByRole("heading", { level: 3 });
  await expect(rows).toHaveCount(100);
  // The "To win" figures in row order: percentages first, then the dashes (no chance stored).
  const figures = await season.evaluate((el) =>
    [...el.querySelectorAll("span")]
      .filter((s) => s.firstElementChild?.textContent === "To win ")
      .map((s) => (s.textContent ?? "").replace("To win ", "").trim()),
  );
  expect(figures).toHaveLength(100);
  const real = figures.filter((t) => t !== "–");
  expect(figures.slice(real.length).every((t) => t === "–")).toBe(true);
  const pct = real.map((t) => (t === "<1%" ? 0.5 : parseFloat(t)));
  expect(pct.length).toBeGreaterThan(5);
  expect(pct).toEqual([...pct].sort((a, b) => b - a));
});

test("unmarking a film leaves its row until the next visit", async ({ page }) => {
  const id = await movieId("im-still-here");
  const saved = await db.select().from(marks);
  try {
    await setMark(id, { watched: false, want: true });
    await page.goto("/watch-list");
    const want = section(page, "Want to watch");
    const row = want.getByRole("heading", { level: 3, name: "I'm Still Here" });
    const mark = want.getByRole("button", { name: "Want to watch", exact: true }).first();
    await expect(mark).toBeEnabled();
    await expect(row).toBeVisible();

    // Tapping it off: the mark shows off and saves, the row stays put.
    const before = await titlesIn(want);
    await rowOf(row).getByRole("button", { name: "Want to watch" }).click();
    await expect.poll(() => readMark(id)).toEqual({ watched: false, want: false });
    await expect(rowOf(row).getByRole("button", { name: "Add to want to watch" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await page.waitForTimeout(500);
    expect(await titlesIn(want)).toEqual(before);

    // Going to another page and back inside the app: it is gone.
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Race" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^The \d{4} race$/);
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Watch list" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Watch list");
    await expect(section(page, "Want to watch").getByRole("heading", { level: 3, name: "I'm Still Here" })).toHaveCount(0);
    await page.reload();
    await expect(section(page, "Want to watch").getByRole("heading", { level: 3, name: "I'm Still Here" })).toHaveCount(0);
  } finally {
    await putBack(id, saved);
  }
});

test("a season film marked watched stays until the next visit, then leaves the list", async ({ page }) => {
  await page.goto("/watch-list");
  const season = section(page, `Not watched yet, ${LIVE_YEAR} season`);
  const first = season.getByRole("heading", { level: 3 }).first();
  const title = (await first.textContent()) ?? "";
  const href = (await first.getByRole("link").getAttribute("href")) ?? "";
  const id = await movieId(href.replace("/movies/", ""));
  const saved = await db.select().from(marks);
  try {
    const row = rowOf(first);
    const watched = row.getByRole("button", { name: "Mark as watched" });
    await expect(watched).toBeEnabled();
    await watched.click();
    await expect.poll(() => readMark(id)).toEqual({ watched: true, want: false });
    await expect(row.getByRole("button", { name: "Watched", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(first).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Watch list");
    await expect(season.getByRole("heading", { level: 3, name: title, exact: true })).toHaveCount(0);
    await expect(season.getByText(/^\d+ films?$/)).toHaveText("99 films");
  } finally {
    await putBack(id, saved);
  }
});

test("adds a film by typing part of its original title, and it is at the top after a reload", async ({ page }) => {
  const id = await movieId("the-secret-agent");
  const saved = await db.select().from(marks);
  try {
    // Start from a list without the film (an earlier run may have left it wanted).
    await setMark(id, null);
    await page.goto("/watch-list");
    const box = page.getByRole("combobox", { name: "Add a film" });
    await expect(box).toBeVisible();
    // Found by its original title (shown with the match), not yet on the list.
    const result = page.getByRole("option", { name: /The Secret Agent/ });
    await typeToFind(box, "agente secre", result);
    await expect(result).toContainText("O Agente Secreto");
    await expect(result).not.toContainText("On your list");
    await box.press("Enter");

    // A toast confirms, the box clears and the film heads Want to watch without a reload.
    await expect(page.getByRole("status").filter({ hasText: "The Secret Agent added" })).toBeVisible();
    await expect(box).toHaveValue("");
    const want = section(page, "Want to watch");
    await expect.poll(async () => (await titlesIn(want))[0]).toBe("The Secret Agent");
    await expect.poll(() => readMark(id)).toEqual({ watched: false, want: true });

    await page.reload();
    await expect.poll(async () => (await titlesIn(section(page, "Want to watch")))[0]).toBe("The Secret Agent");

    // Typing it again says it is on the list.
    const again = page.getByRole("option", { name: /The Secret Agent/ });
    await typeToFind(page.getByRole("combobox", { name: "Add a film" }), "agente secre", again);
    await expect(again).toContainText("On your list");

    // No match: the line says so, and nothing is added.
    await page.getByRole("combobox", { name: "Add a film" }).fill("zzzxq");
    await expect(page.getByText("No film called “zzzxq” in the app yet.")).toBeVisible();
  } finally {
    // Put every mark back, including the places the add moved the other films to.
    await putBack(id, saved);
  }
});

// My order (7.9): three wanted films in a known order, every other mark set aside and put back.
const ORDER = ["anora", "hamnet", "im-still-here"] as const;

async function withOrder(run: (titles: string[], ids: number[]) => Promise<void>) {
  const saved = await db.select().from(marks);
  const ids = await Promise.all(ORDER.map(movieId));
  const titles = await Promise.all(
    ids.map(async (id) => (await db.select({ title: movies.title }).from(movies).where(eq(movies.id, id)))[0].title),
  );
  try {
    await db.delete(marks);
    await db.insert(marks).values(ids.map((id, i) => ({ movieId: id, watched: false, want: true, wantRank: i + 1 })));
    await run(titles, ids);
  } finally {
    await db.delete(marks);
    if (saved.length > 0) await db.insert(marks).values(saved);
  }
}

const storedOrder = async (ids: number[]) => {
  const rows = await db.select({ movieId: marks.movieId, wantRank: marks.wantRank }).from(marks);
  return [...rows].filter((r) => ids.includes(r.movieId)).sort((a, b) => (a.wantRank ?? 0) - (b.wantRank ?? 0)).map((r) => r.movieId);
};

test("release sort and combined filters survive reload, clear safely, and ignore unknown addresses", async ({ page }) => {
  await withOrder(async ([a, b, c], [first, second]) => {
    await db.update(marks).set({ releaseOn: "2099-12-12", platform: "Cinépolis", releaseTentative: true, updatedAt: new Date("2030-01-01") }).where(eq(marks.movieId, first));
    await db.update(marks).set({ releaseOn: "2020-01-01", platform: "CINEPOLIS", updatedAt: new Date("2020-01-01") }).where(eq(marks.movieId, second));
    await page.goto("/watch-list?sort=release&platform=CINEPOLIS");
    const want = section(page, "Want to watch");
    await expect.poll(() => titlesIn(want)).toEqual([b, a]);
    await expect(want.getByText("2 of 3 films", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Reorder / })).toHaveCount(0);
    await expect(section(page, `Not watched yet, ${LIVE_YEAR} season`)).toHaveCount(0);
    // Latest spelling among currently wanted films, with each normalized name only once.
    const platform = page.getByRole("button", { name: "Platform: Cinépolis", exact: true });
    await platform.click();
    await expect(page.getByRole("menuitemradio", { name: "Cinépolis", exact: true })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(platform).toBeFocused();
    await page.getByRole("button", { name: "Release: All", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Coming A date after today", exact: true }).click();
    await expect(page).toHaveURL(/sort=release&platform=Cin%C3%A9polis&release=coming$/);
    await expect.poll(() => titlesIn(want)).toEqual([a]);
    await page.reload();
    await expect(want.getByText("1 of 3 films", { exact: true })).toBeVisible();
    await expect.poll(() => titlesIn(want)).toEqual([a]);
    await page.getByRole("link", { name: "Clear filters", exact: true }).click();
    await expect(page).toHaveURL(/\/watch-list\?sort=release$/);
    await expect.poll(() => titlesIn(want)).toEqual([b, a, c]);
    await expect(section(page, `Not watched yet, ${LIVE_YEAR} season`)).toBeVisible();

    await page.goto("/watch-list?platform=CINEPOLIS&release=tbd");
    await expect(want.getByRole("heading", { name: "No films match these filters" })).toBeVisible();
    await expect(want.getByText("0 of 3 films", { exact: true })).toBeVisible();
    await expect(want).toContainText("on Cinépolis and still TBD");
    await want.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/watch-list$/);
    await expect(page.getByRole("button", { name: /^Reorder / })).toHaveCount(3);

    await page.goto("/watch-list?platform=none&release=tbd");
    await expect.poll(() => titlesIn(want)).toEqual([c]);
    await expect(page.getByRole("button", { name: /^Reorder / })).toHaveCount(0);
    await expect(section(page, `Not watched yet, ${LIVE_YEAR} season`)).toHaveCount(0);
    await page.goto("/watch-list?sort=unknown&platform=unknown&release=unknown");
    await expect.poll(() => titlesIn(want)).toEqual([a, b, c]);
    await expect(page.getByRole("button", { name: /^Reorder / })).toHaveCount(3);
    await expect(section(page, `Not watched yet, ${LIVE_YEAR} season`)).toBeVisible();
  });
});

/** Neither the window nor the page is wider than the screen. */
const noSidewaysScroll = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.scrollX === 0 && document.documentElement.scrollWidth <= document.documentElement.clientWidth);

for (const width of [390, 1280]) {
  test.describe(`My order at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
    });

    test("moves a film by keyboard, Esc puts one back, and the order survives a reload", async ({ page }) => {
      await withOrder(async ([a, b, c], ids) => {
        await page.goto("/watch-list");
        const want = section(page, "Want to watch");
        await expect.poll(() => titlesIn(want)).toEqual([a, b, c]);
        await expect(want.getByText("3 films · drag the handle to reorder")).toBeVisible();
        await expect(section(page, `Not watched yet, ${LIVE_YEAR} season`).getByText(/· by Oscar stage$/)).toBeVisible();

        // Space lifts, ↓ moves, space drops: the notice and the live region follow the move.
        const handle = want.getByRole("button", { name: `Reorder ${a}` });
        await handle.focus();
        await page.keyboard.press("Space");
        await expect(page.getByText(`Moving ${a}.`)).toBeVisible();
        await page.keyboard.press("ArrowDown");
        await expect(page.getByText(`Moving ${a}. Position 2 of 3.`)).toBeVisible();
        await expect(page.getByText(`Moved ${a} to position 2 of 3`)).toBeAttached();
        await page.keyboard.press("Space");
        await expect(page.getByText(`Moving ${a}.`)).toHaveCount(0);
        await expect.poll(() => titlesIn(want)).toEqual([b, a, c]);
        await expect(handle).toBeFocused();
        await expect.poll(() => storedOrder(ids)).toEqual([ids[1], ids[0], ids[2]]);

        // Esc puts a lifted film back where it was, and nothing is saved.
        await handle.focus();
        await page.keyboard.press("Space");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Escape");
        await expect.poll(() => titlesIn(want)).toEqual([b, a, c]);

        await page.reload();
        await expect.poll(() => titlesIn(section(page, "Want to watch"))).toEqual([b, a, c]);
        expect(await storedOrder(ids)).toEqual([ids[1], ids[0], ids[2]]);
      });
    });

    test("moves a film by mouse without the page scrolling sideways, and the order survives a reload", async ({ page }) => {
      // Tall enough that all three rows (each with its release line) are on screen, so the pointer never starts below the fold.
      await page.setViewportSize({ width, height: 1100 });
      await withOrder(async ([a, b, c], ids) => {
        await page.goto("/watch-list");
        const want = section(page, "Want to watch");
        await expect.poll(() => titlesIn(want)).toEqual([a, b, c]);

        // Drag the last film's handle above the first row, wandering sideways on the way.
        const from = await want.getByRole("button", { name: `Reorder ${c}` }).boundingBox();
        const to = await rowOf(want.getByRole("heading", { level: 3, name: a })).boundingBox();
        if (!from || !to) throw new Error("rows not laid out");
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + from.width / 2 + 10, from.y, { steps: 5 });
        await page.mouse.move(from.x + width, to.y + to.height / 2, { steps: 10 });
        await page.mouse.move(from.x + from.width / 2, to.y + 4, { steps: 10 });
        expect(await noSidewaysScroll(page)).toBe(true);
        await page.mouse.up();

        await expect.poll(() => titlesIn(want)).toEqual([c, a, b]);
        expect(await noSidewaysScroll(page)).toBe(true);
        await expect.poll(() => storedOrder(ids)).toEqual([ids[2], ids[0], ids[1]]);
        await page.reload();
        await expect.poll(() => titlesIn(section(page, "Want to watch"))).toEqual([c, a, b]);
      });
    });
  });
}

test("a move that can't be saved puts the rows back and says so; other sorts have no handles", async ({ page }) => {
  await withOrder(async ([a, b, c], ids) => {
    await page.goto("/watch-list");
    const want = section(page, "Want to watch");
    await expect.poll(() => titlesIn(want)).toEqual([a, b, c]);

    // The save (a Server Action, posted to the page) fails.
    await page.route("**/watch-list", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
    await want.getByRole("button", { name: `Reorder ${b}` }).focus();
    // Each key waits for the lift or move it makes: a key pressed before the drag has started is lost.
    await page.keyboard.press("Space");
    await expect(page.getByText(`Moving ${b}.`)).toBeVisible();
    await page.keyboard.press("ArrowUp");
    await expect(page.getByText(`Moving ${b}. Position 1 of 3.`)).toBeVisible();
    await page.keyboard.press("Space");
    await expect(page.getByRole("status").filter({ hasText: "Couldn't save the order" })).toContainText(
      "Your list is back as it was.",
    );
    await expect.poll(() => titlesIn(want)).toEqual([a, b, c]);
    expect(await storedOrder(ids)).toEqual(ids);

    // Try again, with the connection back, makes the move.
    await page.unroute("**/watch-list");
    await page.getByRole("status").filter({ hasText: "Couldn't save the order" }).getByRole("button", { name: "Try again" }).click();
    await expect.poll(() => titlesIn(want)).toEqual([b, a, c]);
    await expect.poll(() => storedOrder(ids)).toEqual([ids[1], ids[0], ids[2]]);

    // Under another sort the handles are gone.
    await page.goto("/watch-list?sort=stage");
    await expect(section(page, "Want to watch").getByRole("heading", { level: 3 })).toHaveCount(3);
    await expect(page.getByRole("button", { name: /^Reorder / })).toHaveCount(0);
  });
});

// Release date and platform (7.10): the editor opens from each Want to watch row's release line.
const storedRelease = async (id: number) =>
  (await db.select({ releaseOn: marks.releaseOn, platform: marks.platform }).from(marks).where(eq(marks.movieId, id)))[0];

/** Tab until the field has focus: the browser's date field has a stop for its day, month and year. */
async function tabTo(page: import("@playwright/test").Page, target: import("@playwright/test").Locator) {
  for (let i = 0; i < 4 && !(await target.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(target).toBeFocused();
}

const editorOf = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "Release date and platform" });

test("sets a film's date and platform by keyboard, reloads, fails and retries, then clears", async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await withOrder(async ([a], [id]) => {
    await page.goto("/watch-list");
    const row = rowOf(
      section(page, "Want to watch").getByRole("heading", {
        level: 3,
        name: a,
      }),
    );
    const line = row.getByRole("button", { name: "Add release date" });
    await expect(line).toHaveAttribute("aria-expanded", "false");

    // Enter opens the editor with focus in the Date field.
    await line.focus();
    await page.keyboard.press("Enter");
    const editor = editorOf(page);
    const date = editor.getByLabel("Date");
    await expect(editor).toBeVisible();
    await expect(editor).toContainText(a);
    await expect(editor).toContainText("The first date you can watch it from Indonesia. Empty means TBD.");
    await expect(date).toBeFocused();
    await expect(editor.getByRole("button", { name: "Clear" })).toBeDisabled();

    // Tab runs Date, the chosen status, Platform, Clear, Cancel, Save; arrows change the status.
    await date.fill("2030-12-12");
    const tentative = editor.getByRole("radio", { name: "Tentative" });
    await tabTo(page, tentative);
    await tentative.press("ArrowLeft");
    await expect(editor.getByRole("radio", { name: "Confirmed" })).toBeChecked();
    const platform = editor.getByRole("combobox", { name: "Platform" });
    await tabTo(page, platform);
    await page.keyboard.press("Tab");
    await expect(editor.getByRole("button", { name: "Clear" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(editor.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(editor.getByRole("button", { name: "Save" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(editor).toHaveCount(0);
    await expect(line).toBeFocused();
    expect(await storedRelease(id)).toEqual({
      releaseOn: null,
      platform: null,
    });

    // Reopen, type, take a suggestion with the arrows, and Enter (no list open) saves.
    await page.keyboard.press("Enter");
    await expect(date).toBeFocused();
    await expect(date).toHaveValue("");
    await date.fill("2030-12-12");
    await tabTo(page, tentative);
    await tentative.press("ArrowLeft");
    await tabTo(page, platform);
    await platform.pressSequentially("net");
    await expect(editor.getByRole("listbox", { name: "Platforms" })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(editor.getByRole("option", { selected: true })).toHaveText("Netflix");
    await page.keyboard.press("Enter");
    await expect(platform).toHaveValue("Netflix");
    await expect(editor.getByRole("listbox")).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(editor).toHaveCount(0);
    const saved = row.getByRole("button", { name: /12 Dec 2030 · Netflix/ });
    await expect(saved).toBeFocused();
    await expect.poll(() => storedRelease(id)).toEqual({ releaseOn: "2030-12-12", platform: "Netflix" });

    // Both survive a reload.
    await page.reload();
    const reloaded = rowOf(
      section(page, "Want to watch").getByRole("heading", {
        level: 3,
        name: a,
      }),
    ).getByRole("button", {
      name: /12 Dec 2030 · Netflix/,
    });
    await expect(reloaded).toBeVisible();

    // A save that fails stays open with the values kept and says so; the release is as it was.
    await reloaded.click();
    await platform.fill("MUBI");
    await page.route("**/watch-list", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(editor.getByRole("alert")).toContainText(`${a}'s release is as it was.`);
    await expect(platform).toHaveValue("MUBI");
    expect(await storedRelease(id)).toEqual({
      releaseOn: "2030-12-12",
      platform: "Netflix",
    });

    // Save again with the connection back: no date reads TBD only if emptied; here the date stays.
    await page.unroute("**/watch-list");
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(editor).toHaveCount(0);
    await expect.poll(() => storedRelease(id)).toEqual({ releaseOn: "2030-12-12", platform: "MUBI" });

    // Clear empties both and saves at once; the platform just used is offered as "Used before".
    await row.getByRole("button", { name: /12 Dec 2030 · MUBI/ }).click();
    await platform.focus();
    await expect(editor.getByRole("group", { name: "Used before" }).getByRole("option", { name: "MUBI" })).toBeVisible();
    await editor.getByRole("button", { name: "Clear" }).click();
    await expect(editor).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Add release date" })).toBeFocused();
    await expect.poll(() => storedRelease(id)).toEqual({ releaseOn: null, platform: null });

    // A platform alone reads TBD.
    await row.getByRole("button", { name: "Add release date" }).click();
    await platform.fill("Cinema XXI");
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(row.getByRole("button", { name: /TBD · Cinema XXI/ })).toBeVisible();
    await expect.poll(() => storedRelease(id)).toEqual({ releaseOn: null, platform: "Cinema XXI" });
  });
});

test("on a phone the editor is a sheet that keeps focus inside, and the page doesn't scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await withOrder(async ([a], [id]) => {
    await page.goto("/watch-list");
    const row = rowOf(
      section(page, "Want to watch").getByRole("heading", {
        level: 3,
        name: a,
      }),
    );
    const line = row.getByRole("button", { name: "Add release date" });
    await line.click();
    const editor = editorOf(page);
    await expect(editor).toHaveAttribute("aria-modal", "true");
    await expect(editor.getByLabel("Date")).toBeFocused();

    // Tab wraps from the last control to the close button and back.
    await editor.getByRole("button", { name: "Save" }).focus();
    await page.keyboard.press("Tab");
    await expect(editor.getByRole("button", { name: "Close" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(editor.getByRole("button", { name: "Save" })).toBeFocused();

    // Close returns focus to the line; a long platform wraps without widening the page.
    await editor.getByRole("button", { name: "Close" }).click();
    await expect(editor).toHaveCount(0);
    await expect(line).toBeFocused();
    await line.click();
    await editor.getByLabel("Date").fill("2030-01-05");
    await editor.getByRole("combobox", { name: "Platform" }).fill("Cinépolis Lippo Mall Kemang IMAX Laser");
    await editor.getByRole("button", { name: "Save" }).click();
    await expect(editor).toHaveCount(0);
    await expect(
      row.getByRole("button", {
        name: /5 Jan 2030, tentative · Cinépolis Lippo Mall Kemang IMAX Laser/,
      }),
    ).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(true);
    await expect
      .poll(() => storedRelease(id))
      .toEqual({
        releaseOn: "2030-01-05",
        platform: "Cinépolis Lippo Mall Kemang IMAX Laser",
      });
  });
});

test("tentative release dates survive reload, confirmed edits keep their choice, and TBD drops the flag", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await withOrder(async ([title], [id]) => {
    const stored = async () => (await db.select({ date: marks.releaseOn, tentative: marks.releaseTentative }).from(marks).where(eq(marks.movieId, id)))[0];
    await page.goto("/watch-list");
    const row = rowOf(section(page, "Want to watch").getByRole("heading", { level: 3, name: title }));
    const editor = editorOf(page);
    await row.getByRole("button", { name: "Add release date" }).click();
    await expect(editor.getByRole("radiogroup")).toHaveCount(0);
    await editor.getByLabel("Date", { exact: true }).fill("2030-12-12");
    await expect(editor.getByRole("radio", { name: "Tentative" })).toBeChecked();
    await editor.getByRole("combobox", { name: "Platform" }).fill("Netflix");
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(stored).toEqual({ date: "2030-12-12", tentative: true });
    await page.reload();
    const line = row.getByRole("button", { name: "12 Dec 2030, tentative · Netflix", exact: true });
    await expect(line).toBeVisible();
    await line.click();
    await editor.getByLabel("Date", { exact: true }).fill("2030-12-13");
    await expect(editor.getByRole("radio", { name: "Tentative" })).toBeChecked();
    await editor.getByRole("radio", { name: "Tentative" }).press("ArrowLeft");
    await expect(editor.getByRole("radio", { name: "Confirmed" })).toBeChecked();
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(stored).toEqual({ date: "2030-12-13", tentative: false });
    await page.reload();
    await row.getByRole("button", { name: "13 Dec 2030 · Netflix", exact: true }).click();
    await editor.getByLabel("Date", { exact: true }).fill("2030-12-14");
    await expect(editor.getByRole("radio", { name: "Confirmed" })).toBeChecked();
    await editor.getByLabel("Date", { exact: true }).fill("");
    await expect(editor.getByRole("radiogroup")).toHaveCount(0);
    await editor.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(stored).toEqual({ date: null, tentative: false });
    await expect(row.getByRole("button", { name: "TBD · Netflix", exact: true })).toBeVisible();
    await page.reload();
    await row.getByRole("button", { name: "TBD · Netflix", exact: true }).click();
    await editor.getByLabel("Date", { exact: true }).fill("2030-12-15");
    await expect(editor.getByRole("radio", { name: "Tentative" })).toBeChecked();
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  });
});

// Phase 9: both entry paths through the real Watch list, with server-side provider fixtures.
async function restoreFilmFlow(saved: (typeof marks.$inferSelect)[], beforeIds: Set<number>) {
  await db.transaction(async (tx) => {
    await lockFilmWrites(tx);
    const created = (await tx.select({ id: movies.id }).from(movies)).filter((film) => !beforeIds.has(film.id)).map((film) => film.id);
    if (created.length) {
      await tx.delete(marks).where(inArray(marks.movieId, created));
      await tx.delete(movies).where(inArray(movies.id, created));
    }
    for (const row of saved) await tx.insert(marks).values(row).onConflictDoUpdate({ target: marks.movieId, set: row });
  });
}

async function openMore(page: import('@playwright/test').Page, query: string) {
  const box = page.getByRole('combobox', { name: 'Add a film' });
  await typeToFind(box, query, page.getByRole('button', { name: 'Search more films', exact: true }));
  await page.getByRole('button', { name: 'Search more films', exact: true }).click();
  return page.getByRole('region', { name: /^(Search more films|Add to Want to watch)$/ });
}

test('manual and catalogue films survive reload, global search and movie navigation with marks and release notes', async ({ page }) => {
  test.setTimeout(120_000);
  const saved = await db.select().from(marks);
  const beforeIds = new Set((await db.select({ id: movies.id }).from(movies)).map((row) => row.id));
  const title = `Manual film ${randomUUID().slice(0, 8)}`;
  try {
    await page.goto('/watch-list?sort=average');
    const box = page.getByRole('combobox', { name: 'Add a film' });
    await typeToFind(box, title, page.getByRole('button', { name: 'Add manually', exact: true }));
    // The two paths are in the ordinary Tab sequence, after the main input.
    await box.focus(); await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Search more films', exact: true })).toBeFocused();
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    const form = page.getByRole('region', { name: 'Add manually' });
    await expect(form.getByLabel('Release or planned year')).toBeFocused();
    await form.getByLabel('Release or planned year').fill('2032');
    await form.getByLabel('Release or planned year').press('Enter');
    await expect(box).toHaveValue(''); await expect(box).toBeFocused();
    await expect(page).toHaveURL(/sort=average/);
    await page.getByRole('link', { name: 'Open film', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await page.reload(); await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    const manualUrl = page.url();
    // Global search uses the stored film, not the external provider.
    await page.getByRole('heading', { level: 1 }).click(); await page.keyboard.press('/');
    const global = page.getByRole('combobox', { name: 'Search films and awards' });
    await expect(global).toBeFocused(); await global.fill(title);
    await expect(page.getByRole('option', { name: new RegExp(title) })).toBeVisible();
    await global.press('Enter'); await expect(page).toHaveURL(manualUrl);
    await page.goto('/watch-list');
    const row = rowOf(section(page, 'Want to watch').getByRole('heading', { level: 3, name: title }));
    await row.getByRole('button', { name: 'Add release date' }).click();
    await editorOf(page).getByLabel('Date').fill('2032-12-12');
    await editorOf(page).getByRole('combobox', { name: 'Platform' }).fill('MUBI');
    await editorOf(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editorOf(page)).toHaveCount(0);
    await page.reload(); await expect(row).toContainText('MUBI');
    // Catalogue, using keyboard selection and a forthcoming film with no IMDb ID.
    const panel = await openMore(page, 'Upcoming fixture');
    await expect(panel.getByRole('option', { name: /Upcoming fixture/ })).toBeVisible();
    await box.press('Enter');
    await expect(panel.getByRole('button', { name: 'Add to Want to watch' })).toBeFocused();
    await page.keyboard.press('Enter'); await expect(box).toHaveValue('');
    await expect.poll(async () => (await titlesIn(section(page, 'Want to watch')))[0]).toBe('Upcoming fixture');
    await page.reload();
    const catalogueRow = rowOf(section(page, 'Want to watch').getByRole('heading', { level: 3, name: 'Upcoming fixture' }));
    await catalogueRow.getByRole('link', { name: 'Upcoming fixture' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Upcoming fixture');
    await page.getByRole('heading', { level: 1 }).click(); await page.keyboard.press('/');
    await global.fill('Upcoming fixture');
    await expect(page.getByRole('option', { name: /Upcoming fixture/ })).toBeVisible();
    await global.press('Escape');
    // Existing mark controls work for the newly stored film as well.
    const [film] = await db.select().from(movies).where(eq(movies.tmdbId, 99004003));
    await page.getByRole('button', { name: 'Watched', exact: true }).click();
    await expect.poll(() => readMark(film.id)).toEqual({ watched: true, want: false });
    // A manual title/year match waits for a choice rather than silently merging.
    await page.goto('/watch-list'); await typeToFind(box, title, page.getByRole('button', { name: 'Add manually', exact: true }));
    await page.getByRole('button', { name: 'Add manually', exact: true }).click();
    await form.getByLabel('Release or planned year').fill('2032');
    await form.getByRole('button', { name: 'Add to Want to watch' }).click();
    await expect(form.getByRole('radiogroup')).toBeVisible();
    await form.getByRole('button', { name: 'Use this film', exact: true }).click();
    await expect(box).toHaveValue(''); await page.reload(); await expect(row).toContainText('MUBI');
    expect((await db.select().from(movies).where(eq(movies.title, title)))).toHaveLength(1);
  } finally { await restoreFilmFlow(saved, beforeIds); }
});

// Required look evidence stays under screenshots/phase-9; no unrelated screens are captured.
for (const { width, height } of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 900 }]) {
  test(`add-film look ${width}: results, confirmation, validation, saving, failure and saved row`, async ({ page }) => {
    test.setTimeout(120_000);
    const { mkdirSync } = await import('node:fs');
    mkdirSync('screenshots/phase-9', { recursive: true });
    const saved = await db.select().from(marks);
    const beforeIds = new Set((await db.select({ id: movies.id }).from(movies)).map((row) => row.id));
    const title = `Pulang ke Rumah · ${width}`;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const shot = async (name: string) => {
      await page.mouse.move(0, 0);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
      // Audit only this task's visible controls/text, including occlusion at the tap centre.
      const problems = await page.locator('main').evaluate((main) => {
        const panel = main.querySelector('section[aria-labelledby$="-panel-title"]');
        if (!panel) return [];
        return Array.from(panel.querySelectorAll<HTMLElement>('button,input,h2,h3,label')).flatMap((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return [];
          const result: string[] = [];
          if (element.scrollWidth > element.clientWidth + 1) result.push(`overflow: ${element.textContent}`);
          const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
          if (element.matches('button,input') && y > 56 && y < innerHeight && !element.contains(document.elementFromPoint(x, y))) result.push(`covered: ${element.textContent}`);
          return result;
        });
      });
      expect(problems).toEqual([]);
      const sortOverflow = await page.getByRole('navigation', { name: 'Sort by' }).evaluate((nav) => nav.scrollWidth - nav.clientWidth);
      expect(sortOverflow).toBeLessThanOrEqual(0);
      const screenshot = await page.screenshot({ path: `screenshots/phase-9/${name}-${width}.png`, animations: 'disabled', caret: 'hide' });
      // A moving count once left blue glyph-edge pixels painted over bare paper at the right edge.
      const strayPixels = await page.evaluate(async (dataUrl) => {
        const image = new Image(); image.src = dataUrl; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
        const main = document.querySelector('main')!;
        const edge = main.getBoundingClientRect().right - parseFloat(getComputedStyle(main).paddingRight);
        const scale = image.width / innerWidth;
        const pixels = context.getImageData(Math.round(edge * scale), 0, 1, image.height).data;
        const stray: number[] = [];
        for (let y = 0; y < image.height; y++) {
          const r = pixels[y * 4], g = pixels[y * 4 + 1], b = pixels[y * 4 + 2];
          if (b > r + 20 && g > r + 10 && document.elementFromPoint(edge - 1, y / scale) === main) stray.push(y);
        }
        return stray;
      }, `data:image/png;base64,${screenshot.toString('base64')}`);
      expect(strayPixels, 'stray blue text paint outside the current count').toEqual([]);
    };
    try {
      await page.setViewportSize({ width, height });
      await page.goto('/watch-list');
      const box = page.getByRole('combobox', { name: 'Add a film' });
      await typeToFind(box, 'zzzxq', page.getByText('No film called “zzzxq” in the app yet.'));
      await expect(page.getByRole('button', { name: 'Search more films', exact: true })).toBeInViewport();
      await expect(box).toBeInViewport();
      const moreBounds = await page.getByRole('button', { name: 'Search more films', exact: true }).boundingBox();
      const wantBounds = await section(page, 'Want to watch').getByRole('heading', { name: 'Want to watch', exact: true }).boundingBox();
      expect(wantBounds!.y).toBeGreaterThanOrEqual(moreBounds!.y + moreBounds!.height);
      await shot('no-match');
      if (width === 390) {
        let finishSearch!: () => void;
        const searchGate = new Promise<void>((resolve) => { finishSearch = resolve; });
        await page.route('**/api/movie-catalogue?**', async (route) => { await searchGate; await route.continue(); });
        const empty = await openMore(page, 'fixture:empty');
        await expect(empty.getByLabel('Searching TMDB', { exact: true })).toBeVisible();
        await shot('loading'); finishSearch();
        await expect(empty.getByText('No film called “fixture:empty” on TMDB.')).toBeVisible();
        await shot('empty');
        await page.unroute('**/api/movie-catalogue?**');
        await page.keyboard.press('Escape');
        await typeToFind(box, 'offline film', page.getByRole('button', { name: 'Search more films', exact: true }));
        await page.context().setOffline(true);
        await page.getByRole('button', { name: 'Search more films', exact: true }).click();
        await expect(empty.getByRole('alert')).toContainText("Couldn't reach TMDB.");
        await shot('offline');
        await page.context().setOffline(false);
        await page.keyboard.press('Escape');
      }
      const panel = await openMore(page, 'fixture:pages');
      await expect(panel.getByRole('option')).toHaveCount(3);
      await panel.getByRole('button', { name: 'Show more results' }).click();
      await expect(panel.getByRole('option')).toHaveCount(5);
      await panel.getByRole('option').nth(3).hover();
      await expect(panel.getByRole('option').nth(3)).toHaveAttribute('aria-selected', 'true');
      await expect(panel.locator('[role="option"][aria-selected="true"]')).toHaveCount(1);
      await expect(panel.getByRole('button', { name: 'Show more results' })).toHaveCount(0);
      await page.getByText('Add a film', { exact: true }).evaluate((label) => label.scrollIntoView({ block: 'start' }));
      await page.evaluate(() => window.scrollBy(0, -12));
      await expect(box).toBeInViewport({ ratio: 1 });
      await expect(page.getByText('Add a film', { exact: true })).toBeInViewport({ ratio: 1 });
      await shot('results');
      await panel.getByRole('option', { name: /Upcoming fixture/ }).click();
      await expect(panel.getByRole('button', { name: 'Add to Want to watch' })).toBeFocused();
      await expect(panel.getByRole('heading', { name: 'Add to Want to watch', exact: true })).toBeVisible();
      await expect(panel.getByRole('heading', { name: 'Upcoming fixture' })).toBeInViewport();
      await expect(panel.getByRole('button', { name: 'Add to Want to watch' })).toBeInViewport();
      await shot('picked');
      // A 100% crop covers the panel's text ends, frame and action boundary.
      await panel.screenshot({ path: `screenshots/phase-9/picked-panel-${width}.png` });
      await panel.getByRole('button', { name: 'Back to results' }).click();
      await panel.getByRole('option', { name: /Unknown year fixture/ }).click();
      await expect(panel.getByLabel('Release or planned year')).toBeFocused();
      await panel.getByRole('button', { name: 'Add to Want to watch' }).click();
      await expect(panel.getByText('Type a year from 1800 to 9999.')).toBeVisible();
      if (width === 390) await shot('unknown-year');
      await page.keyboard.press('Escape'); await expect(box).toBeFocused();
      // Search failure is never presented as empty; manual entry preserves its query.
      await openMore(page, 'fixture:401'); await expect(panel.getByRole('alert')).toContainText("Film search isn't working.");
      if (width === 390) await shot('provider-failed');
      await panel.getByRole('button', { name: 'Add manually', exact: true }).click();
      const manual = page.getByRole('region', { name: 'Add manually' });
      await manual.getByLabel('Title', { exact: true }).fill(title);
      await expect(box).toHaveValue(title);
      await manual.getByRole('button', { name: 'Add to Want to watch' }).click();
      await expect(manual.getByText('Type a year from 1800 to 9999.')).toBeVisible();
      const yearErrorColour = await manual.getByLabel('Release or planned year').evaluate((element) => {
        const probe = document.createElement('span'); probe.style.color = 'var(--error)'; document.body.append(probe);
        const error = getComputedStyle(probe).color; probe.remove();
        return { border: getComputedStyle(element).borderTopColor, error };
      });
      expect(yearErrorColour.border).toBe(yearErrorColour.error);
      await shot('manual-error');
      await manual.screenshot({ path: `screenshots/phase-9/manual-panel-${width}.png` });
      if (width !== 844) {
        const { readFileSync } = await import('node:fs');
        const { createRequire } = await import('node:module');
        await page.addScriptTag({ content: readFileSync(createRequire(`${process.cwd()}/package.json`).resolve('axe-core/axe.min.js'), 'utf8') });
        const violations = await page.evaluate(async () => {
          // @ts-expect-error axe is injected into this test page
          const result = await window.axe.run(document.querySelector('main'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
          return result.violations.map((v: { id: string; nodes: { target: string[] }[] }) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }));
        });
        expect(violations).toEqual([]);
      }
      await manual.getByLabel('Release or planned year').fill('2031');
      const actionBounds = async () => {
        const cancel = await manual.getByRole('button', { name: 'Cancel', exact: true }).boundingBox();
        const submit = await manual.locator('button[type="submit"]').boundingBox();
        return { cancelX: cancel!.x, cancelWidth: cancel!.width, submitX: submit!.x, submitWidth: submit!.width };
      };
      const idleActions = await actionBounds();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      await page.route('**/watch-list', async (route) => {
        if (route.request().method() === 'POST') { await gate; await route.abort('failed'); }
        else await route.continue();
      });
      await manual.getByRole('button', { name: 'Add to Want to watch' }).click();
      await expect(manual.locator('form')).toHaveAttribute('aria-busy', 'true');
      await expect(manual.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
      await expect(manual.getByRole('button', { name: 'Adding…', exact: true })).toBeDisabled();
      expect(await actionBounds(), 'saving must not move or resize the action buttons').toEqual(idleActions);
      await shot('saving'); release();
      await expect(manual.getByRole('alert')).toContainText("Couldn't add");
      expect(await actionBounds(), 'retry must not move or resize the action buttons').toEqual(idleActions);
      const retryBounds = await manual.getByRole('button', { name: 'Try again', exact: true }).boundingBox();
      expect(retryBounds!.y + retryBounds!.height).toBeLessThanOrEqual(height - 8);
      await shot('save-failed');
      await expect(manual.getByLabel('Title', { exact: true })).toHaveValue(title);
      await page.unroute('**/watch-list');
      await manual.getByRole('button', { name: 'Try again', exact: true }).click();
      await expect(box).toHaveValue(''); await expect(box).toBeFocused();
      await expect.poll(async () => (await titlesIn(section(page, 'Want to watch')))[0]).toBe(title);
      await page.reload();
      await expect.poll(async () => (await titlesIn(section(page, 'Want to watch')))[0]).toBe(title);
      const savedRow = rowOf(section(page, 'Want to watch').getByRole('heading', { level: 3, name: title }));
      await savedRow.scrollIntoViewIfNeeded();
      await shot('saved-row');
      await expect(savedRow).not.toContainText('No Oscar result');
      await expect(savedRow).not.toContainText('Nominations 0');
      if (width === 390) {
        await typeToFind(box, title, page.getByRole('button', { name: 'Add manually', exact: true }));
        await page.getByRole('button', { name: 'Add manually', exact: true }).click();
        await manual.getByLabel('Release or planned year').fill('2031');
        await manual.getByRole('button', { name: 'Add to Want to watch' }).click();
        await expect(manual.getByRole('radiogroup')).toBeVisible();
        await expect(manual.getByRole('radio')).toBeFocused();
        await shot('duplicate');
        // An unanswered "Add a different film": the retry keeps that choice (9.R). The aborted post never reaches the server.
        await page.route('**/watch-list', (route) => (route.request().method() === 'POST' ? route.abort() : route.continue()));
        await manual.getByRole('button', { name: 'Add a different film' }).click();
        await expect(manual.getByRole('alert')).toContainText(`Couldn't add ${title}`);
        await expect(manual.getByRole('button', { name: 'Try again' })).toBeVisible();
        await expect(manual.getByRole('radiogroup')).toBeVisible();
        await shot('duplicate-retry');
        await page.unroute('**/watch-list');
        await page.keyboard.press('Escape');
        const longTitle = 'TheUnusuallyLongUnbrokenFilmTitle'.repeat(5);
        await page.route('**/api/movie-catalogue?**', (route) => route.fulfill({ json: { ok: true, value: {
          films: [{ tmdbId: 123, title: longTitle, originalTitle: null, year: 2030, overview: 'A full overview that remains readable without making the action disappear.' }], page: 1, nextPage: null,
        } } }));
        await openMore(page, 'stress title');
        await panel.getByRole('option').click();
        await expect(panel.getByRole('heading', { name: longTitle })).toBeInViewport();
        await expect(panel.getByRole('button', { name: 'Add to Want to watch' })).toBeInViewport();
        await shot('long-title');
        await page.unroute('**/api/movie-catalogue?**');
      }
      expect(errors).toEqual([]);
    } finally { await restoreFilmFlow(saved, beforeIds); }
  });
}
