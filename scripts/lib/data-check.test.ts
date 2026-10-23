import { describe, expect, it } from "vitest";
import type { EditionFile, MoviesFile } from "../../src/lib/data-files";
import { checkData, oscarNomineeRange, readDataSet, type DataSet } from "./data-check";

const AWARDS: DataSet["awards"] = [
  {
    slug: "oscars",
    name: "Academy Awards",
    shortName: "Oscars",
    kind: "oscars",
    calendarOrder: 100,
    winnersOnly: false,
    isSelection: false,
    categories: [
      { slug: "picture", name: "Best Picture", oscarCategory: "picture", sortOrder: 1 },
      { slug: "international", name: "Best International Feature Film", oscarCategory: "international", sortOrder: 2 },
    ],
  },
];

const ids = (n: number, from = 1) => Array.from({ length: n }, (_, i) => `tt${from + i}`);

function moviesFor(keys: string[]): MoviesFile {
  return Object.fromEntries(keys.map((k) => [k, { slug: `film-${k}`, title: `Film ${k}`, countries: ["US"] }]));
}

/** A finished 2024 Oscars edition: 10 Picture and 5 International nominees, one winner each. */
function finished(): EditionFile {
  return {
    award: "oscars",
    year: 2024,
    status: "loaded",
    shortlistOn: "2024-12-17",
    nominationsOn: "2025-01-23",
    winnersOn: "2025-03-02",
    sourceUrls: [],
    results: [
      ...ids(10).map((imdb, i) => ({ category: "picture", imdb, title: imdb, outcome: i === 0 ? ("won" as const) : ("nominated" as const) })),
      ...ids(5, 20).map((imdb, i) => ({
        category: "international",
        imdb,
        title: imdb,
        country: "BR",
        outcome: i === 0 ? ("won" as const) : ("nominated" as const),
      })),
    ],
    screenings: [],
  };
}

function dataSet(edition: EditionFile, movies: MoviesFile = moviesFor([...ids(10), ...ids(5, 20)])): DataSet {
  return {
    awards: AWARDS,
    movies: [{ path: "movies/2024.json", year: 2024, file: movies }],
    editions: [{ path: "editions/oscars/2024.json", edition }],
    marks: null,
  };
}

const errorsOf = (data: DataSet, today = "2026-10-22") => checkData(data, { today }).errors;

