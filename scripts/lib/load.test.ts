// The loader's planning rules (IMPLEMENTATION_PLAN.md §3.5), without a database: what a plan
// inserts, updates and removes, what it refuses, and how it prints. The database side (dry
// run, one transaction, a second run planning nothing) is in tests/db/load.test.ts.
import { describe, expect, it } from "vitest";
import type { DataSet } from "./data-check";
import { formatLoadPlan, planLoad, planSize, selectAward, type DbState } from "./load";

function files(): DataSet {
  return {
    awards: [
      {
        slug: "gotham",
        name: "Gotham Awards",
        shortName: "Gotham",
        kind: "major",
        calendarOrder: 10,
        winnersOnly: false,
        isSelection: false,
        categories: [
          { slug: "feature", name: "Best Feature", oscarCategory: "picture", sortOrder: 1 },
          { slug: "director", name: "Best Director", oscarCategory: "picture", loose: true, mappingNote: "A director prize", sortOrder: 2 },
        ],
      },
      {
        slug: "cannes",
        name: "Cannes Film Festival",
        shortName: "Cannes",
        kind: "festival",
        calendarOrder: 1,
        winnersOnly: true,
        isSelection: false,
        categories: [{ slug: "palme", name: "Palme d'Or", oscarCategory: "picture", sortOrder: 1 }],
      },
    ],
    movies: [
      {
        path: "movies/2024.json",
        year: 2024,
        file: {
          tt0000001: { slug: "one", title: "One", countries: ["US"], wd: "Q1", tmdb: 11 },
          tt0000002: { slug: "two", title: "Two", originalTitle: "Deux", originalLang: "fr", countries: ["FR"] },
          Q3: { slug: "three", title: "Three", countries: ["JP"] },
        },
      },
    ],
    editions: [
      {
        path: "editions/gotham/2024.json",
        edition: {
          award: "gotham",
          year: 2024,
          status: "loaded",
          nominationsOn: "2024-11-01",
          winnersOn: "2024-12-02",
          sourceUrls: ["https://example.org/gotham"],
          results: [
            { category: "feature", imdb: "tt0000001", title: "One", outcome: "won" },
            { category: "feature", wd: "Q3", title: "Three", outcome: "nominated" },
          ],
          screenings: [],
        },
      },
      {
        path: "editions/cannes/2024.json",
        edition: {
          award: "cannes",
          year: 2024,
          status: "loaded",
          winnersOn: "2024-05-25",
          sourceUrls: [],
          results: [{ category: "palme", imdb: "tt0000002", title: "Two", outcome: "won" }],
          screenings: [{ imdb: "tt0000002", title: "Two", section: "Competition", prize: "Palme d'Or" }],
        },
      },
    ],
    marks: null,
  };
}

const EMPTY: DbState = { awards: [], categories: [], movies: [], editions: [], results: [], screenings: [] };

