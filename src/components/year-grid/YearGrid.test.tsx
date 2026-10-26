// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FilmRowData } from "@/data/films";
import type { GridColumn, GridFilm } from "@/lib/year-grid";
import { YearGrid, YearGridLegend } from "./YearGrid";

// The marks are wired to the layout's store; here a plain button stands in.
vi.mock("@/components/marks/MarksProvider", () => ({
  FilmWatchedMark: ({ title }: { title: string }) => <button type="button">Mark {title} as watched</button>,
}));

const column = (slug: string, kind: GridColumn["kind"], status: GridColumn["status"] = "loaded"): GridColumn => ({
  slug,
  shortName: slug.toUpperCase(),
  name: `${slug} awards`,
  kind,
  isSelection: false,
  status,
});

const COLUMNS = [
  column("oscars", "oscars"),
  column("bafta", "major"),
  column("dga", "major", "no_data"),
  column("cannes", "festival"),
  column("nyfcc", "critics"),
  column("lafca", "critics"),
];

function film(id: number, title: string): FilmRowData {
  return {
    id,
    slug: `film-${id}`,
    title,
    originalTitle: null,
    originalLang: null,
    year: 2024,
    countries: ["US"],
    flag: "US",
    scores: { imdb: 7.5, rt: null, mc: null, tmdb: null, average: 75, count: 1 },
  };
}

const FILMS: GridFilm[] = [
  {
    film: film(1, "Anora"),
    cells: {
      oscars: { outcome: "won", category: "Best Picture" },
      bafta: { outcome: "nominated", category: "Best Film" },
      cannes: { outcome: "won", category: "Palme d'Or" },
      nyfcc: { outcome: "won", category: "Best Film" },
      lafca: { outcome: "won", category: "Best Film" },
    },
  },
  {
    film: film(2, "Wicked"),
    cells: { oscars: { outcome: "nominated", category: "Best Picture" } },
  },
];

const renderGrid = (criticsOpen: boolean) =>
  render(<YearGrid columns={COLUMNS} films={FILMS} category="picture" criticsOpen={criticsOpen} caption="Best Picture, 2024" />);

describe("YearGrid", () => {
  it("is a table with a row per film (a row header with the film), totals and labelled cells", () => {
    renderGrid(false);
    const table = screen.getByRole("table", { name: "Best Picture, 2024" });
    const anora = within(table).getByRole("rowheader", { name: "Anora" });
    expect(within(anora).getByRole("link", { name: "Anora" }).getAttribute("href")).toBe("/movies/film-1");
    expect(within(anora).getByText("75 average")).toBeTruthy();
    const cells = within(anora.closest("tr")!).getAllByRole("cell");
    // Wins (Oscar, Cannes and the two critics groups) and nominations (those and BAFTA).
    expect(cells[0].textContent).toBe("4");
    expect(cells[1].textContent).toBe("5");
    expect(within(table).getAllByRole("img", { name: "Won: Best Picture" })).toHaveLength(1);
    expect(within(table).getByRole("img", { name: "Nominated: Best Film" }).getAttribute("title")).toBe("Nominated: Best Film");
    expect(within(table).getAllByRole("img", { name: "Nominated: Best Picture" })).toHaveLength(1);
  });

  it("heads the columns by group, then by award, and marks a column with no data that year", () => {
    renderGrid(false);
    for (const name of ["Totals", "Oscars", "Major awards", "Festivals", "Critics groups", "Wins", "Noms", "BAFTA", "CANNES"]) {
      expect(screen.getByRole("columnheader", { name })).toBeTruthy();
    }
    expect(screen.getByRole("columnheader", { name: "DGA" }).getAttribute("title")).toBe("dga awards: no data this year");
    expect(screen.getAllByRole("img", { name: "No data" })).toHaveLength(2);
  });

  it("folds the critics groups into one count column", () => {
    renderGrid(false);
    expect(screen.getByRole("columnheader", { name: "2 groups" })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "NYFCC" })).toBeNull();
    expect(screen.getByRole("img", { name: "2 critics group wins" }).textContent).toBe("2");
  });

  it("opens the critics groups into one column each", () => {
    renderGrid(true);
    expect(screen.queryByRole("columnheader", { name: "2 groups" })).toBeNull();
    expect(screen.getByRole("columnheader", { name: "NYFCC" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "LAFCA" })).toBeTruthy();
    expect(screen.getAllByRole("img", { name: "Won: Best Film" })).toHaveLength(2);
  });

  it("scrolls inside a labelled region that the keyboard can reach", () => {
    renderGrid(false);
    const region = screen.getByRole("region", { name: "Awards for each film" });
    expect(region.getAttribute("tabindex")).toBe("0");
  });
});

