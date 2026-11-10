// Owner-data backup: marks, Watch list notes and every app-created film. Restore plans
// missing films and changed marks, then writes them together. Unmentioned data stays put.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { ScriptDb } from "../../src/db";
import { marks, movies } from "../../src/db/schema";
import { marksFileSchema, type MarkEntry, type MarksFile, type MovieSnapshot } from "../../src/lib/data-files";

/** A script client or a transaction on one. */
export type Db = Pick<ScriptDb, "select" | "insert" | "transaction">;

/** A film's whole row in `marks`, less its time. */
export type MarkState = {
  watched: boolean;
  want: boolean;
  wantRank: number | null;
  releaseOn: string | null;
  platform: string | null;
};
export type Film = {
  id: number;
  slug: string;
  imdbId: string | null;
  wikidataId: string | null;
  tmdbId: number | null;
  localId: string | null;
  title: string;
  year: number;
};
export type CurrentMark = MarkState & { movieId: number };

export type PlannedWrite = {
  kind: "insert" | "update";
  film: Film;
  from: MarkState | null;
  to: MarkState & { updatedAt?: string };
};

export type RestorePlan = {
  /** Retained so apply can resolve every requested identity again inside its transaction. */
  entries: MarksFile;
  creates: Array<{ movie: MovieSnapshot; to: MarkState & { updatedAt?: string } }>;
  writes: PlannedWrite[];
  unchanged: number;
  /** File entries that can't be restored: no such film, or two entries for one film. */
  problems: string[];
  /** Films marked in the database that the file doesn't mention; restore leaves them. */
  notInFile: Array<{ film: Film; mark: MarkState }>;
};

const NONE: MarkState = { watched: false, want: false, wantRank: null, releaseOn: null, platform: null };
const sameMark = (a: MarkState, b: MarkState) =>
  a.watched === b.watched &&
  a.want === b.want &&
  a.wantRank === b.wantRank &&
  a.releaseOn === b.releaseOn &&
  a.platform === b.platform;
/** A row worth keeping in the backup: a mark, or release notes (kept when a film is unwanted). */
const isKept = (m: MarkState) => m.watched || m.want || m.releaseOn !== null || m.platform !== null;
const entryId = (m: Pick<MarkEntry, "imdb" | "wd" | "tmdb" | "localId">) =>
  m.imdb ?? m.wd ?? (m.tmdb === undefined ? `local:${m.localId}` : `tmdb:${m.tmdb}`);
const identityOf = (f: Pick<Film, "imdbId" | "wikidataId" | "tmdbId" | "localId">) => ({
  ...(f.imdbId ? { imdb: f.imdbId } : {}),
  ...(f.wikidataId ? { wd: f.wikidataId } : {}),
  ...(f.tmdbId ? { tmdb: f.tmdbId } : {}),
  ...(f.localId ? { localId: f.localId } : {}),
});
const identityColumns = { imdb: "imdbId", wd: "wikidataId", tmdb: "tmdbId", localId: "localId" } as const;
const stateOf = ({ watched, want, wantRank, releaseOn, platform }: MarkState): MarkState => ({
  watched,
  want,
  wantRank,
  releaseOn,
  platform,
});

/**
 * The row an entry asks for, given the film's row now. A Watch list field the entry leaves out
 * (an older file) keeps its value, except that a film that isn't wanted has no rank.
 */
export function targetState(entry: MarkEntry, now: MarkState): MarkState {
  const keptRank = now.want ? now.wantRank : null;
  return {
    watched: entry.watched,
    want: entry.want,
    wantRank: entry.want ? (entry.wantRank === undefined ? keptRank : entry.wantRank) : null,
    releaseOn: entry.releaseOn === undefined ? now.releaseOn : entry.releaseOn,
    platform: entry.platform === undefined ? now.platform : entry.platform,
  };
}

