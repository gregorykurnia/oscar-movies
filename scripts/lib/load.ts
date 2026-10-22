// The loader (IMPLEMENTATION_PLAN.md §3.5): the data files are the source, the database follows
// them. A load validates every file (the `data:check` rules), plans every write by diffing the
// files against the database, prints the plan, and applies it in one transaction. A second run
// plans nothing. It never deletes a movie, an award or a category, never writes the marks, and
// deletes only results and screenings that an edition in the files no longer lists. On
// `production` it exports the marks first and stops if that fails.
import { execFileSync } from "node:child_process";
import { inArray } from "drizzle-orm";
import type { ScriptDb } from "../../src/db";
import type { DbBranch } from "../../src/db/meta";
import { awardCategories, awards, dataLoads, editions, movies, results, screenings } from "../../src/db/schema";
import { IMDB_ID, refKey } from "../../src/lib/data-files";
import { checkData, type DataSet } from "./data-check";

/** A script client or a transaction on one. */
export type Db = Pick<ScriptDb, "select" | "insert" | "update" | "delete" | "transaction">;
type Tx = Parameters<Parameters<ScriptDb["transaction"]>[0]>[0];

type AwardRow = Omit<typeof awards.$inferInsert, "id">;
type CategoryRow = Omit<typeof awardCategories.$inferInsert, "id" | "awardId">;
type MovieRow = Pick<
  typeof movies.$inferInsert,
  "slug" | "title" | "originalTitle" | "originalLang" | "year" | "countries" | "language" | "imdbId" | "wikidataId" | "tmdbId"
>;
type EditionRow = Omit<typeof editions.$inferInsert, "id" | "awardId" | "year">;
type ResultRow = Pick<typeof results.$inferInsert, "outcome" | "country">;
type ScreeningRow = Pick<typeof screenings.$inferInsert, "sectionOrder" | "prize">;

export type Change = { field: string; from: unknown; to: unknown };
export type Update<T> = { id: number; label: string; set: Partial<T>; changes: Change[] };
export type Delete = { id: number; label: string };

/** A result or screening, named by its edition, category or section, and film. */
type ChildKey = { award: string; year: number; movie: string; label: string };

export type LoadPlan = {
  awards: { inserts: AwardRow[]; updates: Update<AwardRow>[] };
  categories: { inserts: Array<CategoryRow & { award: string }>; updates: Update<CategoryRow>[] };
  movies: { inserts: Array<MovieRow & { key: string }>; updates: Update<MovieRow>[] };
  editions: { inserts: Array<EditionRow & { award: string; year: number }>; updates: Update<EditionRow>[] };
  results: {
    inserts: Array<ResultRow & ChildKey & { category: string }>;
    updates: Update<ResultRow>[];
    deletes: Delete[];
  };
  screenings: {
    inserts: Array<ScreeningRow & ChildKey & { section: string }>;
    updates: Update<ScreeningRow>[];
    deletes: Delete[];
  };
  /** The editions the files hold (after `--only`), as `award/year`. */
  editionKeys: string[];
  /** Why the plan can't be applied (a slug that would change, an ID two films would share). */
  problems: string[];
};

/** What the plan reads from the database. */
export type DbState = {
  awards: Array<AwardRow & { id: number }>;
  categories: Array<CategoryRow & { id: number; awardId: number }>;
  movies: Array<MovieRow & { id: number }>;
  editions: Array<EditionRow & { id: number; awardId: number; year: number }>;
  results: Array<ResultRow & { id: number; editionId: number; categoryId: number; movieId: number }>;
  screenings: Array<ScreeningRow & { id: number; editionId: number; movieId: number; section: string }>;
};

// ---------------------------------------------------------------------------------------------
// Planning (pure, so its rules are unit tested).

/** Compares as the database stores it: a missing optional value is null. */
const norm = (v: unknown) => (v === undefined ? null : v);
const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));

function diff<T extends object>(current: T, wanted: T): { set: Partial<T>; changes: Change[] } {
  const set: Partial<T> = {};
  const changes: Change[] = [];
  for (const field of Object.keys(wanted) as Array<keyof T & string>) {
    if (!same(current[field], wanted[field])) {
      set[field] = wanted[field];
      changes.push({ field, from: norm(current[field]), to: norm(wanted[field]) });
    }
  }
  return { set, changes };
}

