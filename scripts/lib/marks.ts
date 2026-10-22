// Marks export and restore (IMPLEMENTATION_PLAN.md §3.5, §10). The marks are the only data
// that exists nowhere else, so the export names films by IMDb ID or QID (it survives any
// reload) and restore writes only the films whose marks differ, after a plan that lists
// every write. Restore never clears a mark that the file doesn't mention.
import { relative, resolve } from "node:path";
import { eq, inArray, or } from "drizzle-orm";
import type { ScriptDb } from "../../src/db";
import { marks, movies } from "../../src/db/schema";
import type { MarkEntry, MarksFile } from "../../src/lib/data-files";

/** A script client or a transaction on one. */
export type Db = Pick<ScriptDb, "select" | "insert" | "transaction">;

export type MarkState = { watched: boolean; want: boolean };
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

const NONE: MarkState = { watched: false, want: false };
const sameMark = (a: MarkState, b: MarkState) => a.watched === b.watched && a.want === b.want;
const isMarked = (m: MarkState) => m.watched || m.want;
const entryId = (m: MarkEntry) => (m.imdb ?? m.wd) as string;

export function markLabel(m: MarkState): string {
  return m.watched ? "watched" : m.want ? "want" : "none";
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
    const to = { watched: entry.watched, want: entry.want, updatedAt: entry.updatedAt };
    if (sameMark(now ?? NONE, to)) {
      plan.unchanged += 1;
    } else if (now) {
      plan.writes.push({ kind: "update", film, from: { watched: now.watched, want: now.want }, to });
    } else {
      plan.writes.push({ kind: "insert", film, from: null, to });
    }
  }

  const filmById = new Map(films.map((f) => [f.id, f]));
  for (const m of current) {
    if (!claimed.has(m.movieId) && isMarked(m)) {
      const film = filmById.get(m.movieId);
      if (film) plan.notInFile.push({ film, mark: { watched: m.watched, want: m.want } });
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

/** Every marked film (watched or want), sorted by IMDb ID or QID so the file diffs small. */
export async function exportMarks(db: Db): Promise<MarksFile> {
  const rows = await db
    .select({ ...filmColumns, watched: marks.watched, want: marks.want, updatedAt: marks.updatedAt })
    .from(marks)
    .innerJoin(movies, eq(movies.id, marks.movieId))
    .where(or(eq(marks.watched, true), eq(marks.want, true)));
  return rows
    .map((r) => ({
      ...(r.imdbId ? { imdb: r.imdbId } : {}),
      ...(r.wikidataId ? { wd: r.wikidataId } : {}),
      title: r.title,
      year: r.year,
      watched: r.watched,
      want: r.want,
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

/** Reads what restore needs from the database and plans it (no writes). */
export async function loadRestorePlan(db: Db, entries: MarksFile): Promise<RestorePlan> {
  const imdbIds = entries.flatMap((m) => (m.imdb ? [m.imdb] : []));
  const wdIds = entries.flatMap((m) => (m.wd ? [m.wd] : []));
  const current = await db
    .select({ movieId: marks.movieId, watched: marks.watched, want: marks.want })
    .from(marks);
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
      .select({ movieId: marks.movieId, watched: marks.watched, want: marks.want })
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
        watched: w.to.watched,
        want: w.to.want,
        updatedAt: w.to.updatedAt ? new Date(w.to.updatedAt) : new Date(),
      };
      await tx
        .insert(marks)
        .values({ movieId: w.film.id, ...values })
        .onConflictDoUpdate({ target: marks.movieId, set: values });
    }
  });
  return plan.writes.length;
}
