// The year summary's data: the year's grids, every category and all of them together. Each comes
// from the cached `getYearGrid`, so the summary and the grid pages share one read per year and
// category; the marks are read per visit by the page (`src/data/watch-list.ts`).
import { RACE_CATEGORIES, type RaceCategory } from "@/lib/race";
import type { YearGrid } from "@/lib/year-grid";
import { getYearGrid } from "./year-grid";

export type YearSummaryGrids = { all: YearGrid; categories: { slug: RaceCategory; grid: YearGrid }[] };

/** The year's grids for the summary: all the categories together, and each one. */
export async function getYearSummaryGrids(year: number): Promise<YearSummaryGrids> {
  const [all, ...grids] = await Promise.all([
    getYearGrid(year, "all"),
    ...RACE_CATEGORIES.map((c) => getYearGrid(year, c.slug)),
  ]);
  return { all, categories: RACE_CATEGORIES.map((c, i) => ({ slug: c.slug, grid: grids[i] })) };
}