function movieRow(key: string, year: number, m: DataSet["movies"][number]["file"][string]): MovieRow {
  const isImdb = IMDB_ID.test(key);
  return {
    slug: m.slug,
    title: m.title,
    originalTitle: m.originalTitle ?? null,
    originalLang: m.originalLang ?? null,
    year,
    countries: m.countries,
    language: m.language ?? null,
    imdbId: isImdb ? key : null,
    wikidataId: isImdb ? (m.wd ?? null) : key,
    tmdbId: m.tmdb ?? null,
  };
}

/** Narrows the files to one award (`--only`). Movie facts always load: every award shares them. */
export function selectAward(data: DataSet, only: string | undefined): DataSet {
  if (only === undefined) return data;
  if (!data.awards.some((a) => a.slug === only)) {
    throw new Error(`--only ${only}: there is no award "${only}" in data/awards.json. Nothing was written.`);
  }
  return {
    ...data,
    awards: data.awards.filter((a) => a.slug === only),
    editions: data.editions.filter((e) => e.edition.award === only),
  };
}

/**
 * Every write that makes the database match the files. Rows the files don't mention are left
 * as they are, except the results and screenings of an edition the files hold.
 */
export function planLoad(data: DataSet, db: DbState): LoadPlan {
  const plan: LoadPlan = {
    awards: { inserts: [], updates: [] },
    categories: { inserts: [], updates: [] },
    movies: { inserts: [], updates: [] },
    editions: { inserts: [], updates: [] },
    results: { inserts: [], updates: [], deletes: [] },
    screenings: { inserts: [], updates: [], deletes: [] },
    editionKeys: data.editions.map((e) => `${e.edition.award}/${e.edition.year}`),
    problems: [],
  };

  // Awards and their categories, by slug.
  const awardBySlug = new Map(db.awards.map((a) => [a.slug, a]));
  const awardSlugById = new Map(db.awards.map((a) => [a.id, a.slug]));
  const categoryByKey = new Map(db.categories.map((c) => [`${c.awardId}/${c.slug}`, c]));
  const categorySlugById = new Map(db.categories.map((c) => [c.id, c.slug]));
  for (const { categories, ...entry } of data.awards) {
    const wanted: AwardRow = { ...entry, url: entry.url ?? null };
    const current = awardBySlug.get(entry.slug);
    if (!current) plan.awards.inserts.push(wanted);
    else {
      const { set, changes } = diff<AwardRow>(current, wanted);
      if (changes.length > 0) plan.awards.updates.push({ id: current.id, label: `award ${entry.slug}`, set, changes });
    }
    for (const c of categories) {
      const row: CategoryRow = { ...c, loose: c.loose ?? false, mappingNote: c.mappingNote ?? null };
      const existing = current && categoryByKey.get(`${current.id}/${c.slug}`);
      if (!existing) plan.categories.inserts.push({ ...row, award: entry.slug });
      else {
        const { set, changes } = diff<CategoryRow>(existing, row);
        if (changes.length > 0) {
          plan.categories.updates.push({ id: existing.id, label: `category ${entry.slug}/${c.slug}`, set, changes });
        }
      }
    }
  }

  // Movies, by IMDb ID, then by QID (a film filed by QID that later got an IMDb ID).
  const byImdb = new Map(db.movies.filter((m) => m.imdbId).map((m) => [m.imdbId as string, m]));
  const byWd = new Map(db.movies.filter((m) => m.wikidataId).map((m) => [m.wikidataId as string, m]));
  const keyOfMovieId = new Map<number, string>();
  const fileKeyOf = new Map<string, string>(); // file key or QID → the key the film is filed under
  const finalRows = new Map<number | string, MovieRow>(db.movies.map((m) => [m.id, m]));
  for (const { year, file } of data.movies) {
    for (const [key, entry] of Object.entries(file)) {
      fileKeyOf.set(key, key);
      if (entry.wd) fileKeyOf.set(entry.wd, key);
      const wanted = movieRow(key, year, entry);
      const current =
        (wanted.imdbId ? byImdb.get(wanted.imdbId) : undefined) ?? (wanted.wikidataId ? byWd.get(wanted.wikidataId) : undefined);
      const label = `movie ${key} (${entry.title})`;
      if (!current) {
        plan.movies.inserts.push({ ...wanted, key });
        finalRows.set(key, wanted);
        continue;
      }
      if (keyOfMovieId.has(current.id)) {
        plan.problems.push(`${label} and ${keyOfMovieId.get(current.id)} are the same film in the database (id ${current.id}).`);
        continue;
      }
      keyOfMovieId.set(current.id, key);
      finalRows.set(current.id, wanted);
      const { set, changes } = diff<MovieRow>(current, wanted);
      if (set.slug !== undefined) {
        plan.problems.push(`${label}: its slug would change from "${current.slug}" to "${wanted.slug}" (slugs never change).`);
      }
      if (current.imdbId && wanted.imdbId !== current.imdbId) {
        plan.problems.push(`${label}: the database has it as ${current.imdbId}; fix the film's IDs by hand.`);
      }
      if (changes.length > 0) plan.movies.updates.push({ id: current.id, label, set, changes });
    }
  }
  // Unique columns after the load: two films may not share one.
  for (const field of ["slug", "imdbId", "wikidataId", "tmdbId"] as const) {
    const owners = new Map<unknown, string>();
    for (const [id, row] of finalRows) {
      const value = row[field];
      if (value === null || value === undefined) continue;
      const name = typeof id === "string" ? id : (keyOfMovieId.get(id) ?? `the film with id ${id}`);
      const other = owners.get(value);
      if (other !== undefined) plan.problems.push(`${other} and ${name} would share ${field} ${JSON.stringify(value)}.`);
      owners.set(value, name);
    }
  }
  const movieKeyOf = (movieId: number) => keyOfMovieId.get(movieId) ?? `#${movieId}`;

  const titleOf = new Map<string, string>();
  for (const { file } of data.movies) for (const [key, m] of Object.entries(file)) titleOf.set(key, m.title);
  const filmName = (movie: string, title: string) => `${title} (${movie})`;

  // Editions, by award and year; then their results and screenings.
  const editionByKey = new Map(db.editions.map((e) => [`${awardSlugById.get(e.awardId)}/${e.year}`, e]));
  for (const { edition: e } of data.editions) {
    const where = `${e.award} ${e.year}`;
    const wanted: EditionRow = {
      ordinal: e.ordinal ?? null,
      status: e.status,
      shortlistOn: e.shortlistOn ?? null,
      nominationsOn: e.nominationsOn ?? null,
      winnersOn: e.winnersOn ?? null,
      sourceUrls: e.sourceUrls,
      note: e.note ?? null,
    };
    const current = editionByKey.get(`${e.award}/${e.year}`);
    if (!current) plan.editions.inserts.push({ ...wanted, award: e.award, year: e.year });
    else {
      const { set, changes } = diff<EditionRow>(current, wanted);
      if (changes.length > 0) plan.editions.updates.push({ id: current.id, label: `edition ${where}`, set, changes });
    }

    // Results, by category and film.
    const existingResults = new Map(
      (current ? db.results.filter((r) => r.editionId === current.id) : []).map((r) => [
        `${categorySlugById.get(r.categoryId)}/${movieKeyOf(r.movieId)}`,
        r,
      ]),
    );
    for (const r of e.results) {
      const movie = fileKeyOf.get(refKey(r) as string) as string;
      const row: ResultRow = { outcome: r.outcome, country: r.country ?? null };
      const label = `result ${where} ${r.category}: ${filmName(movie, r.title)}`;
      const existing = existingResults.get(`${r.category}/${movie}`);
      existingResults.delete(`${r.category}/${movie}`);
      if (!existing) plan.results.inserts.push({ ...row, award: e.award, year: e.year, category: r.category, movie, label });
      else {
        const { set, changes } = diff<ResultRow>(existing, row);
        if (changes.length > 0) plan.results.updates.push({ id: existing.id, label, set, changes });
      }
    }
    for (const [key, r] of existingResults) {
      const [category, movie] = key.split("/");
      const name = filmName(movie, titleOf.get(movie) ?? "a film not in the files");
      plan.results.deletes.push({ id: r.id, label: `result ${where} ${category}: ${name}, ${r.outcome}` });
    }

    // Screenings, by section and film.
    const existingScreenings = new Map(
      (current ? db.screenings.filter((s) => s.editionId === current.id) : []).map((s) => [
        `${s.section}\u0000${movieKeyOf(s.movieId)}`,
        s,
      ]),
    );
    for (const s of e.screenings) {
      const movie = fileKeyOf.get(refKey(s) as string) as string;
      const row: ScreeningRow = { sectionOrder: s.sectionOrder ?? 0, prize: s.prize ?? null };
      const label = `screening ${where} ${s.section}: ${filmName(movie, s.title)}`;
      const existing = existingScreenings.get(`${s.section}\u0000${movie}`);
      existingScreenings.delete(`${s.section}\u0000${movie}`);
      if (!existing) plan.screenings.inserts.push({ ...row, award: e.award, year: e.year, section: s.section, movie, label });
      else {
        const { set, changes } = diff<ScreeningRow>(existing, row);
        if (changes.length > 0) plan.screenings.updates.push({ id: existing.id, label, set, changes });
      }
    }
    for (const [key, s] of existingScreenings) {
      const [section, movie] = key.split("\u0000");
      const name = filmName(movie, titleOf.get(movie) ?? "a film not in the files");
      plan.screenings.deletes.push({ id: s.id, label: `screening ${where} ${section}: ${name}` });
    }
  }
  return plan;
}

