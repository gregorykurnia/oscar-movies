// The rules behind `npm run data:check` (IMPLEMENTATION_PLAN.md §3.3), kept pure so they are
// unit tested and the loader (task 1.2) runs the same ones before it plans a load. Each file
// is validated by its schema in `src/lib/data-files.ts`; these are the rules across files.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  awardsFileSchema,
  editionFileSchema,
  marksFileSchema,
  moviesFileSchema,
  refKey,
  type AwardsFile,
  type EditionFile,
  type MarksFile,
  type MoviesFile,
} from "../../src/lib/data-files";

export type DataSet = {
  awards: AwardsFile;
  movies: Array<{ path: string; year: number; file: MoviesFile }>;
  editions: Array<{ path: string; edition: EditionFile }>;
  marks: MarksFile | null;
};

export type CheckReport = { errors: string[]; warnings: string[] };

type SafeParser<T> = { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; message: string }> } } };

function parseFile<T>(path: string, schema: SafeParser<T>, label: string, errors: string[]): T | null {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    errors.push(`${label}: not valid JSON (${(error as Error).message})`);
    return null;
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  for (const issue of parsed.error.issues.slice(0, 10)) {
    errors.push(`${label}: ${issue.path.map(String).join(".") || "(file)"}: ${issue.message}`);
  }
  return null;
}

const jsonFiles = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, encoding: "utf8" })
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => join(dir, f))
    : [];

/** Reads and validates every file in `dataDir`. Schema failures come back as errors. */
export function readDataSet(dataDir: string): { data: DataSet; errors: string[] } {
  const errors: string[] = [];
  const label = (path: string) => relative(dataDir, path) || path;
  const awardsPath = join(dataDir, "awards.json");
  const awards = existsSync(awardsPath) ? parseFile(awardsPath, awardsFileSchema, "awards.json", errors) : null;
  if (!existsSync(awardsPath)) errors.push("awards.json is missing");

  const movies: DataSet["movies"] = [];
  for (const path of jsonFiles(join(dataDir, "movies"))) {
    const match = path.match(/(\d{4})\.json$/);
    if (!match) {
      errors.push(`${label(path)}: movie files are named <year>.json`);
      continue;
    }
    const file = parseFile(path, moviesFileSchema, label(path), errors);
    if (file) movies.push({ path: label(path), year: Number(match[1]), file });
  }

  const editions: DataSet["editions"] = [];
  for (const path of jsonFiles(join(dataDir, "editions"))) {
    const edition = parseFile(path, editionFileSchema, label(path), errors);
    if (edition) editions.push({ path: label(path), edition });
  }

  const marksPath = join(dataDir, "marks.json");
  const marks = existsSync(marksPath) ? parseFile(marksPath, marksFileSchema, "marks.json", errors) : null;

  return { data: { awards: awards ?? [], movies, editions, marks }, errors };
}

const NOMINEE: ReadonlySet<string> = new Set(["nominated", "runner_up", "won"]);

/** Picture had 8–10 nominees until the 2021 film year, and 10 since; the others have 5. */
export function oscarNomineeRange(category: string, year: number): [number, number] {
  if (category === "picture") return year >= 2021 ? [10, 10] : [8, 10];
  return [5, 5];
}

export type CheckOptions = {
  /** `YYYY-MM-DD`: dates on or before it have happened. */
  today: string;
  /** Slugs as last committed, by film key: a slug must never change. */
  previousSlugs?: Map<string, string>;
};

