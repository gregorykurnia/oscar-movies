import { describe, expect, it } from "vitest";
import type { FilmRowData } from "@/data/films";
import {
  listHref,
  listOf,
  mostNominated,
  mostNominatedNote,
  yearSummary,
} from "./year-summary";
import type { GridColumn, GridFilm, GridCell, YearGrid } from "./year-grid";

function film(id: number, title: string): FilmRowData {
  return {
    id,
    slug: `film-${id}`,
    title,
    originalTitle: null,
    originalLang: null,
    year: 2025,
    countries: ["US"],
    scores: { imdb: null, rt: null, mc: null, tmdb: null, average: null, count: 0 },
  };
}

const gf = (f: FilmRowData, cells: Record<string, GridCell>): GridFilm => ({ film: f, flags: f.countries, cells });
const won = { outcome: "won", category: "Best Picture" } as const;
const nominated = { outcome: "nominated", category: "Best Picture" } as const;
const runnerUp = { outcome: "runner_up", category: "People's Choice" } as const;
const shortlisted = { outcome: "shortlisted", category: "Best International Feature Film" } as const;

function col(slug: string, shortName: string, kind: GridColumn["kind"]): GridColumn {
  return { slug, shortName, name: `${shortName} name`, kind, isSelection: false, status: "loaded" };
}

const COLUMNS = [col("oscars", "Oscars", "oscars"), col("bafta", "BAFTA", "major"), col("tiff", "TIFF", "festival")];

// Four films: Anora and The Brutalist are Picture nominees with two nominations each; Wicked is a
// Picture nominee with two too (a runner-up place counts); Drift is a shortlist with no nomination.
const anora = film(1, "Anora");
const brutalist = film(2, "The Brutalist");
const wicked = film(3, "Wicked");
const drift = film(4, "Drift");
const ANORA = gf(anora, { oscars: won, bafta: nominated });
const BRUTALIST = gf(brutalist, { oscars: nominated, bafta: won });
const WICKED = gf(wicked, { oscars: nominated, tiff: runnerUp });
const DRIFT = gf(drift, { oscars: shortlisted });

const all: YearGrid = { columns: COLUMNS, films: [ANORA, BRUTALIST, WICKED, DRIFT] };
const picture: YearGrid = { columns: COLUMNS, films: [ANORA, BRUTALIST, WICKED] };
const documentary: YearGrid = { columns: COLUMNS, films: [DRIFT] };
const international: YearGrid = { columns: COLUMNS, films: [] };
const animated: YearGrid = { columns: COLUMNS, films: [] };

const categories = [
  { slug: "picture" as const, grid: picture },
  { slug: "documentary" as const, grid: documentary },
  { slug: "international" as const, grid: international },
  { slug: "animated" as const, grid: animated },
];

describe("yearSummary", () => {
  it("counts each film once across the categories, and each category's own films", () => {
    const summary = yearSummary(all, categories, new Set());
    expect(summary.films).toBe(4);
    expect(summary.rows.map((r) => [r.name, r.films])).toEqual([
      ["Best Picture", 3],
      ["Best Documentary Feature", 1],
      ["Best International Feature", 0],
      ["Best Animated Feature", 0],
    ]);
  });

  it("counts the watched films in all, and in each category", () => {
    const summary = yearSummary(all, categories, new Set([1, 2, 4]));
    expect(summary.watched).toBe(3);
    expect(summary.rows.map((r) => r.watched)).toEqual([2, 1, 0, 0]);
  });

  it("leaves the most-nominated figure to the most-nominated helper", () => {
    expect(yearSummary(all, categories, new Set()).mostNominated).toEqual(mostNominated(all));
  });
});

describe("mostNominated", () => {
  it("is the films with the most awards nominating them, wins first among the tied", () => {
    const top = mostNominated(all)!;
    expect(top.count).toBe(2);
    expect(top.films).toEqual([
      { title: "Anora", wins: 1, awards: ["Oscars"] },
      { title: "The Brutalist", wins: 1, awards: ["BAFTA"] },
      { title: "Wicked", wins: 0, awards: [] },
    ]);
  });

  it("is the one film when it has the most", () => {
    const grid: YearGrid = { columns: COLUMNS, films: [ANORA, gf(wicked, { oscars: nominated, bafta: nominated, tiff: runnerUp }), DRIFT] };
    expect(mostNominated(grid)).toEqual({ count: 3, films: [{ title: "Wicked", wins: 0, awards: [] }] });
  });

  it("is null while only shortlists are out, and for a year with no films", () => {
    expect(mostNominated({ columns: COLUMNS, films: [DRIFT] })).toBeNull();
    expect(mostNominated({ columns: COLUMNS, films: [] })).toBeNull();
  });
});

describe("the most-nominated note", () => {
  it("names the film, its wins and the awards they came from", () => {
    expect(mostNominatedNote({ count: 3, films: [{ title: "Anora", wins: 2, awards: ["Oscars", "BAFTA"] }] })).toBe(
      "Anora: 2 wins at Oscars and BAFTA",
    );
    expect(mostNominatedNote({ count: 3, films: [{ title: "Anora", wins: 1, awards: ["Oscars"] }] })).toBe("Anora: 1 win at Oscars");
  });

  it("says when the film has no wins yet, and how many are tied", () => {
    expect(mostNominatedNote({ count: 2, films: [{ title: "Wicked", wins: 0, awards: [] }] })).toBe("Wicked: no wins yet");
    const tied = { count: 2, films: [{ title: "Anora", wins: 1, awards: ["Oscars"] }, { title: "Wicked", wins: 0, awards: [] }, { title: "Drift", wins: 0, awards: [] }] };
    expect(mostNominatedNote(tied)).toBe("Anora: 1 win at Oscars · 2 more tied");
  });
});

describe("listOf", () => {
  it("joins names the way the page reads them", () => {
    expect(listOf([])).toBe("");
    expect(listOf(["Oscars"])).toBe("Oscars");
    expect(listOf(["Oscars", "BAFTA"])).toBe("Oscars and BAFTA");
    expect(listOf(["Oscars", "BAFTA", "Globes"])).toBe("Oscars, BAFTA and Globes");
  });
});

describe("listHref", () => {
  it("opens the grid view a count means, with the defaults left out", () => {
    expect(listHref(2025, { category: "picture" })).toBe("/grid/2025");
    expect(listHref(2025, { category: "documentary", filters: ["watched"] })).toBe("/grid/2025?category=documentary&filter=watched");
    expect(listHref(2025, { category: "all" })).toBe("/grid/2025?category=all");
    expect(listHref(2025, { category: "all", sort: "noms" })).toBe("/grid/2025?category=all&sort=noms");
  });
});
