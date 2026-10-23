// The mark filters (task 2.11a, product plan §3.13): Watched, Unwatched and Want to watch chips on
// the Oscar year page, an award page, Submissions and the year grid. Each chip is in the address,
// filters by the live marks and survives a reload. It writes marks on the `test` branch and puts
// each one back as it was.
import { expect, test, type Page } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { marks, movies } from "../../src/db/schema";

const { db, close } = createScriptDb();
test.afterAll(() => close());

type Mark = { watched: boolean; want: boolean };

/** Sets each film's mark (null: none) for the test, and puts every one back afterwards. */
async function withMarks(slugs: Record<string, Mark | null>, run: () => Promise<void>) {
  const rows = await db.select({ id: movies.id, slug: movies.slug }).from(movies).where(inArray(movies.slug, Object.keys(slugs)));
  expect(rows.map((r) => r.slug).sort()).toEqual(Object.keys(slugs).sort());
  const saved = await db.select().from(marks).where(inArray(marks.movieId, rows.map((r) => r.id)));
  const set = async (id: number, value: Mark | null) => {
    if (value === null) await db.delete(marks).where(eq(marks.movieId, id));
    else await db.insert(marks).values({ movieId: id, ...value }).onConflictDoUpdate({ target: marks.movieId, set: value });
  };
  try {
    for (const { id, slug } of rows) await set(id, slugs[slug]);
    await run();
  } finally {
    for (const { id } of rows) {
      const before = saved.find((m) => m.movieId === id);
      await set(id, before ? { watched: before.watched, want: before.want } : null);
    }
  }
}

const WATCHED: Mark = { watched: true, want: false };
const WANT: Mark = { watched: false, want: true };

const chips = (page: Page) => page.getByRole("group", { name: "Filter" });
const chip = (page: Page, name: string) => chips(page).getByRole("button", { name, exact: true });

