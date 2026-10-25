// Phase 1's Done-when scenario (task 1.15, IMPLEMENTATION_PLAN.md): the 2025 Oscars page shows all
// four categories with flags, scores and the average; marking a film watched shows on every page
// it appears on; search finds a film by its original title. It runs as one flow on the `test`
// branch and puts the film's mark back as it was.
import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { marks, movies } from "../../src/db/schema";

const { db, close } = createScriptDb();
test.afterAll(() => close());

// The 98th Academy Awards (2025 films): nominees including the winner, and the winner.
const OSCARS_2025 = [
  { id: "picture", heading: "Best Picture", nominees: 10, winner: "One Battle After Another" },
  { id: "documentary", heading: "Best Documentary Feature", nominees: 5, winner: "Mr. Nobody Against Putin" },
  { id: "international", heading: "Best International Feature", nominees: 5, winner: "Sentimental Value" },
  { id: "animated", heading: "Best Animated Feature", nominees: 5, winner: "KPop Demon Hunters" },
];

// A Best Picture nominee whose original title differs from its English one.
const FILM = { slug: "the-secret-agent", title: "The Secret Agent", original: "O Agente Secreto" };

const WATCHED = { watched: true, want: false };

async function filmId() {
  const [row] = await db.select({ id: movies.id }).from(movies).where(eq(movies.slug, FILM.slug));
  expect(row, FILM.slug).toBeTruthy();
  return row.id;
}

const readMark = async (id: number) =>
  (await db.select({ watched: marks.watched, want: marks.want }).from(marks).where(eq(marks.movieId, id)))[0] ?? null;

async function restore(id: number, saved: Awaited<ReturnType<typeof readMark>>) {
  if (saved) await db.update(marks).set(saved).where(eq(marks.movieId, id));
  else await db.delete(marks).where(eq(marks.movieId, id));
}

/** The row a title heading sits in. */
const rowIn = (scope: ReturnType<Page["locator"]>, title: string) =>
  // The row is the nearest block holding the marks (pressed buttons): a Watch list row's release line is a button too (7.R).
  scope.getByRole("heading", { level: 3, name: title }).locator("xpath=ancestor::div[.//button[@aria-pressed]][1]");

test("the 2025 Oscars page shows all four categories with flags, scores and the average", async ({ page }) => {
  await page.goto("/awards/oscars/2025");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Oscars 2025");
  await expect(page.getByText(/^98th Academy Awards · /)).toBeVisible();

  for (const { id, heading, nominees, winner } of OSCARS_2025) {
    const section = page.getByRole("region", { name: heading });
    await expect(section).toHaveAttribute("id", id);
    await expect(section.getByRole("heading", { level: 3 })).toHaveCount(nominees);
    await expect(section.locator("[data-winner]").getByRole("heading", { level: 3, name: winner })).toBeVisible();
    // Every film shows its flags and a scores line ending in the average, or "No scores yet".
    const rows = section.getByRole("heading", { level: 3 }).locator("xpath=ancestor::div[.//button][1]");
    for (let i = 0; i < nominees; i++) {
      await expect(rows.nth(i).getByRole("img").first()).toBeVisible();
      await expect(rows.nth(i)).toContainText(/IMDb .*RT .*MC .*TMDB .*(\d+ · \d of 4|No scores yet)/);
    }
  }

  // At least one nominee carries a real average.
  const picture = page.getByRole("region", { name: "Best Picture" });
  await expect(picture.getByText(/^\d+ · [1-4] of 4$/).first()).toBeVisible();
});

test("marking a film watched shows on every page it appears on", async ({ page }) => {
  const id = await filmId();
  const saved = await readMark(id);
  try {
    await db.delete(marks).where(eq(marks.movieId, id));

    // Marked on the Oscars page …
    await page.goto("/awards/oscars/2025");
    const oscarRow = rowIn(page.getByRole("region", { name: "Best Picture" }), FILM.title);
    const mark = oscarRow.getByRole("button", { name: "Mark as watched" });
    await expect(mark).toBeEnabled();
    await mark.click();
    await expect(oscarRow.getByRole("button", { name: "Watched", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => readMark(id)).toEqual(WATCHED);

    // … shows on the race (Picture tab) …
    await page.goto("/race/2025");
    const raceRow = rowIn(page.getByRole("tabpanel"), FILM.title);
    await expect(raceRow.getByRole("button", { name: "Watched", exact: true })).toHaveAttribute("aria-pressed", "true");

    // … on the movie page, after moving within the app …
    await raceRow.getByRole("link", { name: FILM.title }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(FILM.title);
    await expect(page.getByRole("button", { name: "Watched", exact: true })).toHaveAttribute("aria-pressed", "true");

    // … and after a reload of it. Back on the Oscars page it is still marked.
    await page.reload();
    await expect(page.getByRole("button", { name: "Watched", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.goto("/awards/oscars/2025");
    await expect(
      rowIn(page.getByRole("region", { name: "Best Picture" }), FILM.title).getByRole("button", {
        name: "Watched",
        exact: true,
      }),
    ).toHaveAttribute("aria-pressed", "true");

    // Want to watch from the movie page puts it on the Watch list, with the Oscar stage.
    await page.goto(`/movies/${FILM.slug}`);
    const want = page.getByRole("button", { name: "Want to watch", exact: true });
    await expect(want).toBeEnabled();
    await want.click();
    await expect.poll(() => readMark(id)).toEqual({ watched: false, want: true });
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Watch list" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Watch list");
    const listed = page.getByRole("region", { name: "Want to watch" });
    await expect(listed.getByRole("heading", { level: 3, name: FILM.title })).toBeVisible();
    await expect(rowIn(listed, FILM.title).getByRole("button", { name: "Want to watch", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  } finally {
    await restore(id, saved);
  }
});

test("search finds a film by its original title and opens it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const box = page.getByRole("combobox", { name: "Search films and awards" });
  // The `/` key works once the page has hydrated; a press before that does nothing (1.R).
  await expect(async () => {
    await page.keyboard.press("/");
    await expect(box).toBeFocused({ timeout: 1000 });
  }).toPass();

  await box.fill("agente secreto");
  const option = page.getByRole("option", { name: new RegExp(FILM.title) });
  await expect(option).toBeVisible();
  await expect(option).toContainText(FILM.original);
  await expect(option.locator("mark")).toHaveText("Agente Secreto");
  await expect(option).toContainText("Best Picture");

  await option.click();
  await expect(page).toHaveURL(new RegExp(`/movies/${FILM.slug}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(FILM.title);
  await expect(page.getByText(FILM.original, { exact: true })).toBeVisible();
});
