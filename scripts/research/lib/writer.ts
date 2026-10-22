// Writes research results into `data/` (IMPLEMENTATION_PLAN.md §3.3–3.4) so that git diffs
// stay small: one film or one result per line, entries already in a file keep their place,
// slugs and hand-made fixes are never overwritten, and every file is validated before it is
// written.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  editionFileSchema,
  moviesFileSchema,
  refKey,
  type EditionFile,
  type MovieEntry,
  type MoviesFile,
  type ResultEntry,
  type ScreeningEntry,
} from "../../../src/lib/data-files";
import type { Facts } from "./facts";
import { uniqueSlug } from "./slug";

/** `{ "a": 1, "b": ["US", "GB"] }`: the one-line style of the data files. */
export function inline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(inline).join(", ")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return "{}";
    return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`).join(", ")} }`;
  }
  return JSON.stringify(value);
}

const MOVIE_FIELDS = ["slug", "title", "originalTitle", "originalLang", "countries", "language", "wd", "tmdb"] as const;
const RESULT_FIELDS = ["category", "imdb", "wd", "title", "outcome", "country", "unresolved"] as const;
const SCREENING_FIELDS = ["imdb", "wd", "title", "section", "sectionOrder", "prize", "unresolved"] as const;
const EDITION_FIELDS = [
  "award",
  "year",
  "ordinal",
  "status",
  "shortlistOn",
  "nominationsOn",
  "winnersOn",
  "sourceUrls",
  "note",
] as const;

function ordered<T extends object>(value: T, fields: readonly string[]): Record<string, unknown> {
  const source = value as Record<string, unknown>;
  return Object.fromEntries(fields.filter((f) => source[f] !== undefined).map((f) => [f, source[f]]));
}

export function formatMoviesFile(file: MoviesFile): string {
  const lines = Object.entries(file).map(([key, m]) => `  ${JSON.stringify(key)}: ${inline(ordered(m, MOVIE_FIELDS))}`);
  return lines.length === 0 ? "{}\n" : `{\n${lines.join(",\n")}\n}\n`;
}

function block(items: object[], fields: readonly string[]): string {
  if (items.length === 0) return "[]";
  return `[\n${items.map((item) => `    ${inline(ordered(item, fields))}`).join(",\n")}\n  ]`;
}

export function formatEditionFile(edition: EditionFile): string {
  const head = Object.entries(ordered(edition, EDITION_FIELDS)).map(([k, v]) => `  ${JSON.stringify(k)}: ${inline(v)}`);
  head.push(`  "results": ${block(edition.results, RESULT_FIELDS)}`);
  head.push(`  "screenings": ${block(edition.screenings, SCREENING_FIELDS)}`);
  return `{\n${head.join(",\n")}\n}\n`;
}

export const editionPath = (dataDir: string, award: string, year: number) =>
  join(dataDir, "editions", award, `${year}.json`);
export const moviesPath = (dataDir: string, year: number) => join(dataDir, "movies", `${year}.json`);

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

/** Every `data/movies/<year>.json`, validated, by year. */
export function readMoviesFiles(dataDir: string): Map<number, MoviesFile> {
  const dir = join(dataDir, "movies");
  const files = new Map<number, MoviesFile>();
  if (!existsSync(dir)) return files;
  for (const name of readdirSync(dir).filter((f) => /^\d{4}\.json$/.test(f)).sort()) {
    const path = join(dir, name);
    const parsed = moviesFileSchema.safeParse(readJson(path));
    if (!parsed.success) throw new Error(`${path} is not valid: ${parsed.error.message}`);
    files.set(Number(name.slice(0, 4)), parsed.data);
  }
  return files;
}

/** `wd` is missing only for a film found on TMDB that Wikidata has no item for. */
export type NewFilm = { imdb?: string; wd?: string; facts: Facts };

/** The key a film is filed under: its IMDb ID, or its QID when it has none. */
export const movieKey = (film: { imdb?: string; wd?: string }) => (film.imdb ?? film.wd) as string;

/**
 * Adds films to `data/movies/<year>.json`. A film already in any year's file (by IMDb ID or
 * QID) is left exactly as it is, so a hand-fixed title or a slug never changes; new films are
 * appended with a slug no other film has.
 */
