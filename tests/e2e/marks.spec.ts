// Marks end to end (task 1.7, plan §5.6): a mark set on one page shows on another, both by
// moving within the app and after a reload (it reached the database), and offline the marks
// are disabled under the offline notice. It uses the live-marks pages until the race and the
// movie page exist. The film's own mark is put back as it was afterwards.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { marks } from "../../src/db/schema";

const { db, close } = createScriptDb();
test.afterAll(() => close());

const readMark = async (movieId: number) =>
  (await db.select({ watched: marks.watched, want: marks.want }).from(marks).where(eq(marks.movieId, movieId)))[0] ??
  null;

type Saved = Awaited<ReturnType<typeof readMark>>;

async function restore(movieId: number, saved: Saved) {
  if (saved) {
    await db.update(marks).set(saved).where(eq(marks.movieId, movieId));
  } else {
    await db.delete(marks).where(eq(marks.movieId, movieId));
  }
}

/** The first film on the list: its title link, its id, and its row. */
async function firstFilm(page: Page) {
  const link = page.getByRole("heading", { level: 3 }).getByRole("link").first();
  const href = await link.getAttribute("href");
  const movieId = Number(new URL(href ?? "", "http://x").searchParams.get("id"));
  expect(movieId).toBeGreaterThan(0);
  const title = (await link.textContent()) ?? "";
  const row: Locator = link.locator("xpath=ancestor::div[contains(@class,'border-b')][1]");
  return { link, movieId, title, row };
}

test("a mark set on one page shows on another, and after a reload", async ({ page }) => {
  await page.goto("/styleguide/marks");
  const { movieId } = await firstFilm(page);
  const saved = await readMark(movieId);
  try {
    await db.delete(marks).where(eq(marks.movieId, movieId));
    await page.reload();
    const { link, title, row } = await firstFilm(page);

    const watched = row.getByRole("button", { name: "Mark as watched" });
    await expect(watched).toBeEnabled();
    await watched.click();
    await expect(row.getByRole("button", { name: "Watched", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => readMark(movieId)).toEqual({ watched: true, want: false });

    // Another page, reached within the app: the labelled marks show the same state.
    await link.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByRole("button", { name: "Watched", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.getByRole("button", { name: "Watched", exact: true })).toHaveAttribute("aria-pressed", "true");

    // Want to watch clears watched, here and back on the list.
    const want = page.getByRole("button", { name: "Want to watch", exact: true });
    await expect(want).toBeEnabled();
    await want.click();
    await expect(want).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Watched", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => readMark(movieId)).toEqual({ watched: false, want: true });

    await page.getByRole("link", { name: "Live marks" }).click();
    const back = (await firstFilm(page)).row;
    await expect(back.getByRole("button", { name: "Want to watch" })).toHaveAttribute("aria-pressed", "true");
    await expect(back.getByRole("button", { name: "Mark as watched" })).toHaveAttribute("aria-pressed", "false");
  } finally {
    await restore(movieId, saved);
  }
});

test("offline, the marks are disabled under the offline notice", async ({ page, context }) => {
  await page.goto("/styleguide/marks");
  const { row } = await firstFilm(page);
  const watchedMark = row.getByRole("button", { name: /^(Mark as watched|Watched)$/ });
  await expect(watchedMark).toBeEnabled();

  await context.setOffline(true);
  await expect(page.getByRole("status").filter({ hasText: "You're offline." })).toBeVisible();
  await expect(watchedMark).toBeDisabled();

  await context.setOffline(false);
  await expect(page.getByText("You're offline.")).toHaveCount(0);
  await expect(watchedMark).toBeEnabled();
});
