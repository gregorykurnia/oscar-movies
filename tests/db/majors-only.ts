// The year grid as it was before Phase 4 loaded critics groups: their columns and cells taken
// out, and the films that were rows only because of one gone. The Phase 2 figures these tests
// pin (31 Picture films, nine nominations for Hamnet) don't move with each critics import; the
// critics groups' own figures are tested with Phase 4's pages (tasks 4.10, 4.11).
import { isNomination, isShortlisted } from "../../src/lib/stage";
import { columnKey, type YearGrid } from "../../src/lib/year-grid";

export function majorsOnly(grid: YearGrid): YearGrid {
  const critics = new Set(grid.columns.filter((c) => c.kind === "critics").map(columnKey));
  const films = grid.films
    .map((f) => ({ ...f, cells: Object.fromEntries(Object.entries(f.cells).filter(([key]) => !critics.has(key))) }))
    .filter((f) => Object.entries(f.cells).some(([slug, cell]) => isNomination(cell.outcome) || (slug === "oscars" && isShortlisted(cell.outcome))));
  return { columns: grid.columns.filter((c) => c.kind !== "critics"), films };
}
