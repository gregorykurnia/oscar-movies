import { describe, expect, it } from "vitest";
import type { StagedFilm } from "@/data/watch-list";
import type { Outcome } from "@/lib/stage";
import { moveItem, orderToSave, parseWatchQuery, positionText, reorderWords, sortWanted, sortWatchList, watchHref } from "./watch-list";

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
      flag: null,
      scores: { imdb: null, rt: null, mc: null, tmdb: null, average, count: average === null ? 0 : 4 },
    },
    stage,
    pill: null,
    categories: [],
    nominations,
    chance,
  };
}

const titles = (films: StagedFilm[]) => films.map((f) => f.film.title);

describe("the address", () => {
  it("reads the sort and show all, and ignores anything else", () => {
    expect(parseWatchQuery({})).toEqual({ sort: "mine", all: false });
    expect(parseWatchQuery({ sort: "stage" })).toEqual({ sort: "stage", all: false });
    expect(parseWatchQuery({ sort: "nominations", all: "1" })).toEqual({ sort: "nominations", all: true });
    expect(parseWatchQuery({ sort: ["average", "stage"] })).toEqual({ sort: "average", all: false });
    expect(parseWatchQuery({ sort: "chance" })).toEqual({ sort: "chance", all: false });
    expect(parseWatchQuery({ sort: "popular", all: "yes" })).toEqual({ sort: "mine", all: false });
  });

  it("writes only what differs from the defaults", () => {
    expect(watchHref({ sort: "mine", all: false })).toBe("/watch-list");
    expect(watchHref({ sort: "stage", all: false })).toBe("/watch-list?sort=stage");
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

  it("by my order: the season follows the stage, Want to watch keeps the order it came in", () => {
    expect(titles(sortWatchList(films, "mine"))).toEqual(["Zed", "Alpha", "Bold", "Short", "Quiet", "Loose"]);
    expect(titles(sortWanted(films, "mine"))).toEqual(titles(films));
    expect(titles(sortWanted(films, "stage"))).toEqual(["Zed", "Alpha", "Bold", "Short", "Quiet", "Loose"]);
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

describe("my order", () => {
  it("moves one item and keeps the rest in order", () => {
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(moveItem([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3]);
    expect(moveItem([1, 2, 3, 4], 1, 2)).toEqual([1, 3, 2, 4]);
  });

  it("leaves the list as it was for no move or a place out of range, and never changes the original", () => {
    const list = [1, 2, 3];
    expect(moveItem(list, 1, 1)).toEqual([1, 2, 3]);
    expect(moveItem(list, -1, 1)).toEqual([1, 2, 3]);
    expect(moveItem(list, 0, 3)).toEqual([1, 2, 3]);
    expect(moveItem(list, 2, 0)).not.toBe(list);
    expect(list).toEqual([1, 2, 3]);
  });

  it("saves only the films still wanted, in the rows' order; an unknown mark counts as wanted", () => {
    const marks = new Map<number, boolean>([
      [10, true],
      [20, false],
      [30, true],
    ]);
    expect(orderToSave([30, 20, 10, 40], (id) => marks.get(id))).toEqual([30, 10, 40]);
    expect(orderToSave([], () => true)).toEqual([]);
  });

  it("words the moves for the live region from the first place as 1", () => {
    expect(positionText(0, 4)).toBe("position 1 of 4");
    expect(reorderWords.lifted("Hamnet", 0, 4)).toBe("Picked up Hamnet. Position 1 of 4.");
    expect(reorderWords.moved("Hamnet", 1, 4)).toBe("Moved Hamnet to position 2 of 4");
    expect(reorderWords.dropped("Hamnet", 3, 4)).toBe("Dropped Hamnet at position 4 of 4.");
    expect(reorderWords.cancelled("Hamnet", 0, 4)).toBe("Moving cancelled. Hamnet is back at position 1 of 4.");
  });
});
