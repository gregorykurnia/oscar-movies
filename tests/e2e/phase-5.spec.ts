// Phase 5's Done-when scenario (task 5.4, IMPLEMENTATION_PLAN.md): Cannes 2025's page lists every
// section's films with flags and scores, earlier years say lineups start in 2025, and a film's
// page lists its screenings. One walk through the pages by their links; the sections, films and
// prizes come from the `test` database. Reads only; no writes.
import { expect, test } from "@playwright/test";
import { and, asc, eq, lt, notInArray, sql } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { awards, editions, marks, movies, screenings } from "../../src/db/schema";

const { db, close } = createScriptDb();
test.afterAll(() => close());

const FESTIVAL = { slug: "cannes", shortName: "Cannes" };
const YEAR = 2025;

type Row = {
  slug: string;
  title: string;
  countries: string[];
  avg: number | null;
  section: string;
  order: number;
  prize: string | null;
};

// The page's own title order (`localeCompare`), which isn't Postgres's byte order ("EPiC" and "Easy's Waltz").
const byTitle = (a: Row, b: Row) => a.title.localeCompare(b.title, "en");
/** The page's Average score order: highest first, films with none last, ties by title. */
const byAverage = (a: Row, b: Row) =>
  a.avg === b.avg ? byTitle(a, b) : a.avg === null ? 1 : b.avg === null ? -1 : b.avg - a.avg || byTitle(a, b);

/** Every screening of the festival's edition, in programme order then title. */
async function lineupRows(slug: string, year: number): Promise<Row[]> {
  const rows = await db
    .select({
      slug: movies.slug,
      title: movies.title,
      countries: movies.countries,
      avg: movies.avgScore,
      section: screenings.section,
      order: screenings.sectionOrder,
      prize: screenings.prize,
    })
    .from(screenings)
    .innerJoin(editions, eq(editions.id, screenings.editionId))
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .innerJoin(movies, eq(movies.id, screenings.movieId))
    .where(and(eq(awards.slug, slug), eq(editions.year, year)))
    .orderBy(asc(screenings.sectionOrder));
  return rows.sort((a, b) => a.order - b.order || byTitle(a, b));
}

function bySection(rows: Row[]) {
  const sections = new Map<number, { name: string; rows: Row[] }>();
  for (const r of rows) {
    const s = sections.get(r.order) ?? { name: r.section, rows: [] };
    s.rows.push(r);
    sections.set(r.order, s);
  }
  return [...sections.values()];
}

