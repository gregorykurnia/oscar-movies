// Movie slugs (`/movies/[slug]`): made once from the English title and never changed, so a
// link to a film keeps working. A title already taken by another film gets the year, then a
// number.

export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function uniqueSlug(title: string, year: number, taken: Set<string>): string {
  const base = slugify(title) || "film";
  if (!taken.has(base)) return base;
  const withYear = `${base}-${year}`;
  if (!taken.has(withYear)) return withYear;
  for (let n = 2; ; n++) if (!taken.has(`${withYear}-${n}`)) return `${withYear}-${n}`;
}
