// Tasks 2.2 and 2.3's Done when: each award's winners in `data/editions/` match Wikipedia's for
// every year. `sources/major-winners.json` holds the winners as each award's own category article
// gives them ("BAFTA Award for Best Film"; saved by `majors-check.ts --write`, which compares
// them with the ceremony pages the import read), so a research run that picks the wrong film
// (or a wrong IMDb ID) fails `npm test`. The European Film Awards are the other way round (the
// import read the category articles, the check reads the ceremony pages). Cinema Eye and the AFI
// Top 10 have no second source on Wikipedia and are not in the file.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readDataSet } from "../lib/data-check";
import type { WinnersFile } from "./majors-check";

const WINNERS = JSON.parse(readFileSync("scripts/research/sources/major-winners.json", "utf8")) as WinnersFile;
/** Task 2.2's awards: a loaded edition for every year 2012–2025 and `no_data` for 2026. */
const AWARDS = ["golden-globes", "bafta", "actor-awards", "pga", "dga"];
/** Task 2.3's awards in the file. */
const AWARDS_2_3 = ["annie", "spirit-awards", "satellite", "european-film-awards"];
/** The film years a category was given in, where that is not 2012–2025. */
const YEARS: Record<string, [number, number]> = {
  "annie/indie-feature": [2015, 2025],
  "satellite/picture": [2012, 2017],
  // The category article has no 2025 row yet, so 2025 is not held here.
  "satellite/drama": [2018, 2024],
  "satellite/comedy-musical": [2018, 2024],
};

describe("major award winners in data/", () => {
  const { data, errors } = readDataSet("data");
  const editions = new Map(data.editions.map((e) => [`${e.edition.award}/${e.edition.year}`, e.edition]));

  it("reads every file", () => expect(errors).toEqual([]));
  it("lists every award these tasks import", () => expect(Object.keys(WINNERS).sort()).toEqual([...AWARDS, ...AWARDS_2_3].sort()));

  for (const [award, categories] of Object.entries(WINNERS)) {
    for (const [category, years] of Object.entries(categories)) {
      const [from, to] = YEARS[`${award}/${category}`] ?? [2012, 2025];
      it(`${award} ${category}: ${from}–${to} match Wikipedia's list`, () => {
        expect(Object.keys(years).map(Number)).toEqual(Array.from({ length: to - from + 1 }, (_, i) => from + i));
        for (const [year, ids] of Object.entries(years)) {
          const edition = editions.get(`${award}/${year}`);
          expect(edition, `no ${award} edition for ${year}`).toBeDefined();
          const won = (edition?.results ?? [])
            .filter((r) => r.category === category && r.outcome === "won")
            .map((r) => r.imdb ?? r.wd)
            .sort();
          expect(won, `${award} ${year} ${category}`).toEqual([...ids].sort());
        }
      });
    }
  }

  it("has a no_data edition for 2026 and a loaded one for every year before", () => {
    for (const award of [...AWARDS, ...AWARDS_2_3]) {
      expect(editions.get(`${award}/2026`)?.status, `${award} 2026`).toBe("no_data");
      for (let year = 2012; year <= 2025; year++) expect(editions.get(`${award}/${year}`)?.status, `${award} ${year}`).toBe("loaded");
    }
  });

  it("has an edition for every year of Cinema Eye and the AFI Top 10", () => {
    for (const award of ["cinema-eye", "afi"]) for (let year = 2012; year <= 2026; year++) expect(editions.has(`${award}/${year}`), `${award} ${year}`).toBe(true);
    // Cinema Eye: nominees and dates only from the 15th honors (2021 films); before that only the winner (2020: no list).
    for (let year = 2012; year <= 2019; year++) expect(editions.get(`cinema-eye/${year}`)?.status).toBe("partial");
    expect(editions.get("cinema-eye/2020")?.status).toBe("partial");
    for (let year = 2021; year <= 2025; year++) expect(editions.get(`cinema-eye/${year}`)?.status).toBe("loaded");
    expect(editions.get("cinema-eye/2026")?.status).toBe("no_data");
    // The AFI Top 10: ten films a year, eleven in 2014; no winners.
    for (let year = 2012; year <= 2025; year++) {
      const results = editions.get(`afi/${year}`)?.results ?? [];
      expect(results.length, `afi ${year}`).toBe(year === 2014 ? 11 : 10);
      expect(results.every((r) => r.outcome === "nominated")).toBe(true);
    }
  });
});
