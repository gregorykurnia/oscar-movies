// App-created films are owner data. Every fixture and its deletion runs in a rolled-back
// transaction on the guarded Neon test branch; filesystem exports live in a temporary folder.
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asc, eq, inArray, TransactionRollbackError } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { applyRestore, exportMarks, exportMarksToFile, formatPlan, loadRestorePlan, readMarksFile, serializeMarks } from "../../scripts/lib/marks";
import { createScriptDb } from "../../src/db";
import { marks, movies } from "../../src/db/schema";
import { marksFileSchema, type MarkEntry } from "../../src/lib/data-files";

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

const markRows = (tx: Tx) => tx.select().from(marks).orderBy(asc(marks.movieId));

async function fixtures(tx: Tx) {
  const films = await tx.insert(movies).values(Array.from({ length: 5 }, (_, i) => ({
    slug: `test-marks-backup-${i + 1}`, title: `Backup Film ${i + 1}`, year: 2026,
    localId: `b6871340-cb0a-4f82-a40c-3510cdbd000${i + 1}`, countries: i === 2 ? ["JP"] : [],
    ...(i === 2 ? {
      originalTitle: "映画", originalLang: "ja", language: "ja",
      imdbId: "tt88000001", wikidataId: "Q88000001", tmdbId: 88000001,
    } : {}),
  }))).returning();
  const wanted = await tx.select().from(marks).where(eq(marks.want, true)).orderBy(asc(marks.wantRank), asc(marks.movieId));
  for (const [i, m] of wanted.entries()) await tx.update(marks).set({ wantRank: i + 1 }).where(eq(marks.movieId, m.movieId));
  await tx.insert(marks).values([
    { movieId: films[0].id, want: true, wantRank: wanted.length + 1, releaseOn: "2026-12-12", platform: "Netflix" },
    { movieId: films[1].id, want: true, wantRank: wanted.length + 2 },
    { movieId: films[2].id, watched: true, releaseOn: "2026-11-01", platform: "MUBI" },
    { movieId: films[3].id, platform: "Cinema XXI" },
  ].map((m) => ({ ...m, updatedAt: new Date("2026-11-10T12:00:00Z") })));
  return films;
}

const absentMovie = {
  localId: "ccb22f13-1c14-471d-a7fb-b78431957d49",
  slug: "test-marks-backup-absent", title: "Absent Backup Film", year: 2026, countries: [],
};
const absent: MarkEntry = { localId: absentMovie.localId, movie: absentMovie, watched: false, want: true, platform: "MUBI" };