export function checkData(data: DataSet, { today, previousSlugs }: CheckOptions): CheckReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Movies: one entry per film across every year, slugs unique and unchanged.
  const movieOf = new Map<string, string>(); // key or QID → the key the film is filed under
  const slugOwner = new Map<string, string>();
  for (const { path, file } of data.movies) {
    for (const [key, m] of Object.entries(file)) {
      for (const id of new Set([key, m.wd].filter((x): x is string => x !== undefined))) {
        if (movieOf.has(id) && movieOf.get(id) !== key) errors.push(`${path}: ${id} is also filed as ${movieOf.get(id)}`);
        else if (movieOf.has(id)) errors.push(`${path}: ${key} is listed in more than one movie file`);
        movieOf.set(id, key);
      }
      const owner = slugOwner.get(m.slug);
      if (owner !== undefined && owner !== key) errors.push(`${path}: slug "${m.slug}" is used by ${owner} and ${key}`);
      slugOwner.set(m.slug, key);
      const before = previousSlugs?.get(key);
      if (before !== undefined && before !== m.slug) {
        errors.push(`${path}: ${key}'s slug changed from "${before}" to "${m.slug}" (slugs never change)`);
      }
      if (m.countries.length === 0) warnings.push(`${path}: ${key} (${m.title}) has no country`);
    }
  }

  const awards = new Map(data.awards.map((a) => [a.slug, a]));
  const seenEditions = new Set<string>();

  for (const { path, edition: e } of data.editions) {
    const where = path;
    const award = awards.get(e.award);
    if (!award) {
      errors.push(`${where}: unknown award "${e.award}"`);
      continue;
    }
    const expectedPath = join("editions", e.award, `${e.year}.json`);
    if (path !== expectedPath) errors.push(`${where}: should be at ${expectedPath} (award ${e.award}, year ${e.year})`);
    const editionId = `${e.award}/${e.year}`;
    if (seenEditions.has(editionId)) errors.push(`${where}: a second file for ${editionId}`);
    seenEditions.add(editionId);

    // Status and dates.
    if (e.status === "no_data" && (e.results.length > 0 || e.screenings.length > 0)) {
      errors.push(`${where}: status no_data but it has results`);
    }
    if (e.status === "partial" && !e.note) errors.push(`${where}: a partial edition needs a note saying what is missing`);
    if (e.status === "loaded") {
      if (!e.winnersOn && !award.isSelection) errors.push(`${where}: loaded but has no winnersOn date`);
      if (!e.nominationsOn && !award.winnersOnly && !award.isSelection) {
        errors.push(`${where}: loaded but has no nominationsOn date`);
      }
      if (award.kind === "oscars" && !e.shortlistOn) errors.push(`${where}: loaded but has no shortlistOn date`);
    }

    // Results: known category, one row per film per category, films that resolve.
    const categories = new Map(award.categories.map((c) => [c.slug, c]));
    const rowsSeen = new Set<string>();
    for (const r of e.results) {
      const category = categories.get(r.category);
      const label = `${where}: ${r.title} (${r.category})`;
      if (!category) {
        errors.push(`${label}: ${e.award} has no category "${r.category}"`);
        continue;
      }
      const key = refKey(r);
      if (key === undefined) {
        errors.push(`${label}: unresolved; find its IMDb ID or QID, or leave it out and record it`);
        continue;
      }
      const filed = movieOf.get(key);
      if (filed === undefined) errors.push(`${label}: ${key} is in no movie file`);
      const row = `${r.category}\u0000${filed ?? key}`;
      if (rowsSeen.has(row)) errors.push(`${label}: listed twice in this category`);
      rowsSeen.add(row);
      if (award.kind === "oscars" && category.oscarCategory === "international" && !r.country) {
        errors.push(`${label}: an International result needs its submitting country`);
      }
      if (category.oscarCategory !== "international" && r.country) {
        errors.push(`${label}: country is only for International results`);
      }
    }
    // Lineups: festivals only, and each section has one place in the programme that no other section shares
    // (the lineup page groups its films by that place).
    if (e.screenings.length > 0 && award.kind !== "festival") errors.push(`${where}: screenings on ${award.kind} ${e.award}; lineups are for festivals`);
    const orderOf = new Map<string, number>();
    const sectionAt = new Map<number, string>();
    for (const s of e.screenings) {
      if (s.sectionOrder === undefined) {
        errors.push(`${where}: ${s.title} (${s.section}): no sectionOrder`);
        continue;
      }
      const order = orderOf.get(s.section);
      if (order !== undefined && order !== s.sectionOrder) errors.push(`${where}: ${s.section} has sectionOrder ${order} and ${s.sectionOrder}`);
      const other = sectionAt.get(s.sectionOrder);
      if (other !== undefined && other !== s.section) errors.push(`${where}: ${other} and ${s.section} share sectionOrder ${s.sectionOrder}`);
      orderOf.set(s.section, order ?? s.sectionOrder);
      sectionAt.set(s.sectionOrder, other ?? s.section);
    }
    const screeningsSeen = new Set<string>();
    for (const s of e.screenings) {
      const key = refKey(s);
      if (key === undefined) errors.push(`${where}: ${s.title} (${s.section}): unresolved`);
      else if (!movieOf.has(key)) errors.push(`${where}: ${s.title} (${s.section}): ${key} is in no movie file`);
      else {
        const row = `${s.section}\u0000${movieOf.get(key)}`;
        if (screeningsSeen.has(row)) errors.push(`${where}: ${s.title} (${s.section}): listed twice in this section`);
        screeningsSeen.add(row);
      }
    }

    // The Oscars: nominee counts once nominations are out, one winner once the ceremony is.
    if (award.kind === "oscars") {
      const complete = e.status === "loaded";
      for (const c of award.categories) {
        const rows = e.results.filter((r) => r.category === c.slug);
        const nominees = rows.filter((r) => NOMINEE.has(r.outcome)).length;
        const winners = rows.filter((r) => r.outcome === "won").length;
        if (winners > 1) errors.push(`${where}: ${c.slug} has ${winners} winners`);
        if (!complete) continue;
        if (e.nominationsOn && e.nominationsOn <= today) {
          const [min, max] = oscarNomineeRange(c.slug, e.year);
          if (nominees < min || nominees > max) {
            errors.push(`${where}: ${c.slug} has ${nominees} nominees, expected ${min === max ? min : `${min}–${max}`}`);
          }
        }
        if (e.winnersOn && e.winnersOn <= today && winners !== 1) {
          errors.push(`${where}: ${c.slug} has ${winners} winners, expected 1 (the ceremony was ${e.winnersOn})`);
        }
      }
    }
  }

  for (const m of data.marks ?? []) {
    const key = m.imdb ?? m.wd;
    if (!(m.imdb && movieOf.has(m.imdb)) && !(m.wd && movieOf.has(m.wd))) {
      warnings.push(`marks.json: ${key}${m.title ? ` (${m.title})` : ""} is in no movie file`);
    }
  }

  return { errors, warnings };
}

/** Counts for the summary line. */
export function dataSummary(data: DataSet): string {
  const films = data.movies.reduce((n, m) => n + Object.keys(m.file).length, 0);
  const results = data.editions.reduce((n, e) => n + e.edition.results.length, 0);
  const screenings = data.editions.reduce((n, e) => n + e.edition.screenings.length, 0);
  return `${data.awards.length} awards, ${data.editions.length} editions, ${films} films, ${results} results${screenings > 0 ? `, ${screenings} screenings` : ""}`;
}