describe("checkData", () => {
  it("passes a complete finished edition, and the repo's data", () => {
    expect(errorsOf(dataSet(finished()))).toEqual([]);
    const repo = readDataSet("data");
    expect(repo.errors).toEqual([]);
    expect(errorsOf(repo.data)).toEqual([]);
  });

  it("counts Picture nominees by year: 8–10 until 2020, 10 from 2021", () => {
    expect(oscarNomineeRange("picture", 2019)).toEqual([8, 10]);
    expect(oscarNomineeRange("picture", 2021)).toEqual([10, 10]);
    expect(oscarNomineeRange("animated", 2021)).toEqual([5, 5]);
    const nine = finished();
    nine.results = nine.results.filter((r) => r.imdb !== "tt10");
    expect(errorsOf(dataSet(nine))).toEqual(["editions/oscars/2024.json: picture has 9 nominees, expected 10"]);
  });

  it("wants one winner once the ceremony is over, and doesn't count before the nominations", () => {
    const noWinner = finished();
    noWinner.results = noWinner.results.map((r) => (r.category === "picture" ? { ...r, outcome: "nominated" } : r));
    expect(errorsOf(dataSet(noWinner))).toEqual([
      "editions/oscars/2024.json: picture has 0 winners, expected 1 (the ceremony was 2025-03-02)",
    ]);
    // On the eve of the ceremony nobody has won yet, and that's fine.
    expect(errorsOf(dataSet(noWinner), "2025-03-01")).toEqual([]);
    const shortlistOnly = { ...finished(), results: finished().results.map((r) => ({ ...r, outcome: "shortlisted" as const })) };
    expect(errorsOf(dataSet(shortlistOnly), "2025-01-01")).toEqual([]);
  });

  it("lists unresolved films and films missing from the movie files", () => {
    const e = finished();
    e.results.push({ category: "picture", title: "Mystery", outcome: "submitted", unresolved: true });
    e.results.push({ category: "picture", imdb: "tt500", title: "Nowhere", outcome: "submitted" });
    expect(errorsOf(dataSet(e))).toEqual([
      "editions/oscars/2024.json: Mystery (picture): unresolved; find its IMDb ID or QID, or leave it out and record it",
      "editions/oscars/2024.json: Nowhere (picture): tt500 is in no movie file",
    ]);
  });

  it("refuses screenings outside a festival, and sections that share or change their place", () => {
    const e = {
      ...finished(),
      screenings: [
        { imdb: "tt1", title: "A", section: "In Competition", sectionOrder: 1 },
        { imdb: "tt2", title: "B", section: "In Competition", sectionOrder: 2 },
        { imdb: "tt3", title: "C", section: "Un Certain Regard", sectionOrder: 1 },
        { imdb: "tt4", title: "D", section: "Out of Competition" },
      ],
    };
    const errors = errorsOf(dataSet(e));
    expect(errors).toContain("editions/oscars/2024.json: screenings on oscars oscars; lineups are for festivals");
    expect(errors).toContain("editions/oscars/2024.json: In Competition has sectionOrder 1 and 2");
    expect(errors).toContain("editions/oscars/2024.json: In Competition and Un Certain Regard share sectionOrder 1");
    expect(errors).toContain("editions/oscars/2024.json: D (Out of Competition): no sectionOrder");
  });

  it("finds a film by its QID, and refuses one listed twice in a category", () => {
    const e = finished();
    const movies = moviesFor([...ids(10), ...ids(5, 20)]);
    movies.tt1.wd = "Q1";
    e.results.push({ category: "picture", wd: "Q1", title: "tt1 again", outcome: "nominated" });
    expect(errorsOf(dataSet(e, movies))).toContain("editions/oscars/2024.json: tt1 again (picture): listed twice in this category");
  });

  it("checks the submitting country, dates, statuses, paths and categories", () => {
    const e = finished();
    e.results[10] = { ...e.results[10], country: undefined };
    e.results[0] = { ...e.results[0], country: "US" };
    delete e.shortlistOn;
    const data = dataSet(e);
    data.editions.push({ path: "editions/oscars/2023.json", edition: { ...finished(), year: 2025, status: "partial", results: [], note: undefined } });
    data.editions.push({ path: "editions/bafta/2024.json", edition: { ...finished(), award: "bafta" } });
    data.editions.push({
      path: "editions/oscars/2022.json",
      edition: { ...finished(), year: 2022, status: "no_data", results: [{ category: "song", imdb: "tt1", title: "x", outcome: "won" }] },
    });
    expect(errorsOf(data)).toEqual([
      "editions/oscars/2024.json: loaded but has no shortlistOn date",
      "editions/oscars/2024.json: tt1 (picture): country is only for International results",
      "editions/oscars/2024.json: tt20 (international): an International result needs its submitting country",
      "editions/oscars/2023.json: should be at editions/oscars/2025.json (award oscars, year 2025)",
      "editions/oscars/2023.json: a partial edition needs a note saying what is missing",
      'editions/bafta/2024.json: unknown award "bafta"',
      "editions/oscars/2022.json: status no_data but it has results",
      'editions/oscars/2022.json: x (song): oscars has no category "song"',
    ]);
  });

  it("keeps slugs unique and unchanged, and each film in one movie file", () => {
    const data = dataSet(finished());
    data.movies[0].file.tt2.slug = "film-tt1";
    data.movies.push({ path: "movies/2023.json", year: 2023, file: { tt3: { slug: "film-tt3", title: "Again", countries: [] } } });
    const { errors, warnings } = checkData(data, { today: "2026-10-22", previousSlugs: new Map([["tt4", "old-slug"]]) });
    expect(errors).toEqual([
      'movies/2024.json: slug "film-tt1" is used by tt1 and tt2',
      "movies/2024.json: tt4's slug changed from \"old-slug\" to \"film-tt4\" (slugs never change)",
      "movies/2023.json: tt3 is listed in more than one movie file",
    ]);
    expect(warnings).toEqual(["movies/2023.json: tt3 (Again) has no country"]);
  });

  it("warns about marks for films that aren't in the data", () => {
    const data = { ...dataSet(finished()), marks: [{ imdb: "tt404", title: "Lost", watched: true, want: false }] };
    expect(checkData(data, { today: "2026-10-22" }).warnings).toEqual(["marks.json: tt404 (Lost) is in no movie file"]);
  });
});