/** The database exactly as a load of `files()` leaves it. */
function loaded(): DbState {
  return {
    awards: [
      { id: 1, slug: "gotham", name: "Gotham Awards", shortName: "Gotham", kind: "major", calendarOrder: 10, winnersOnly: false, isSelection: false, url: null },
      { id: 2, slug: "cannes", name: "Cannes Film Festival", shortName: "Cannes", kind: "festival", calendarOrder: 1, winnersOnly: true, isSelection: false, url: null },
    ],
    categories: [
      { id: 10, awardId: 1, slug: "feature", name: "Best Feature", oscarCategory: "picture", loose: false, mappingNote: null, sortOrder: 1 },
      { id: 11, awardId: 1, slug: "director", name: "Best Director", oscarCategory: "picture", loose: true, mappingNote: "A director prize", sortOrder: 2 },
      { id: 12, awardId: 2, slug: "palme", name: "Palme d'Or", oscarCategory: "picture", loose: false, mappingNote: null, sortOrder: 1 },
    ],
    movies: [
      { id: 100, localId: null, slug: "one", title: "One", originalTitle: null, originalLang: null, year: 2024, countries: ["US"], language: null, imdbId: "tt0000001", wikidataId: "Q1", tmdbId: 11 },
      { id: 101, localId: null, slug: "two", title: "Two", originalTitle: "Deux", originalLang: "fr", year: 2024, countries: ["FR"], language: null, imdbId: "tt0000002", wikidataId: null, tmdbId: null },
      { id: 102, localId: null, slug: "three", title: "Three", originalTitle: null, originalLang: null, year: 2024, countries: ["JP"], language: null, imdbId: null, wikidataId: "Q3", tmdbId: null },
    ],
    editions: [
      { id: 20, awardId: 1, year: 2024, ordinal: null, status: "loaded", shortlistOn: null, nominationsOn: "2024-11-01", winnersOn: "2024-12-02", sourceUrls: ["https://example.org/gotham"], note: null },
      { id: 21, awardId: 2, year: 2024, ordinal: null, status: "loaded", shortlistOn: null, nominationsOn: null, winnersOn: "2024-05-25", sourceUrls: [], note: null },
    ],
    results: [
      { id: 30, editionId: 20, categoryId: 10, movieId: 100, outcome: "won", country: null },
      { id: 31, editionId: 20, categoryId: 10, movieId: 102, outcome: "nominated", country: null },
      { id: 32, editionId: 21, categoryId: 12, movieId: 101, outcome: "won", country: null },
    ],
    screenings: [{ id: 40, editionId: 21, movieId: 101, section: "Competition", sectionOrder: 0, prize: "Palme d'Or" }],
  };
}

