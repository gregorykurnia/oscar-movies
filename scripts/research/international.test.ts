// Task 1.4: the International Feature rules on small inputs, and its Done when on the files in
// `data/`: each year's submission count is the one Wikipedia's list states, and the winners
// match the Academy's list. Nothing here reaches the network.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readDataSet } from "../lib/data-check";
import { ceremony, outcomeOf, shortlistSize, statedCount } from "./international";
import { countryCode } from "./lib/countries";
import { choose, splitNames, type Candidate, type FilmQuery } from "./lib/wikidata-search";

describe("submission list rules", () => {
  it("reads the Result column", () => {
    expect(outcomeOf("Won Academy Award")).toBe("won");
    expect(outcomeOf("Nominated")).toBe("nominated");
    expect(outcomeOf("Made shortlist")).toBe("shortlisted");
    expect(outcomeOf("Not nominated")).toBe("eligible");
    for (const r of ["Withdrawn", "Disqualified", "Not on the final list", "TBD"]) expect(outcomeOf(r)).toBe("submitted");
    expect(() => outcomeOf("Pending")).toThrow(/Unknown result/);
  });

  it("names the ceremony and the shortlist size of each year", () => {
    expect([2012, 2019, 2020, 2021, 2026].map(ceremony)).toEqual(["85th", "92nd", "93rd", "94th", "99th"]);
    expect([2012, 2018, 2019, 2020, 2025].map(shortlistSize)).toEqual([9, 9, 10, 15, 15]);
  });

  it("reads the count the page states", () => {
    expect(statedCount("<p>89 countries submitted films, and 85 were eligible.<sup class='reference'>[1]</sup></p>")).toBe(89);
    expect(statedCount("<p>A record 101 countries submitted films, alongside four.</p>")).toBe(101);
    expect(statedCount("<p>Nothing here.</p>")).toBeNull();
  });

  it("knows every submitting country by name and refuses a new one", () => {
    expect(countryCode("South Korea")).toBe("KR");
    expect(countryCode("Macedonia")).toBe(countryCode("North Macedonia"));
    expect(() => countryCode("Atlantis")).toThrow(/Unknown submitting country/);
  });
});

const film = (id: string, year: number, extra: Partial<Candidate> = {}): Candidate => ({
  id,
  isFilm: true,
  years: [year],
  directors: [],
  countries: [],
  titles: [],
  ...extra,
});
const query: FilmQuery = { title: "Castillo", year: 2024, country: "MT", directors: ["Abigail Mallia and Someone Else"] };

describe("choosing a Wikidata film", () => {
  it("splits director names", () => {
    expect(splitNames("Veronika Franz and Severin Fiala")).toEqual(["Veronika Franz", "Severin Fiala"]);
    expect(splitNames("A, B & C")).toEqual(["A", "B", "C"]);
  });

  it("takes a film that agrees on the director", () => {
    expect(choose(query, [film("Q1", 2024, { directors: ["Abigail Mallia"] })])).toMatchObject({ ok: true, id: "Q1" });
  });

  it("takes a film that agrees on both country and title, but not on country alone", () => {
    expect(choose(query, [film("Q1", 2025, { countries: ["MT"], titles: ["Castillo"] })])).toMatchObject({ ok: true, id: "Q1" });
    expect(choose(query, [film("Q1", 2024, { countries: ["MT"], titles: ["Another Film"] })])).toMatchObject({ ok: false });
  });

  it("refuses a wrong year, a non-film and an ambiguous pair", () => {
    expect(choose(query, [film("Q1", 2019, { directors: ["Abigail Mallia"] })])).toMatchObject({ ok: false });
    expect(choose(query, [film("Q2", 2024, { isFilm: false, directors: ["Abigail Mallia"] })])).toMatchObject({ ok: false });
    const twin = [film("Q1", 2024, { directors: ["Abigail Mallia"] }), film("Q3", 2024, { directors: ["Abigail Mallia"] })];
    expect(choose(query, twin)).toMatchObject({ ok: false, reason: expect.stringContaining("several") });
  });

  it("prefers the candidate that matches director and title", () => {
    const both = film("Q1", 2024, { directors: ["Abigail Mallia"], titles: ["Castillo"] });
    const onlyDirector = film("Q3", 2024, { directors: ["Abigail Mallia"], titles: ["Other"] });
    expect(choose(query, [onlyDirector, both])).toMatchObject({ ok: true, id: "Q1" });
  });
});

// Task 1.4's Done when. Counts are the ones each year's list states ("89 countries submitted
// films"); films with no IMDb ID and no Wikidata item are left out and counted separately in
// `sources/international.json`.
const SUBMISSIONS: Record<number, number> = {
  2012: 73, 2013: 76, 2014: 83, 2015: 82, 2016: 89, 2017: 92, 2018: 89, 2019: 94,
  2020: 97, 2021: 93, 2022: 93, 2023: 92, 2024: 89, 2025: 92, 2026: 101,
};
// IMDb ID of each Best International Feature winner (Academy's list; film year: film).
const WINNERS: Record<number, string> = {
  2012: "tt1602620", // Amour
  2013: "tt2358891", // The Great Beauty
  2014: "tt2718492", // Ida
  2015: "tt3808342", // Son of Saul
  2016: "tt5186714", // The Salesman
  2017: "tt5639354", // A Fantastic Woman
  2018: "tt6155172", // Roma
  2019: "tt6751668", // Parasite
  2020: "tt10288566", // Another Round
  2021: "tt14039582", // Drive My Car
  2022: "tt1016150", // All Quiet on the Western Front
  2023: "tt7160372", // The Zone of Interest
  2024: "tt14961016", // I'm Still Here
  2025: "tt27714581", // Sentimental Value
};

describe("International Feature in data/", () => {
  const { data, errors } = readDataSet("data");
  const left = Object.keys(JSON.parse(readFileSync("scripts/research/sources/international.json", "utf8")).leaveOut as object);
  const oscars = new Map(data.editions.filter((e) => e.edition.award === "oscars").map((e) => [e.edition.year, e.edition]));

  it("reads every file", () => expect(errors).toEqual([]));

  for (const [year, count] of Object.entries(SUBMISSIONS)) {
    it(`has the ${count} submissions Wikipedia lists for ${year}`, () => {
      const rows = oscars.get(Number(year))?.results.filter((r) => r.category === "international") ?? [];
      const leftOut = left.filter((k) => k.startsWith(`${year} `)).length;
      expect(rows.length + leftOut).toBe(count);
      expect(new Set(rows.map((r) => r.country)).size).toBe(rows.length);
      expect(rows.every((r) => r.country && !r.unresolved)).toBe(true);
    });
  }

  for (const [year, imdb] of Object.entries(WINNERS)) {
    it(`has the Academy's winner for ${year}`, () => {
      const won = oscars.get(Number(year))?.results.filter((r) => r.category === "international" && r.outcome === "won");
      expect(won?.map((r) => r.imdb)).toEqual([imdb]);
    });
  }
});
