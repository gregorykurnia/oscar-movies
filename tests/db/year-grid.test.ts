// The year grid's query (task 2.9) against the seeded `test` data: 2025 Picture's columns and films,
// International's shortlist rows, and a category with nothing loaded yet.
import { afterAll, describe, expect, it } from "vitest";
import { createScriptDb } from "../../src/db";
import { queryYearGrid } from "../../src/data/year-grid";
import { gridTotals } from "../../src/lib/year-grid";
import { majorsOnly } from "./majors-only";

const { db, close } = createScriptDb();
afterAll(() => close());

const OSCAR_NOMINEES_2025 = [
  "Bugonia",
  "F1",
  "Frankenstein",
  "Hamnet",
  "Marty Supreme",
  "One Battle After Another",
  "Sentimental Value",
  "Sinners",
  "The Secret Agent",
  "Train Dreams",
];

describe("queryYearGrid", () => {
  it("2025 Picture: every award that gives Picture as a column, Oscars first, all loaded", async () => {
    const { columns } = majorsOnly(await queryYearGrid(db, 2025, "picture"));
    expect(columns.map((c) => c.slug)).toEqual([
      "oscars",
      "afi",
      "golden-globes",
      "satellite",
      "dga",
      "spirit-awards",
      "bafta",
      "pga",
      "actor-awards",
      "sundance",
      "berlin",
      "cannes",
      "venice",
      "tiff",
    ]);
    expect(columns.every((c) => c.status === "loaded")).toBe(true);
  });

  it("2025 Picture: every film with a nomination anywhere, the Oscar nominees and the winner among them", async () => {
    const { films } = majorsOnly(await queryYearGrid(db, 2025, "picture"));
    expect(films).toHaveLength(31);
    const oscars = films.filter((f) => f.cells.oscars).map((f) => f.film.title).sort();
    expect(oscars).toEqual(OSCAR_NOMINEES_2025);
    const winner = films.find((f) => f.cells.oscars?.outcome === "won")!;
    expect(winner.film.title).toBe("One Battle After Another");
    expect(winner.cells.oscars.category).toBe("Best Picture");
    expect(gridTotals(winner)).toEqual({ wins: 5, noms: 8 });
    // A festival winner with no other result is a row too.
    expect(films.find((f) => f.film.title === "Sirāt")!.cells.cannes.outcome).toBe("won");
  });

  it("2025 International: the Oscar shortlist makes a row, a submission alone doesn't; the submitting country's flag leads", async () => {
    const { films } = majorsOnly(await queryYearGrid(db, 2025, "international"));
    expect(films).toHaveLength(20);
    expect(films.filter((f) => f.cells.oscars?.outcome === "shortlisted")).toHaveLength(10);
    expect(films.some((f) => f.cells.oscars?.outcome === "submitted" && Object.keys(f.cells).length === 1)).toBe(false);
    expect(films.find((f) => f.film.title === "Sentimental Value")!.flags[0]).toBe("NO");
  });

  it("2025 all categories: the four categories' films together, each once, with every award as a column", async () => {
    const { columns, films } = majorsOnly(await queryYearGrid(db, 2025, "all"));
    const union = new Set<number>();
    for (const category of ["picture", "documentary", "international", "animated"] as const) {
      for (const f of majorsOnly(await queryYearGrid(db, 2025, category)).films) union.add(f.film.id);
    }
    expect(films.map((f) => f.film.id).sort((a, b) => a - b)).toEqual([...union].sort((a, b) => a - b));
    expect(columns).toHaveLength(17);
    expect(columns.map((c) => c.slug)).toEqual(expect.arrayContaining(["oscars", "annie", "sundance"]));
  });

  it("2026 Animated: the columns with no data, and no films yet", async () => {
    const { columns, films } = majorsOnly(await queryYearGrid(db, 2026, "animated"));
    expect(columns[0]).toMatchObject({ slug: "oscars", status: "partial" });
    expect(columns.slice(1).every((c) => c.status === "no_data")).toBe(true);
    expect(films).toEqual([]);
  });
});