describe("app-created film backup", () => {
  it("recreates deleted films and all notes/order/watched state; a second restore writes nothing", async () => {
    await rolledBack(async (tx) => {
      const films = await fixtures(tx);
      const file = marksFileSchema.parse(JSON.parse(serializeMarks(await exportMarks(tx))));
      const ours = file.filter((m) => m.localId?.startsWith("b6871340-"));
      expect(ours).toHaveLength(5);
      expect(ours.find((m) => m.localId === films[4].localId)).toMatchObject({ watched: false, want: false, movie: { slug: films[4].slug } });
      expect(ours.find((m) => m.localId === films[2].localId)?.movie).toMatchObject({
        originalTitle: "映画", originalLang: "ja", countries: ["JP"], language: "ja",
        imdb: "tt88000001", wd: "Q88000001", tmdb: 88000001,
      });
      await tx.delete(marks).where(inArray(marks.movieId, films.map((f) => f.id)));
      await tx.delete(movies).where(inArray(movies.id, films.map((f) => f.id)));
      const beforeMarks = await markRows(tx);
      const plan = await loadRestorePlan(tx, file);
      expect(plan.problems).toEqual([]);
      expect(plan.creates).toHaveLength(5);
      expect(formatPlan(plan, "Dry run")).toContain("5 films to recreate");
      expect(await markRows(tx)).toEqual(beforeMarks);
      expect(await tx.select().from(movies).where(inArray(movies.slug, films.map((f) => f.slug)))).toEqual([]);

      expect(await applyRestore(tx, plan)).toBe(4);
      const restored = await tx.select().from(movies).where(inArray(movies.slug, films.map((f) => f.slug)));
      for (const film of films) {
        const recreated = restored.find((f) => f.localId === film.localId)!;
        expect(recreated.id).not.toBe(film.id);
        expect({ ...recreated, id: film.id }).toEqual(film);
      }
      expect(await exportMarks(tx)).toEqual(file);
      const again = await loadRestorePlan(tx, file);
      expect(again.creates).toEqual([]);
      expect(again.writes).toEqual([]);
      expect(await applyRestore(tx, again)).toBe(0);
    });
  });

  it("refuses identity and slug conflicts without creating any otherwise valid film", async () => {
    await rolledBack(async (tx) => {
      const films = await fixtures(tx);
      const conflicts: MarkEntry[] = [
        { imdb: "tt88000001", localId: films[1].localId!, watched: true, want: false },
        { ...absent, movie: { ...absentMovie, slug: films[2].slug } },
      ];
      for (const conflict of conflicts) {
        const plan = await loadRestorePlan(tx, conflict.movie ? [conflict] : [absent, conflict]);
        expect(plan.problems).toHaveLength(1);
        const before = await markRows(tx);
        await expect(applyRestore(tx, plan)).rejects.toThrow(/nothing was written/);
        expect(await markRows(tx)).toEqual(before);
        expect(await tx.select().from(movies).where(eq(movies.localId, absentMovie.localId))).toEqual([]);
      }
    });
  });

  it("recreates a film with no marks or notes without inventing a mark row", async () => {
    await rolledBack(async (tx) => {
      const entry = { ...absent, want: false, platform: null };
      const plan = await loadRestorePlan(tx, [entry]);
      expect(plan.creates).toHaveLength(1);
      expect(plan.writes).toEqual([]);
      expect(await applyRestore(tx, plan)).toBe(0);
      const [film] = await tx.select().from(movies).where(eq(movies.localId, absentMovie.localId));
      expect(film.slug).toBe(absentMovie.slug);
      expect(await tx.select().from(marks).where(eq(marks.movieId, film.id))).toEqual([]);
      const again = await loadRestorePlan(tx, [entry]);
      expect(again.creates).toEqual([]);
      expect(await applyRestore(tx, again)).toBe(0);
    });
  });

  it("refuses a film that appeared after planning, without overwriting its mark", async () => {
    await rolledBack(async (tx) => {
      const plan = await loadRestorePlan(tx, [absent]);
      const [film] = await tx.insert(movies).values({ ...absentMovie }).returning();
      await tx.insert(marks).values({ movieId: film.id, watched: true });
      const before = await markRows(tx);
      await expect(applyRestore(tx, plan)).rejects.toThrow(/Films changed.*Nothing was written/);
      expect(await markRows(tx)).toEqual(before);
    });
  });

  it("rolls back recreated movies and their marks if a later mark write fails", async () => {
    await rolledBack(async (tx) => {
      const films = await fixtures(tx);
      const plan = await loadRestorePlan(tx, [absent, { localId: films[0].localId!, watched: true, want: false }]);
      // Inject a database constraint failure after the valid film/mark creation, to prove
      // the entire transaction rolls back even when a later statement fails.
      plan.writes[0].to.platform = "x".repeat(41);
      const before = await markRows(tx);
      await expect(applyRestore(tx, plan)).rejects.toThrow();
      expect(await markRows(tx)).toEqual(before);
      expect(await tx.select().from(movies).where(eq(movies.localId, absentMovie.localId))).toEqual([]);
    });
  });

  it("refuses an identity claimed by another film after planning", async () => {
    await rolledBack(async (tx) => {
      const films = await fixtures(tx);
      // An old backup falls back to a known local ID while IMDb is still absent.
      const entry = { localId: films[0].localId!, imdb: "tt88000999", watched: true, want: false };
      const plan = await loadRestorePlan(tx, [entry]);
      expect(plan.problems).toEqual([]);
      await tx.update(movies).set({ imdbId: entry.imdb }).where(eq(movies.id, films[1].id));
      const before = await markRows(tx);
      await expect(applyRestore(tx, plan)).rejects.toThrow(/Films changed.*Nothing was written/);
      expect(await markRows(tx)).toEqual(before);
    });
  });

  it("rejects malformed snapshots before writing", async () => {
    await rolledBack(async (tx) => {
      const before = await markRows(tx);
      await expect(loadRestorePlan(tx, [{ ...absent, movie: { ...absentMovie, year: 32_768 } }])).rejects.toThrow();
      expect(await markRows(tx)).toEqual(before);
      expect(await tx.select().from(movies).where(eq(movies.localId, absentMovie.localId))).toEqual([]);
    });
  });

  it("keeps the production file protected, refuses shrinkage, and atomically replaces a test file", async () => {
    const folder = mkdtempSync(join(tmpdir(), "oscar-marks-backup-"));
    const file = join(folder, "marks.json");
    try {
      await rolledBack(async (tx) => {
        await fixtures(tx);
        await expect(exportMarksToFile(tx, { target: "test", file: "./data/marks.json", allowShrink: true })).rejects.toThrow(/production backup/);
        await exportMarksToFile(tx, { target: "test", file, allowShrink: false });
        const entries = readMarksFile(file);
        expect(entries).toEqual(await exportMarks(tx));
        expect(existsSync(`${file}.tmp`)).toBe(false);
        const larger = serializeMarks([...entries, { imdb: "tt88000999", watched: true, want: false }]);
        writeFileSync(file, larger);
        await expect(exportMarksToFile(tx, { target: "test", file, allowShrink: false })).rejects.toThrow(/file was kept/);
        expect(readFileSync(file, "utf8")).toBe(larger);
        expect(existsSync(`${file}.tmp`)).toBe(false);
        await exportMarksToFile(tx, { target: "test", file, allowShrink: true });
        expect(readMarksFile(file)).toEqual(entries);
      });
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
