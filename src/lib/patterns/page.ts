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

/** The ids of a season's films flagged Snub risk (none before the shortlist or without a season). */
export function flaggedFilms(season: SeasonPatterns | undefined): Set<number> {
  return new Set((season?.films ?? []).filter((f) => f.snubRisk.length > 0).map((f) => Number(f.movie)));
}

/** A season's films by id, for the pages that list the shortlist with their own rows. */
export function filmsById(season: SeasonPatterns | undefined): Map<number, FilmPatterns> {
  return new Map((season?.films ?? []).map((f) => [Number(f.movie), f]));
}

/** The patterns' order for the shortlisted films that missed: pick, then most nominations, then title (no pick: nominations, title). */
export function shortlistOrder<T extends { film: { id: number; title: string } }>(entries: T[], byFilm: Map<number, FilmPatterns>): T[] {
  const pick = (e: T) => byFilm.get(e.film.id)?.pick ?? Infinity;
  const nominations = (e: T) => byFilm.get(e.film.id)?.nominations ?? 0;
  return [...entries].sort((a, b) => pick(a) - pick(b) || nominations(b) - nominations(a) || a.film.title.localeCompare(b.film.title));
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** The Oscars page's caption parts: "47 nominations", "3 strong awards", "Pick #2" (no pick before 2015). */
export function shortlistCaption(film: FilmPatterns): string[] {
  const parts = [plural(film.nominations, "nomination"), plural(film.strongAwards.length, "strong award")];
  if (film.pick !== null) parts.push(`Pick #${film.pick}`);
  return parts;
}
