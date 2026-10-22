/**
 * Years from newest to oldest, inclusive (2026 to 2012), for the year switcher. It lives outside
 * the switcher's file because that file is a client component and pages (server) call this.
 */
export function yearRange(newest: number, oldest: number): number[] {
  const years: number[] = [];
  for (let y = newest; y >= oldest; y--) years.push(y);
  return years;
}