test("the festivals index opens Cannes 2025, whose page lists every section's films with flags and scores", async ({ page }) => {
  const rows = await lineupRows(FESTIVAL.slug, YEAR);
  const sections = bySection(rows);
  expect(sections.length).toBeGreaterThanOrEqual(8);
  expect(rows.length).toBeGreaterThan(100);

  await page.goto(`/festivals/${YEAR}`);
  await page.getByRole("region", { name: "Festivals" }).getByRole("link", { name: /Cannes/ }).click();
  await expect(page).toHaveURL(new RegExp(`/festivals/${FESTIVAL.slug}/${YEAR}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${FESTIVAL.shortName} ${YEAR}`);
  await expect(page.getByRole("link", { name: `Prizes` }).first()).toHaveAttribute("href", `/awards/${FESTIVAL.slug}/${YEAR}`);

  // One heading per section in the programme's order, each with its film count.
  const lineup = page.locator('section[id^="section-"]');
  await expect(lineup).toHaveCount(sections.length);
  await expect(lineup.getByRole("heading", { level: 2 })).toHaveText(sections.map((s) => s.name));

  // Every film of every section is on the page: its link, its flags (a film with a production
  // country shows one) and its scores line (the four scores and the average, or "No scores yet").
  const onPage = await page.evaluate(() =>
    [...document.querySelectorAll('section[id^="section-"]')].map((section) => ({
      count: section.querySelector("h2 + span")?.textContent ?? "",
      films: [...section.querySelectorAll('a[href^="/movies/"]')].map((a) => {
        const row = a.closest("h2,h3,h4")!.parentElement!.parentElement!;
        return {
          slug: a.getAttribute("href")!.replace("/movies/", ""),
          flags: row.querySelectorAll('[role="img"]').length,
          scores: row.querySelector("p:last-of-type")?.textContent ?? "",
        };
      }),
    })),
  );
  expect(onPage).toHaveLength(sections.length);
  sections.forEach((s, i) => {
    expect(onPage[i].count, `${s.name} count`).toBe(`${s.rows.length.toLocaleString("en")} ${s.rows.length === 1 ? "film" : "films"}`);
    expect(onPage[i].films.map((f) => f.slug), `${s.name} films`).toEqual(s.rows.map((r) => r.slug));
    onPage[i].films.forEach((f, j) => {
      const r = s.rows[j];
      if (r.countries.length > 0) expect(f.flags, `${r.title} has a flag`).toBeGreaterThan(0);
      expect(f.scores, `${r.title} has a scores line`).toMatch(/IMDb .*RT .*MC .*TMDB .*(\d+ of 4|No scores yet)$/);
    });
  });
  expect(onPage.flatMap((s) => s.films)).toHaveLength(rows.length);

  // A prize is a pill on the film that won it (in its section's list, so its row).
  const prized = rows.find((r) => r.prize);
  expect(prized, "a Cannes 2025 film with a prize").toBeTruthy();
  const firstPrize = prized!.prize!.split("; ")[0].replace(` (${prized!.section})`, "");
  const prizedRow = page
    .locator(`section#section-${prized!.order}`)
    .locator("div[data-winner]")
    .filter({ has: page.locator(`a[href="/movies/${prized!.slug}"]`) });
  await expect(prizedRow.getByText(firstPrize, { exact: true })).toBeVisible();
});

test("the sort in the address puts the best-scored film first in each section", async ({ page }) => {
  const sections = bySection(await lineupRows(FESTIVAL.slug, YEAR));
  await page.goto(`/festivals/${FESTIVAL.slug}/${YEAR}`);
  await expect(page.getByRole("link", { name: "Title", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Average score", exact: true }).click();
  await expect(page).toHaveURL(/\?sort=average$/);
  await expect(page.getByRole("link", { name: "Average score", exact: true })).toHaveAttribute("aria-current", "page");

  const expected = sections.map((s) => [...s.rows].sort(byAverage).map((r) => r.slug));
  const pageSlugs = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('section[id^="section-"]')].map((s) =>
        [...s.querySelectorAll('a[href^="/movies/"]')].map((a) => a.getAttribute("href")!.replace("/movies/", "")),
      ),
    );
  expect(await pageSlugs()).toEqual(expected);

  // The Watched chip joins the sort in the address and keeps only the films marked watched (read
  // from the database; none at all shows "No films match"). A press before hydration does
  // nothing, so it's pressed until the chip says so.
  const watched = new Set(
    (await db.select({ slug: movies.slug }).from(marks).innerJoin(movies, eq(movies.id, marks.movieId)).where(eq(marks.watched, true))).map(
      (r) => r.slug,
    ),
  );
  const chip = page.getByRole("group", { name: "Filter" }).getByRole("button", { name: "Watched", exact: true });
  await expect(async () => {
    if ((await chip.getAttribute("aria-pressed")) !== "true") await chip.click();
    await expect(page).toHaveURL(/\?sort=average&filter=watched$/, { timeout: 3000 });
  }).toPass();
  const kept = expected.map((s) => s.filter((slug) => watched.has(slug))).filter((s) => s.length > 0);
  if (kept.length === 0) await expect(page.getByText("No films match")).toBeVisible();
  else await expect.poll(pageSlugs).toEqual(kept);

  // The year switcher keeps both.
  const switcher = page.getByRole("button", { name: `Year: ${YEAR}` });
  await expect(async () => {
    if ((await switcher.getAttribute("aria-expanded")) !== "true") await switcher.click();
    await expect(page.getByRole("dialog", { name: "Choose a year" })).toBeVisible({ timeout: 3000 });
  }).toPass();
  await expect(page.getByRole("dialog", { name: "Choose a year" }).locator(`a[href^="/festivals/${FESTIVAL.slug}/${YEAR + 1}"]`)).toHaveAttribute(
    "href",
    `/festivals/${FESTIVAL.slug}/${YEAR + 1}?sort=average&filter=watched`,
  );
});

test("a film's page lists its screening, which links back to the lineup", async ({ page }) => {
  const rows = await lineupRows(FESTIVAL.slug, YEAR);
  const film = rows.find((r) => r.prize) ?? rows[0];
  // The film's screenings at every festival and year (a film can be selected at several).
  const all = await db
    .select({ section: screenings.section, slug: awards.slug, year: editions.year })
    .from(screenings)
    .innerJoin(editions, eq(editions.id, screenings.editionId))
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .innerJoin(movies, eq(movies.id, screenings.movieId))
    .where(eq(movies.slug, film.slug));
  const others = all.filter((r) => r.slug === FESTIVAL.slug && r.year === YEAR);
  // The section the film was found in (and won its prize in, when it has one).
  const here = others.find((r) => r.section === film.section) ?? others[0];

  await page.goto(`/festivals/${FESTIVAL.slug}/${YEAR}`);
  await page.locator(`section a[href="/movies/${film.slug}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/movies/${film.slug}$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(film.title);

  const festivals = page.getByRole("group", { name: "Festivals" });
  const selected = festivals.getByRole("listitem").filter({ hasText: "Selected" });
  await expect(selected).toHaveCount(all.length);
  for (const r of others) {
    await expect(selected.filter({ hasText: r.section }).first()).toBeVisible();
  }
  // Its prizes are on the page: a followed one (Palme d'Or) as the festival's own Won row, the rest
  // in the screening's caption.
  if (film.prize) await expect(festivals).toContainText(film.prize.split("; ")[0].replace(` (${film.section})`, ""));

  await selected.filter({ hasText: here.section }).first().getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/festivals/${FESTIVAL.slug}/${YEAR}$`));
});

test("an earlier year says lineups start in 2025, and a film from before has the coverage line", async ({ page }) => {
  await page.goto(`/festivals/${FESTIVAL.slug}/${YEAR - 1}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${FESTIVAL.shortName} ${YEAR - 1}`);
  await expect(page.getByRole("heading", { name: "Lineups start in 2025" })).toBeVisible();
  await expect(page.getByRole("link", { name: `Prizes for ${YEAR - 1}` })).toHaveAttribute("href", `/awards/${FESTIVAL.slug}/${YEAR - 1}`);
  await expect(page.locator('section[id^="section-"]')).toHaveCount(0);

  // The festivals index before 2025 opens the prizes, and says so.
  await page.goto(`/festivals/${YEAR - 1}`);
  await expect(page.getByText(/prizes only before 2025/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Festivals" }).getByRole("link", { name: /Cannes/ })).toHaveAttribute(
    "href",
    `/awards/${FESTIVAL.slug}/${YEAR - 1}`,
  );

  // A film from before 2025 that no lineup lists: its page says lineups are tracked from 2025 on.
  const [old] = await db
    .select({ slug: movies.slug, title: movies.title })
    .from(movies)
    .where(and(lt(movies.year, YEAR), notInArray(movies.id, db.select({ id: screenings.movieId }).from(screenings)), sql`exists (select 1 from results r where r.movie_id = ${movies.id})`))
    .limit(1);
  expect(old, "an older film with results and no screening").toBeTruthy();
  await page.goto(`/movies/${old.slug}`);
  await expect(page.getByRole("group", { name: "Festivals" })).toContainText("Festival lineups are tracked from 2025 on.");
});
