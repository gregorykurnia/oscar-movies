"use client";

import { useSearchParams } from "next/navigation";
import { YearSwitcher } from "@/components/year-switcher/YearSwitcher";
import { parseCategory, raceHref } from "@/lib/race";

/** The race's year switcher: keeps the selected tab (read from the address) and sends the live season to `/`. */
export function RaceYearSwitcher({ year, years, liveYear }: { year: number; years: number[]; liveYear: number }) {
  const category = parseCategory(useSearchParams().get("category"));
  return <YearSwitcher year={year} years={years} liveYear={liveYear} href={(y) => raceHref(y, category, liveYear)} />;
}
