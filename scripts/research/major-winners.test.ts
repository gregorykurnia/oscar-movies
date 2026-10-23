// Task 2.2's Done when: each award's winners in `data/editions/` match Wikipedia's for every
// year. `sources/major-winners.json` holds the winners as each award's own category article
// gives them ("BAFTA Award for Best Film"; saved by `majors-check.ts --write`, which compares
// them with the ceremony pages the import read), so a research run that picks the wrong film
// (or a wrong IMDb ID) fails `npm test`.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readDataSet } from "../lib/data-check";
import type { WinnersFile } from "./majors-check";

const WINNERS = JSON.parse(readFileSync("scripts/research/sources/major-winners.json", "utf8")) as WinnersFile;
const AWARDS = ["golden-globes", "bafta", "actor-awards", "pga", "dga"];

describe("major award winners in data/", () => {
  const { data, errors } = readDataSet("data");
  const editions = new Map(data.editions.map((e) => [`${e.edition.award}/${e.edition.year}`, e.edition]));

  it("reads every file", () => expect(errors).toEqual([]));
  it("lists every award this task imports", () => expect(Object.keys(WINNERS).sort()).toEqual([...AWARDS].sort()));

  for (const [award, categories] of Object.entries(WINNERS)) {
    for (const [category, years] of Object.entries(categories)) {
      it(`${award} ${category}: 2012–2025 match Wikipedia's list`, () => {
        expect(Object.keys(years).length).toBe(14);
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
    for (const award of AWARDS) {
      expect(editions.get(`${award}/2026`)?.status, `${award} 2026`).toBe("no_data");
      for (let year = 2012; year <= 2025; year++) expect(editions.get(`${award}/${year}`)?.status, `${award} ${year}`).toBe("loaded");
    }
  });
});
