// Unit tests for the DOC NYC import (task 6.4): the film page reader, the year fixes, the search
// texts, the IMDb match and the edition it builds (docs/imdb-import.md §5).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { awardsFileSchema, editionFileSchema } from "../../src/lib/data-files";
import {
  AWARD,
  buildEdition,
  decodeHtml,
  festivalYears,
  matchFilm,
  readFilmPage,
  searchTexts,
  slugOf,
  SOURCES,
  sourcesSchema,
  splitNames,
} from "./docnyc";
import type { ImdbCandidate } from "./lib/imdb";

const item = (label: string, value: string) => `<div class='content-item'><b>${label}:</b> ${value}<br></div>`;

describe("readFilmPage", () => {
  it("reads the director and the year from the content items", () => {
    const html = `<h1>WILD INSIDE</h1>${item("Director", "Penny Lane")}${item("Producer", "Gabriel Sedgwick,  Nickolas Hasse")}${item("Year", "2026")}`;
    expect(readFilmPage(html)).toEqual({ directors: ["Penny Lane"], year: 2026 });
  });

  it("splits several directors and decodes entities", () => {
    const html = `${item("Director", "Karim Amer, Jehane Noujaim")}${item("Year", "2019")}`;
    expect(readFilmPage(html).directors).toEqual(["Karim Amer", "Jehane Noujaim"]);
    expect(readFilmPage(item("Director", "Joshua Oppenheimer &amp; Christine Cynn")).directors).toEqual(["Joshua Oppenheimer", "Christine Cynn"]);
    expect(readFilmPage(item("Directors", "Raoul Peck and Ava DuVernay")).directors).toEqual(["Raoul Peck", "Ava DuVernay"]);
  });

  it("leaves the year out when the page has none, and takes the first of a repeated label", () => {
    expect(readFilmPage(item("Director", "Ab Cd"))).toEqual({ directors: ["Ab Cd"] });
    expect(readFilmPage(`${item("Director", "First One")}${item("Director", "Second One")}`).directors).toEqual(["First One"]);
  });

  it("returns no directors for a page without the item", () => {
    expect(readFilmPage("<p>nothing</p>")).toEqual({ directors: [] });
  });
});

describe("decodeHtml, slugOf, splitNames", () => {
  it("decodes numeric and named entities and tidies spaces", () => {
    expect(decodeHtml("HUMAN FLOW&#8217;S  &amp; MORE")).toBe("HUMAN FLOW’S & MORE");
    expect(decodeHtml("A &#x2013; B")).toBe("A – B");
    expect(decodeHtml("&unknown; stays")).toBe("&unknown; stays");
  });

  it("takes the slug of a film link", () => {
    expect(slugOf("https://www.docnyc.net/film/wild-inside/")).toBe("wild-inside");
    expect(slugOf("https://www.docnyc.net/film/the-great-hack-2")).toBe("the-great-hack-2");
  });

  it("splits credit lines", () => {
    expect(splitNames("A One / B Two")).toEqual(["A One", "B Two"]);
    expect(splitNames("")).toEqual([]);
  });
});

describe("festivalYears", () => {
  const fixes = {
    "mr-nobody-against-putin": { year: 2025, why: "tagged twice" },
    "the-great-hack": { year: 2019, why: "no tag" },
  };
  const film = (slug: string, years: number[]) => ({ link: `https://www.docnyc.net/film/${slug}/`, "event-year": years });

  it("maps the event-year tags to festival years", () => {
    expect(festivalYears(film("a", [1441]), fixes)).toEqual([2024]);
    expect(festivalYears(film("b", [1483, 1441]), fixes)).toEqual([2024, 2025]);
  });

  it("ignores tags for years the app doesn't cover (685 is 2011)", () => {
    expect(festivalYears(film("c", [685]), fixes)).toEqual([]);
    expect(festivalYears(film("d", [685, 696]), fixes)).toEqual([2012]);
  });

  it("applies a year fix over the tags, including a missing tag", () => {
    expect(festivalYears(film("mr-nobody-against-putin", [1441, 1483]), fixes)).toEqual([2025]);
    expect(festivalYears(film("the-great-hack", []), fixes)).toEqual([2019]);
  });
});

describe("searchTexts", () => {
  it("tries the whole title, what comes before a colon or dash, then the title with the year", () => {
    expect(searchTexts("MY UNDESIRABLE FRIENDS: PART I &#8211; LAST AIR IN MOSCOW", 2025)).toEqual([
      "MY UNDESIRABLE FRIENDS: PART I – LAST AIR IN MOSCOW",
      "MY UNDESIRABLE FRIENDS",
      "MY UNDESIRABLE FRIENDS: PART I – LAST AIR IN MOSCOW 2025",
    ]);
    expect(searchTexts("SEEDS", 2025)).toEqual(["SEEDS", "SEEDS 2025"]);
  });
});

