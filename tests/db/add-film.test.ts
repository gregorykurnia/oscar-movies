// Guarded Neon test only. Most cases roll back; the cross-connection race restores every
// affected rank/mark and deletes only its own randomly identified films in finally.
import { randomUUID } from "node:crypto";
import { asc, eq, inArray, sql, TransactionRollbackError } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createScriptDb, withFilmTransaction, type FilmTransaction } from "../../src/db";
import { lockFilmWrites } from "../../src/db/write-lock";
import { marks, movies, results, predictions } from "../../src/db/schema";
import { saveFilm, type FilmDraft } from "../../src/data/add-film";
import { writeMark, writeRelease, writeWantAtTop, writeWantOrder } from "../../src/data/marks";
import { queryMovie } from "../../src/data/movie";
import { queryWantedFilms, querySeasonFilms, queryLiveChances } from "../../src/data/watch-list";
import { querySearchFilms } from "../../src/data/search";
import { applyRestore, loadRestorePlan } from "../../scripts/lib/marks";
import { LIVE_YEAR } from "../../src/lib/years";

const { db, close } = createScriptDb();
afterAll(() => close());
const manual = (extra = {}): FilmDraft => ({ input: { kind: "manual", localId: randomUUID(), title: "Test atomic film", year: 2030, ...extra } });
const catalogue = (extra = {}): FilmDraft => ({
  input: { kind: "catalogue", localId: randomUUID(), tmdbId: 99005001 },
  details: { tmdbId: 99005001, title: "Test provider film", originalTitle: "映画", year: 2030, overview: "",
    imdbId: "tt99005001", wikidataId: "Q99005001", countries: ["JP"], language: "ja", tmdbScore: 7.6, ...extra },
});
async function rolledBack(check: (tx: FilmTransaction) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await lockFilmWrites(tx);
      await normalizeRanks(tx);
      await check(tx);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
}
const allMarks = (tx: FilmTransaction) => tx.select().from(marks).orderBy(asc(marks.movieId));
async function normalizeRanks(tx: FilmTransaction) {
  await tx.execute(sql`update marks set want_rank = r.rank from (
    select movie_id, row_number() over (order by want_rank nulls last, movie_id) as rank from marks where want
  ) r where marks.movie_id = r.movie_id`);
}
async function saved(tx: FilmTransaction, draft: FilmDraft) {
  const result = await saveFilm(tx, draft);
  if (!result.ok) throw new Error(`Unexpected save failure: ${result.reason}`);
  return result;
}
async function ranks(tx: Pick<FilmTransaction, "select">) {
  const wanted = await tx.select().from(marks).where(eq(marks.want, true)).orderBy(asc(marks.wantRank));
  expect(wanted.map((m) => m.wantRank)).toEqual(wanted.map((_, i) => i + 1));
  return wanted.map((m) => m.movieId);
}