test("the Oscar year page's chips filter every category by the marks and survive a reload", async ({ page }) => {
  await withMarks({ anora: WATCHED, conclave: WANT, flow: null }, async () => {
    await page.goto("/awards/oscars/2024");
    const picture = page.getByRole("region", { name: "Best Picture" });
    await expect(picture.getByRole("heading", { level: 3, name: "Anora" })).toBeVisible();
    await expect(picture.getByRole("heading", { level: 3 })).toHaveCount(10);

    await chip(page, "Watched").click();
    await expect(page).toHaveURL(/\/awards\/oscars\/2024\?filter=watched$/);
    await expect(picture.getByRole("heading", { level: 3, name: "Anora" })).toBeVisible();
    await expect(picture.getByRole("heading", { level: 3, name: "Conclave" })).toHaveCount(0);

    await page.reload();
    await expect(chip(page, "Watched")).toHaveAttribute("aria-pressed", "true");
    await expect(picture.getByRole("heading", { level: 3, name: "Conclave" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Best Animated Feature" }).getByRole("heading", { level: 3, name: "Flow" })).toHaveCount(0);

    // Want to watch replaces Watched.
    await chip(page, "Want to watch").click();
    await expect(page).toHaveURL(/\/awards\/oscars\/2024\?filter=want$/);
    await expect(picture.getByRole("heading", { level: 3, name: "Conclave" })).toBeVisible();
    await expect(picture.getByRole("heading", { level: 3, name: "Anora" })).toHaveCount(0);
    await expect(chip(page, "Watched")).toHaveAttribute("aria-pressed", "false");

    // Unwatched keeps the want-to-watch film; pressing it again clears the filter. The year
    // switcher carries the chip to the other year.
    await chip(page, "Unwatched").click();
    await expect(picture.getByRole("heading", { level: 3, name: "Conclave" })).toBeVisible();
    await expect(picture.getByRole("heading", { level: 3, name: "Anora" })).toHaveCount(0);
    await page.getByRole("button", { name: "Year: 2024" }).click();
    await page.getByRole("dialog", { name: "Choose a year" }).getByRole("link", { name: "2023" }).click();
    await expect(page).toHaveURL(/\/awards\/oscars\/2023\?filter=unwatched$/);
    await chip(page, "Unwatched").click();
    await expect(page).toHaveURL(/\/awards\/oscars\/2023$/);
  });
});

test("an award page's chips filter its categories by the marks and survive a reload", async ({ page }) => {
  await withMarks({ "one-battle-after-another": WATCHED, sinners: WANT }, async () => {
    await page.goto("/awards/bafta/2025?filter=watched");
    const picture = page.getByRole("region", { name: "Best Film" });
    await expect(chip(page, "Watched")).toHaveAttribute("aria-pressed", "true");
    await expect(picture.getByRole("heading", { level: 3, name: "One Battle After Another" })).toBeVisible();
    await expect(picture.getByRole("heading", { level: 3, name: "Sinners" })).toHaveCount(0);

    await chip(page, "Want to watch").click();
    await expect(page).toHaveURL(/\/awards\/bafta\/2025\?filter=want$/);
    await expect(picture.getByRole("heading", { level: 3, name: "Sinners" })).toBeVisible();
    await expect(picture.getByRole("heading", { level: 3, name: "One Battle After Another" })).toHaveCount(0);

    await page.reload();
    await expect(chip(page, "Want to watch")).toHaveAttribute("aria-pressed", "true");
    await expect(picture.getByRole("heading", { level: 3, name: "Sinners" })).toBeVisible();
  });
});

test("Submissions' mark chips sit beside Shortlisted and replace one another", async ({ page }) => {
  await withMarks({ "im-still-here": WATCHED, flow: WANT }, async () => {
    await page.goto("/submissions/2024?filter=shortlisted&filter=watched");
    const rows = page.getByRole("main").getByRole("heading", { level: 2 });
    await expect(chip(page, "Shortlisted")).toHaveAttribute("aria-pressed", "true");
    await expect(chip(page, "Watched")).toHaveAttribute("aria-pressed", "true");
    await expect(rows.filter({ hasText: "I'm Still Here" })).toHaveCount(1);
    await expect(rows.filter({ hasText: /^Flow$/ })).toHaveCount(0);

    await chip(page, "Want to watch").click();
    await expect(page).toHaveURL(/\/submissions\/2024\?filter=shortlisted&filter=want$/);
    await expect(rows.filter({ hasText: /^Flow$/ })).toHaveCount(1);
    await expect(rows.filter({ hasText: "I'm Still Here" })).toHaveCount(0);

    await page.reload();
    await expect(chip(page, "Want to watch")).toHaveAttribute("aria-pressed", "true");
    await expect(chip(page, "Shortlisted")).toHaveAttribute("aria-pressed", "true");
    await expect(rows.filter({ hasText: /^Flow$/ })).toHaveCount(1);
  });
});

test("the year grid's Want to watch chip keeps the want-to-watch films", async ({ page }) => {
  await withMarks({ hamnet: WANT, sinners: WATCHED }, async () => {
    await page.goto("/grid/2025");
    await chip(page, "Want to watch").click();
    await expect(page).toHaveURL(/\/grid\/2025\?filter=want$/);
    const rows = page.getByRole("table").getByRole("rowheader");
    await expect(rows.filter({ hasText: "Hamnet" })).toHaveCount(1);
    await expect(rows.filter({ hasText: "Sinners" })).toHaveCount(0);

    await page.reload();
    await expect(chip(page, "Want to watch")).toHaveAttribute("aria-pressed", "true");
    await expect(rows.filter({ hasText: "Hamnet" })).toHaveCount(1);

    await chip(page, "Watched").click();
    await expect(page).toHaveURL(/\/grid\/2025\?filter=watched$/);
    await expect(rows.filter({ hasText: "Sinners" })).toHaveCount(1);
    await expect(rows.filter({ hasText: "Hamnet" })).toHaveCount(0);
  });
});
