/**
 * Years from newest to oldest, inclusive (2026 to 2012), for the year switcher. It lives outside
 * the switcher's file because that file is a client component and pages (server) call this.
 */
export function yearRange(newest: number, oldest: number): number[] {
  const years: number[] = [];
  for (let y = newest; y >= oldest; y--) years.push(y);
  return years;
}

/** The live season (plan §2): the race `/` shows. Moves forward when a new season opens. */
export const LIVE_YEAR = 2026;
/** The first film year the app covers. */
export const OLDEST_YEAR = 2012;

/** The Academy Awards' edition number for a film year: 2025 is the 98th ("98th Academy Awards"). */
export function editionLabel(year: number): string {
  const n = year - 1927;
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${suffix} Academy Awards`;
}

/** A film year from the address ("2024"), or null when it isn't one the app covers. */
export function parseFilmYear(value: string): number | null {
  if (!/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= OLDEST_YEAR && year <= LIVE_YEAR ? year : null;
}
