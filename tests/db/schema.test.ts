// Schema constraints (IMPLEMENTATION_PLAN.md §3.1, task 0.3): one row per table goes in and
// comes back out, and every check, unique key and delete rule refuses what it should. Each
// test runs inside a transaction that is rolled back, so the `test` branch stays as it was.
// Slugs start with `test-` so they never clash with the seeded data (`db:seed:test`).
import { readFileSync } from "node:fs";
import { eq, sql, TransactionRollbackError } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createScriptDb } from "../../src/db";
import {
  accuracy,
  appMeta,
  awardCategories,
  awards,
  dataLoads,
  editions,
  marks,
  movies,
  predictions,
  results,
  screenings,
} from "../../src/db/schema";

const { db, close } = createScriptDb();
afterAll(() => close());

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function rolledBack(fn: (tx: Tx) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
}

/** Runs `fn` in a savepoint and expects Postgres to refuse it with `constraint`. */
async function expectViolation(tx: Tx, constraint: string, fn: (sp: Tx) => Promise<unknown>) {
  const error = await tx.transaction(async (sp) => void (await fn(sp))).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, `expected ${constraint} to refuse`).not.toBeNull();
  const cause = (error as { cause?: { constraint?: string } }).cause;
  expect(cause?.constraint).toBe(constraint);
}

let n = 0;
async function addMovie(tx: Tx, values: Partial<typeof movies.$inferInsert> = {}) {
  n += 1;
  const [row] = await tx
    .insert(movies)
    .values({ slug: `test-film-${n}`, title: `Film ${n}`, year: 2024, countries: ["US"], imdbId: `tt9000${n}`, ...values })
    .returning();
  return row;
}

async function addAward(tx: Tx) {
  const [award] = await tx
    .insert(awards)
    .values({ slug: "test-oscars", name: "Academy Awards", shortName: "Oscars", kind: "oscars", calendarOrder: 99 })
    .returning();
  const [category] = await tx
    .insert(awardCategories)
    .values({ awardId: award.id, slug: "picture", name: "Best Picture", oscarCategory: "picture" })
    .returning();
  const [edition] = await tx
    .insert(editions)
    .values({ awardId: award.id, year: 2024, ordinal: "97th", status: "loaded", winnersOn: "2025-03-02" })
    .returning();
  return { award, category, edition };
}

describe("migrations", () => {
  it("applied every migration in drizzle/ exactly once", async () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
      entries: unknown[];
    };
    const rows = await db.execute<{ count: string }>(
      sql`select count(*) as count from drizzle.__drizzle_migrations`,
    );
    expect(Number(rows.rows[0].count)).toBe(journal.entries.length);
  });
});

describe("app_meta", () => {
  it("marks this branch as test, and stores and reads a row", async () => {
    const [branch] = await db.select().from(appMeta).where(eq(appMeta.key, "db_branch"));
    expect(branch.value).toBe("test");
    await rolledBack(async (tx) => {
      await tx.insert(appMeta).values({ key: "probe", value: "1" });
      const [row] = await tx.select().from(appMeta).where(eq(appMeta.key, "probe"));
      expect(row.value).toBe("1");
    });
  });
});

