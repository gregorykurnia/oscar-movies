// The score store on the `test` branch (IMPLEMENTATION_PLAN.md §5.4, task 1.5): the queue's
// order and recheck ages, and a save after failed calls keeps every stored score. Each test
// runs inside a transaction that is rolled back. Films use `test-scores-` slugs and year 1990
// (outside the app's years) so the seeded films don't get in the way of `--year` queues.
import { asc, eq, inArray, TransactionRollbackError } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createScriptDb } from "../../src/db";
import { dataLoads, movies } from "../../src/db/schema";
import type { RunSummary } from "../../src/lib/scores/batch";
import { mergeScores } from "../../src/lib/scores/merge";
import { createScoreStore } from "../../src/lib/scores/store";
import { LIVE_YEAR } from "../../src/lib/years";

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
  it("queues never-checked films first, then recent ones after 7 days, older ones after 30", async () => {
    await rolledBack(async (tx) => {
      // Every seeded film looks freshly checked, so only these films are due.
      await tx.update(movies).set({ scoresCheckedAt: NOW });
      const rows = await tx
        .insert(movies)
        .values([
          { slug: "test-scores-old-due", title: "a", year: 2015, countries: ["US"], imdbId: "tt81000001", scoresCheckedAt: daysAgo(31) },
          { slug: "test-scores-old-fresh", title: "b", year: 2015, countries: ["US"], imdbId: "tt81000002", scoresCheckedAt: daysAgo(10) },
          { slug: "test-scores-recent-due", title: "c", year: LIVE_YEAR - 1, countries: ["US"], imdbId: "tt81000003", scoresCheckedAt: daysAgo(8) },
          { slug: "test-scores-recent-fresh", title: "d", year: LIVE_YEAR, countries: ["US"], imdbId: "tt81000004", scoresCheckedAt: daysAgo(3) },
          { slug: "test-scores-never", title: "e", year: 2013, countries: ["US"], imdbId: "tt81000005" },
        ])
        .returning({ id: movies.id, slug: movies.slug });
      const slugOf = new Map(rows.map((r) => [r.id, r.slug]));

      const queue = await createScoreStore(tx).queue({ now: NOW });
      expect(queue.map((f) => slugOf.get(f.id))).toEqual([
        "test-scores-never",
        "test-scores-recent-due",
        "test-scores-old-due",
      ]);
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
