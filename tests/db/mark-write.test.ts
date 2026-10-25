// The marks write (plan §5.6, task 1.7) and the Watch list writes (7.4) on the `test` branch:
// a mark sets the whole state, keeps one row per film, refuses a film that doesn't exist, and
// never stores watched and wanted together; a newly wanted film goes to the top of the order,
// an unwanted one loses its rank, a reorder is refused unless it names exactly the wanted
// films, and release notes stay through mark changes. These are the writes the marks and Watch
// list actions make (their input checks: `src/app/actions/*.test.ts`). Each test runs inside a
// transaction that is rolled back.
import { asc, eq, sql, TransactionRollbackError } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createScriptDb } from "../../src/db";
import { writeMark, writeRelease, writeWantAtTop, writeWantOrder } from "../../src/data/marks";
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

/** Three films of our own, on top of the seeded marks. */
async function addFilms(tx: Tx) {
  const rows = await tx
    .insert(movies)
    .values([
      { slug: "test-watch-list-1", title: "Watch One", year: 2025, countries: ["US"], imdbId: "tt80000111" },
      { slug: "test-watch-list-2", title: "Watch Two", year: 2025, countries: ["FR"], imdbId: "tt80000112" },
      { slug: "test-watch-list-3", title: "Watch Three", year: 2025, countries: ["JP"], imdbId: "tt80000113" },
    ])
    .returning({ id: movies.id });
  return rows.map((r) => r.id) as [number, number, number];
}

/** The wanted films, top first. */
const order = async (tx: Tx) =>
  (
    await tx
      .select({ movieId: marks.movieId })
      .from(marks)
      .where(eq(marks.want, true))
      .orderBy(sql`${marks.wantRank} asc nulls last`, asc(marks.movieId))
  ).map((r) => r.movieId);

const row = async (tx: Tx, id: number) =>
  (
    await tx
      .select({
        watched: marks.watched,
        want: marks.want,
        wantRank: marks.wantRank,
        releaseOn: marks.releaseOn,
        platform: marks.platform,
      })
      .from(marks)
      .where(eq(marks.movieId, id))
  )[0];

describe("writeMark and the order", () => {
  it("puts a newly wanted film at the top and shifts the rest down", async () => {
    await rolledBack(async (tx) => {
      const seeded = await order(tx);
      const [one, two] = await addFilms(tx);
      await writeMark(tx, one, { watched: false, want: true });
      await writeMark(tx, two, { watched: false, want: true });
      expect(await order(tx)).toEqual([two, one, ...seeded]);
      expect((await row(tx, two))?.wantRank).toBe(1);
      expect((await row(tx, one))?.wantRank).toBe(2);
    });
  });

  it("keeps a wanted film's place when it's saved wanted again", async () => {
    await rolledBack(async (tx) => {
      const seeded = await order(tx);
      const [one, two] = await addFilms(tx);
      await writeMark(tx, one, { watched: false, want: true });
      await writeMark(tx, two, { watched: false, want: true });
      await writeMark(tx, one, { watched: false, want: true });
      expect(await order(tx)).toEqual([two, one, ...seeded]);
    });
  });

  it("clears the rank when want goes off, and a film wanted again goes to the top", async () => {
    await rolledBack(async (tx) => {
      const seeded = await order(tx);
      const [one, two, three] = await addFilms(tx);
      for (const id of [one, two, three]) await writeMark(tx, id, { watched: false, want: true });
      await writeMark(tx, two, { watched: true, want: false });
      expect(await row(tx, two)).toMatchObject({ watched: true, want: false, wantRank: null });
      expect(await order(tx)).toEqual([three, one, ...seeded]);
      await writeMark(tx, two, { watched: false, want: true });
      expect(await order(tx)).toEqual([two, three, one, ...seeded]);
    });
  });

  it("keeps the release notes through mark changes", async () => {
    await rolledBack(async (tx) => {
      const [one] = await addFilms(tx);
      await writeMark(tx, one, { watched: false, want: true });
      await writeRelease(tx, one, { releaseOn: "2026-12-12", platform: "Netflix" });
      await writeMark(tx, one, { watched: false, want: false });
      expect(await row(tx, one)).toEqual({
        watched: false,
        want: false,
        wantRank: null,
        releaseOn: "2026-12-12",
        platform: "Netflix",
      });
      await writeMark(tx, one, { watched: true, want: false });
      expect(await row(tx, one)).toMatchObject({ releaseOn: "2026-12-12", platform: "Netflix" });
    });
  });
});