describe("matchFilm", () => {
  const hit = (id: string, year: number, directors: string[], type = "movie"): ImdbCandidate => ({ id, title: "T", year, type, directors });
  const film = { title: "SEEDS", slug: "seeds", year: 2025, directors: ["Brittany Shyne"] };

  it("takes the one feature within two years that shares a director", async () => {
    const search = async () => [hit("tt1", 1999, ["Brittany Shyne"]), hit("tt2", 2025, ["Brittany Shyne"]), hit("tt3", 2025, ["Someone Else"])];
    expect(await matchFilm(search, film, { ids: {} })).toEqual({ ok: true, imdb: "tt2" });
  });

  it("falls back to the shorter search text", async () => {
    const texts: string[] = [];
    const search = async (text: string) => {
      texts.push(text);
      return text === "SEEDS" ? [hit("tt2", 2025, ["Brittany Shyne"])] : [];
    };
    expect(await matchFilm(search, { ...film, title: "SEEDS: A STORY" }, { ids: {} })).toEqual({ ok: true, imdb: "tt2" });
    expect(texts).toEqual(["SEEDS: A STORY", "SEEDS"]);
    expect(texts).not.toContain("SEEDS: A STORY 2025");
  });

  it("uses a hand-matched ID without searching, and says why a film isn't found", async () => {
    const never = async () => {
      throw new Error("searched");
    };
    expect(await matchFilm(never, film, { ids: { "2025 seeds": { imdb: "tt9", why: "by hand" } } })).toEqual({ ok: true, imdb: "tt9" });
    const none = await matchFilm(async () => [hit("tt1", 1999, ["Brittany Shyne"])], film, { ids: {} });
    expect(none).toEqual({ ok: false, reason: "no IMDb title within two years shares a director" });
  });
});

describe("buildEdition", () => {
  const input = {
    year: 2025,
    lists: [
      { category: "short-list", films: [{ imdb: "tt2", title: "b film" }, { imdb: "tt1", title: "A film" }] },
      { category: "winners-circle", films: [{ imdb: "tt1", title: "A film" }] },
    ],
    announced: "2025-10-14",
    leftOut: [],
    sourceUrls: ["https://www.docnyc.net/festival-section/short-list/"],
  };

  it("lists every film as nominated, in title order, and is loaded with a dated post", () => {
    const e = buildEdition(input);
    expect(e.status).toBe("loaded");
    expect(e.nominationsOn).toBe("2025-10-14");
    expect(e.results.map((r) => `${r.category}:${r.imdb}:${r.outcome}`)).toEqual(["short-list:tt1:nominated", "short-list:tt2:nominated", "winners-circle:tt1:nominated"]);
    expect(e.note).not.toMatch(/no dated post/);
    expect(editionFileSchema.safeParse(e).success).toBe(true);
  });

  it("lists a film once per category and says when the site has no dated post", () => {
    const e = buildEdition({ ...input, announced: undefined, lists: [{ category: "short-list", films: [{ imdb: "tt1", title: "A" }, { imdb: "tt1", title: "A" }] }] });
    expect(e.results).toHaveLength(1);
    expect(e.nominationsOn).toBeUndefined();
    expect(e.note).toMatch(/no dated post/);
  });

  it("is partial and names what was left out and why", () => {
    const e = buildEdition({ ...input, leftOut: [{ title: "Lost", reason: "no IMDb page" }] });
    expect(e.status).toBe("partial");
    expect(e.note).toContain('Left out: "Lost" (no IMDb page).');
  });
});

describe("sources and registry", () => {
  const sources = sourcesSchema.parse(JSON.parse(readFileSync(SOURCES, "utf8")));
  const registry = awardsFileSchema.parse(JSON.parse(readFileSync("data/awards.json", "utf8")));

  it("fixes the two films the site tags wrongly", () => {
    expect(Object.keys(sources.years).sort()).toEqual(["mr-nobody-against-putin", "the-great-hack"]);
  });

  it("names categories the registry has", () => {
    const doc = registry.find((a) => a.slug === AWARD)!;
    expect(doc.categories.map((c) => c.slug)).toEqual(["short-list", "winners-circle"]);
    expect(doc.isSelection).toBe(true);
  });
});
