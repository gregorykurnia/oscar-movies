// Task 2.4's Done when: each festival's winners in `data/editions/` match Wikipedia's for every year.
// `sources/festival-winners.json` holds what the second place on Wikipedia says (saved by
// `festivals-check.ts --write`, which compares it with the pages the import read), so a research run that
// picks the wrong film (or a wrong IMDb ID) fails `npm test`.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readDataSet } from "../lib/data-check";
import type { FestivalWinnersFile } from "./festivals-check";

const WINNERS = JSON.parse(readFileSync("scripts/research/sources/festival-winners.json", "utf8")) as FestivalWinnersFile;
const FESTIVALS = ["cannes", "venice", "berlin", "sundance", "tiff"];

describe("festival prizes in data/", () => {
  const { data, errors } = readDataSet("data");
  const editions = new Map(data.editions.map((e) => [`${e.edition.award}/${e.edition.year}`, e.edition]));

  it("reads every file", () => expect(errors).toEqual([]));

  for (const [award, categories] of Object.entries(WINNERS)) {
    for (const [category, years] of Object.entries(categories)) {
      const [slug, kind] = category.split(":");
      it(`${award} ${slug}${kind ? " runners-up" : ""}: ${Object.keys(years).length} years match Wikipedia's second source`, () => {
        for (const [year, ids] of Object.entries(years)) {
          const edition = editions.get(`${award}/${year}`);
          expect(edition, `no ${award} edition for ${year}`).toBeDefined();
          const found = (edition?.results ?? [])
            .filter((r) => r.category === slug && r.outcome === (kind ? "runner_up" : "won"))
            .map((r) => r.imdb ?? r.wd)
            .sort();
          expect(found, `${award} ${year} ${slug}`).toEqual([...ids].sort());
        }
      });
    }
  }

  it("has a loaded edition for every festival and year, except the Cannes of 2020 (not held)", () => {
    for (const award of FESTIVALS) {
      for (let year = 2012; year <= 2026; year++) {
        const status = editions.get(`${award}/${year}`)?.status;
        expect(status, `${award} ${year}`).toBe(award === "cannes" && year === 2020 ? "no_data" : "loaded");
      }
    }
  });

  it("gives Toronto's film prize a winner and two runners-up every year", () => {
    for (let year = 2012; year <= 2026; year++) {
      const rows = (editions.get(`tiff/${year}`)?.results ?? []).filter((r) => r.category === "peoples-choice");
      expect(rows.filter((r) => r.outcome === "won"), `tiff ${year}`).toHaveLength(1);
      expect(rows.filter((r) => r.outcome === "runner_up"), `tiff ${year}`).toHaveLength(2);
    }
  });

  it("gives Sundance eight winners every year, and Toronto's International prize from 2025", () => {
    for (let year = 2012; year <= 2026; year++) {
      expect((editions.get(`sundance/${year}`)?.results ?? []).filter((r) => r.outcome === "won"), `sundance ${year}`).toHaveLength(8);
      const international = (editions.get(`tiff/${year}`)?.results ?? []).filter((r) => r.category === "peoples-choice-international");
      expect(international.length > 0, `tiff ${year} international`).toBe(year >= 2025);
    }
  });
});
