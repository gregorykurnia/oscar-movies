// Predictions in the database (IMPLEMENTATION_PLAN.md §5.3, task 3.2) against the seeded `test`
// data: every stored category adds to 100%, past seasons have both eves, and reloading one
// precursor (Cannes 2026 with its Palme d'Or taken away) through the loader moves the 2026
// chances. The writes run inside a transaction that is rolled back.
import { and, eq, TransactionRollbackError } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { recomputePredictions } from "../../scripts/lib/compute";
import { readDataSet } from "../../scripts/lib/data-check";
import { runLoad } from "../../scripts/lib/load";
import { createScriptDb } from "../../src/db";
import { movies, predictions } from "../../src/db/schema";

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

const TODAY = "2026-10-23";

async function chances(tx: Tx, year: number) {
  const rows = await tx
    .select({ imdb: movies.imdbId, pWin: predictions.pWin, pNominate: predictions.pNominate, rank: predictions.rank })
    .from(predictions)
    .innerJoin(movies, eq(movies.id, predictions.movieId))
    .where(and(eq(predictions.year, year), eq(predictions.oscarCategory, "picture"), eq(predictions.snapshot, "live")));
  return new Map(rows.map((r) => [r.imdb, r]));
}

describe("recomputePredictions", () => {
  it("stores every season's live chances, the past seasons' eves, and each category adds to 100%", async () => {
    await rolledBack(async (tx) => {
      await recomputePredictions(tx, TODAY);
      const rows = await tx.select().from(predictions);
      const sums = new Map<string, number>();
      for (const r of rows) {
        const key = `${r.year}/${r.oscarCategory}/${r.snapshot}`;
        sums.set(key, (sums.get(key) ?? 0) + r.pWin);
      }
      for (const [key, sum] of sums) expect(sum, key).toBeCloseTo(1, 4);
      expect(sums.has("2024/picture/eve_nominations")).toBe(true);
      expect(sums.has("2024/picture/eve_ceremony")).toBe(true);
      expect(sums.has("2026/picture/live")).toBe(true);
      // 2026's eves haven't come yet.
      expect(sums.has("2026/picture/eve_nominations")).toBe(false);
      const past = rows.filter((r) => r.year === 2024 && r.oscarCategory === "picture" && r.snapshot === "eve_ceremony");
      expect(past).toHaveLength(10);
      expect(past.every((r) => r.pNominate === null)).toBe(true);
    });
  });

  it("moves the 2026 chances when one precursor is reloaded", async () => {
    const { data, errors } = readDataSet("data");
    expect(errors).toEqual([]);
    const cannes = data.editions.find((e) => e.edition.award === "cannes" && e.edition.year === 2026)!;
    const palme = cannes.edition.results.find((r) => r.category === "palme-dor")!;
    const changed = {
      ...data,
      editions: data.editions.map((e) =>
        e === cannes ? { ...e, edition: { ...e.edition, results: e.edition.results.filter((r) => r !== palme) } } : e,
      ),
    };

    await rolledBack(async (tx) => {
      await recomputePredictions(tx, TODAY);
      const before = await chances(tx, 2026);
      expect(before.get(palme.imdb!)).toBeDefined();

      const { written } = await runLoad(tx, changed, {
        target: "test",
        dryRun: false,
        only: "cannes",
        today: TODAY,
        afterWrites: async (inner) => void (await recomputePredictions(inner, TODAY)),
        log: () => {},
      });
      expect(written).toBe(true);

      const after = await chances(tx, 2026);
      // The Palme d'Or winner has no other 2026 Best Picture result, so it drops out of the race.
      expect(after.get(palme.imdb!)).toBeUndefined();
      expect(after.size).toBe(before.size - 1);
      const moved = [...after].some(([imdb, a]) => Math.abs(a.pWin - before.get(imdb)!.pWin) > 1e-6);
      expect(moved).toBe(true);
      expect([...after.values()].reduce((s, r) => s + r.pWin, 0)).toBeCloseTo(1, 4);
    });
  });
});
