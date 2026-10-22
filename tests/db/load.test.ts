// The loader on the `test` branch (IMPLEMENTATION_PLAN.md §3.5, task 1.2): a dry run writes
// nothing, a load is one transaction (a forced error leaves no change), a second run plans
// nothing, the marks are never touched, and a production target exports the marks before
// anything else. A small data set of its own (award `test-load`, films `tt71000001`…) sits
// next to the seeded data; most tests run inside a transaction that is rolled back.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { asc, count, desc, eq, inArray, sql, TransactionRollbackError } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DataSet } from "../../scripts/lib/data-check";
import { runLoad, type LoadOptions } from "../../scripts/lib/load";
import { exportMarksToFile } from "../../scripts/lib/marks";
import { createScriptDb } from "../../src/db";
import {
  awardCategories,
  awards,
  dataLoads,
  editions,
  marks,
  movies,
  results,
  screenings,
} from "../../src/db/schema";
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

const AWARD = "test-load";
const FILMS = ["tt71000001", "tt71000002", "tt71000003"];

function testData(): DataSet {
  return {
    awards: [
      {
        slug: AWARD,
        name: "Loader Test Awards",
        shortName: "Loader",
        kind: "major",
        calendarOrder: 900,
        winnersOnly: false,
        isSelection: false,
        categories: [{ slug: "feature", name: "Best Feature", oscarCategory: "picture", sortOrder: 1 }],
      },
    ],
    movies: [
      {
        path: "movies/2024.json",
        year: 2024,
        file: {
          tt71000001: { slug: "test-load-one", title: "Load One", countries: ["US"] },
          tt71000002: { slug: "test-load-two", title: "Load Two", originalTitle: "Deux", originalLang: "fr", countries: ["FR"] },
          tt71000003: { slug: "test-load-three", title: "Load Three", countries: ["JP"], wd: "Q71000003" },
        },
      },
    ],
    editions: [
      {
        path: `editions/${AWARD}/2024.json`,
        edition: {
          award: AWARD,
          year: 2024,
          status: "loaded",
          nominationsOn: "2024-11-01",
          winnersOn: "2024-12-01",
          sourceUrls: ["https://example.org/test-load"],
          results: [
            { category: "feature", imdb: "tt71000001", title: "Load One", outcome: "won" },
            { category: "feature", imdb: "tt71000002", title: "Load Two", outcome: "nominated" },
            { category: "feature", imdb: "tt71000003", title: "Load Three", outcome: "nominated" },
          ],
          screenings: [{ imdb: "tt71000002", title: "Load Two", section: "Competition" }],
        },
      },
    ],
    marks: null,
  };
}

const quiet: Pick<LoadOptions, "log" | "today"> = { log: () => {}, today: "2026-10-22" };

/** Row counts of every table a load could touch, plus the marks themselves. */
async function snapshot(q: Pick<Tx, "select">) {
  const n = async (table: typeof movies | typeof awards | typeof awardCategories | typeof editions | typeof results | typeof screenings | typeof dataLoads) =>
    (await q.select({ n: count() }).from(table))[0].n;
  return {
    movies: await n(movies),
    awards: await n(awards),
    categories: await n(awardCategories),
    editions: await n(editions),
    results: await n(results),
    screenings: await n(screenings),
    dataLoads: await n(dataLoads),
    marks: await q.select().from(marks).orderBy(asc(marks.movieId)),
  };
}

const ourFilms = (q: Pick<Tx, "select">) =>
  q.select({ id: movies.id }).from(movies).where(inArray(movies.imdbId, FILMS));

