// Task 1.3's Done when: the winners in `data/editions/oscars/` match the Academy's list
// (oscars.org/oscars/ceremonies/<year>) for every year. Typed here by hand from the Academy's
// list, so a research run that picks the wrong film (or a wrong IMDb ID) fails `npm test`.
import { describe, expect, it } from "vitest";
import { readDataSet } from "../lib/data-check";

const WINNERS: Record<number, { picture: string; documentary: string; animated: string }> = {
  // film year: IMDb IDs of Best Picture, Documentary Feature, Animated Feature
  2012: { picture: "tt1024648", documentary: "tt2125608", animated: "tt1217209" }, // Argo · Searching for Sugar Man · Brave
  2013: { picture: "tt2024544", documentary: "tt2396566", animated: "tt2294629" }, // 12 Years a Slave · 20 Feet from Stardom · Frozen
  2014: { picture: "tt2562232", documentary: "tt4044364", animated: "tt2245084" }, // Birdman · Citizenfour · Big Hero 6
  2015: { picture: "tt1895587", documentary: "tt2870648", animated: "tt2096673" }, // Spotlight · Amy · Inside Out
  2016: { picture: "tt4975722", documentary: "tt5275892", animated: "tt2948356" }, // Moonlight · O.J.: Made in America · Zootopia
  2017: { picture: "tt5580390", documentary: "tt6333060", animated: "tt2380307" }, // The Shape of Water · Icarus · Coco
  2018: { picture: "tt6966692", documentary: "tt7775622", animated: "tt4633694" }, // Green Book · Free Solo · Spider-Man: Into the Spider-Verse
  2019: { picture: "tt6751668", documentary: "tt9351980", animated: "tt1979376" }, // Parasite · American Factory · Toy Story 4
  2020: { picture: "tt9770150", documentary: "tt12888462", animated: "tt2948372" }, // Nomadland · My Octopus Teacher · Soul
  2021: { picture: "tt10366460", documentary: "tt7378922", animated: "tt2953050" }, // CODA · Summer of Soul · Encanto
  2022: { picture: "tt6710474", documentary: "tt17041964", animated: "tt1488589" }, // Everything Everywhere All at Once · Navalny · Guillermo del Toro's Pinocchio
  2023: { picture: "tt15398776", documentary: "tt24082438", animated: "tt6587046" }, // Oppenheimer · 20 Days in Mariupol · The Boy and the Heron
  2024: { picture: "tt28607951", documentary: "tt30953759", animated: "tt4772188" }, // Anora · No Other Land · Flow
  2025: { picture: "tt30144839", documentary: "tt34965515", animated: "tt14205554" }, // One Battle After Another · Mr. Nobody Against Putin · KPop Demon Hunters
};

describe("Oscar winners in data/", () => {
  const { data, errors } = readDataSet("data");
  const oscars = new Map(data.editions.filter((e) => e.edition.award === "oscars").map((e) => [e.edition.year, e.edition]));

  it("reads every file", () => expect(errors).toEqual([]));

  for (const [year, winners] of Object.entries(WINNERS)) {
    it(`match the Academy's list for ${year}`, () => {
      const edition = oscars.get(Number(year));
      expect(edition, `no Oscars edition for ${year}`).toBeDefined();
      for (const [category, imdb] of Object.entries(winners)) {
        const won = edition?.results.filter((r) => r.category === category && r.outcome === "won").map((r) => r.imdb);
        expect(won, `${year} ${category}`).toEqual([imdb]);
      }
    });
  }
});
