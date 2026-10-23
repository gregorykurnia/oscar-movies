import { describe, expect, it } from "vitest";
import type { StagedFilm } from "@/data/watch-list";
import type { Outcome } from "@/lib/stage";
import { parseWatchQuery, sortWatchList, watchHref } from "./watch-list";

let nextId = 1;
function film(title: string, stage: Outcome | null, nominations: number, average: number | null, chance: number | null = null): StagedFilm {
  return {
    film: {
      id: nextId++,
      slug: title.toLowerCase(),
      title,
      originalTitle: null,
      originalLang: null,
      year: 2025,
      countries: [],
      scores: { imdb: null, rt: null, mc: null, tmdb: null, average, count: average === null ? 0 : 4 },
    },
    stage,
    pill: null,
    categories: [],
    nominations,
    chance,
    flags: [],
  };
}

const titles = (films: StagedFilm[]) => films.map((f) => f.film.title);

describe("the address", () => {
  it("reads the sort and show all, and ignores anything else", () => {
    expect(parseWatchQuery({})).toEqual({ sort: "stage", all: false });
    expect(parseWatchQuery({ sort: "nominations", all: "1" })).toEqual({ sort: "nominations", all: true });
    expect(parseWatchQuery({ sort: ["average", "stage"] })).toEqual({ sort: "average", all: false });
    expect(parseWatchQuery({ sort: "chance" })).toEqual({ sort: "chance", all: false });
    expect(parseWatchQuery({ sort: "popular", all: "yes" })).toEqual({ sort: "stage", all: false });
  });

  it("writes only what differs from the defaults", () => {
    expect(watchHref({ sort: "stage", all: false })).toBe("/watch-list");
    expect(watchHref({ sort: "average", all: false })).toBe("/watch-list?sort=average");
    expect(watchHref({ sort: "nominations", all: true })).toBe("/watch-list?sort=nominations&all=1");
  });
});

describe("sorting", () => {
  const films = [
    film("Quiet", "submitted", 0, 70),
    film("Bold", "nominated", 3, null),
    film("Alpha", "nominated", 5, 80),
    film("Zed", "won", 1, 60),
    film("Loose", null, 0, null),
    film("Short", "shortlisted", 1, 90),
  ];

  it("by stage: furthest first, then nominations, then title; no result last", () => {
    expect(titles(sortWatchList(films, "stage"))).toEqual(["Zed", "Alpha", "Bold", "Short", "Quiet", "Loose"]);
  });

  it("by nominations: most first, then stage, then title", () => {
    expect(titles(sortWatchList(films, "nominations"))).toEqual(["Alpha", "Bold", "Zed", "Short", "Quiet", "Loose"]);
  });

  it("by average: highest first, no scores last by title", () => {
    expect(titles(sortWatchList(films, "average"))).toEqual(["Short", "Alpha", "Quiet", "Zed", "Bold", "Loose"]);
  });

  it("does not change the list it is given", () => {
    const before = titles(films);
    sortWatchList(films, "average");
    expect(titles(films)).toEqual(before);
  });
});