export function markLabel(m: MarkState): string {
  const parts = [m.watched ? "watched" : m.want ? `want${m.wantRank === null ? "" : ` #${m.wantRank}`}` : "none"];
  if (m.releaseOn !== null || m.platform !== null) parts.push(`${m.releaseOn ?? "TBD"} · ${m.platform ?? "no platform"}`);
  return parts.join(", ");
}

export function filmLabel(f: Film): string {
  return `${f.title} (${f.year}, ${entryId(identityOf(f))})`;
}

/**
 * What restoring `entries` would write, given the films they might name and the marks in the
 * database now. All supplied identities must agree. A missing film needs a valid local-film
 * snapshot; a matching film keeps its current metadata and stable slug.
 */
export function planRestore(entries: MarksFile, films: Film[], current: CurrentMark[]): RestorePlan {
  const plan: RestorePlan = { entries: [], creates: [], writes: [], unchanged: 0, problems: [], notInFile: [] };
  const parsed = marksFileSchema.safeParse(entries);
  if (!parsed.success) {
    plan.problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    return plan;
  }
  plan.entries = parsed.data;
  const byIdentity = new Map<string, Film>();
  for (const film of films) {
    for (const [key, value] of Object.entries(identityOf(film))) byIdentity.set(`${key}:${value}`, film);
  }
  const bySlug = new Map(films.map((f) => [f.slug, f]));
  const createdSlugs = new Set<string>();
  const markOf = new Map(current.map((m) => [m.movieId, m]));
  const claimed = new Map<number, string>();

  for (const entry of parsed.data) {
    const matches = new Map<number, Film>();
    for (const key of Object.keys(identityColumns) as Array<keyof typeof identityColumns>) {
      const match = entry[key] === undefined ? undefined : byIdentity.get(`${key}:${entry[key]}`);
      if (match) matches.set(match.id, match);
    }
    const id = entryId(entry);
    const film = matches.values().next().value;
    if (matches.size > 1 || (film && Object.entries(identityColumns).some(([key, column]) => {
      const value = entry[key as keyof typeof identityColumns];
      return value !== undefined && film[column] !== null && value !== film[column];
    }))) {
      plan.problems.push(`${id}: conflicting film identities. Nothing was written.`);
      continue;
    }
    if (entry.movie) {
      const slugOwner = bySlug.get(entry.movie.slug);
      if ((slugOwner && slugOwner.id !== film?.id) || createdSlugs.has(entry.movie.slug) ||
          (film && (film.slug !== entry.movie.slug || film.localId !== entry.localId))) {
        plan.problems.push(`${id}: conflicting stable slug or local identity (${entry.movie.slug}).`);
        continue;
      }
    }
    if (!film) {
      if (entry.movie) {
        plan.creates.push({ movie: entry.movie, to: { ...targetState(entry, NONE), updatedAt: entry.updatedAt } });
        createdSlugs.add(entry.movie.slug);
      } else {
        const ids = [entry.imdb, entry.wd, entry.tmdb === undefined ? undefined : `tmdb:${entry.tmdb}`, entry.localId].filter(Boolean).join(", ");
        plan.problems.push(`${entry.title ? `${entry.title} (${ids})` : ids}: no such film in the database.`);
      }
      continue;
    }
    const other = claimed.get(film.id);
    if (other) {
      plan.problems.push(`${id} and ${other} are the same film, ${filmLabel(film)}.`);
      continue;
    }
    claimed.set(film.id, id);

    const now = markOf.get(film.id);
    const to = { ...targetState(entry, now ?? NONE), updatedAt: entry.updatedAt };
    if (sameMark(now ?? NONE, to)) {
      plan.unchanged += 1;
    } else if (now) {
      plan.writes.push({ kind: "update", film, from: stateOf(now), to });
    } else {
      plan.writes.push({ kind: "insert", film, from: null, to });
    }
  }

  const filmById = new Map(films.map((f) => [f.id, f]));
  for (const m of current) {
    if (!claimed.has(m.movieId) && isKept(m)) {
      const film = filmById.get(m.movieId);
      if (film) plan.notInFile.push({ film, mark: stateOf(m) });
    }
  }
  return plan;
}

export function formatPlan(plan: RestorePlan, heading: string): string {
  const markCount = plan.writes.length + plan.creates.filter((c) => isKept(c.to)).length;
  const lines = [`${heading}: ${markCount} marks to write, ${plan.creates.length} films to recreate, ${plan.unchanged} unchanged.`];
  for (const c of plan.creates) {
    lines.push(`  create  ${c.movie.title} (${c.movie.year}, ${c.movie.localId}), /movies/${c.movie.slug}: ${markLabel(c.to)}`);
  }
  for (const w of plan.writes) {
    const change = w.from ? `${markLabel(w.from)} → ${markLabel(w.to)}` : markLabel(w.to);
    lines.push(`  ${w.kind.padEnd(6)}  ${filmLabel(w.film)}: ${change}`);
  }
  if (plan.notInFile.length > 0) {
    lines.push(`Marked in the database but not in the file (left as they are): ${plan.notInFile.length}`);
    for (const n of plan.notInFile) lines.push(`  keep    ${filmLabel(n.film)}: ${markLabel(n.mark)}`);
  }
  if (plan.problems.length > 0) {
    lines.push(`Can't restore ${plan.problems.length} entr${plan.problems.length === 1 ? "y" : "ies"}:`);
    for (const p of plan.problems) lines.push(`  ${p}`);
  }
  return lines.join("\n");
}

const filmColumns = {
  id: movies.id,
  slug: movies.slug,
  imdbId: movies.imdbId,
  wikidataId: movies.wikidataId,
  tmdbId: movies.tmdbId,
  localId: movies.localId,
  title: movies.title,
  year: movies.year,
};

const markColumns = {
  watched: marks.watched,
  want: marks.want,
  wantRank: marks.wantRank,
  releaseOn: marks.releaseOn,
  platform: marks.platform,
};

/**
 * Every app-created film, plus ordinary films with marks or notes. A left join includes
 * local films that have never had a mark row. Stable identities keep diffs small.
 */
export async function exportMarks(db: Db): Promise<MarksFile> {
  const rows = await db
    .select({
      ...filmColumns, ...markColumns, updatedAt: marks.updatedAt,
      originalTitle: movies.originalTitle, originalLang: movies.originalLang,
      countries: movies.countries, language: movies.language,
    })
    .from(movies)
    .leftJoin(marks, eq(movies.id, marks.movieId))
    .where(or(isNotNull(movies.localId), eq(marks.watched, true), eq(marks.want, true), isNotNull(marks.releaseOn), isNotNull(marks.platform)));
  return marksFileSchema.parse(rows
    .map((r) => ({
      ...identityOf(r),
      ...(r.localId ? { movie: {
        ...identityOf(r), localId: r.localId, slug: r.slug, title: r.title, year: r.year, countries: r.countries,
        ...(r.originalTitle === null ? {} : { originalTitle: r.originalTitle }),
        ...(r.originalLang === null ? {} : { originalLang: r.originalLang }),
        ...(r.language === null ? {} : { language: r.language }),
      } } : {}),
      title: r.title,
      year: r.year,
      watched: r.watched ?? false,
      want: r.want ?? false,
      wantRank: r.wantRank,
      releaseOn: r.releaseOn,
      platform: r.platform,
      ...(r.updatedAt ? { updatedAt: r.updatedAt.toISOString() } : {}),
    }))
    .sort((a, b) => entryId(a).localeCompare(entryId(b))));
}

/** The file as JSON, one film per line. */
export function serializeMarks(file: MarksFile): string {
  if (file.length === 0) return "[]\n";
  return `[\n${file.map((m) => `  ${JSON.stringify(m)}`).join(",\n")}\n]\n`;
}

/** The committed production backup; a test export must never write it. */
export const PRODUCTION_MARKS_FILE = "data/marks.json";

/**
 * Why an export must not overwrite its file, or null when it may. `previous` is the file's
 * entry count (null when there's no valid file). Fewer marked films than the file holds usually
 * means the database lost marks, and the file may be the only copy left: that needs
 * `--allow-shrink` (docs/runbook.md).
 */
export function exportProblem(opts: {
  target: "test" | "production";
  file: string;
  previous: number | null;
  next: number;
  allowShrink: boolean;
}): string | null {
  const { target, file, previous, next, allowShrink } = opts;
  if (target === "test" && normalize(file) === PRODUCTION_MARKS_FILE) {
    return `A test export can't write ${PRODUCTION_MARKS_FILE}, the production backup.`;
  }
  if (previous !== null && next < previous && !allowShrink) {
    return (
      `${file} has ${previous} backed-up films and ${target} has only ${next}. The file was kept as it is. ` +
      "If films or marks were removed on purpose, run the export again with --allow-shrink."
    );
  }
  return null;
}

/** A path relative to the project folder, with forward slashes (`./data//marks.json` → `data/marks.json`). */
function normalize(file: string): string {
  return relative(process.cwd(), resolve(file)).split("\\").join("/");
}

/** Reads and validates a marks file; stops with every problem when it isn't valid. */
export function readMarksFile(path: string): MarksFile {
  if (!existsSync(path)) throw new Error(`${path} doesn't exist. Nothing was written.`);
  const parsed = marksFileSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "file"}: ${i.message}`);
    throw new Error(`${path} isn't a valid marks file. Nothing was written.\n- ${issues.join("\n- ")}`);
  }
  return parsed.data;
}

