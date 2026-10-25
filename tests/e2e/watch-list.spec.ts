// The Watch list (task 1.14, guide §8.3): both sections, the sort in the address, and marks that
// change the list only on the next visit, never under the tap; Add a film (7.8) and My order's
// drag handles (7.9). It writes marks on the `test` branch and puts each one back as it was.
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { marks, movies } from "../../src/db/schema";

const { db, close } = createScriptDb();
test.afterAll(() => close());

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

/** The row a title heading sits in. */
const rowOf = (heading: import("@playwright/test").Locator) => heading.locator("xpath=ancestor::div[contains(@class,'border-b')][1]");
const section = (page: import("@playwright/test").Page, name: string) => page.getByRole("region", { name });
const titlesIn = (region: import("@playwright/test").Locator) => region.getByRole("heading", { level: 3 }).allTextContents();

test("both sections list their films, and the sort is kept in the address", async ({ page }) => {
  const id = await movieId("im-still-here");
  const saved = await readMark(id);
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
    const season = section(page, "Not watched yet, 2026 season");
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
    await setMark(id, saved);
  }
});

test("sorted by % chance, the season's films run from the best chance down, and the figure shows", async ({ page }) => {
  await page.goto("/watch-list?sort=chance&all=1");
  await expect(page.getByRole("navigation", { name: "Sort by" }).getByRole("link", { name: "% chance" })).toHaveAttribute("aria-current", "page");
  const season = section(page, "Not watched yet, 2026 season");
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
  const saved = await readMark(id);
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
    await setMark(id, saved);
  }
});

test("a season film marked watched stays until the next visit, then leaves the list", async ({ page }) => {
  await page.goto("/watch-list");
  const season = section(page, "Not watched yet, 2026 season");
  const first = season.getByRole("heading", { level: 3 }).first();
  const title = (await first.textContent()) ?? "";
  const href = (await first.getByRole("link").getAttribute("href")) ?? "";
  const id = await movieId(href.replace("/movies/", ""));
  const saved = await readMark(id);
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
    await setMark(id, saved);
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
    await box.fill("agente secre");

    // Found by its original title (shown with the match), not yet on the list.
    const result = page.getByRole("option", { name: /The Secret Agent/ });
    await expect(result).toBeVisible();
    await expect(result).toContainText("O Agente Secreto");
    await expect(result).not.toContainText("On your list");
    await box.press("Enter");

    // A toast confirms, the box clears and the film heads Want to watch without a reload.
    await expect(page.getByRole("status").filter({ hasText: "The Secret Agent added." })).toBeVisible();
    await expect(box).toHaveValue("");
    const want = section(page, "Want to watch");
    await expect.poll(async () => (await titlesIn(want))[0]).toBe("The Secret Agent");
    await expect.poll(() => readMark(id)).toEqual({ watched: false, want: true });

    await page.reload();
    await expect.poll(async () => (await titlesIn(section(page, "Want to watch")))[0]).toBe("The Secret Agent");

    // Typing it again says it is on the list.
    await page.getByRole("combobox", { name: "Add a film" }).fill("agente secre");
    await expect(page.getByRole("option", { name: /The Secret Agent/ })).toContainText("On your list");

    // No match: the line says so, and nothing is added.
    await page.getByRole("combobox", { name: "Add a film" }).fill("zzzxq");
    await expect(page.getByText("No film called “zzzxq” yet.")).toBeVisible();
  } finally {
    // Put every mark back, including the places the add moved the other films to.
    await setMark(id, null);
    for (const row of saved) {
      await db
        .insert(marks)
        .values(row)
        .onConflictDoUpdate({ target: marks.movieId, set: row });
    }
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
        await expect(section(page, "Not watched yet, 2026 season").getByText(/· by Oscar stage$/)).toBeVisible();

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
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowUp");
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