describe("YearGrid in the Oscar order", () => {
  it("heads each Oscar group that has films with a group row and its count, and none under other sorts", () => {
    const films = [...FILMS, { film: film(3, "Nickel Boys"), cells: { oscars: { outcome: "shortlisted" as const, category: "Best Picture" } } }];
    const { container, unmount } = render(
      <YearGrid columns={COLUMNS} films={films} category="picture" criticsOpen={false} caption="Best Picture, 2024" oscarGroups />,
    );
    const heads = [...container.querySelectorAll("th[scope=rowgroup]")].map((th) => th.textContent);
    expect(heads).toEqual(["Oscar winner and nominees2", "Oscar shortlist1"]);
    // The group row spans the whole table: its cell takes every column after the film's.
    const groupRow = container.querySelector("th[scope=rowgroup]")!.closest("tr")!;
    const filmRow = screen.getByRole("rowheader", { name: "Anora" }).closest("tr")!;
    expect(Number(groupRow.querySelector("td")!.getAttribute("colspan"))).toBe(filmRow.querySelectorAll("td").length);
    unmount();
    renderGrid(false);
    expect(document.querySelectorAll("th[scope=rowgroup]")).toHaveLength(0);
  });
});

describe("YearGridLegend", () => {
  it("names every cell kind, with critics and no data only when the grid has them", () => {
    const { rerender } = render(<YearGridLegend category="international" hasCritics={false} hasNoDataColumn={false} />);
    const legend = screen.getByRole("list", { name: "Legend" });
    expect(within(legend).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Won",
      "Nominated or on the list",
      "Oscar shortlist",
      "Submitted",
    ]);
    rerender(<YearGridLegend category="picture" hasCritics hasNoDataColumn />);
    expect(within(screen.getByRole("list", { name: "Legend" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Won",
      "Nominated or on the list",
      "Oscar shortlist",
      "Submitted or eligible",
      "9Critics group wins",
      "–No data that year",
    ]);
  });
});

describe("YearGrid with a split award", () => {
  const sub = (slug: string, shortName: string) => ({ slug, name: `${shortName} prize`, shortName });
  const eye = (s: ReturnType<typeof sub>): GridColumn => ({ ...column("cinema-eye", "major"), shortName: "Cinema Eye", name: "Cinema Eye Honors", sub: s });
  const columns = [column("oscars", "oscars"), eye(sub("feature", "Feature")), eye(sub("direction", "Direction")), column("bafta", "major")];
  const films: GridFilm[] = [
    {
      film: film(1, "No Other Land"),
      cells: {
        oscars: { outcome: "won", category: "Best Documentary Feature Film" },
        "cinema-eye/direction": { outcome: "nominated", category: "Direction prize" },
      },
    },
  ];

  it("spans the award's name over its categories' heads, and fills each category's own cell", () => {
    render(<YearGrid columns={columns} films={films} category="documentary" criticsOpen={false} caption="Documentary" />);
    const award = screen.getByRole("columnheader", { name: "Cinema Eye" });
    expect(award.getAttribute("colspan")).toBe("2");
    expect(screen.getByRole("columnheader", { name: "Feature" }).title).toBe("Cinema Eye Honors: Feature prize");
    expect(screen.getByRole("columnheader", { name: "BAFTA" }).getAttribute("rowspan")).toBe("2");
    const row = screen.getByRole("row", { name: /No Other Land/ });
    const cells = within(row).getAllByRole("cell");
    // Wins, Noms, Oscars, Feature, Direction, BAFTA.
    expect(cells).toHaveLength(6);
    expect(within(cells[3]).queryByRole("img")).toBeNull();
    expect(within(cells[4]).getByRole("img").getAttribute("aria-label")).toBe("Nominated: Direction prize");
  });
});