export function addMovies(dataDir: string, year: number, films: NewFilm[]): { added: string[]; kept: string[] } {
  const all = readMoviesFiles(dataDir);
  const known = new Set<string>();
  const taken = new Set<string>();
  for (const file of all.values()) {
    for (const [key, m] of Object.entries(file)) {
      known.add(key);
      if (m.wd) known.add(m.wd);
      taken.add(m.slug);
    }
  }
  const file: MoviesFile = { ...(all.get(year) ?? {}) };
  const added: string[] = [];
  const kept: string[] = [];
  for (const film of films) {
    const key = movieKey(film);
    if (known.has(key) || (film.wd && known.has(film.wd))) {
      kept.push(key);
      continue;
    }
    const slug = uniqueSlug(film.facts.title, year, taken);
    const entry: MovieEntry = { slug, ...film.facts };
    file[key] = entry;
    known.add(key);
    if (film.wd) known.add(film.wd);
    taken.add(slug);
    added.push(key);
  }
  if (added.length > 0) writeValidated(moviesPath(dataDir, year), moviesFileSchema, file, formatMoviesFile);
  return { added, kept };
}

const resultId = (r: ResultEntry) => `${r.category}\u0000${refKey(r) ?? `title:${r.title}`}`;
const screeningId = (s: ScreeningEntry) => `${s.section}\u0000${refKey(s) ?? `title:${s.title}`}`;

/** Takes a hand-made resolution from the old entry when the new one is still unresolved. */
function keepResolution<T extends { imdb?: string; wd?: string; title: string; unresolved?: true }>(
  next: T,
  old: T[],
  sameSlot: (a: T, b: T) => boolean,
): T {
  if (!next.unresolved) return next;
  const fixed = old.find((o) => !o.unresolved && o.title === next.title && sameSlot(o, next));
  if (!fixed) return next;
  const { unresolved: _drop, ...rest } = next;
  void _drop;
  return { ...rest, imdb: fixed.imdb, wd: fixed.wd } as T;
}

/** Entries in `old` keep their order; new ones follow in the order they came. */
function mergeInOrder<T>(old: T[], next: T[], id: (x: T) => string): T[] {
  const nextById = new Map(next.map((x) => [id(x), x]));
  const kept = old.flatMap((x) => (nextById.has(id(x)) ? [nextById.get(id(x)) as T] : []));
  const oldIds = new Set(old.map(id));
  return [...kept, ...next.filter((x) => !oldIds.has(id(x)))];
}

/**
 * The edition to write, given what is on disk. The new research replaces the results (a film
 * no longer on the page goes), but films already listed keep their place, and a film resolved
 * by hand stays resolved. Everything else (status, dates, sources, note) is the new research's.
 */
export function mergeEdition(old: EditionFile | undefined, next: EditionFile): EditionFile {
  if (!old) return next;
  const results = next.results.map((r) => keepResolution(r, old.results, (a, b) => a.category === b.category));
  const screenings = next.screenings.map((s) => keepResolution(s, old.screenings, (a, b) => a.section === b.section));
  return {
    ...next,
    results: mergeInOrder(old.results, results, resultId),
    screenings: mergeInOrder(old.screenings, screenings, screeningId),
  };
}

export function readEdition(dataDir: string, award: string, year: number): EditionFile | undefined {
  const path = editionPath(dataDir, award, year);
  if (!existsSync(path)) return undefined;
  const parsed = editionFileSchema.safeParse(readJson(path));
  if (!parsed.success) throw new Error(`${path} is not valid: ${parsed.error.message}`);
  return parsed.data;
}

/** Merges `edition` into its file and writes it. Returns the path. */
export function writeEdition(dataDir: string, edition: EditionFile): string {
  const merged = mergeEdition(readEdition(dataDir, edition.award, edition.year), edition);
  const path = editionPath(dataDir, edition.award, edition.year);
  writeValidated(path, editionFileSchema, merged, formatEditionFile);
  return path;
}

function writeValidated<T>(
  path: string,
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: Error } },
  value: T,
  format: (v: T) => string,
): void {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new Error(`Refusing to write ${path}: ${parsed.error.message}`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, format(parsed.data));
}
