// The data layer (`src/data/`, IMPLEMENTATION_PLAN.md §5.1, task 1.6) against the seeded `test`
// data: the 97th Oscars (2024 films), International submissions, 2026's open season, and the
// seeded marks (Anora watched, Conclave want to watch; `tests/fixtures/marks.json`). The
// uncached `queryX` functions are tested; the cached `getX` wrappers only add the cache.
// Tests that add rows run inside a transaction that is rolled back.
import { eq, TransactionRollbackError } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createScriptDb } from "../../src/db";
import { marks, movies } from "../../src/db/schema";
import { queryFilmCount } from "../../src/data/films";
import { queryOscarEdition, queryOscarResults, querySubmissions } from "../../src/data/oscars";
import {
  buildWatchList,
  queryMarks,
  querySeasonFilms,
  queryWantedFilms,
} from "../../src/data/watch-list";

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

async function movieBySlug(slug: string) {
  const [row] = await db.select().from(movies).where(eq(movies.slug, slug));
  return row;
}

describe("film rows", () => {
  it("counts every film", async () => {
    const [row] = await db.select({ id: movies.id }).from(movies).limit(1);
    expect(row).toBeDefined();
    expect(await queryFilmCount(db)).toBeGreaterThan(1000);
  });

  it("carry titles, countries and the stored scores and average", async () => {
    const entries = await queryOscarResults(db, 2024, "international", "won");
    const [entry] = entries;
    const stored = await movieBySlug("im-still-here");
    expect(entry.film).toEqual({
      id: stored.id,
      slug: "im-still-here",
      title: "I'm Still Here",
      originalTitle: "Ainda Estou Aqui",
      originalLang: "pt-BR",
      year: 2024,
      countries: ["BR", "FR"],
      scores: {
        imdb: stored.imdbRating,
        rt: stored.rtScore,
        mc: stored.mcScore,
        tmdb: stored.tmdbScore,
        average: stored.avgScore,
        count: stored.scoreCount,
      },
    });
  });
});

describe("Oscar editions", () => {
  it("read a finished year's dates and status", async () => {
    expect(await queryOscarEdition(db, 2024)).toEqual({
      year: 2024,
      ordinal: "97th",
      status: "loaded",
      note: null,
      shortlistOn: "2024-12-17",
      nominationsOn: "2025-01-23",
      winnersOn: "2025-03-02",
    });
  });

  it("read the open season as partial", async () => {
    expect(await queryOscarEdition(db, 2026)).toMatchObject({ year: 2026, ordinal: "99th", status: "partial" });
  });

  it("return null for a year with no edition", async () => {
    expect(await queryOscarEdition(db, 1990)).toBeNull();
  });
});