describe("writeWantAtTop (Add a film)", () => {
  it("wants a watched film, clears watched and puts it first", async () => {
    await rolledBack(async (tx) => {
      const seeded = await order(tx);
      const [one, two] = await addFilms(tx);
      await writeMark(tx, one, { watched: false, want: true });
      await writeMark(tx, two, { watched: true, want: false });
      expect(await writeWantAtTop(tx, two)).toBe(true);
      expect(await row(tx, two)).toMatchObject({ watched: false, want: true, wantRank: 1 });
      expect(await order(tx)).toEqual([two, one, ...seeded]);
    });
  });

  it("moves an already wanted film to the top, keeping the others' order", async () => {
    await rolledBack(async (tx) => {
      const seeded = await order(tx);
      const [one, two, three] = await addFilms(tx);
      for (const id of [one, two, three]) await writeMark(tx, id, { watched: false, want: true });
      expect(await order(tx)).toEqual([three, two, one, ...seeded]);
      await writeWantAtTop(tx, one);
      expect(await order(tx)).toEqual([one, three, two, ...seeded]);
      // Still numbered 1…n with no gap.
      const ranks = await tx.select({ r: marks.wantRank }).from(marks).where(eq(marks.want, true));
      expect(ranks.map((r) => r.r).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual(ranks.map((_, i) => i + 1));
    });
  });

  it("refuses a film that doesn't exist, writing nothing", async () => {
    await rolledBack(async (tx) => {
      const before = await order(tx);
      expect(await writeWantAtTop(tx, 2_000_000_000)).toBe(false);
      expect(await order(tx)).toEqual(before);
    });
  });
});

describe("writeWantOrder (drag to reorder)", () => {
  it("renumbers the wanted films in the order given", async () => {
    await rolledBack(async (tx) => {
      const seeded = await order(tx);
      const [one, two, three] = await addFilms(tx);
      for (const id of [one, two, three]) await writeMark(tx, id, { watched: false, want: true });
      const wanted = [...seeded, one, three, two];
      expect(await writeWantOrder(tx, wanted)).toBe("ok");
      expect(await order(tx)).toEqual(wanted);
      expect((await row(tx, two))?.wantRank).toBe(wanted.length);
    });
  });

  it("refuses a stale order, writing nothing", async () => {
    await rolledBack(async (tx) => {
      const seeded = await order(tx);
      const [one, two, three] = await addFilms(tx);
      for (const id of [one, two]) await writeMark(tx, id, { watched: false, want: true });
      const before = await order(tx);
      // A page read before Three was wanted in another tab: one film short.
      await writeMark(tx, three, { watched: false, want: true });
      const now = await order(tx);
      expect(await writeWantOrder(tx, [one, two, ...seeded])).toBe("stale");
      expect(await order(tx)).toEqual(now);
      // A page read before Two was watched: one film too many.
      await writeMark(tx, two, { watched: true, want: false });
      const after = await order(tx);
      expect(await writeWantOrder(tx, [...before, three].reverse())).toBe("stale");
      expect(await order(tx)).toEqual(after);
      // The same count, but a different film.
      expect(await writeWantOrder(tx, [two, ...after.slice(1)])).toBe("stale");
      expect(await order(tx)).toEqual(after);
    });
  });

  it("refuses a film listed twice", async () => {
    await rolledBack(async (tx) => {
      const [one] = await addFilms(tx);
      await expect(writeWantOrder(tx, [one, one])).rejects.toThrow(/twice/);
    });
  });
});

describe("writeRelease", () => {
  it("sets, changes and clears a film's date and platform, keeping its marks", async () => {
    await rolledBack(async (tx) => {
      const [one] = await addFilms(tx);
      await writeMark(tx, one, { watched: false, want: true });
      expect(await writeRelease(tx, one, { releaseOn: "2026-12-12", platform: "Netflix" })).toBe(true);
      expect(await row(tx, one)).toEqual({ watched: false, want: true, wantRank: 1, releaseOn: "2026-12-12", platform: "Netflix" });
      await writeRelease(tx, one, { releaseOn: null, platform: "Cinema XXI" });
      expect(await row(tx, one)).toMatchObject({ releaseOn: null, platform: "Cinema XXI", want: true, wantRank: 1 });
      await writeRelease(tx, one, { releaseOn: null, platform: null });
      expect(await row(tx, one)).toMatchObject({ releaseOn: null, platform: null, want: true, wantRank: 1 });
    });
  });

  it("gives a film with no marks a row with both marks off", async () => {
    await rolledBack(async (tx) => {
      const [one] = await addFilms(tx);
      expect(await writeRelease(tx, one, { releaseOn: "2026-11-03", platform: null })).toBe(true);
      expect(await row(tx, one)).toEqual({ watched: false, want: false, wantRank: null, releaseOn: "2026-11-03", platform: null });
    });
  });

  it("refuses a film that doesn't exist", async () => {
    await rolledBack(async (tx) => {
      expect(await writeRelease(tx, 2_000_000_000, { releaseOn: "2026-11-03", platform: null })).toBe(false);
    });
  });
});

describe("the marks table's checks", () => {
  it.each([
    ["a rank on a film that isn't wanted", { watched: true, want: false, wantRank: 1 }],
    ["a rank of 0", { watched: false, want: true, wantRank: 0 }],
    ["a platform over 40 characters", { watched: false, want: false, platform: "x".repeat(41) }],
    ["an empty platform", { watched: false, want: false, platform: "" }],
  ])("refuse %s", async (_, values) => {
    await expect(
      rolledBack(async (tx) => {
        const [one] = await addFilms(tx);
        await tx.insert(marks).values({ movieId: one, ...values });
      }),
    ).rejects.toThrow();
  });
});
