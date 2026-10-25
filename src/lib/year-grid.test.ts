import { describe, expect, it } from "vitest";
import type { FilmRowData } from "@/data/films";
import type { AwardSummary } from "@/lib/awards";
import {
  averageLine,
  cellKind,
  cellLabel,
  criticsLabel,
  criticsWins,
  filmCountLabel,
  gridColumns,
  gridFilms,
  gridGroups,
  gridHref,
  gridTotals,
  hasNoData,
  gridCategoryName,
  parseGridQuery,
  toggleGridFilter,
  viewGrid,
  type GridColumn,
  type GridFilm,
  type GridQuery,
  type GridResultRow,
} from "./year-grid";

function film(id: number, title: string, average: number | null = null, countries = ["US"]): FilmRowData {
  return {
    id,
    slug: `film-${id}`,
    title,
    originalTitle: null,
    originalLang: null,
    year: 2025,
    countries,
    flag: countries[0] ?? null,
    scores: { imdb: null, rt: null, mc: null, tmdb: null, average, count: average === null ? 0 : 1 },
  };
}

function award(slug: string, kind: AwardSummary["kind"], calendarOrder: number, categories: AwardSummary["oscarCategories"]): AwardSummary {
  return { slug, name: `${slug} name`, shortName: slug.toUpperCase(), kind, calendarOrder, winnersOnly: false, isSelection: slug === "afi", oscarCategories: categories };
}

const AWARDS: AwardSummary[] = [
  award("cannes", "festival", 30, ["picture"]),
  award("bafta", "major", 680, ["picture", "international"]),
  award("oscars", "oscars", 1000, ["picture", "international"]),
  award("afi", "major", 600, ["picture"]),
  award("sundance", "festival", 10, ["picture"]),
  award("nyfcc", "critics", 900, ["picture"]),
  award("annie", "major", 670, ["animated"]),
];

describe("gridColumns", () => {
  it("lists the awards that give the category: Oscars, majors, festivals, critics, each in calendar order", () => {
    const columns = gridColumns(AWARDS, "picture", [
      { slug: "bafta", status: "loaded" },
      { slug: "cannes", status: "partial" },
      { slug: "afi", status: "no_data" },
    ]);
    expect(columns.map((c) => c.slug)).toEqual(["oscars", "afi", "bafta", "sundance", "cannes", "nyfcc"]);
    expect(columns.map((c) => c.status)).toEqual([null, "no_data", "loaded", null, "partial", null]);
    expect(columns.map(hasNoData)).toEqual([true, true, false, true, false, true]);
  });

  it("leaves out a critics group with no data in any year, never another kind", () => {
    const columns = gridColumns(AWARDS, "picture", [], new Set(["bafta"]));
    expect(columns.map((c) => c.slug)).toEqual(["oscars", "afi", "bafta", "sundance", "cannes"]);
    expect(gridColumns(AWARDS, "picture", [], new Set(["nyfcc"])).map((c) => c.slug)).toContain("nyfcc");
  });

  it("leaves out awards that don't give the category", () => {
    expect(gridColumns(AWARDS, "animated", []).map((c) => c.slug)).toEqual(["annie"]);
  });

  it("lists every award for all categories, in the same order", () => {
    expect(gridColumns(AWARDS, "all", []).map((c) => c.slug)).toEqual(["oscars", "afi", "annie", "bafta", "sundance", "cannes", "nyfcc"]);
  });
});

describe("gridCategoryName", () => {
  it("names the category in words, or all of them", () => {
    expect(gridCategoryName("picture")).toBe("Best Picture");
    expect(gridCategoryName("all")).toBe("All categories");
  });
});

const row = (f: FilmRowData, awardSlug: string, outcome: GridResultRow["outcome"], category = "Best Film"): GridResultRow => ({
  film: f,
  awardSlug,
  category,
  outcome,
});

