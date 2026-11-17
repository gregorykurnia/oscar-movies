// Linking a hand-added film to TMDB: only a clear title + year match, never a guess.
import { describe, expect, it, vi } from "vitest";
import type { CatalogueDetails, CatalogueFilm, MovieCatalogue } from "../movie-catalogue/contract";
import { findTmdbMatch, normalTitle } from "./link-film";

const film = (tmdbId: number, title: string, year: number | null, runtime: number | null = 120, imdbId: string | null = `tt${tmdbId}`) => ({
  tmdbId, title, originalTitle: title, year, overview: "", imdbId, wikidataId: null, language: "en", countries: [], tmdbScore: null, runtime,
});

function catalogue(films: CatalogueDetails[], fail: { search?: boolean; details?: number } = {}) {
  const details = vi.fn<MovieCatalogue["details"]>(async (id) => {
    const found = films.find((f) => f.tmdbId === id);
    return id === fail.details || !found ? { ok: false, error: "not-found" } : { ok: true, value: found };
  });
  const value: MovieCatalogue = {
    search: async () =>
      fail.search
        ? { ok: false, error: "unavailable" }
        : { ok: true, value: { films: films.map((f): CatalogueFilm => ({ ...f })), page: 1, nextPage: null } },
    details,
  };
  return { catalogue: value, details };
}

describe("findTmdbMatch", () => {
  it("links the one film with that title and year (Wildwood)", async () => {
    const { catalogue: c } = catalogue([film(791523, "Wildwood", 2026), film(1702928, "Wildwood", 2014), film(1722901, "Wildwood Nights", 1990)]);
    expect(await findTmdbMatch(c, "Wildwood", 2026)).toEqual({ tmdbId: 791523, imdbId: "tt791523" });
  });

  it("picks the feature over a same-named short of the same year (Artificial)", async () => {
    const { catalogue: c } = catalogue([film(1492198, "Artificial", 2026, 140), film(1586108, "Artificial", 2026, 5)]);
    expect(await findTmdbMatch(c, "Artificial", 2026)).toEqual({ tmdbId: 1492198, imdbId: "tt1492198" });
  });

  it("links nothing when two features share the title and year", async () => {
    const { catalogue: c } = catalogue([film(1, "Sisters", 2026, 95), film(2, "Sisters", 2026, 110)]);
    expect(await findTmdbMatch(c, "Sisters", 2026)).toBeNull();
  });

  it("links nothing when a film of unknown runtime might be the other one", async () => {
    const { catalogue: c } = catalogue([film(1, "Sisters", 2026, null), film(2, "Sisters", 2026, 110)]);
    expect(await findTmdbMatch(c, "Sisters", 2026)).toBeNull();
  });

  it("never links a lone short: the feature may not be on TMDB yet", async () => {
    const { catalogue: c } = catalogue([film(1586108, "Artificial", 2026, 5)]);
    expect(await findTmdbMatch(c, "Artificial", 2026)).toBeNull();
  });

  it("links a lone film whose runtime TMDB doesn't know yet, and searches by its year", async () => {
    const { catalogue: c } = catalogue([film(3, "Coming Soon", 2027, null)]);
    const search = vi.spyOn(c, "search");
    expect(await findTmdbMatch(c, "Coming Soon", 2027)).toEqual({ tmdbId: 3, imdbId: "tt3" });
    expect(search).toHaveBeenCalledWith("Coming Soon", 1, 2027);
  });

  it("links nothing for another year or a longer title", async () => {
    const { catalogue: c, details } = catalogue([film(1, "Wildwood", 2025), film(2, "Wildwood Nights", 2026)]);
    expect(await findTmdbMatch(c, "Wildwood", 2026)).toBeNull();
    expect(details).not.toHaveBeenCalled();
  });

  it("ignores case, accents and punctuation in the title", async () => {
    const { catalogue: c } = catalogue([film(5, "Amélie: Part One", 2026)]);
    expect(await findTmdbMatch(c, "amelie part one", 2026)).toEqual({ tmdbId: 5, imdbId: "tt5" });
    expect(normalTitle("Tom & Jerry!")).toBe(normalTitle("tom and jerry"));
  });

  it("links nothing when the search or a details call fails", async () => {
    expect(await findTmdbMatch(catalogue([film(1, "X", 2026)], { search: true }).catalogue, "X", 2026)).toBeNull();
    const two = [film(1, "X", 2026, 120), film(2, "X", 2026, 5)];
    expect(await findTmdbMatch(catalogue(two, { details: 2 }).catalogue, "X", 2026)).toBeNull();
  });

  it("keeps a missing IMDb ID as null (TMDB alone still gives a score)", async () => {
    const { catalogue: c } = catalogue([film(9, "New Film", 2026, 100, null)]);
    expect(await findTmdbMatch(c, "New Film", 2026)).toEqual({ tmdbId: 9, imdbId: null });
  });
});