/**
 * Exports marks, notes and app-created films to `file` (also used before a production
 * load). Stops, keeping the file, when `exportProblem` finds one. Writes a temporary file and
 * renames it, so a crash never leaves the backup half-written. Returns the line to print.
 */
export async function exportMarksToFile(
  db: Db,
  opts: { target: "test" | "production"; file: string; allowShrink: boolean },
): Promise<string> {
  const { target, file, allowShrink } = opts;
  const protectedFile = exportProblem({ target, file, previous: null, next: 0, allowShrink });
  if (protectedFile) throw new Error(protectedFile);
  const previous = existsSync(file) ? readMarksFile(file).length : null;
  const entries = await exportMarks(db);
  const problem = exportProblem({ target, file, previous, next: entries.length, allowShrink });
  if (problem) throw new Error(problem);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, serializeMarks(entries));
  renameSync(`${file}.tmp`, file);
  const was = previous === null ? "" : ` (the file had ${previous} before)`;
  return `Exported ${entries.length} films with marks, notes or local snapshots from ${target} to ${file}${was}.`;
}

/** Reads what restore needs from the database and plans it (no writes). */
export async function loadRestorePlan(db: Db, entries: MarksFile): Promise<RestorePlan> {
  // Validate snapshots before any database work, including programmatic callers.
  entries = marksFileSchema.parse(entries);
  const imdbIds = entries.flatMap((m) => (m.imdb ? [m.imdb] : []));
  const wdIds = entries.flatMap((m) => (m.wd ? [m.wd] : []));
  const tmdbIds = entries.flatMap((m) => (m.tmdb ? [m.tmdb] : []));
  const localIds = entries.flatMap((m) => (m.localId ? [m.localId] : []));
  const slugs = entries.flatMap((m) => (m.movie ? [m.movie.slug] : []));
  const current = await db.select({ movieId: marks.movieId, ...markColumns }).from(marks);
  const markedIds = current.map((m) => m.movieId);
  const conditions = [
    imdbIds.length > 0 ? inArray(movies.imdbId, imdbIds) : undefined,
    wdIds.length > 0 ? inArray(movies.wikidataId, wdIds) : undefined,
    tmdbIds.length > 0 ? inArray(movies.tmdbId, tmdbIds) : undefined,
    localIds.length > 0 ? inArray(movies.localId, localIds) : undefined,
    slugs.length > 0 ? inArray(movies.slug, slugs) : undefined,
    markedIds.length > 0 ? inArray(movies.id, markedIds) : undefined,
  ].filter((c) => c !== undefined);
  const films = conditions.length > 0 ? await db.select(filmColumns).from(movies).where(or(...conditions)) : [];
  return planRestore(entries, films, current);
}