describe("gridFilms", () => {
  const a = film(1, "Anora");
  const b = film(2, "The Brutalist");
  const c = film(3, "Submitted Only", null, ["BR"]);
  const d = film(4, "Shortlisted", null, ["FR", "BR"]);

  it("keeps films with a nomination, win, runner-up place or Oscar shortlist, and leaves out submitted or eligible only", () => {
    const films = gridFilms(
      [
        row(a, "bafta", "won"),
        row(b, "tiff", "runner_up"),
        row(c, "oscars", "eligible", "Best International Feature Film"),
        row(d, "oscars", "shortlisted", "Best International Feature Film"),
      ],
    );
    expect(films.map((f) => f.film.title)).toEqual(["Anora", "The Brutalist", "Shortlisted"]);
  });

  it("keeps a film's furthest result at an award with several categories (Globes' Drama and Comedy)", () => {
    const films = gridFilms(
      [row(a, "golden-globes", "nominated", "Drama"), row(a, "golden-globes", "won", "Comedy"), row(a, "golden-globes", "nominated", "Other")],
    );
    expect(films[0].cells["golden-globes"]).toEqual({ outcome: "won", category: "Comedy" });
  });

  it("keeps the first category read on a tie", () => {
    const films = gridFilms([row(a, "sundance", "won", "Jury"), row(a, "sundance", "won", "Audience")]);
    expect(films[0].cells.sundance.category).toBe("Jury");
  });
});

const gf = (f: FilmRowData, cells: GridFilm["cells"]): GridFilm => ({ film: f, cells });

describe("gridTotals and criticsWins", () => {
  const g = gf(film(1, "Anora"), {
    oscars: { outcome: "won", category: "Best Picture" },
    bafta: { outcome: "nominated", category: "Best Film" },
    tiff: { outcome: "runner_up", category: "People's Choice" },
    nyfcc: { outcome: "won", category: "Best Film" },
    "oscars-intl": { outcome: "shortlisted", category: "x" },
  });

  it("counts wins and nominations (a win and a runner-up place are nominations; a shortlist isn't)", () => {
    expect(gridTotals(g)).toEqual({ wins: 2, noms: 4 });
  });

  it("counts critics groups' wins for the folded column", () => {
    const columns = gridColumns(AWARDS, "picture", []);
    expect(criticsWins(g, columns)).toBe(1);
    expect(criticsLabel(1)).toBe("1 critics group win");
    expect(criticsLabel(9)).toBe("9 critics group wins");
  });
});

describe("cells", () => {
  it("draws each outcome as won, nominated, shortlist or submitted", () => {
    expect(["won", "nominated", "runner_up", "shortlisted", "eligible", "submitted"].map((o) => cellKind(o as never))).toEqual([
      "won",
      "nom",
      "nom",
      "short",
      "sub",
      "sub",
    ]);
  });

  it("labels each cell with the result and the award's category", () => {
    const plain = { isSelection: false };
    expect(cellLabel({ outcome: "won", category: "Palme d'Or" }, plain, "picture")).toBe("Won: Palme d'Or");
    expect(cellLabel({ outcome: "runner_up", category: "People's Choice Award" }, plain, "picture")).toBe("Runner-up: People's Choice Award");
    expect(cellLabel({ outcome: "nominated", category: "Top 10 Films of the Year" }, { isSelection: true }, "picture")).toBe(
      "Selected: Top 10 Films of the Year",
    );
    expect(cellLabel({ outcome: "eligible", category: "Best International Feature Film" }, plain, "international")).toBe(
      "Submitted: Best International Feature Film",
    );
    expect(cellLabel({ outcome: "eligible", category: "Best Animated Feature Film" }, plain, "animated")).toBe(
      "Eligible: Best Animated Feature Film",
    );
  });

  it("words the average and the count", () => {
    expect(averageLine(film(1, "A", 81.6))).toBe("82 average");
    expect(averageLine(film(1, "A", null))).toBe("No scores yet");
    expect(filmCountLabel(1)).toBe("1 film with a nomination");
    expect(filmCountLabel(1204)).toBe("1,204 films with a nomination");
  });
});

