import { describe, expect, it } from "vitest";
import type { StagedFilm, WantedFilm } from "@/data/watch-list";
import type { Outcome } from "@/lib/stage";
import {
  moveItem,
  orderToSave,
  parseWatchQuery,
  platformOptions,
  positionText,
  releaseLine,
  releaseLineText,
  reorderWords,
  sortWanted,
  sortWatchList,
  todayInJakarta,
  watchHref,
  watchPlatforms,
  filterWanted,
  hasWatchFilters,
  clearWatchFilters,
  wantedCount,
  noWatchMatches,
} from "./watch-list";

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

describe("release sort and filters", () => {
  const today = "2026-11-11";
  const wanted = (title: string, releaseOn: string | null, platform: string | null, releaseTentative = false): WantedFilm => ({
    ...film(title, null, 0, null), wantRank: null, releaseOn, platform, releaseTentative,
  });
  const films = [
    wanted("No note", null, null), wanted("Z coming", "2026-12-12", "Netflix", true),
    wanted("Today", today, "Cinépolis"), wanted("TBD", null, "Netflix"),
    wanted("Past", "2020-01-01", null), wanted("A coming", "2026-12-12", "netflix"),
  ];
  const base = { sort: "mine", all: false } as const;

  it("reads combined addresses, canonicalizes known platforms, ignores unknowns and uses the first repeated value", () => {
    const state = parseWatchQuery({ sort: "release", all: "1", platform: ["CINEPOLIS", "Netflix"], release: ["coming", "out"] }, ["Cinépolis", "Netflix"]);
    expect(state).toEqual({ sort: "release", all: true, platform: "Cinépolis", release: "coming" });
    expect(parseWatchQuery({ sort: "bad", platform: "unknown", release: "bad" }, ["Netflix"])).toEqual(base);
    expect(parseWatchQuery({ platform: "none", release: "tbd" })).toEqual({ ...base, platform: "none", release: "tbd" });
    expect(watchHref(state)).toBe("/watch-list?sort=release&all=1&platform=Cin%C3%A9polis&release=coming");
    expect(watchHref(clearWatchFilters(state))).toBe("/watch-list?sort=release&all=1");
    expect(hasWatchFilters(state)).toBe(true);
    expect(hasWatchFilters(base)).toBe(false);
  });

  it("orders dated films earliest first, then TBD, then no note, with title ties and tentative dates included", () => {
    const before = titles(films);
    expect(titles(sortWanted(films, "release"))).toEqual(["Past", "Today", "A coming", "Z coming", "TBD", "No note"]);
    expect(titles(films)).toEqual(before);
    const season = [film("Submitted", "submitted", 0, null), film("Winner", "won", 1, null)];
    expect(titles(sortWatchList(season, "release"))).toEqual(["Winner", "Submitted"]);
  });

  it("filters by date including today in Jakarta, by platform ignoring accents/case, and combines both", () => {
    expect(titles(filterWanted(films, { ...base, release: "out" }, today))).toEqual(["Today", "Past"]);
    expect(titles(filterWanted(films, { ...base, release: "coming" }, today))).toEqual(["Z coming", "A coming"]);
    expect(titles(filterWanted(films, { ...base, release: "tbd" }, today))).toEqual(["No note", "TBD"]);
    expect(titles(filterWanted(films, { ...base, platform: "CINEPOLIS" }, today))).toEqual(["Today"]);
    expect(titles(filterWanted(films, { ...base, platform: "none" }, today))).toEqual(["No note", "Past"]);
    expect(titles(filterWanted(films, { ...base, platform: "NETFLIX", release: "coming" }, today))).toEqual(["Z coming", "A coming"]);
    expect(filterWanted(films, { ...base, platform: "Netflix", release: "out" }, today)).toEqual([]);
    expect(filterWanted(films, base, today)).toEqual(films);
  });

  it("keeps the latest spelling once and sorts platform choices A–Z", () => {
    expect(watchPlatforms(["CINÉPOLIS", "Netflix", "cinépolis", "netflix", "Apple TV+", " "])).toEqual(["Apple TV+", "CINÉPOLIS", "Netflix"]);
  });

  it("words filtered counts and the no-match explanation including missing notes", () => {
    expect(wantedCount(3, 12, true)).toBe("3 of 12 films");
    expect(wantedCount(0, 1, true)).toBe("0 of 1 film");
    expect(wantedCount(1204, 1204, false)).toBe("1,204 films");
    expect(noWatchMatches(12, { ...base, platform: "MUBI", release: "out" })).toBe("None of the 12 films you want to watch is on MUBI and out now.");
    expect(noWatchMatches(3, { ...base, platform: "none", release: "tbd" })).toContain("with no platform and still TBD");
    expect(noWatchMatches(3, { ...base, release: "coming" })).toContain("is coming.");
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

describe("releaseLine", () => {
  const today = "2026-10-25";
  const words = (releaseOn: string | null, platform: string | null) => releaseLineText(releaseLine({ releaseOn, platform }, today));

  it("reads a date still to come with its day, month and year", () => {
    expect(words("2026-12-12", "Netflix")).toBe("12 Dec 2026 · Netflix");
    expect(releaseLine({ releaseOn: "2026-12-12", platform: "Netflix" }, today).kind).toBe("coming");
  });

  it("reads a date that has passed as Out, with the year only when it isn't this year", () => {
    expect(words("2026-10-03", "Cinema XXI")).toBe("Out 3 Oct · Cinema XXI");
    expect(words("2025-11-03", "Cinema XXI")).toBe("Out 3 Nov 2025 · Cinema XXI");
    expect(releaseLine({ releaseOn: "2026-10-03", platform: null }, today).kind).toBe("out");
  });

  it("counts today as out and tomorrow as to come", () => {
    expect(words("2026-10-25", null)).toBe("Out 25 Oct");
    expect(words("2026-10-26", null)).toBe("26 Oct 2026");
  });

  it("reads no date as TBD when there is a platform", () => {
    expect(words(null, "Netflix")).toBe("TBD · Netflix");
    expect(releaseLine({ releaseOn: null, platform: "Netflix" }, today).kind).toBe("tbd");
  });

  it("reads a date with no platform as the date alone", () => {
    expect(words("2026-12-12", null)).toBe("12 Dec 2026");
    expect(words("2026-12-12", "  ")).toBe("12 Dec 2026");
  });

  it("invites a date when both are empty", () => {
    expect(words(null, null)).toBe("Add release date");
    expect(releaseLine({ releaseOn: null, platform: "" }, today).kind).toBe("empty");
  });

  it("takes today from Jakarta's calendar", () => {
    // 20:00 UTC on 24 Oct is already 25 Oct in Jakarta (UTC+7).
    expect(todayInJakarta(new Date("2026-10-24T20:00:00Z"))).toBe("2026-10-25");
    expect(todayInJakarta(new Date("2026-10-24T16:59:00Z"))).toBe("2026-10-24");
  });
});

describe("platformOptions", () => {
  it("lists the earlier platforms first, then the usual ones not already used", () => {
    const { used, suggestions } = platformOptions("", ["Cinema XXI", "Netflix"]);
    expect(used).toEqual(["Cinema XXI", "Netflix"]);
    expect(suggestions).not.toContain("Netflix");
    expect(suggestions).not.toContain("Cinema XXI");
    expect(suggestions.slice(0, 3)).toEqual(["Prime Video", "Disney+ Hotstar", "Apple TV+"]);
  });

  it("filters by the typed text, ignoring case and accents", () => {
    expect(platformOptions("c", ["Cinema XXI", "Netflix"])).toEqual({
      used: ["Cinema XXI"],
      suggestions: ["Catchplay+", "CGV", "Cinépolis"],
    });
    expect(platformOptions("CINEPO", []).suggestions).toEqual(["Cinépolis"]);
    expect(platformOptions("zzz", ["Netflix"])).toEqual({
      used: [],
      suggestions: [],
    });
  });

  it("shows an earlier platform once, whatever its case, and drops blanks", () => {
    expect(platformOptions("", ["netflix", "Netflix", "  ", "Local cinema"]).used).toEqual(["netflix", "Local cinema"]);
  });
});
