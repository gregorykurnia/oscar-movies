// Marks export and restore on the `test` branch (IMPLEMENTATION_PLAN.md §3.5, task 0.11):
// export then restore changes nothing, planning (the dry run) writes nothing and lists every
// write, and a restore puts changed marks back exactly; from 7.4 the same holds for the Watch
// list order and release notes, and an older file without them leaves them alone. Each test
// runs inside a transaction that is rolled back, so the branch stays as it was. Films use
// `test-marks-` slugs.
import { asc, eq, TransactionRollbackError } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { applyRestore, exportMarks, formatPlan, loadRestorePlan } from "../../scripts/lib/marks";
import { writeWantAtTop } from "../../src/data/marks";
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
  // Two goes last in the order, after the seeded wanted films (numbered 1…n first).
  const seeded = await tx.select({ id: marks.movieId }).from(marks).where(eq(marks.want, true)).orderBy(asc(marks.wantRank), asc(marks.movieId));
  for (const [i, m] of seeded.entries()) await tx.update(marks).set({ wantRank: i + 1 }).where(eq(marks.movieId, m.id));
  const twoRank = seeded.length + 1;
  await tx.insert(marks).values([
    { movieId: one, watched: true, want: false, updatedAt: new Date("2026-01-01T10:00:00Z") },
    {
      movieId: two,
      watched: false,
      want: true,
      wantRank: twoRank,
      releaseOn: "2026-12-12",
      platform: "Netflix",
      updatedAt: new Date("2026-02-01T10:00:00Z"),
    },
    { movieId: three, watched: true, want: false, platform: "MUBI", updatedAt: new Date("2026-03-01T10:00:00Z") },
    { movieId: four, watched: false, want: false },
  ]);
  return { one, two, three, four, twoRank };
}