describe("the address", () => {
  it("reads the view, ignoring anything unknown", () => {
    expect(parseGridQuery({})).toEqual({ category: "picture", sort: "wins", filters: [], criticsOpen: false });
    expect(parseGridQuery({ category: "animated", sort: "title", filter: ["unwatched", "x"], critics: "open" })).toEqual({
      category: "animated",
      sort: "title",
      filters: ["unwatched"],
      criticsOpen: true,
    });
    expect(parseGridQuery({ category: "nope", sort: "nope", critics: "closed" })).toEqual(parseGridQuery({}));
  });

  it("writes the view, defaults left out, and reads back the same", () => {
    const view: GridQuery = { category: "documentary", sort: "average", filters: ["unwatched"], criticsOpen: true };
    const href = gridHref(2025, view);
    expect(href).toBe("/grid/2025?category=documentary&sort=average&filter=unwatched&critics=open");
    expect(parseGridQuery(Object.fromEntries(new URL(href, "http://x").searchParams))).toEqual(view);
    expect(gridHref(2024, parseGridQuery({}))).toBe("/grid/2024");
  });

  it("reads the all categories view and the Watched filter", () => {
    expect(parseGridQuery({ category: "all", filter: "watched" })).toEqual({
      category: "all",
      sort: "wins",
      filters: ["watched"],
      criticsOpen: false,
    });
    expect(gridHref(2025, { category: "all", sort: "noms", filters: ["watched"], criticsOpen: false })).toBe(
      "/grid/2025?category=all&sort=noms&filter=watched",
    );
  });

  it("flips a filter", () => {
    expect(toggleGridFilter([], "unwatched")).toEqual(["unwatched"]);
    expect(toggleGridFilter(["unwatched"], "unwatched")).toEqual([]);
  });

  it("keeps the mark chips apart: turning one on turns the others off", () => {
    expect(toggleGridFilter(["unwatched"], "want")).toEqual(["want"]);
    expect(toggleGridFilter(["want"], "want")).toEqual([]);
    expect(parseGridQuery({ filter: ["want", "watched"] }).filters).toEqual(["watched"]);
    expect(gridHref(2025, { category: "picture", sort: "wins", filters: ["want"], criticsOpen: false })).toBe(
      "/grid/2025?filter=want",
    );
    expect(toggleGridFilter([], "watched")).toEqual(["watched"]);
    expect(toggleGridFilter(["unwatched"], "watched")).toEqual(["watched"]);
    expect(toggleGridFilter(["watched"], "unwatched")).toEqual(["unwatched"]);
    expect(toggleGridFilter(["watched"], "watched")).toEqual([]);
  });
});

describe("viewGrid", () => {
  const won = { outcome: "won", category: "x" } as const;
  const nom = { outcome: "nominated", category: "x" } as const;
  const films = [
    gf(film(1, "Conclave", 80), { a: won, b: nom, c: nom }),
    gf(film(2, "Anora", 82), { a: won, b: won }),
    gf(film(3, "Wicked", null), { a: nom, b: nom, c: nom, d: nom }),
    gf(film(4, "Emilia Pérez", 65), { a: won, b: nom, c: nom }),
  ];
  const view = (over: Partial<GridQuery>): GridQuery => ({ category: "picture", sort: "wins", filters: [], criticsOpen: false, ...over });
  const titles = (v: GridQuery, watched = new Set<number>(), want = new Set<number>()) =>
    viewGrid([...films], v, { watched, want }).map((f) => f.film.title);

  it("sorts by wins, then nominations, then title", () => {
    expect(titles(view({}))).toEqual(["Anora", "Conclave", "Emilia Pérez", "Wicked"]);
  });

  it("sorts by nominations, then wins", () => {
    expect(titles(view({ sort: "noms" }))).toEqual(["Wicked", "Conclave", "Emilia Pérez", "Anora"]);
  });

  it("sorts by average, no scores last", () => {
    expect(titles(view({ sort: "average" }))).toEqual(["Anora", "Conclave", "Emilia Pérez", "Wicked"]);
  });

  it("sorts by title", () => {
    expect(titles(view({ sort: "title" }))).toEqual(["Anora", "Conclave", "Emilia Pérez", "Wicked"]);
  });

  it("filters to films not marked watched", () => {
    expect(titles(view({ filters: ["unwatched"] }), new Set([2, 3]))).toEqual(["Conclave", "Emilia Pérez"]);
  });

  it("filters to films marked watched, and a film both watched and unwatched can't be shown", () => {
    expect(titles(view({ filters: ["watched"] }), new Set([2, 3]))).toEqual(["Anora", "Wicked"]);
    expect(titles(view({ filters: ["watched", "unwatched"] }), new Set([2, 3]))).toEqual([]);
    expect(titles(view({ filters: ["want"] }), new Set([2]), new Set([3, 4]))).toEqual(["Emilia Pérez", "Wicked"]);
  });
});

describe("gridGroups", () => {
  it("groups the columns by kind, leaving out kinds with none", () => {
    const columns: GridColumn[] = gridColumns(AWARDS, "picture", []);
    expect(gridGroups(columns).map((g) => [g.label, g.columns.length])).toEqual([
      ["Oscars", 1],
      ["Major awards", 2],
      ["Festivals", 2],
      ["Critics groups", 1],
    ]);
    expect(gridGroups(gridColumns(AWARDS, "animated", [])).map((g) => g.label)).toEqual(["Major awards"]);
  });
});