export function planSize(plan: LoadPlan): number {
  const tables = [plan.awards, plan.categories, plan.movies, plan.editions, plan.results, plan.screenings];
  return tables.reduce((n, t) => n + t.inserts.length + t.updates.length + ("deletes" in t ? t.deletes.length : 0), 0);
}

/** Counts per table, for the summary line and the `data_loads` row. */
export function planCounts(plan: LoadPlan) {
  const count = (t: { inserts: unknown[]; updates: unknown[]; deletes?: unknown[] }) => ({
    insert: t.inserts.length,
    update: t.updates.length,
    ...(t.deletes ? { delete: t.deletes.length } : {}),
  });
  return {
    awards: count(plan.awards),
    categories: count(plan.categories),
    movies: count(plan.movies),
    editions: count(plan.editions),
    results: count(plan.results),
    screenings: count(plan.screenings),
  };
}

const show = (v: unknown) => JSON.stringify(v);

/** The plan as text: counts per table and per edition, then every change to an existing row. */
export function formatLoadPlan(plan: LoadPlan, heading: string): string {
  const total = planSize(plan);
  const lines = [`${heading}: ${total === 0 ? "nothing to write" : `${total} writes`}.`];
  const c = planCounts(plan);
  const tally = (t: { insert: number; update: number; delete?: number }) =>
    [`${t.insert} new`, `${t.update} changed`, ...(t.delete !== undefined ? [`${t.delete} removed`] : [])].join(", ");
  lines.push(`  awards: ${tally(c.awards)}`, `  categories: ${tally(c.categories)}`, `  movies: ${tally(c.movies)}`);

  // Per edition (award and year), only the ones with writes.
  const editionLabel = new Map<string, string>();
  for (const e of plan.editions.inserts) editionLabel.set(`${e.award} ${e.year}`, "new edition");
  for (const u of plan.editions.updates) editionLabel.set(u.label.replace(/^edition /, ""), "edition changed");
  const perEdition = new Map<string, { r: number[]; s: number[] }>();
  const bump = (where: string, kind: "r" | "s", i: number) => {
    const entry = perEdition.get(where) ?? { r: [0, 0, 0], s: [0, 0, 0] };
    entry[kind][i] += 1;
    perEdition.set(where, entry);
  };
  const whereOf = (label: string) => label.split(" ").slice(1, 3).join(" ");
  plan.results.inserts.forEach((r) => bump(`${r.award} ${r.year}`, "r", 0));
  plan.results.updates.forEach((r) => bump(whereOf(r.label), "r", 1));
  plan.results.deletes.forEach((r) => bump(whereOf(r.label), "r", 2));
  plan.screenings.inserts.forEach((s) => bump(`${s.award} ${s.year}`, "s", 0));
  plan.screenings.updates.forEach((s) => bump(whereOf(s.label), "s", 1));
  plan.screenings.deletes.forEach((s) => bump(whereOf(s.label), "s", 2));
  const editions = [...new Set([...editionLabel.keys(), ...perEdition.keys()])].sort();
  for (const where of editions) {
    const parts = editionLabel.has(where) ? [editionLabel.get(where) as string] : [];
    const counts = perEdition.get(where);
    const three = ([a, b, d]: number[]) => `${a} new, ${b} changed, ${d} removed`;
    if (counts && counts.r.some(Boolean)) parts.push(`results ${three(counts.r)}`);
    if (counts && counts.s.some(Boolean)) parts.push(`screenings ${three(counts.s)}`);
    lines.push(`  ${where}: ${parts.join("; ")}`);
  }

  const updates = [plan.awards, plan.categories, plan.movies, plan.editions, plan.results, plan.screenings].flatMap(
    (t) => t.updates as Update<object>[],
  );
  const deletes = [...plan.results.deletes, ...plan.screenings.deletes];
  if (updates.length + deletes.length > 0) {
    lines.push("Changes to existing rows:");
    for (const u of updates) {
      const what = u.changes.map((ch) => `${ch.field} ${show(ch.from)} → ${show(ch.to)}`).join("; ");
      lines.push(`  update  ${u.label}: ${what}`);
    }
    for (const d of deletes) lines.push(`  delete  ${d.label}`);
  }
  if (plan.problems.length > 0) {
    lines.push(`Can't load (${plan.problems.length}):`);
    for (const p of plan.problems) lines.push(`  ${p}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------------------------
// Reading and writing.

/** The rows the plan compares with: every award, category and movie; the files' editions. */
export async function readDbState(db: Pick<Db, "select">, data: DataSet): Promise<DbState> {
  const [awardRows, categoryRows, movieRows, editionRows] = await Promise.all([
    db.select().from(awards),
    db.select().from(awardCategories),
    db
      .select({
        id: movies.id,
        slug: movies.slug,
        title: movies.title,
        originalTitle: movies.originalTitle,
        originalLang: movies.originalLang,
        year: movies.year,
        countries: movies.countries,
        language: movies.language,
        imdbId: movies.imdbId,
        wikidataId: movies.wikidataId,
        tmdbId: movies.tmdbId,
      })
      .from(movies),
    db.select().from(editions),
  ]);
  const slugOf = new Map(awardRows.map((a) => [a.id, a.slug]));
  const wanted = new Set(data.editions.map((e) => `${e.edition.award}/${e.edition.year}`));
  const ids = editionRows.filter((e) => wanted.has(`${slugOf.get(e.awardId)}/${e.year}`)).map((e) => e.id);
  const [resultRows, screeningRows] =
    ids.length === 0
      ? [[], []]
      : await Promise.all([
          db.select().from(results).where(inArray(results.editionId, ids)),
          db.select().from(screenings).where(inArray(screenings.editionId, ids)),
        ]);
  return {
    awards: awardRows,
    categories: categoryRows,
    movies: movieRows,
    editions: editionRows,
    results: resultRows,
    screenings: screeningRows,
  };
}

/** Writes the plan with `tx`; parents first, so new rows get their ids before children use them. */
async function applyPlan(tx: Tx, plan: LoadPlan, state: DbState): Promise<void> {
  const awardId = new Map(state.awards.map((a) => [a.slug, a.id]));
  for (const row of plan.awards.inserts) {
    const [{ id }] = await tx.insert(awards).values(row).returning({ id: awards.id });
    awardId.set(row.slug, id);
  }
  for (const u of plan.awards.updates) await tx.update(awards).set(u.set).where(inArray(awards.id, [u.id]));

  const awardSlugOf = new Map(state.awards.map((a) => [a.id, a.slug]));
  const categoryId = new Map(state.categories.map((c) => [`${awardSlugOf.get(c.awardId)}/${c.slug}`, c.id]));
  for (const { award, ...row } of plan.categories.inserts) {
    const [{ id }] = await tx
      .insert(awardCategories)
      .values({ ...row, awardId: awardId.get(award) as number })
      .returning({ id: awardCategories.id });
    categoryId.set(`${award}/${row.slug}`, id);
  }
  for (const u of plan.categories.updates) {
    await tx.update(awardCategories).set(u.set).where(inArray(awardCategories.id, [u.id]));
  }

  // Movies by file key (and QID), so results can name them either way.
  const movieId = new Map<string, number>();
  for (const m of state.movies) {
    if (m.imdbId) movieId.set(m.imdbId, m.id);
    if (m.wikidataId) movieId.set(m.wikidataId, m.id);
  }
  for (const u of plan.movies.updates) await tx.update(movies).set(u.set).where(inArray(movies.id, [u.id]));
  for (const u of plan.movies.updates) {
    if (u.set.imdbId) movieId.set(u.set.imdbId, u.id);
    if (u.set.wikidataId) movieId.set(u.set.wikidataId, u.id);
  }
  for (const { key, ...row } of plan.movies.inserts) {
    const [{ id }] = await tx.insert(movies).values(row).returning({ id: movies.id });
    movieId.set(key, id);
  }
  const idOfMovie = (key: string) => {
    const id = movieId.get(key);
    if (id === undefined) throw new Error(`No database row for film ${key}.`);
    return id;
  };

  const editionId = new Map(state.editions.map((e) => [`${awardSlugOf.get(e.awardId)}/${e.year}`, e.id]));
  for (const { award, ...row } of plan.editions.inserts) {
    const [{ id }] = await tx
      .insert(editions)
      .values({ ...row, awardId: awardId.get(award) as number })
      .returning({ id: editions.id });
    editionId.set(`${award}/${row.year}`, id);
  }
  for (const u of plan.editions.updates) await tx.update(editions).set(u.set).where(inArray(editions.id, [u.id]));

  // Removals first, so a film moved between categories or sections never meets its old row.
  const resultDeletes = plan.results.deletes.map((d) => d.id);
  if (resultDeletes.length > 0) await tx.delete(results).where(inArray(results.id, resultDeletes));
  const screeningDeletes = plan.screenings.deletes.map((d) => d.id);
  if (screeningDeletes.length > 0) await tx.delete(screenings).where(inArray(screenings.id, screeningDeletes));
  for (const u of plan.results.updates) await tx.update(results).set(u.set).where(inArray(results.id, [u.id]));
  for (const u of plan.screenings.updates) await tx.update(screenings).set(u.set).where(inArray(screenings.id, [u.id]));

  const resultRows = plan.results.inserts.map((r) => ({
    editionId: editionId.get(`${r.award}/${r.year}`) as number,
    categoryId: categoryId.get(`${r.award}/${r.category}`) as number,
    movieId: idOfMovie(r.movie),
    outcome: r.outcome,
    country: r.country,
  }));
  const screeningRows = plan.screenings.inserts.map((s) => ({
    editionId: editionId.get(`${s.award}/${s.year}`) as number,
    movieId: idOfMovie(s.movie),
    section: s.section,
    sectionOrder: s.sectionOrder,
    prize: s.prize,
  }));
  // In batches, so a full year of International submissions is a handful of statements.
  for (let i = 0; i < resultRows.length; i += 500) await tx.insert(results).values(resultRows.slice(i, i + 500));
  for (let i = 0; i < screeningRows.length; i += 500) await tx.insert(screenings).values(screeningRows.slice(i, i + 500));
}

export type LoadOptions = {
  target: DbBranch;
  dryRun: boolean;
  /** Load one award's editions (`--only <award>`). */
  only?: string;
  /** `YYYY-MM-DD` for the data checks; today by default. */
  today?: string;
  /** Exports the marks; required on production, run before anything else. Returns a line to print. */
  backupMarks?: () => Promise<string>;
  /**
   * Runs inside the load's transaction after the writes: recomputing accuracy and predictions
   * for the affected seasons (tasks 2.5 and 3.2 add them). A throw undoes the whole load.
   */
  afterWrites?: (tx: Tx, plan: LoadPlan) => Promise<void>;
  /** Expires the app's cache after the commit (`APP_URL/api/revalidate`). Returns a line to print. */
  revalidate?: () => Promise<string>;
  gitCommit?: string | null;
  log?: (line: string) => void;
};

export type LoadOutcome = { plan: LoadPlan; written: boolean };

/**
 * One load, in §3.5's order: marks backup (production), checks, plan, then the writes in one
 * transaction, which plans again inside it and stops if the database moved since the printed
 * plan. Throws, with nothing written, on any failure before the commit.
 */
export async function runLoad(db: Db, files: DataSet, opts: LoadOptions): Promise<LoadOutcome> {
  const log = opts.log ?? console.log;

  if (opts.target === "production") {
    if (!opts.backupMarks) throw new Error("A production load exports the marks first. Nothing was written.");
    try {
      log(await opts.backupMarks());
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`The marks export failed, so nothing was loaded.\n${reason}`);
    }
  }

  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const { errors } = checkData(files, { today });
  if (errors.length > 0) {
    throw new Error(`The data files fail the checks (npm run data:check). Nothing was written.\n- ${errors.join("\n- ")}`);
  }
  const data = selectAward(files, opts.only);
  const heading = `Load plan for ${opts.target}${opts.only ? ` (--only ${opts.only})` : ""}`;

  const plan = planLoad(data, await readDbState(db, data));
  const text = formatLoadPlan(plan, heading);
  log(text);
  if (plan.problems.length > 0) throw new Error("The plan has problems (above). Nothing was written.");
  if (opts.dryRun) {
    log("Dry run: nothing was written.");
    return { plan, written: false };
  }
  if (planSize(plan) === 0) return { plan, written: false };

  await db.transaction(async (tx) => {
    const state = await readDbState(tx, data);
    const again = planLoad(data, state);
    if (formatLoadPlan(again, heading) !== text) {
      throw new Error("The database changed after the plan was made. Nothing was written; run the load again.");
    }
    await applyPlan(tx, again, state);
    await opts.afterWrites?.(tx, again);
    await tx.insert(dataLoads).values({
      kind: "awards",
      summary: { target: opts.target, only: opts.only ?? null, editions: plan.editionKeys, counts: planCounts(plan) },
      gitCommit: opts.gitCommit ?? null,
    });
  });
  log(`Loaded ${planSize(plan)} writes in one transaction.`);
  if (opts.revalidate) log(await opts.revalidate());
  return { plan, written: true };
}

// ---------------------------------------------------------------------------------------------
// What the command line passes in.

/** HEAD, with `-dirty` when `data/` has changes that aren't committed. Null outside git. */
export function gitCommit(): string | null {
  try {
    const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "data"], { encoding: "utf8" }).trim();
    return dirty ? `${head}-dirty` : head;
  } catch {
    return null;
  }
}

/** POSTs `APP_URL/api/revalidate` for the award data. A failure is a warning: the load is in. */
export function revalidateAwards(): Promise<string> {
  return revalidateTags(["awards"]);
}

/** POSTs `APP_URL/api/revalidate` for the given tags. Returns a line to print, never throws. */
export async function revalidateTags(tags: ("awards" | "scores")[]): Promise<string> {
  const { APP_URL: appUrl, REVALIDATE_SECRET: secret } = process.env;
  if (!appUrl || !secret) return "Warning: APP_URL or REVALIDATE_SECRET isn't set, so the app's cache wasn't expired.";
  const url = new URL("/api/revalidate", appUrl);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ tags }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return `Warning: ${url} answered ${response.status}, so the app's cache wasn't expired.`;
    return `Expired the app's ${tags.join(" and ")} data at ${url.origin}.`;
  } catch (error) {
    const reason = error instanceof Error ? (error.cause instanceof Error ? error.cause.message : error.message) : String(error);
    return `Warning: couldn't reach ${url.origin} (${reason}), so the app's cache wasn't expired. Pages show the new data once it is.`;
  }
}