describe("planLoad", () => {
  it("inserts everything into an empty database", () => {
    const plan = planLoad(files(), EMPTY);
    expect(plan.problems).toEqual([]);
    expect(plan.awards.inserts.map((a) => a.slug)).toEqual(["gotham", "cannes"]);
    expect(plan.categories.inserts.map((c) => `${c.award}/${c.slug}`)).toEqual(["gotham/feature", "gotham/director", "cannes/palme"]);
    expect(plan.movies.inserts).toContainEqual({
      key: "Q3", slug: "three", title: "Three", originalTitle: null, originalLang: null, year: 2024,
      countries: ["JP"], language: null, imdbId: null, wikidataId: "Q3", tmdbId: null,
    });
    expect(plan.results.inserts.map((r) => [r.award, r.category, r.movie, r.outcome])).toEqual([
      ["gotham", "feature", "tt0000001", "won"],
      ["gotham", "feature", "Q3", "nominated"],
      ["cannes", "palme", "tt0000002", "won"],
    ]);
    expect(plan.screenings.inserts).toHaveLength(1);
    expect(planSize(plan)).toBe(2 + 3 + 3 + 2 + 3 + 1);
  });

  it("plans nothing when the database already matches", () => {
    const plan = planLoad(files(), loaded());
    expect(plan.problems).toEqual([]);
    expect(planSize(plan)).toBe(0);
    expect(formatLoadPlan(plan, "Load plan for test")).toBe(
      "Load plan for test: nothing to write.\n  awards: 0 new, 0 changed\n  categories: 0 new, 0 changed\n  movies: 0 new, 0 changed",
    );
  });

  it("updates only the fields that changed, and removes results an edition no longer lists", () => {
    const data = files();
    data.movies[0].file.tt0000001 = { ...data.movies[0].file.tt0000001, countries: ["US", "GB"], language: "en" };
    const gotham = data.editions[0].edition;
    gotham.note = "Corrected";
    gotham.results = [{ category: "feature", imdb: "tt0000001", title: "One", outcome: "nominated" }];
    data.editions[1].edition.screenings = [];

    const plan = planLoad(data, loaded());
    expect(plan.problems).toEqual([]);
    expect(plan.movies.updates).toEqual([
      {
        id: 100,
        label: "movie tt0000001 (One)",
        set: { countries: ["US", "GB"], language: "en" },
        changes: [
          { field: "countries", from: ["US"], to: ["US", "GB"] },
          { field: "language", from: null, to: "en" },
        ],
      },
    ]);
    expect(plan.editions.updates.map((u) => u.set)).toEqual([{ note: "Corrected" }]);
    expect(plan.results.updates.map((u) => [u.id, u.set])).toEqual([[30, { outcome: "nominated" }]]);
    expect(plan.results.deletes).toEqual([{ id: 31, label: "result gotham 2024 feature: Three (Q3), nominated" }]);
    expect(plan.screenings.deletes.map((d) => d.id)).toEqual([40]);
    expect(plan.results.inserts).toEqual([]);

    expect(formatLoadPlan(plan, "Load plan for test").split("\n")).toEqual([
      "Load plan for test: 5 writes.",
      "  awards: 0 new, 0 changed",
      "  categories: 0 new, 0 changed",
      "  movies: 0 new, 1 changed",
      "  cannes 2024: screenings 0 new, 0 changed, 1 removed",
      "  gotham 2024: edition changed; results 0 new, 1 changed, 1 removed",
      "Changes to existing rows:",
      '  update  movie tt0000001 (One): countries ["US"] → ["US","GB"]; language null → "en"',
      '  update  edition gotham 2024: note null → "Corrected"',
      '  update  result gotham 2024 feature: One (tt0000001): outcome "won" → "nominated"',
      "  delete  result gotham 2024 feature: Three (Q3), nominated",
      "  delete  screening cannes 2024 Competition: Two (tt0000002)",
    ]);
  });

  it("finds a film filed by QID that has since got an IMDb ID, and gives it the ID", () => {
    const data = files();
    const { Q3, ...rest } = data.movies[0].file;
    data.movies[0].file = { ...rest, tt0000003: { ...Q3, wd: "Q3" } };
    data.editions[0].edition.results[1] = { category: "feature", imdb: "tt0000003", title: "Three", outcome: "nominated" };
    const plan = planLoad(data, loaded());
    expect(plan.problems).toEqual([]);
    expect(plan.movies.inserts).toEqual([]);
    expect(plan.movies.updates.map((u) => [u.id, u.set])).toEqual([[102, { imdbId: "tt0000003" }]]);
    // The result is the same film, so it stays.
    expect(plan.results.deletes).toEqual([]);
    expect(plan.results.inserts).toEqual([]);
  });

  it.each(["imdbId", "wikidataId", "tmdbId"] as const)("reuses an app-created film by %s, keeping its slug and local identity", (field) => {
    const data = files();
    const db = loaded();
    const original = db.movies[0];
    db.movies[0] = {
      ...original, localId: "71000000-0000-4000-8000-000000000001", slug: "app-one",
      imdbId: null, wikidataId: null, tmdbId: null, [field]: original[field],
    };
    const plan = planLoad(data, db);
    expect(plan.problems).toEqual([]);
    expect(plan.movies.inserts).toEqual([]);
    expect(plan.movies.updates).toHaveLength(1);
    const [update] = plan.movies.updates;
    expect(update.id).toBe(original.id);
    expect(update.set).not.toHaveProperty("slug");
    expect(update.set).not.toHaveProperty("localId");
    expect(plan.results.inserts).toEqual([]);
    expect(plan.results.deletes).toEqual([]);
    Object.assign(db.movies[0], update.set);
    expect(planSize(planLoad(data, db))).toBe(0);
  });

  it("keeps app-created IDs omitted from research and accepts reviewed metadata changes", () => {
    const data = files();
    data.movies[0].file.tt0000001 = { slug: "one", title: "One, corrected", countries: ["GB"] };
    const db = loaded();
    db.movies[0] = { ...db.movies[0], localId: "71000000-0000-4000-8000-000000000001", slug: "app-one" };
    const plan = planLoad(data, db);
    expect(plan.problems).toEqual([]);
    expect(plan.movies.updates.map((u) => u.set)).toEqual([{ title: "One, corrected", countries: ["GB"] }]);
    Object.assign(db.movies[0], plan.movies.updates[0].set);
    expect(planSize(planLoad(data, db))).toBe(0);
  });

  it.each([
    ["imdbId", "wikidataId"], ["imdbId", "tmdbId"], ["wikidataId", "tmdbId"],
  ] as const)("refuses %s and %s pointing at different rows", (first, second) => {
    const data = files();
    data.movies[0].file = { tt0000001: data.movies[0].file.tt0000001 };
    data.editions = [];
    const db = loaded();
    const ids = { imdbId: "tt0000001", wikidataId: "Q1", tmdbId: 11 };
    db.movies[0] = { ...db.movies[0], imdbId: null, wikidataId: null, tmdbId: null, [first]: ids[first] };
    db.movies[1] = { ...db.movies[1], imdbId: null, wikidataId: null, tmdbId: null, [second]: ids[second] };
    const plan = planLoad(data, db);
    expect(plan.problems).toEqual(["movie tt0000001 (One): conflicting external IDs; fix the film's IDs by hand."]);
    expect(plan.movies.inserts).toEqual([]);
    expect(plan.movies.updates).toEqual([]);
  });

  it.each(["imdbId", "wikidataId", "tmdbId"] as const)("refuses a supplied %s that disagrees with the matched row", (field) => {
    const data = files();
    const key = field === "imdbId" ? "tt0000999" : "tt0000001";
    data.movies[0].file = { [key]: {
      ...data.movies[0].file.tt0000001,
      wd: field === "wikidataId" ? "Q999" : "Q1",
      tmdb: field === "tmdbId" ? 999 : 11,
    } };
    data.editions = [];
    const plan = planLoad(data, loaded());
    expect(plan.problems).toEqual([`movie ${key} (One): conflicting external IDs; fix the film's IDs by hand.`]);
    expect(plan.movies.updates).toEqual([]);
  });

  it("never matches an ID-free manual film by title or year", () => {
    const db = loaded();
    db.movies[0] = {
      ...db.movies[0], localId: "71000000-0000-4000-8000-000000000001", slug: "app-one",
      imdbId: null, wikidataId: null, tmdbId: null,
    };
    const plan = planLoad(files(), db);
    expect(plan.problems).toEqual([]);
    expect(plan.movies.inserts.map((m) => m.key)).toEqual(["tt0000001"]);
    expect(plan.movies.updates).toEqual([]);
  });

  it("refuses a slug that would change, and an ID two films would share", () => {
    const data = files();
    data.movies[0].file.tt0000001 = { ...data.movies[0].file.tt0000001, slug: "one-renamed" };
    data.movies[0].file.tt0000002 = { ...data.movies[0].file.tt0000002, tmdb: 11 };
    const plan = planLoad(data, loaded());
    expect(plan.problems).toEqual([
      'movie tt0000001 (One): its slug would change from "one" to "one-renamed" (slugs never change).',
      "movie tt0000002 (Two): conflicting external IDs; fix the film's IDs by hand.",
    ]);
    expect(formatLoadPlan(plan, "Load plan").split("\n").slice(-3)).toEqual([
      "Can't load (2):",
      ...plan.problems.map((p) => `  ${p}`),
    ]);
  });

  it("refuses a new film whose slug a film already in the database has", () => {
    const data = files();
    data.movies[0].file.tt0000009 = { slug: "kept", title: "New", countries: ["US"] };
    const db = loaded();
    db.movies.push({ ...db.movies[0], id: 103, slug: "kept", imdbId: "tt0000008", wikidataId: null, tmdbId: null });
    expect(planLoad(data, db).problems).toEqual(['the film with id 103 and tt0000009 would share slug "kept".']);
  });

  it("leaves rows the files don't mention, including other editions' results", () => {
    const db = loaded();
    db.awards.push({ ...db.awards[0], id: 3, slug: "old" });
    db.editions.push({ ...db.editions[0], id: 22, awardId: 3 });
    db.results.push({ id: 33, editionId: 22, categoryId: 10, movieId: 100, outcome: "won", country: null });
    expect(planSize(planLoad(files(), db))).toBe(0);
  });
});

describe("selectAward (--only)", () => {
  it("keeps one award's editions and every film", () => {
    const only = selectAward(files(), "cannes");
    expect(only.awards.map((a) => a.slug)).toEqual(["cannes"]);
    expect(only.editions.map((e) => e.path)).toEqual(["editions/cannes/2024.json"]);
    expect(only.movies).toEqual(files().movies);
  });

  it("stops on an award that isn't in the files", () => {
    expect(() => selectAward(files(), "berlin")).toThrow(/no award "berlin"/);
  });
});
