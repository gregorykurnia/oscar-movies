// The marks write (plan §5.6, task 1.7) on the `test` branch: it sets the whole state, keeps
// one row per film, refuses a film that doesn't exist, and never stores watched and wanted
// together. Each test runs inside a transaction that is rolled back.
import { eq, TransactionRollbackError } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createScriptDb } from "../../src/db";
import { writeMark } from "../../src/data/marks";
import { marks, movies } from "../../src/db/schema";

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

async function addFilm(tx: Tx) {
  const [{ id }] = await tx
    .insert(movies)
    .values({ slug: "test-mark-write", title: "Mark Write", year: 2025, countries: ["US"], imdbId: "tt80000101" })
    .returning({ id: movies.id });
  return id;
}

const read = (tx: Tx, id: number) =>
  tx.select({ watched: marks.watched, want: marks.want }).from(marks).where(eq(marks.movieId, id));

describe("writeMark", () => {
  it("writes, then replaces, the film's whole state", async () => {
    await rolledBack(async (tx) => {
      const id = await addFilm(tx);
      expect(await writeMark(tx, id, { watched: false, want: true })).toBe(true);
      expect(await read(tx, id)).toEqual([{ watched: false, want: true }]);
      expect(await writeMark(tx, id, { watched: true, want: false })).toBe(true);
      expect(await read(tx, id)).toEqual([{ watched: true, want: false }]);
      expect(await writeMark(tx, id, { watched: false, want: false })).toBe(true);
      expect(await read(tx, id)).toEqual([{ watched: false, want: false }]);
    });
  });

  it("refuses a film that doesn't exist, writing nothing", async () => {
    await rolledBack(async (tx) => {
      const missing = 2_000_000_000; // past any serial id the branch will reach
      expect(await writeMark(tx, missing, { watched: true, want: false })).toBe(false);
      expect(await read(tx, missing)).toEqual([]);
    });
  });

  it("never stores watched and wanted together", async () => {
    await expect(writeMark(db, 1, { watched: true, want: true })).rejects.toThrow();
  });
});
