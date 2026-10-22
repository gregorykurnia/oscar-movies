// Number and date wording from the guide's copy rules (§11): "–" for anything unknown, never 0.

export const DASH = "–";

/** A score with one decimal (IMDb, TMDB: "7.9") or none (RT, MC: "95"); missing is "–". */
export function formatScore(value: number | null | undefined, decimals: 0 | 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return DASH;
  return value.toFixed(decimals);
}

/** Whole number with thousands commas ("1,204"); missing is "–". */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return DASH;
  return Math.round(value).toLocaleString("en-US");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 Oct", or "14 Oct 2025" with the year. Read in UTC so server and browser agree. */
export function formatDate(date: Date, withYear = false): string {
  const day = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  return withYear ? `${day} ${date.getUTCFullYear()}` : day;
}