describe("atomic film saves", () => {
  it("creates an ID-free manual film with a wanted mark, stable link and honest empty awards/scores", async () => {
    await rolledBack(async (tx) => {
      const beforeResults = await tx.select({ n: sql<number>`count(*)::int` }).from(results);
      const beforePredictions = await tx.select().from(predictions);
      const season = await querySeasonFilms(tx, LIVE_YEAR);
      const chances = await queryLiveChances(tx, LIVE_YEAR);
      const result = await saved(tx, manual({ year: LIVE_YEAR }));
      const [film] = await tx.select().from(movies).where(eq(movies.id, result.film.id));
      expect(film).toMatchObject({ countries: [], language: null, imdbId: null, wikidataId: null, tmdbId: null,
        imdbRating: null, rtScore: null, mcScore: null, tmdbScore: null, scoresCheckedAt: null });
      expect(film.slug).toContain(film.localId);
      expect((await allMarks(tx)).find((m) => m.movieId === film.id)).toMatchObject({ watched: false, want: true, wantRank: 1 });
      expect((await queryWantedFilms(tx)).some((f) => f.film.id === film.id)).toBe(true);
      expect((await querySearchFilms(tx, "Test atomic")).some((f) => f.id === film.id)).toBe(true);
      expect(await queryMovie(tx, film.slug)).toMatchObject({ id: film.id, oscars: [], awards: [], screenings: [] });
      expect(await querySeasonFilms(tx, LIVE_YEAR)).toEqual(season);
      expect(await queryLiveChances(tx, LIVE_YEAR)).toEqual(chances);
      expect(await tx.select({ n: sql<number>`count(*)::int` }).from(results)).toEqual(beforeResults);
      expect(await tx.select().from(predictions)).toEqual(beforePredictions);
      await ranks(tx);
    });
  });

  it("imports trusted catalogue facts/scores with local identity and leaves other scores due", async () => {
    await rolledBack(async (tx) => {
      const result = await saved(tx, catalogue());
      expect((await tx.select().from(movies).where(eq(movies.id, result.film.id)))[0]).toMatchObject({
        slug: "test-provider-film-2030-tmdb-99005001", localId: expect.any(String), imdbId: "tt99005001",
        wikidataId: "Q99005001", tmdbId: 99005001, originalTitle: "映画", originalLang: "ja", countries: ["JP"],
        language: "ja", tmdbScore: 7.6, tmdbAt: expect.any(Date), scoresCheckedAt: null, imdbRating: null,
      });
    });
  });

  it("requires duplicate choice, reuses an explicit selection and allows a different film/remake", async () => {
    await rolledBack(async (tx) => {
      const first = await saved(tx, manual());
      const draft = manual();
      const before = await allMarks(tx);
      expect(await saveFilm(tx, draft)).toEqual({ ok: false, reason: "duplicate", matches: [first.film] });
      expect(await allMarks(tx)).toEqual(before);
      const use = { input: { ...draft.input, kind: "manual" as const, title: "Test atomic film", year: 2030,
        duplicate: { kind: "use" as const, movieId: first.film.id } } };
      expect(await saved(tx, use)).toMatchObject({ film: first.film, created: false });
      const different = await saved(tx, manual({ duplicate: { kind: "different" } }));
      expect(different.film.id).not.toBe(first.film.id);
      expect(different.film.slug).not.toBe(first.film.slug);
      expect((await saved(tx, manual({ year: 2031 }))).film.id).not.toBe(first.film.id);
      expect(await saveFilm(tx, manual({ duplicate: { kind: "use", movieId: 2147483647 } }))).toEqual({ ok: false, reason: "identity-conflict" });
    });
  });

  it("reuses retries, preserves release notes and refuses changed input with the old draft UUID", async () => {
    await rolledBack(async (tx) => {
      const draft = manual();
      const first = await saved(tx, draft);
      await writeRelease(tx, first.film.id, { releaseOn: "2030-12-12", platform: "MUBI" });
      await writeMark(tx, first.film.id, { watched: true, want: false });
      expect(await saved(tx, draft)).toMatchObject({ film: first.film, created: false });
      expect((await allMarks(tx)).find((m) => m.movieId === first.film.id)).toMatchObject({ watched: false, want: true, wantRank: 1, releaseOn: "2030-12-12", platform: "MUBI" });
      const before = await allMarks(tx);
      for (const changed of [{ title: "Edited input" }, { year: 2031 }]) {
        expect(await saveFilm(tx, manual({ ...draft.input, ...changed }))).toEqual({ ok: false, reason: "draft-changed" });
      }
      expect(await allMarks(tx)).toEqual(before);
      expect((await tx.select().from(movies).where(eq(movies.localId, draft.input.localId)))).toHaveLength(1);
    });
  });

  it("refuses a changed explicit duplicate selection on a previously saved draft", async () => {
    await rolledBack(async (tx) => {
      const draft = manual();
      await saved(tx, draft);
      const other = await saved(tx, manual({ duplicate: { kind: "different" } }));
      const before = await allMarks(tx);
      expect(await saveFilm(tx, manual({ ...draft.input, duplicate: { kind: "use", movieId: other.film.id } })))
        .toEqual({ ok: false, reason: "draft-changed" });
      expect(await allMarks(tx)).toEqual(before);
    });
  });

  it("reuses all agreeing external IDs without overwriting researched facts, slug, IDs, scores or notes", async () => {
    await rolledBack(async (tx) => {
      const [film] = await tx.insert(movies).values({ slug: "test-atomic-researched", title: "Curated title", year: 2029,
        countries: ["FR"], imdbId: "tt99005001", wikidataId: "Q99005001", imdbRating: 8.1 }).returning();
      await writeRelease(tx, film.id, { releaseOn: "2030-01-01", platform: "Netflix" });
      const draft = catalogue();
      expect(await saved(tx, draft)).toMatchObject({ film: { id: film.id, slug: film.slug }, created: false });
      expect(await saved(tx, { ...draft, input: { ...draft.input, localId: randomUUID() } })).toMatchObject({ film: { id: film.id }, created: false });
      expect((await tx.select().from(movies).where(eq(movies.id, film.id)))[0]).toEqual(film);
      expect((await allMarks(tx)).find((m) => m.movieId === film.id)).toMatchObject({ releaseOn: "2030-01-01", platform: "Netflix", want: true, watched: false });
      await ranks(tx);
    });
  });

  it("refuses IDs pointing to different rows and incompatible IDs on one row without any writes", async () => {
    await rolledBack(async (tx) => {
      await tx.insert(movies).values([
        { slug: "test-atomic-conflict-a", title: "A", year: 2030, countries: [], imdbId: "tt99005001" },
        { slug: "test-atomic-conflict-b", title: "B", year: 2030, countries: [], wikidataId: "Q99005001" },
      ]);
      const before = await allMarks(tx);
      expect(await saveFilm(tx, catalogue())).toEqual({ ok: false, reason: "identity-conflict" });
      const draft = catalogue({ wikidataId: null });
      await tx.update(movies).set({ tmdbId: 99005002 }).where(eq(movies.imdbId, "tt99005001"));
      expect(await saveFilm(tx, draft)).toEqual({ ok: false, reason: "identity-conflict" });
      expect(await allMarks(tx)).toEqual(before);
      expect(await tx.select().from(movies).where(eq(movies.tmdbId, 99005001))).toEqual([]);
    });
  });

  it("uses an entered year only when the provider has none, and allows unscored films", async () => {
    await rolledBack(async (tx) => {
      const draft = catalogue({ year: null, imdbId: null, wikidataId: null, tmdbScore: null });
      expect(await saveFilm(tx, draft)).toEqual({ ok: false, reason: "missing-year" });
      const first = await saved(tx, { ...draft, input: { ...draft.input, kind: "catalogue", tmdbId: 99005001, year: 2034 } });
      expect(first.film.year).toBe(2034);
      expect(await saveFilm(tx, { ...draft, input: { ...draft.input, kind: "catalogue", tmdbId: 99005001, year: 2035 } })).toEqual({ ok: false, reason: "draft-changed" });
      const known = catalogue({ tmdbId: 99005002, imdbId: null, wikidataId: null });
      known.input = { kind: "catalogue", localId: randomUUID(), tmdbId: 99005002, year: 2099 };
      expect((await saved(tx, known)).film.year).toBe(2030);
    });
  });

  it("rolls back the film and shifted ranks when the actual mark insert fails; retry succeeds", async () => {
    await rolledBack(async (tx) => {
      const draft = manual();
      const before = await allMarks(tx);
      // Transactional DDL and a temp function: neither survives this rolled-back test.
      await tx.execute(sql`create function pg_temp.reject_atomic_mark() returns trigger language plpgsql as $$
        begin raise exception 'injected mark failure'; end $$`);
      await tx.execute(sql`create trigger test_reject_atomic_mark before insert on marks for each row execute function pg_temp.reject_atomic_mark()`);
      await expect(saveFilm(tx, draft)).rejects.toThrow();
      expect(await tx.select().from(movies).where(eq(movies.localId, draft.input.localId))).toEqual([]);
      expect(await allMarks(tx)).toEqual(before);
      await tx.execute(sql`drop trigger test_reject_atomic_mark on marks`);
      expect((await saved(tx, draft)).created).toBe(true);
    });
  });
});

