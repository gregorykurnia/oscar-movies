// Marks export and restore on the `test` branch (IMPLEMENTATION_PLAN.md §3.5, task 0.11):
// export then restore changes nothing, planning (the dry run) writes nothing and lists every
// write, and a restore puts changed marks back exactly. Each test runs inside a transaction
// that is rolled back, so the branch stays as it was. Films use `test-marks-` slugs.
import { asc, eq, TransactionRollbackError } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { applyRestore, exportMarks, loadRestorePlan } from "../../scripts/lib/marks";
import { createScriptDb } from "../../src/db";
import { marks, movies } from "../../src/db/schema";
import { marksFileSchema } from "../../src/lib/data-files";

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

const snapshot = (tx: Tx) => tx.select().from(marks).orderBy(asc(marks.movieId));

/** Three marked films (one known by QID only) and one unmarked, on top of the seeded marks. */
async function addFilms(tx: Tx) {
  const rows = await tx
    .insert(movies)
    .values([
      { slug: "test-marks-1", title: "Marks One", year: 2024, countries: ["US"], imdbId: "tt80000001" },
      { slug: "test-marks-2", title: "Marks Two", year: 2024, countries: ["FR"], imdbId: "tt80000002", wikidataId: "Q80000002" },
      { slug: "test-marks-3", title: "Marks Three", year: 2025, countries: ["JP"], wikidataId: "Q80000003" },
      { slug: "test-marks-4", title: "Marks Four", year: 2025, countries: ["KR"], imdbId: "tt80000004" },
    ])
    .returning({ id: movies.id });
  const [one, two, three, four] = rows.map((r) => r.id);
  await tx.insert(marks).values([
    { movieId: one, watched: true, want: false, updatedAt: new Date("2026-01-01T10:00:00Z") },
    { movieId: two, watched: false, want: true, updatedAt: new Date("2026-02-01T10:00:00Z") },
    { movieId: three, watched: true, want: false, updatedAt: new Date("2026-03-01T10:00:00Z") },
    { movieId: four, watched: false, want: false },
  ]);
  return { one, two, three, four };
}

describe("marks export and restore", () => {
  it("exports every marked film by IMDb ID or QID, sorted by ID, as a valid marks file", async () => {
    await rolledBack(async (tx) => {
      await addFilms(tx);
      const file = await exportMarks(tx);
      expect(marksFileSchema.safeParse(file).success).toBe(true);
      const ours = file.filter((m) => m.title?.startsWith("Marks "));
      expect(ours).toEqual([
        { wd: "Q80000003", title: "Marks Three", year: 2025, watched: true, want: false, updatedAt: "2026-03-01T10:00:00.000Z" },
        { imdb: "tt80000001", title: "Marks One", year: 2024, watched: true, want: false, updatedAt: "2026-01-01T10:00:00.000Z" },
        { imdb: "tt80000002", wd: "Q80000002", title: "Marks Two", year: 2024, watched: false, want: true, updatedAt: "2026-02-01T10:00:00.000Z" },
      ]);
    });
  });

  it("changes nothing when it restores its own export", async () => {
    await rolledBack(async (tx) => {
      await addFilms(tx);
      const before = await snapshot(tx);
      const plan = await loadRestorePlan(tx, await exportMarks(tx));
      expect(plan.writes).toEqual([]);
      expect(plan.problems).toEqual([]);
      expect(plan.notInFile).toEqual([]);
      expect(plan.unchanged).toBe(before.filter((m) => m.watched || m.want).length);
      expect(await applyRestore(tx, plan)).toBe(0);
      expect(await snapshot(tx)).toEqual(before);
    });
  });

  it("plans every write without writing, then restores the marks exactly", async () => {
    await rolledBack(async (tx) => {
      const { one, two, three, four } = await addFilms(tx);
      const exported = await snapshot(tx);
      const file = await exportMarks(tx);

      // After the export: one flips to want, two's row is gone, three is cleared, four is watched.
      await tx.update(marks).set({ watched: false, want: true }).where(eq(marks.movieId, one));
      await tx.delete(marks).where(eq(marks.movieId, two));
      await tx.update(marks).set({ watched: false }).where(eq(marks.movieId, three));
      await tx.update(marks).set({ watched: true }).where(eq(marks.movieId, four));
      const changed = await snapshot(tx);

      const plan = await loadRestorePlan(tx, file);
      expect(await snapshot(tx)).toEqual(changed);
      expect(plan.problems).toEqual([]);
      expect(plan.writes.map((w) => [w.kind, w.film.id, w.from, { watched: w.to.watched, want: w.to.want }])).toEqual([
        ["update", three, { watched: false, want: false }, { watched: true, want: false }],
        ["update", one, { watched: false, want: true }, { watched: true, want: false }],
        ["insert", two, null, { watched: false, want: true }],
      ]);
      expect(plan.notInFile.map((n) => n.film.id)).toEqual([four]);

      expect(await applyRestore(tx, plan)).toBe(3);
      const after = await snapshot(tx);
      const byId = (rows: typeof after, id: number) => rows.find((m) => m.movieId === id);
      for (const id of [one, two, three]) expect(byId(after, id)).toEqual(byId(exported, id));
      expect(byId(after, four)?.watched).toBe(true);

      const again = await loadRestorePlan(tx, file);
      expect(again.writes).toEqual([]);
    });
  });

  it("refuses to write when an entry names a film that isn't there", async () => {
    await rolledBack(async (tx) => {
      const before = await snapshot(tx);
      const plan = await loadRestorePlan(tx, [
        { imdb: "tt80000009", title: "Missing", watched: true, want: false },
      ]);
      expect(plan.problems).toEqual(["Missing (tt80000009): no such film in the database."]);
      await expect(applyRestore(tx, plan)).rejects.toThrow(/nothing was written/);
      expect(await snapshot(tx)).toEqual(before);
    });
  });
});