describe("Oscar results by year and category", () => {
  it("list Best Picture's nominees with the winner first", async () => {
    const picture = await queryOscarResults(db, 2024, "picture");
    expect(picture).toHaveLength(10);
    expect(picture[0]).toMatchObject({ outcome: "won", film: { slug: "anora" }, country: null, flags: ["US"] });
    expect(picture.slice(1).every((e) => e.outcome === "nominated")).toBe(true);
    const titles = picture.slice(1).map((e) => e.film.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("include the shortlist by default, furthest stage first", async () => {
    const documentary = await queryOscarResults(db, 2024, "documentary");
    expect(documentary.map((e) => e.outcome)).toEqual([
      "won",
      ...Array(4).fill("nominated"),
      ...Array(10).fill("shortlisted"),
    ]);
  });

  it("reach back to eligible films when asked", async () => {
    expect(await queryOscarResults(db, 2024, "animated")).toHaveLength(5);
    const animated = await queryOscarResults(db, 2024, "animated", "submitted");
    expect(animated).toHaveLength(30);
    expect(animated.at(-1)?.outcome).toBe("eligible");
  });

  it("put the submitting country's flag first for International", async () => {
    const international = await queryOscarResults(db, 2024, "international");
    expect(international).toHaveLength(15);
    const [winner] = international;
    expect(winner).toMatchObject({ outcome: "won", country: "BR", flags: ["BR", "FR"] });
  });

  it("are empty for a category with no results that year", async () => {
    expect(await queryOscarResults(db, 2026, "picture")).toEqual([]);
  });
});

describe("International submissions", () => {
  it("list every submission of a year with its country", async () => {
    const submissions = await querySubmissions(db, 2024);
    expect(submissions).toHaveLength(89);
    expect(submissions.every((e) => e.country !== null && e.flags[0] === e.country)).toBe(true);
    expect(submissions.map((e) => e.outcome).slice(0, 15)).toEqual([
      "won",
      ...Array(4).fill("nominated"),
      ...Array(10).fill("shortlisted"),
    ]);
    expect(new Set(submissions.slice(15).map((e) => e.outcome))).toEqual(new Set(["eligible", "submitted"]));
  });

  it("list the open season's submissions announced so far", async () => {
    const submissions = await querySubmissions(db, 2026);
    expect(submissions).toHaveLength(100);
    expect(submissions.every((e) => e.outcome === "submitted")).toBe(true);
  });
});

describe("marks and the watch list", () => {
  it("read the seeded marks", async () => {
    const anora = await movieBySlug("anora");
    const conclave = await movieBySlug("conclave");
    expect(await queryMarks(db)).toEqual(
      [
        { movieId: anora.id, watched: true, want: false },
        { movieId: conclave.id, watched: false, want: true },
      ].sort((a, b) => a.movieId - b.movieId),
    );
  });

  it("skip marks that are both off", async () => {
    await rolledBack(async (tx) => {
      const [film] = await tx
        .insert(movies)
        .values({ slug: "test-data-off", title: "Off", year: 1990, countries: ["US"], imdbId: "tt82000001" })
        .returning({ id: movies.id });
      await tx.insert(marks).values({ movieId: film.id, watched: false, want: false });
      expect((await queryMarks(tx)).some((m) => m.movieId === film.id)).toBe(false);
    });
  });

  it("list a season's films with their furthest stage and nominations", async () => {
    const season = await querySeasonFilms(db, 2024);
    // Picture 10, Documentary 15, International 89, Animated 30, less films in two categories.
    expect(season.length).toBeGreaterThan(130);
    expect(season.length).toBeLessThanOrEqual(144);
    expect(season.find((f) => f.film.slug === "anora")).toMatchObject({ stage: "won", nominations: 1, flags: ["US"] });
    expect(season.find((f) => f.film.slug === "im-still-here")).toMatchObject({
      stage: "won",
      flags: ["BR", "FR"],
    });
    // I'm Still Here was nominated for Best Picture and won International.
    expect(season.find((f) => f.film.slug === "im-still-here")?.nominations).toBe(2);
  });

  it("list the want-to-watch films, including ones with no Oscar result", async () => {
    await rolledBack(async (tx) => {
      const [film] = await tx
        .insert(movies)
        .values({ slug: "test-data-want", title: "Want", year: 1990, countries: ["FR"], imdbId: "tt82000002" })
        .returning({ id: movies.id });
      await tx.insert(marks).values({ movieId: film.id, want: true });
      const wanted = await queryWantedFilms(tx);
      expect(wanted.map((f) => f.film.slug)).toEqual(["conclave", "test-data-want"]);
      expect(wanted[0]).toMatchObject({ stage: "nominated", nominations: 1, flags: ["GB", "US"] });
      expect(wanted[1]).toMatchObject({ stage: null, nominations: 0, flags: ["FR"] });
    });
  });

  it("drop watched and wanted films from the season's section", async () => {
    const [wanted, season, allMarks] = await Promise.all([
      queryWantedFilms(db),
      querySeasonFilms(db, 2024),
      queryMarks(db),
    ]);
    const list = buildWatchList(wanted, season, allMarks);
    expect(list.want.map((f) => f.film.slug)).toEqual(["conclave"]);
    const slugs = list.unwatched.map((f) => f.film.slug);
    expect(slugs).not.toContain("anora");
    expect(slugs).not.toContain("conclave");
    expect(list.unwatched).toHaveLength(season.length - 2);
  });
});
