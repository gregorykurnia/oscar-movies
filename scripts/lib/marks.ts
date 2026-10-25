// Marks export and restore (IMPLEMENTATION_PLAN.md §3.5, §10). The marks are the only data
// that exists nowhere else, so the export names films by IMDb ID or QID (it survives any
// reload) and restore writes only the films whose marks differ, after a plan that lists
// every write. Restore never clears a mark that the file doesn't mention. From 7.4 the file
// also carries each film's Watch list order and release notes; a file without them (an older
// backup) leaves them as they are.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { ScriptDb } from "../../src/db";
import { marks, movies } from "../../src/db/schema";
import { marksFileSchema, type MarkEntry, type MarksFile } from "../../src/lib/data-files";

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
export type Film = { id: number; imdbId: string | null; wikidataId: string | null; title: string; year: number };
export type CurrentMark = MarkState & { movieId: number };

export type PlannedWrite = {
  kind: "insert" | "update";
  film: Film;
  from: MarkState | null;
  to: MarkState & { updatedAt?: string };
};

export type RestorePlan = {
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
const entryId = (m: MarkEntry) => (m.imdb ?? m.wd) as string;
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
  return `${f.title} (${f.year}, ${f.imdbId ?? f.wikidataId})`;
}

/**
 * What restoring `entries` would write, given the films they might name and the marks in the
 * database now. Pure, so the rules are unit tested: a film is found by IMDb ID first, then by
 * QID; an entry equal to the film's current marks (no row counts as neither) plans nothing.
 */
export function planRestore(entries: MarksFile, films: Film[], current: CurrentMark[]): RestorePlan {
  const byImdb = new Map(films.filter((f) => f.imdbId).map((f) => [f.imdbId as string, f]));
  const byWd = new Map(films.filter((f) => f.wikidataId).map((f) => [f.wikidataId as string, f]));
  const markOf = new Map(current.map((m) => [m.movieId, m]));
  const plan: RestorePlan = { writes: [], unchanged: 0, problems: [], notInFile: [] };
  const claimed = new Map<number, string>();

  for (const entry of entries) {
    const film = (entry.imdb && byImdb.get(entry.imdb)) || (entry.wd && byWd.get(entry.wd)) || undefined;
    const id = entryId(entry);
    if (!film) {
      const ids = [entry.imdb, entry.wd].filter(Boolean).join(", ");
      plan.problems.push(`${entry.title ? `${entry.title} (${ids})` : ids}: no such film in the database.`);
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
  const lines = [`${heading}: ${plan.writes.length} to write, ${plan.unchanged} unchanged.`];
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
  imdbId: movies.imdbId,
  wikidataId: movies.wikidataId,
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
 * Every marked film (watched or want) and every film with release notes, sorted by IMDb ID or
 * QID so the file diffs small. Each entry has all three Watch list fields, so a restore puts
 * them back exactly.
 */
export async function exportMarks(db: Db): Promise<MarksFile> {
  const rows = await db
    .select({ ...filmColumns, ...markColumns, updatedAt: marks.updatedAt })
    .from(marks)
    .innerJoin(movies, eq(movies.id, marks.movieId))
    .where(or(eq(marks.watched, true), eq(marks.want, true), isNotNull(marks.releaseOn), isNotNull(marks.platform)));
  return rows
    .map((r) => ({
      ...(r.imdbId ? { imdb: r.imdbId } : {}),
      ...(r.wikidataId ? { wd: r.wikidataId } : {}),
      title: r.title,
      year: r.year,
      watched: r.watched,
      want: r.want,
      wantRank: r.wantRank,
      releaseOn: r.releaseOn,
      platform: r.platform,
      updatedAt: r.updatedAt.toISOString(),
    }))
    .sort((a, b) => entryId(a).localeCompare(entryId(b)));
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
      `${file} has ${previous} marked films and ${target} has only ${next}. The file was kept as it is. ` +
      "If marks were removed on purpose, run the export again with --allow-shrink."
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
 * Exports every marked film to `file` (`marks:export`, and the loader before a production
 * load). Stops, keeping the file, when `exportProblem` finds one. Writes a temporary file and
 * renames it, so a crash never leaves the backup half-written. Returns the line to print.
 */
export async function exportMarksToFile(
  db: Db,
  opts: { target: "test" | "production"; file: string; allowShrink: boolean },
): Promise<string> {
  const { target, file, allowShrink } = opts;
  const previous = existsSync(file) ? readMarksFile(file).length : null;
  const entries = await exportMarks(db);
  const problem = exportProblem({ target, file, previous, next: entries.length, allowShrink });
  if (problem) throw new Error(problem);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, serializeMarks(entries));
  renameSync(`${file}.tmp`, file);
  const was = previous === null ? "" : ` (the file had ${previous} before)`;
  return `Exported ${entries.length} marked films from ${target} to ${file}${was}.`;
}

/** Reads what restore needs from the database and plans it (no writes). */
export async function loadRestorePlan(db: Db, entries: MarksFile): Promise<RestorePlan> {
  const imdbIds = entries.flatMap((m) => (m.imdb ? [m.imdb] : []));
  const wdIds = entries.flatMap((m) => (m.wd ? [m.wd] : []));
  const current = await db.select({ movieId: marks.movieId, ...markColumns }).from(marks);
  const markedIds = current.map((m) => m.movieId);
  const conditions = [
    imdbIds.length > 0 ? inArray(movies.imdbId, imdbIds) : undefined,
    wdIds.length > 0 ? inArray(movies.wikidataId, wdIds) : undefined,
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
  if (plan.writes.length === 0) return 0;
  await db.transaction(async (tx) => {
    const ids = plan.writes.map((w) => w.film.id);
    const rows = await tx
      .select({ movieId: marks.movieId, ...markColumns })
      .from(marks)
      .where(inArray(marks.movieId, ids))
      .for("update");
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
    for (const w of plan.writes) {
      const values = {
        ...stateOf(w.to),
        updatedAt: w.to.updatedAt ? new Date(w.to.updatedAt) : new Date(),
      };
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
    await tx.execute(sql`
      update marks set want_rank = r.rank
      from (
        select movie_id, row_number() over (order by want_rank nulls last, updated_at desc, movie_id) as rank
        from marks where want
      ) r
      where marks.movie_id = r.movie_id and marks.want_rank is distinct from r.rank`);
  });
  return plan.writes.length;
}
