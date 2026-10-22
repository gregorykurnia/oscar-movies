// The toolkit end to end on saved responses (task 1.1's Done when): the 97th Academy Awards
// page as Wikipedia served it, and the Wikidata answers for its films, trimmed to the fields
// the toolkit reads (tests/fixtures/research/97th-academy-awards/). Nothing reaches the network:
// the fetcher is offline, so a request that isn't saved fails the test.
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { editionFileSchema, moviesFileSchema, type EditionFile, type ResultEntry } from "../../../src/lib/data-files";
import { checkData, readDataSet } from "../../lib/data-check";
import { createFetcher } from "./fetcher";
import { filmRef, newFilms, researched, researchFilms, unresolvedReport } from "./films";
import { nomineeList, readNomineeLists } from "./tables";
import { fetchPage } from "./wikipedia";
import { addMovies, writeEdition } from "./writer";

const FIXTURES = "tests/fixtures/research/97th-academy-awards";
const CATEGORIES = {
  picture: "Best Picture",
  international: "Best International Feature Film",
  documentary: "Best Documentary Feature Film",
  animated: "Best Animated Feature Film",
} as const;

/** What an Oscars script does with the page: one result per nominee, the winner `won`. */
async function researchOscars(dataDir: string) {
  const fetcher = createFetcher({ cacheDir: FIXTURES, offline: true });
  const page = await fetchPage(fetcher, "97th Academy Awards");
  const lists = readNomineeLists(page.html);
  const nominees = Object.entries(CATEGORIES).flatMap(([category, header]) =>
    nomineeList(lists, header).nominees.map((n) => ({ category, ...n })),
  );
  const films = await researchFilms(
    fetcher,
    nominees.map((n) => n.film ?? { article: null, text: n.line }),
  );
  const results: ResultEntry[] = nominees.map((n) => {
    const film = researched(films, n.film ?? { article: null, text: n.line });
    const country = n.category === "international" ? n.line.match(/\(([^)]+)\)/)?.[1] : undefined;
    return {
      category: n.category,
      ...filmRef(film),
      outcome: n.winner ? "won" : "nominated",
      ...(country ? { country: { Brazil: "BR", France: "FR", Latvia: "LV", Denmark: "DK", Germany: "DE" }[country] } : {}),
    };
  });
  const edition: EditionFile = {
    award: "oscars",
    year: 2024,
    ordinal: "97th",
    status: "loaded",
    shortlistOn: "2024-12-17",
    nominationsOn: "2025-01-23",
    winnersOn: "2025-03-02",
    sourceUrls: [page.url],
    results,
    screenings: [],
  };
  const movies = addMovies(dataDir, 2024, newFilms(films));
  const path = writeEdition(dataDir, edition);
  return { path, movies, films, fetcher };
}

describe("research toolkit on the saved 97th Academy Awards page", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "oscar-research-"));
    // Start from the repo's data: the awards registry and the Phase 0 sample of five films.
    cpSync("data", dataDir, { recursive: true });
  });
  afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

  it("reads every nominee of the four categories, with one winner each", async () => {
    const fetcher = createFetcher({ cacheDir: FIXTURES, offline: true });
    const lists = readNomineeLists((await fetchPage(fetcher, "97th Academy Awards")).html);
    const picture = nomineeList(lists, "Best Picture").nominees;
    expect(picture).toHaveLength(10);
    expect(picture.filter((n) => n.winner).map((n) => n.film?.article)).toEqual(["Anora"]);
    expect(picture.map((n) => n.film?.article)).toContain("I'm Still Here (2024 film)");
    for (const header of Object.values(CATEGORIES).slice(1)) {
      const list = nomineeList(lists, header).nominees;
      expect(list).toHaveLength(5);
      expect(list.filter((n) => n.winner)).toHaveLength(1);
    }
    expect(nomineeList(lists, "Best International Feature Film").nominees[0].line).toMatch(/^I'm Still Here \(Brazil\)/);
  });

  it("resolves every film to its IMDb ID through Wikidata, never by title", async () => {
    const { films, fetcher } = await researchOscars(dataDir);
    expect(unresolvedReport(films)).toEqual([]);
    const byArticle = new Map([...films.values()].map((f) => [f.link.article, f]));
    const imdb = (article: string) => {
      const f = byArticle.get(article);
      return f?.ok ? f.imdb : undefined;
    };
    expect(imdb("Anora")).toBe("tt28607951");
    // Linked as "Conclave (film)" and "I'm Still Here (2024 film)": the article, not the text.
    expect(imdb("Conclave (film)")).toBe("tt20215234");
    expect(imdb("I'm Still Here (2024 film)")).toBe("tt14961016");
    expect(imdb("Flow (2024 film)")).toBe("tt4772188");
    expect(imdb("Wicked (2024 film)")).toBe("tt1262426");
    expect(fetcher.requests).toBe(0);
  });

  it("writes an edition file and movie entries that pass the schemas and data:check", async () => {
    const { path, movies } = await researchOscars(dataDir);
    const edition = editionFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    expect(edition.results).toHaveLength(25);
    expect(edition.results.filter((r) => r.outcome === "won").map((r) => r.imdb)).toEqual([
      "tt28607951", // Anora
      "tt14961016", // I'm Still Here
      "tt30953759", // No Other Land
      "tt4772188", // Flow
    ]);
    // The five Phase 0 films were already filed; only the other 17 are new.
    expect(movies.kept).toHaveLength(5);
    expect(movies.added).toHaveLength(17);

    const { data, errors } = readDataSet(dataDir);
    expect(errors).toEqual([]);
    expect(checkData(data, { today: "2026-10-22" })).toEqual({ errors: [], warnings: [] });
  });

  it("files facts by IMDb ID, keeps the slugs already made, and gives new films fresh ones", async () => {
    await researchOscars(dataDir);
    const movies = moviesFileSchema.parse(JSON.parse(readFileSync(join(dataDir, "movies/2024.json"), "utf8")));
    expect(movies.tt28607951.slug).toBe("anora");
    expect(movies.tt14961016).toEqual({
      slug: "im-still-here",
      title: "I'm Still Here",
      originalTitle: "Ainda Estou Aqui",
      originalLang: "pt-BR",
      countries: ["BR", "FR"],
      language: "pt",
      wd: "Q124262351",
      tmdb: 1000837,
    });
    // The title in English is the film's own, not the label's spelling.
    expect(movies.tt17163970.title).toBe("Wallace & Gromit: Vengeance Most Fowl");
    expect(movies.tt17163970.originalTitle).toBeUndefined();
    expect(Object.keys(movies).slice(0, 5)).toEqual(["tt28607951", "tt8999762", "tt20215234", "tt20221436", "tt15239678"]);
  });

  it("rewrites nothing on a second run", async () => {
    const first = await researchOscars(dataDir);
    const edition = readFileSync(first.path, "utf8");
    const movies = readFileSync(join(dataDir, "movies/2024.json"), "utf8");
    const second = await researchOscars(dataDir);
    expect(second.movies.added).toEqual([]);
    expect(readFileSync(second.path, "utf8")).toBe(edition);
    expect(readFileSync(join(dataDir, "movies/2024.json"), "utf8")).toBe(movies);
  });
});
