// The score store on the `test` branch (IMPLEMENTATION_PLAN.md §5.4, task 1.5): the queue's
// order and recheck window, and a save after failed calls keeps every stored score. Each test
// runs inside a transaction that is rolled back. Films use `test-scores-` slugs and year 1990
// (outside the app's years) so the seeded films don't get in the way of `--year` queues.
import { asc, eq, inArray, sql, TransactionRollbackError } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { queryMovie } from "../../src/data/movie";
import { queryWantedFilms } from "../../src/data/watch-list";
import { createScriptDb } from "../../src/db";
import { dataLoads, marks, movies } from "../../src/db/schema";
import type { RunSummary } from "../../src/lib/scores/batch";
import { mergeScores } from "../../src/lib/scores/merge";
import { createScoreStore } from "../../src/lib/scores/store";

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

const NOW = new Date("2026-10-22T20:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("generated scores", () => {
  it("averages the sources present, rounds the result and exposes it through both film readers", async () => {
    await rolledBack(async (tx) => {
      const base = { title: "Score fixture", year: 1990, countries: ["US"] };
      const fourScores = { imdbRating: 7.3, rtScore: 91, mcScore: 88, tmdbScore: 7.1 };
      const columns = { id: movies.id, slug: movies.slug, avgScore: movies.avgScore, scoreCount: movies.scoreCount };
      const rows = await tx.insert(movies).values([
        { ...base, slug: "test-scores-imdb-lb", imdbId: "tt81000041", imdbRating: 7, lbRating: 4 },
        { ...base, slug: "test-scores-lb-only", imdbId: "tt81000042", lbRating: 3.5 },
        { ...base, slug: "test-scores-no-scores", imdbId: "tt81000043" },
        { ...base, slug: "test-scores-four", imdbId: "tt81000044", ...fourScores },
        { ...base, slug: "test-scores-five", imdbId: "tt81000045", ...fourScores, lbRating: 3.67 },
      ]).returning(columns);
      expect(rows).toMatchObject([
        { avgScore: 75, scoreCount: 2 },
        { avgScore: 70, scoreCount: 1 },
        { avgScore: null, scoreCount: 0 },
        { avgScore: 80.8, scoreCount: 4 },
        { avgScore: 79.3, scoreCount: 5 },
      ]);

      const full = rows[4];
      await tx.insert(marks).values({ movieId: full.id, want: true });
      const wanted = await queryWantedFilms(tx);
      expect(wanted.find(({ film }) => film.id === full.id)?.film.scores).toMatchObject({ average: 79.3, count: 5, lb: 3.67 });
      await expect(queryMovie(tx, full.slug)).resolves.toMatchObject({
        scores: { average: 79.3, count: 5, lb: { value: 3.67 } },
      });

      const updateLetterboxd = (lbRating: number | null) =>
        tx.update(movies).set({ lbRating }).where(eq(movies.id, rows[3].id)).returning(columns);
      await expect(updateLetterboxd(3.67)).resolves.toMatchObject([{ avgScore: 79.3, scoreCount: 5 }]);
      await expect(updateLetterboxd(3.67)).resolves.toMatchObject([{ avgScore: 79.3, scoreCount: 5 }]);
      await expect(updateLetterboxd(null)).resolves.toMatchObject([{ avgScore: 80.8, scoreCount: 4 }]);
    });
  });

  it("keeps a valid index on the generated average", async () => {
    const { rows } = await db.execute<{ definition: string; valid: boolean }>(sql`
      select pg_get_indexdef(indexrelid) as definition, indisvalid as valid
      from pg_index
      where indexrelid = to_regclass('public.movies_avg_score_idx')
    `);
    expect(rows).toEqual([{ definition: expect.stringContaining("(avg_score)"), valid: true }]);
  });
});