describe("marks export and restore", () => {
  it("exports every marked film by IMDb ID or QID, sorted by ID, as a valid marks file", async () => {
    await rolledBack(async (tx) => {
      const { twoRank } = await addFilms(tx);
      const file = await exportMarks(tx);
      expect(marksFileSchema.safeParse(file).success).toBe(true);
      const ours = file.filter((m) => m.title?.startsWith("Marks "));
      const none = { wantRank: null, releaseOn: null, platform: null };
      expect(ours).toEqual([
        { wd: "Q80000003", title: "Marks Three", year: 2025, watched: true, want: false, ...none, platform: "MUBI", updatedAt: "2026-03-01T10:00:00.000Z" },
        { imdb: "tt80000001", title: "Marks One", year: 2024, watched: true, want: false, ...none, updatedAt: "2026-01-01T10:00:00.000Z" },
        {
          imdb: "tt80000002",
          wd: "Q80000002",
          title: "Marks Two",
          year: 2024,
          watched: false,
          want: true,
          wantRank: twoRank,
          releaseOn: "2026-12-12",
          platform: "Netflix",
          updatedAt: "2026-02-01T10:00:00.000Z",
        },
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
      const marksOf = (m: { watched: boolean; want: boolean } | null) => m && { watched: m.watched, want: m.want };
      expect(plan.writes.map((w) => [w.kind, w.film.id, marksOf(w.from), marksOf(w.to)])).toEqual([
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

  it("exports a film that has only release notes, and restores them", async () => {
    await rolledBack(async (tx) => {
      const { four } = await addFilms(tx);
      await tx.update(marks).set({ releaseOn: "2026-11-03", platform: "Cinema XXI" }).where(eq(marks.movieId, four));
      const file = await exportMarks(tx);
      expect(file.find((m) => m.imdb === "tt80000004")).toMatchObject({
        watched: false,
        want: false,
        releaseOn: "2026-11-03",
        platform: "Cinema XXI",
      });
      await tx.update(marks).set({ releaseOn: null, platform: null }).where(eq(marks.movieId, four));
      // Two, and any seeded wanted film, get their backed-up places back.
      expect(await applyRestore(tx, await loadRestorePlan(tx, file))).toBeGreaterThan(0);
      expect((await tx.select().from(marks).where(eq(marks.movieId, four)))[0]).toMatchObject({
        releaseOn: "2026-11-03",
        platform: "Cinema XXI",
      });
    });
  });

  it("puts the order and release notes back exactly, nulls included", async () => {
    await rolledBack(async (tx) => {
      const { two, three, twoRank } = await addFilms(tx);
      const exported = await snapshot(tx);
      const file = await exportMarks(tx);

      // After the export: two moves and its notes change, three gets a date and loses its platform.
      await tx.update(marks).set({ wantRank: 1, releaseOn: null, platform: "Prime Video" }).where(eq(marks.movieId, two));
      await tx.update(marks).set({ releaseOn: "2027-01-05", platform: null }).where(eq(marks.movieId, three));

      const plan = await loadRestorePlan(tx, file);
      expect(plan.writes.map((w) => w.film.id).sort()).toEqual([two, three].sort());
      expect(formatPlan(plan, "Plan")).toContain(`Marks Two (2024, tt80000002): want #1, TBD · Prime Video → want #${twoRank}, 2026-12-12 · Netflix`);
      expect(await applyRestore(tx, plan)).toBe(2);
      expect(await snapshot(tx)).toEqual(exported);
      expect((await loadRestorePlan(tx, file)).writes).toEqual([]);
    });
  });

  it("restores an older file without the Watch list fields, leaving them alone", async () => {
    await rolledBack(async (tx) => {
      const { one, two, three, twoRank } = await addFilms(tx);
      // Two stops being wanted and three is wanted, after the old backup.
      await tx.update(marks).set({ want: false, wantRank: null }).where(eq(marks.movieId, two));
      await tx.update(marks).set({ watched: false, want: true, wantRank: 1 }).where(eq(marks.movieId, three));
      const old = marksFileSchema.parse([
        { imdb: "tt80000001", title: "Marks One", watched: true, want: false },
        { imdb: "tt80000002", title: "Marks Two", watched: false, want: true, updatedAt: "2026-02-01T10:00:00.000Z" },
        { wd: "Q80000003", title: "Marks Three", watched: true, want: false },
      ]);
      const plan = await loadRestorePlan(tx, old);
      expect(plan.problems).toEqual([]);
      expect(plan.unchanged).toBe(1);
      expect(await applyRestore(tx, plan)).toBe(2);

      const after = await snapshot(tx);
      const byId = (id: number) => after.find((m) => m.movieId === id);
      expect(byId(one)).toMatchObject({ watched: true, want: false, wantRank: null, releaseOn: null, platform: null });
      // Wanted again, last in the order, its notes kept through the unwanted spell.
      expect(byId(two)).toMatchObject({ watched: false, want: true, wantRank: twoRank, releaseOn: "2026-12-12", platform: "Netflix" });
      // Watched again: no rank, platform kept.
      expect(byId(three)).toMatchObject({ watched: true, want: false, wantRank: null, platform: "MUBI" });
      expect((await loadRestorePlan(tx, old)).writes).toEqual([]);
    });
  });

  it("numbers the order 1…n again when an older backup's places collide with today's (7.R)", async () => {
    await rolledBack(async (tx) => {
      const { two, four } = await addFilms(tx);
      const file = await exportMarks(tx);
      // After the backup: Four is added at the top (everyone moves down one), then Two's mark is lost.
      await writeWantAtTop(tx, four);
      await tx.update(marks).set({ want: false, wantRank: null }).where(eq(marks.movieId, two));
      // Two, and any seeded wanted film, get their backed-up places back.
      expect(await applyRestore(tx, await loadRestorePlan(tx, file))).toBeGreaterThan(0);
      const wanted = await tx.select({ id: marks.movieId, rank: marks.wantRank }).from(marks).where(eq(marks.want, true)).orderBy(asc(marks.wantRank));
      expect(wanted.map((w) => w.rank)).toEqual(wanted.map((_, i) => i + 1));
      expect(wanted[0].id).toBe(four);
    });
  });

  it("writes nothing when a planned film's mark changed after the plan", async () => {
    await rolledBack(async (tx) => {
      const { one, two } = await addFilms(tx);
      const file = await exportMarks(tx);
      await tx.update(marks).set({ watched: false, want: true }).where(eq(marks.movieId, one));
      await tx.delete(marks).where(eq(marks.movieId, two));
      const plan = await loadRestorePlan(tx, file);
      expect(plan.writes.map((w) => w.film.id).sort()).toEqual([one, two].sort());

      // A tap on the live site between the plan and the write: one goes back to watched.
      await tx.update(marks).set({ watched: true, want: false }).where(eq(marks.movieId, one));
      const before = await snapshot(tx);
      await expect(applyRestore(tx, plan)).rejects.toThrow(/Marks One \(2024, tt80000001\).*Nothing was written/);
      expect(await snapshot(tx)).toEqual(before);
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