it("serializes concurrent new/retried saves, existing add, toggle, restore and reorder on the same lock", async () => {
  const identities = [randomUUID(), randomUUID(), randomUUID()];
  const before = await db.select().from(marks);
  try {
    await withFilmTransaction(normalizeRanks);
    const fixtures = await db.insert(movies).values(identities.slice(0, 2).map((localId, i) => ({
      slug: `test-atomic-race-${localId}`, title: `Atomic race ${i}`, year: 2030, countries: [], localId,
    }))).returning();
    const draft = manual({ localId: identities[2], title: "Atomic concurrent new" });
    const plan = await loadRestorePlan(db, [{ localId: identities[0], watched: true, want: false, platform: "Cinema" }]);
    const oldOrder = (await db.select().from(marks).where(eq(marks.want, true)).orderBy(asc(marks.wantRank))).map((m) => m.movieId);
    const outcomes = await Promise.allSettled([
      withFilmTransaction((tx) => saveFilm(tx, draft)),
      withFilmTransaction((tx) => saveFilm(tx, draft)),
      withFilmTransaction((tx) => writeWantAtTop(tx, fixtures[0].id)),
      withFilmTransaction((tx) => writeMark(tx, fixtures[1].id, { watched: false, want: true })),
      withFilmTransaction((tx) => writeWantOrder(tx, oldOrder)),
      applyRestore(db, plan),
    ]);
    for (const [i, outcome] of outcomes.entries()) {
      if (outcome.status === "rejected") {
        expect(i, String(outcome.reason)).toBe(5);
        expect(String(outcome.reason)).toContain("Marks changed since the plan");
      } else if (i < 2) expect(outcome.value).toMatchObject({ ok: true });
      else if (i < 4) expect(outcome.value).toBe(true);
      else if (i === 4) expect(["ok", "stale"]).toContain(outcome.value);
    }
    expect(await db.select().from(movies).where(eq(movies.localId, identities[2]))).toHaveLength(1);
    await ranks(db);
  } finally {
    await withFilmTransaction(async (tx) => {
      const films = await tx.select({ id: movies.id }).from(movies).where(inArray(movies.localId, identities));
      const ids = films.map((f) => f.id);
      if (ids.length) {
        await tx.delete(marks).where(inArray(marks.movieId, ids));
        await tx.delete(movies).where(inArray(movies.id, ids));
      }
      for (const row of before) await tx.insert(marks).values(row).onConflictDoUpdate({ target: marks.movieId, set: row });
    });
  }
}, 60_000);