/**
 * Writes the plan in one transaction. Refuses a plan with problems, and a plan that's out of
 * date: if any planned film's mark changed after the plan was made (a tap on the live site
 * during a restore), nothing is written and the dry run has to be read again.
 */
export async function applyRestore(db: Db, plan: RestorePlan): Promise<number> {
  if (plan.problems.length > 0) {
    throw new Error("The plan has entries that can't be restored. Fix the file first; nothing was written.");
  }
  if (plan.writes.length === 0 && plan.creates.length === 0) return 0;
  const createdMarks = plan.creates.filter((c) => isKept(c.to)).length;
  await db.transaction(async (tx) => {
    // A film may have appeared since dry run. Recheck before writing; uniqueness constraints
    // also roll back the transaction if a concurrent insert wins after this read.
    const recheck = await loadRestorePlan(tx, plan.entries);
    if (recheck.problems.length > 0 || recheck.creates.length !== plan.creates.length) {
      throw new Error("Films changed since the plan was made. Nothing was written; run the dry run again.");
    }
    const ids = plan.writes.map((w) => w.film.id);
    const filmRows = ids.length > 0 ? await tx.select(filmColumns).from(movies).where(inArray(movies.id, ids)).for("update") : [];
    if (plan.writes.some((w) => {
      const film = filmRows.find((f) => f.id === w.film.id);
      return !film || film.slug !== w.film.slug || Object.values(identityColumns).some((key) => film[key] !== w.film[key]);
    })) {
      throw new Error("Film identities changed since the plan was made. Nothing was written; run the dry run again.");
    }
    const rows = ids.length > 0 ? await tx
      .select({ movieId: marks.movieId, ...markColumns })
      .from(marks)
      .where(inArray(marks.movieId, ids))
      .for("update") : [];
    const now = new Map(rows.map((r) => [r.movieId, r]));
    const moved = plan.writes.filter((w) => {
      const row = now.get(w.film.id);
      return w.from === null ? row !== undefined : row === undefined || !sameMark(row, w.from);
    });
    if (moved.length > 0) {
      throw new Error(
        `Marks changed since the plan was made: ${moved.map((w) => filmLabel(w.film)).join(", ")}. ` +
          "Nothing was written; run the dry run again.",
      );
    }
    const valuesOf = (to: MarkState & { updatedAt?: string }) => ({
      ...stateOf(to), updatedAt: to.updatedAt ? new Date(to.updatedAt) : new Date(),
    });
    for (const { movie, to } of plan.creates) {
      const [film] = await tx.insert(movies).values({
        slug: movie.slug, title: movie.title, year: movie.year, countries: movie.countries,
        originalTitle: movie.originalTitle ?? null, originalLang: movie.originalLang ?? null, language: movie.language ?? null,
        imdbId: movie.imdb ?? null, wikidataId: movie.wd ?? null, tmdbId: movie.tmdb ?? null, localId: movie.localId,
      }).returning({ id: movies.id });
      if (isKept(to)) await tx.insert(marks).values({ movieId: film.id, ...valuesOf(to) });
    }
    for (const w of plan.writes) {
      const values = valuesOf(w.to);
      if (w.from === null) {
        // No row to lock when the plan was checked: a tap could have added one since. Never
        // overwrite it; stop, and the whole restore rolls back (1.R).
        const added = await tx
          .insert(marks)
          .values({ movieId: w.film.id, ...values })
          .onConflictDoNothing({ target: marks.movieId })
          .returning({ movieId: marks.movieId });
        if (added.length === 0) {
          throw new Error(`Marks changed since the plan was made: ${filmLabel(w.film)}. Nothing was written; run the dry run again.`);
        }
      } else {
        await tx.update(marks).set(values).where(eq(marks.movieId, w.film.id));
      }
    }
    // The file's ranks can collide with films it leaves alone (a backup older than the order
    // now): number every wanted film 1…n again, the more recently marked first on a tie (7.R).
    if (plan.writes.length + createdMarks > 0) await tx.execute(sql`
      update marks set want_rank = r.rank
      from (
        select movie_id, row_number() over (order by want_rank nulls last, updated_at desc, movie_id) as rank
        from marks where want
      ) r
      where marks.movie_id = r.movie_id and marks.want_rank is distinct from r.rank`);
  });
  return plan.writes.length + createdMarks;
}
