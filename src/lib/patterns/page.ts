// The patterns page's pure helpers (guide §8.14): the address, the years it lists, award names and
// the lists a season's films split into. `src/components/patterns/` draws them.
import registry from "../../../data/awards.json";
import type { Figure } from "../accuracy";
import { LIVE_YEAR, parseFilmYear, yearRange } from "../years";
import { PICKS_FROM, type FilmPatterns, type PatternCategory, type SeasonPatterns } from "./index";

export const PATTERN_TABS: ReadonlyArray<{ slug: PatternCategory; name: string; oscar: string }> = [
  { slug: "documentary", name: "Documentary", oscar: "Best Documentary Feature" },
  { slug: "international", name: "International", oscar: "Best International Feature" },
];

/** The years the switcher lists: the live year down to the first season with a pick. */
export const PATTERN_YEARS = yearRange(LIVE_YEAR, PICKS_FROM);

/** `?category=`: Documentary is the default and stays out of the address. */
export function parsePatternCategory(value: string | string[] | null | undefined): PatternCategory {
  return (Array.isArray(value) ? value[0] : value) === "international" ? "international" : "documentary";
}

/** A year the page covers (the live year to 2015), or null. */
export function parsePatternYear(value: string): number | null {
  const year = parseFilmYear(value);
  return year !== null && year >= PICKS_FROM ? year : null;
}

/** The page's address; `year` may be a "{year}" placeholder for the year switcher. */
export function patternsHref(year: number | string, category: PatternCategory = "documentary"): string {
  return `/patterns/${year}${category === "documentary" ? "" : `?category=${category}`}`;
}

type RegistryAward = { slug: string; shortName: string; categories: Array<{ slug: string; name: string; oscarCategory: string }> };

/** "IDA Best Feature Documentary", "Spirit", "NYFCC": an award category's key ("ida/feature") in words. */
export function awardCategoryName(key: string): string {
  const [awardSlug, categorySlug] = key.split("/");
  const award = (registry as RegistryAward[]).find((a) => a.slug === awardSlug);
  if (!award) return key;
  const category = award.categories.find((c) => c.slug === categorySlug);
  // The category's name only where the award has several that count towards the same Oscar category.
  const several = category && award.categories.filter((c) => c.oscarCategory === category.oscarCategory).length > 1;
  return several ? `${award.shortName} ${category.name}` : award.shortName;
}

export const percent = (f: Figure): number => (f.count === 0 ? 0 : Math.round((100 * f.hits) / f.count));

/** The season's films that weren't nominated: most nominations first, then strong awards, then pick. */
export function missedFilms(season: SeasonPatterns): FilmPatterns[] {
  return season.films
    .filter((f) => f.nominated === false)
    .sort(
      (a, b) =>
        b.nominations - a.nominations ||
        b.strongAwards.length - a.strongAwards.length ||
        (a.pick ?? Infinity) - (b.pick ?? Infinity) ||
        a.title.localeCompare(b.title),
    );
}

/** The five (or `slots`) the patterns picked, in rank order. */
export const picksOf = (season: SeasonPatterns): FilmPatterns[] => season.films.slice(0, season.slots);

/** The nominees: the winner first, then by the patterns' rank. */
export function nomineesOf(season: SeasonPatterns, winner: number | null): FilmPatterns[] {
  return season.films
    .filter((f) => f.nominated)
    .sort((a, b) => Number(Number(b.movie) === winner) - Number(Number(a.movie) === winner));
}
