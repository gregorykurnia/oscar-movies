// The score store on the `test` branch (IMPLEMENTATION_PLAN.md §5.4, task 1.5): the queue's
// order and recheck window, and a save after failed calls keeps every stored score. Each test
// runs inside a transaction that is rolled back. Films use `test-scores-` slugs and year 1990
// (outside the app's years) so the seeded films don't get in the way of `--year` queues.
import { asc, eq, inArray, TransactionRollbackError } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createScriptDb } from "../../src/db";
import { dataLoads, movies } from "../../src/db/schema";
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
      const scored = { imdbRating: 7.5, rtScore: 91, mcScore: 80, tmdbScore: 7.2 };
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