describe("movies", () => {
  it("stores a film and computes the average, score count and search key", async () => {
    await rolledBack(async (tx) => {
      const film = await addMovie(tx, {
        title: "Amélie",
        originalTitle: "Le Fabuleux Destin d'Amélie Poulain",
        originalLang: "fr",
        countries: ["FR", "DE"],
        wikidataId: "Q484048",
        tmdbId: 194,
        imdbRating: 8.3,
        rtScore: 89,
        tmdbScore: 7.9,
      });
      const [row] = await tx.select().from(movies).where(eq(movies.id, film.id));
      expect(row).toMatchObject({ title: "Amélie", countries: ["FR", "DE"], imdbRating: 8.3, mcScore: null });
      // (83 + 79 + 89) / 3 = 83.67
      expect(row.avgScore).toBe(83.7);
      expect(row.scoreCount).toBe(3);
      expect(row.searchKey).toBe("amelie le fabuleux destin d'amelie poulain");

      const bare = await addMovie(tx, { title: "Sans scores" });
      expect(bare).toMatchObject({ avgScore: null, scoreCount: 0, searchKey: "sans scores " });
    });
  });

  it("refuses bad ids, out-of-range scores and duplicates", async () => {
    await rolledBack(async (tx) => {
      await addMovie(tx, { slug: "test-first", imdbId: "tt0000001", wikidataId: "Q1", tmdbId: 1 });
      await expectViolation(tx, "movies_has_id", (sp) => addMovie(sp, { imdbId: null }));
      await expectViolation(tx, "movies_imdb_id_format", (sp) => addMovie(sp, { imdbId: "nm123" }));
      await expectViolation(tx, "movies_wikidata_id_format", (sp) => addMovie(sp, { wikidataId: "P345" }));
      await expectViolation(tx, "movies_imdb_rating_range", (sp) => addMovie(sp, { imdbRating: 10.5 }));
      await expectViolation(tx, "movies_rt_score_range", (sp) => addMovie(sp, { rtScore: 101 }));
      await expectViolation(tx, "movies_mc_score_range", (sp) => addMovie(sp, { mcScore: -1 }));
      await expectViolation(tx, "movies_tmdb_score_range", (sp) => addMovie(sp, { tmdbScore: 11 }));
      await expectViolation(tx, "movies_imdb_id_unique", (sp) => addMovie(sp, { imdbId: "tt0000001" }));
      await expectViolation(tx, "movies_wikidata_id_unique", (sp) => addMovie(sp, { wikidataId: "Q1" }));
      await expectViolation(tx, "movies_tmdb_id_unique", (sp) => addMovie(sp, { tmdbId: 1 }));
      await expectViolation(tx, "movies_slug_unique", (sp) => addMovie(sp, { slug: "test-first" }));
    });
  });
});

describe("marks", () => {
  it("stores a mark, refuses watched and want together, and keeps its film from being deleted", async () => {
    await rolledBack(async (tx) => {
      const film = await addMovie(tx);
      await tx.insert(marks).values({ movieId: film.id, watched: true });
      const [row] = await tx.select().from(marks).where(eq(marks.movieId, film.id));
      expect(row).toMatchObject({ watched: true, want: false });
      expect(row.updatedAt).toBeInstanceOf(Date);

      await expectViolation(tx, "marks_not_watched_and_want", (sp) =>
        sp.update(marks).set({ want: true }).where(eq(marks.movieId, film.id)),
      );
      await expectViolation(tx, "marks_movie_id_movies_id_fk", (sp) =>
        sp.delete(movies).where(eq(movies.id, film.id)),
      );
      await expectViolation(tx, "marks_movie_id_movies_id_fk", (sp) =>
        sp.insert(marks).values({ movieId: -1 }),
      );
    });
  });
});

describe("awards, award_categories and editions", () => {
  it("stores one of each and refuses duplicates and deleting an award in use", async () => {
    await rolledBack(async (tx) => {
      const { award, category, edition } = await addAward(tx);
      const [a] = await tx.select().from(awards).where(eq(awards.id, award.id));
      expect(a).toMatchObject({ slug: "test-oscars", kind: "oscars", winnersOnly: false, isSelection: false });
      const [c] = await tx.select().from(awardCategories).where(eq(awardCategories.id, category.id));
      expect(c).toMatchObject({ oscarCategory: "picture", loose: false, sortOrder: 0 });
      const [e] = await tx.select().from(editions).where(eq(editions.id, edition.id));
      expect(e).toMatchObject({ year: 2024, status: "loaded", winnersOn: "2025-03-02", sourceUrls: [] });

      await expectViolation(tx, "awards_slug_unique", (sp) =>
        sp.insert(awards).values({ slug: "test-oscars", name: "x", shortName: "x", kind: "major", calendarOrder: 1 }),
      );
      await expectViolation(tx, "award_categories_award_slug_key", (sp) =>
        sp.insert(awardCategories).values({ awardId: award.id, slug: "picture", name: "x", oscarCategory: "picture" }),
      );
      await expectViolation(tx, "editions_award_year_key", (sp) =>
        sp.insert(editions).values({ awardId: award.id, year: 2024, status: "partial" }),
      );
      await expectViolation(tx, "award_categories_award_id_awards_id_fk", (sp) =>
        sp.delete(awards).where(eq(awards.id, award.id)),
      );
      const [festival] = await tx
        .insert(awards)
        .values({ slug: "test-cannes", name: "Cannes Film Festival", shortName: "Cannes", kind: "festival", calendarOrder: 1 })
        .returning();
      await tx.insert(editions).values({ awardId: festival.id, year: 2025, status: "no_data" });
      await expectViolation(tx, "editions_award_id_awards_id_fk", (sp) =>
        sp.delete(awards).where(eq(awards.id, festival.id)),
      );
    });
  });
});