describe("score store", () => {
  it("queues never-checked films first, then this race's films checked over 20 hours ago; older films never", async () => {
    await rolledBack(async (tx) => {
      // Every seeded film looks freshly checked, so only these films are due.
      await tx.update(movies).set({ scoresCheckedAt: NOW });
      const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3_600_000);
      const rows = await tx
        .insert(movies)
        .values([
          { slug: "test-scores-old-stale", title: "a", year: 2015, countries: ["US"], imdbId: "tt81000001", scoresCheckedAt: daysAgo(400) },
          { slug: "test-scores-last-year", title: "b", year: 2025, countries: ["US"], imdbId: "tt81000002", scoresCheckedAt: daysAgo(30) },
          { slug: "test-scores-live-due", title: "c", year: 2026, countries: ["US"], imdbId: "tt81000003", scoresCheckedAt: hoursAgo(24) },
          { slug: "test-scores-live-fresh", title: "d", year: 2026, countries: ["US"], imdbId: "tt81000004", scoresCheckedAt: hoursAgo(10) },
          { slug: "test-scores-planned-due", title: "f", year: 2027, countries: ["US"], imdbId: "tt81000006", scoresCheckedAt: hoursAgo(21) },
          { slug: "test-scores-never", title: "e", year: 2013, countries: ["US"], imdbId: "tt81000005" },
        ])
        .returning({ id: movies.id, slug: movies.slug });
      const slugOf = new Map(rows.map((r) => [r.id, r.slug]));

      const queue = await createScoreStore(tx).queue({ now: NOW });
      expect(queue.map((f) => slugOf.get(f.id))).toEqual([
        "test-scores-never",
        "test-scores-live-due",
        "test-scores-planned-due",
      ]);
    });
  });

  it("with ids, queues just those films whatever their age", async () => {
    await rolledBack(async (tx) => {
      const [row] = await tx
        .insert(movies)
        .values({ slug: "test-scores-one", title: "a", year: 1990, countries: ["US"], imdbId: "tt81000031", scoresCheckedAt: NOW })
        .returning({ id: movies.id });
      const queue = await createScoreStore(tx).queue({ now: NOW, ids: [row.id] });
      expect(queue.map((f) => f.id)).toEqual([row.id]);
    });
  });

  it("with years, queues every film of those years whatever its age", async () => {
    await rolledBack(async (tx) => {
      await tx.insert(movies).values([
        { slug: "test-scores-y1", title: "a", year: 1990, countries: ["US"], imdbId: "tt81000011", scoresCheckedAt: NOW },
        { slug: "test-scores-y2", title: "b", year: 1990, countries: ["US"], imdbId: "tt81000012" },
      ]);
      const queue = await createScoreStore(tx).queue({ now: NOW, years: { from: 1990, to: 1990 } });
      expect(queue.map((f) => f.imdbId)).toEqual(["tt81000012", "tt81000011"]);
    });
  });

  it("a save after failed calls keeps the stored scores and their dates", async () => {
    await rolledBack(async (tx) => {
      const scored = { imdbRating: 7.5, rtScore: 91, mcScore: 80, tmdbScore: 7.2, lbRating: null };
      const at = daysAgo(40);
      const [row] = await tx
        .insert(movies)
        .values({
          slug: "test-scores-keep",
          title: "Keep",
          year: 1990,
          countries: ["US"],
          imdbId: "tt81000021",
          ...scored,
          imdbAt: at,
          rtAt: at,
          mcAt: at,
          tmdbAt: at,
        })
        .returning({ id: movies.id });
      const store = createScoreStore(tx);
      await store.save(row.id, mergeScores(scored, { rtScore: null }, NOW).update);
      await store.record({ source: "script", checked: 1 } as RunSummary);

      const [after] = await tx.select().from(movies).where(eq(movies.id, row.id));
      expect(after).toMatchObject({ ...scored, imdbAt: at, rtAt: at, mcAt: at, tmdbAt: at, scoresCheckedAt: NOW });
      expect(after.scoreCount).toBe(4);
      // Without an order Postgres may return the rows in any order: the newest is the highest id.
      const loads = await tx.select().from(dataLoads).where(inArray(dataLoads.kind, ["scores"])).orderBy(asc(dataLoads.id));
      expect(loads.at(-1)?.summary).toMatchObject({ source: "script", checked: 1 });
    });
  });
});
