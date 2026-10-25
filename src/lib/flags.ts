// One flag per film (plan §3.2, guide §7 Flags).

/** An International Feature submission: the film year and the country that submitted it. */
export type Submission = { year: number; country: string | null };

/**
 * The film's primary country as an upper-case ISO code. A film that was submitted for
 * International Feature shows the country that submitted it (the latest year if more than one,
 * even when that country isn't among its production countries); any other film shows the first
 * production country (`countries` is stored main first). Null when the film has neither.
 */
export function primaryCountry(countries: string[], submissions: Submission[] = []): string | null {
  let latest: Submission | null = null;
  for (const s of submissions) {
    if (s.country && (!latest || s.year > latest.year)) latest = s;
  }
  const code = latest?.country ?? countries[0];
  return code ? code.toUpperCase() : null;
}