describe("results and screenings", () => {
  it("stores one of each, refuses duplicates and deleting their film, and goes with their edition", async () => {
    await rolledBack(async (tx) => {
      const { category, edition } = await addAward(tx);
      const film = await addMovie(tx);
      await tx.insert(results).values({ editionId: edition.id, categoryId: category.id, movieId: film.id, outcome: "won" });
      await tx.insert(screenings).values({ editionId: edition.id, movieId: film.id, section: "Competition", prize: "Palme d'Or" });
      const [r] = await tx.select().from(results).where(eq(results.movieId, film.id));
      expect(r).toMatchObject({ outcome: "won", country: null });
      const [s] = await tx.select().from(screenings).where(eq(screenings.movieId, film.id));
      expect(s).toMatchObject({ section: "Competition", sectionOrder: 0, prize: "Palme d'Or" });

      await expectViolation(tx, "results_edition_category_movie_key", (sp) =>
        sp.insert(results).values({ editionId: edition.id, categoryId: category.id, movieId: film.id, outcome: "nominated" }),
      );
      await expectViolation(tx, "screenings_edition_movie_section_key", (sp) =>
        sp.insert(screenings).values({ editionId: edition.id, movieId: film.id, section: "Competition" }),
      );
      await expectViolation(tx, "results_movie_id_movies_id_fk", (sp) =>
        sp.delete(movies).where(eq(movies.id, film.id)),
      );
      await expectViolation(tx, "results_category_id_award_categories_id_fk", (sp) =>
        sp.delete(awardCategories).where(eq(awardCategories.id, category.id)),
      );

      // Reloading an edition replaces its results and screenings; the film stays.
      await tx.delete(editions).where(eq(editions.id, edition.id));
      expect(await tx.select().from(results).where(eq(results.movieId, film.id))).toEqual([]);
      expect(await tx.select().from(screenings).where(eq(screenings.movieId, film.id))).toEqual([]);
      expect(await tx.select().from(movies).where(eq(movies.id, film.id))).toHaveLength(1);
    });
  });
});

describe("accuracy and predictions", () => {
  it("stores one of each; they go with their category or film", async () => {
    await rolledBack(async (tx) => {
      const { category, edition } = await addAward(tx);
      const film = await addMovie(tx);
      await tx.insert(accuracy).values({ categoryId: category.id, winHits: 5, winCount: 13, nomHits: 11, nomCount: 13 });
      const prediction = { year: 2025, oscarCategory: "picture", snapshot: "live", movieId: film.id, pNominate: 0.92, pWin: 0.41, rank: 1, why: { top: [] } } as const;
      await tx.insert(predictions).values(prediction);

      const [acc] = await tx.select().from(accuracy).where(eq(accuracy.categoryId, category.id));
      expect(acc).toMatchObject({ winHits: 5, winCount: 13, nomineesHits: null });
      const [p] = await tx.select().from(predictions).where(eq(predictions.movieId, film.id));
      expect(p).toMatchObject({ rank: 1, why: { top: [] } });
      expect(p.pWin).toBeCloseTo(0.41);

      await expectViolation(tx, "predictions_pkey", (sp) => sp.insert(predictions).values(prediction));

      await tx.delete(editions).where(eq(editions.id, edition.id));
      await tx.delete(awardCategories).where(eq(awardCategories.id, category.id));
      expect(await tx.select().from(accuracy).where(eq(accuracy.categoryId, category.id))).toEqual([]);
      await tx.delete(movies).where(eq(movies.id, film.id));
      expect(await tx.select().from(predictions).where(eq(predictions.movieId, film.id))).toEqual([]);
    });
  });
});

describe("data_loads", () => {
  it("stores a load and refuses an unknown kind", async () => {
    await rolledBack(async (tx) => {
      const [load] = await tx.insert(dataLoads).values({ kind: "scores", summary: { checked: 300, errors: 0 } }).returning();
      const [row] = await tx.select().from(dataLoads).where(eq(dataLoads.id, load.id));
      expect(row).toMatchObject({ kind: "scores", summary: { checked: 300, errors: 0 }, gitCommit: null });
      expect(row.loadedAt).toBeInstanceOf(Date);
      await expectViolation(tx, "data_loads_kind", (sp) => sp.insert(dataLoads).values({ kind: "import", summary: {} }));
    });
  });
});