describe("the loader", () => {
  it("writes nothing on a dry run, and lists every planned write", async () => {
    const before = await snapshot(db);
    const lines: string[] = [];
    const { plan, written } = await runLoad(db, testData(), {
      target: "test",
      dryRun: true,
      today: "2026-10-22",
      log: (l) => lines.push(l),
    });
    expect(written).toBe(false);
    expect(plan.movies.inserts.map((m) => m.key)).toEqual(FILMS);
    expect(plan.results.inserts).toHaveLength(3);
    expect(lines.join("\n")).toContain(`${AWARD} 2024: new edition; results 3 new, 0 changed, 0 removed; screenings 1 new, 0 changed, 0 removed`);
    expect(lines.at(-1)).toBe("Dry run: nothing was written.");
    expect(await snapshot(db)).toEqual(before);
  });

  it("loads the files, writes a data_loads row, leaves the marks, and a second run plans nothing", async () => {
    await rolledBack(async (tx) => {
      const before = await snapshot(tx);
      const first = await runLoad(tx, testData(), { target: "test", dryRun: false, gitCommit: "abc1234", ...quiet });
      expect(first.written).toBe(true);

      const after = await snapshot(tx);
      expect(after).toEqual({
        ...before,
        movies: before.movies + 3,
        awards: before.awards + 1,
        categories: before.categories + 1,
        editions: before.editions + 1,
        results: before.results + 3,
        screenings: before.screenings + 1,
        dataLoads: before.dataLoads + 1,
      });
      const [load] = await tx.select().from(dataLoads).orderBy(desc(dataLoads.id)).limit(1);
      expect(load).toMatchObject({
        kind: "awards",
        gitCommit: "abc1234",
        summary: { target: "test", only: null, editions: [`${AWARD}/2024`] },
      });
      const [three] = await tx.select().from(movies).where(eq(movies.imdbId, "tt71000003"));
      expect(three).toMatchObject({ slug: "test-load-three", wikidataId: "Q71000003", countries: ["JP"], year: 2024 });

      const second = await runLoad(tx, testData(), { target: "test", dryRun: false, ...quiet });
      expect(second.written).toBe(false);
      expect(second.plan.problems).toEqual([]);
      expect(await snapshot(tx)).toEqual(after);
    });
  });

  it("applies a correction: changed and removed results, a changed film, then plans nothing", async () => {
    await rolledBack(async (tx) => {
      await runLoad(tx, testData(), { target: "test", dryRun: false, ...quiet });
      // Mark a film, to prove a reload never touches marks.
      const [one] = await tx.select({ id: movies.id }).from(movies).where(eq(movies.imdbId, "tt71000001"));
      await tx.insert(marks).values({ movieId: one.id, watched: true, want: false });
      const marksBefore = (await snapshot(tx)).marks;

      const data = testData();
      const e = data.editions[0].edition;
      e.results = [
        { category: "feature", imdb: "tt71000001", title: "Load One", outcome: "nominated" },
        { category: "feature", imdb: "tt71000002", title: "Load Two", outcome: "won" },
      ];
      e.screenings = [];
      data.movies[0].file.tt71000001 = { ...data.movies[0].file.tt71000001, countries: ["US", "GB"] };

      const lines: string[] = [];
      const { plan } = await runLoad(tx, data, { ...quiet, target: "test", dryRun: false, log: (l) => lines.push(l) });
      expect(plan.results.updates).toHaveLength(2);
      expect(plan.results.deletes.map((d) => d.label)).toEqual([`result ${AWARD} 2024 feature: Load Three (tt71000003), nominated`]);
      expect(lines.join("\n")).toContain('update  movie tt71000001 (Load One): countries ["US"] → ["US","GB"]');

      const rows = await tx
        .select({ imdb: movies.imdbId, outcome: results.outcome })
        .from(results)
        .innerJoin(movies, eq(movies.id, results.movieId))
        .where(inArray(movies.imdbId, FILMS))
        .orderBy(asc(movies.imdbId));
      expect(rows).toEqual([
        { imdb: "tt71000001", outcome: "nominated" },
        { imdb: "tt71000002", outcome: "won" },
      ]);
      // The film that left the edition stays: a load never deletes a movie.
      expect(await ourFilms(tx)).toHaveLength(3);
      expect((await snapshot(tx)).marks).toEqual(marksBefore);
      expect((await runLoad(tx, data, { target: "test", dryRun: false, ...quiet })).written).toBe(false);
    });
  });

  it("is one transaction: an error after the writes leaves no change at all", async () => {
    // On the real connection (no outer transaction), so the loader's own transaction is the
    // only thing that can undo the writes.
    const before = await snapshot(db);
    try {
      await expect(
        runLoad(db, testData(), {
          target: "test",
          dryRun: false,
          ...quiet,
          afterWrites: async (tx) => {
            // Every write is in by now, visible inside the transaction.
            expect(await ourFilms(tx)).toHaveLength(3);
            throw new Error("Forced error after the writes");
          },
        }),
      ).rejects.toThrow("Forced error after the writes");
      expect(await snapshot(db)).toEqual(before);
      expect(await ourFilms(db)).toEqual([]);
      expect(await db.select().from(awards).where(eq(awards.slug, AWARD))).toEqual([]);
    } finally {
      await removeLeftovers();
    }
  });

  it("refuses data that fails the checks, and writes nothing", async () => {
    const before = await snapshot(db);
    const data = testData();
    data.editions[0].edition.results.push({ category: "feature", imdb: "tt71000009", title: "Nowhere", outcome: "nominated" });
    await expect(runLoad(db, data, { target: "test", dryRun: false, ...quiet })).rejects.toThrow(
      /fail the checks[\s\S]*tt71000009 is in no movie file/,
    );
    expect(await snapshot(db)).toEqual(before);
  });

  describe("on a production target", () => {
    const file = ".cache/test-load-marks.json";

    it("exports the marks before it reads or writes anything", async () => {
      rmSync(file, { force: true });
      await rolledBack(async (tx) => {
        const events: string[] = [];
        await runLoad(tx, testData(), {
          target: "production",
          dryRun: false,
          today: "2026-10-22",
          log: (l) => events.push(l.split("\n")[0]),
          backupMarks: async () => {
            events.push("backup");
            expect(await ourFilms(tx)).toEqual([]);
            return exportMarksToFile(tx, { target: "test", file, allowShrink: false });
          },
        });
        expect(events[0]).toBe("backup");
        expect(events[1]).toMatch(/^Exported \d+ marked films from test to \.cache\/test-load-marks\.json\.$/);
        expect(events[2]).toMatch(/^Load plan for production: \d+ writes\.$/);
        const exported = marksFileSchema.parse(JSON.parse(readFileSync(file, "utf8")));
        const marked = (await snapshot(tx)).marks.filter((m) => m.watched || m.want);
        expect(exported).toHaveLength(marked.length);
        expect(await ourFilms(tx)).toHaveLength(3);
      });
      rmSync(file, { force: true });
    });

    it("writes nothing when the export fails, or when there is no export", async () => {
      const before = await snapshot(db);
      await expect(
        runLoad(db, testData(), {
          target: "production",
          dryRun: false,
          ...quiet,
          backupMarks: () => Promise.reject(new Error("disk full")),
        }),
      ).rejects.toThrow(/The marks export failed, so nothing was loaded\.\ndisk full/);
      await expect(runLoad(db, testData(), { target: "production", dryRun: true, ...quiet })).rejects.toThrow(
        /exports the marks first/,
      );
      expect(await snapshot(db)).toEqual(before);
      expect(existsSync(file)).toBe(false);
    });
  });
});

/** Only if a failed assertion let the forced-error load through: removes the test set. */
async function removeLeftovers() {
  const ids = (await ourFilms(db)).map((m) => m.id);
  const [award] = await db.select({ id: awards.id }).from(awards).where(eq(awards.slug, AWARD));
  const ours = sql`${dataLoads.summary}->'editions' ? ${`${AWARD}/2024`}`;
  const [{ n: loads }] = await db.select({ n: count() }).from(dataLoads).where(ours);
  if (!award && ids.length === 0 && loads === 0) return;
  await db.transaction(async (tx) => {
    await tx.delete(dataLoads).where(ours);
    if (award) {
      await tx.delete(editions).where(eq(editions.awardId, award.id));
      await tx.delete(awardCategories).where(eq(awardCategories.awardId, award.id));
      await tx.delete(awards).where(eq(awards.id, award.id));
    }
    if (ids.length > 0) await tx.delete(movies).where(inArray(movies.id, ids));
  });
}
