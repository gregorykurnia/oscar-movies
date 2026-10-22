// Writing a mark (plan §5.6): the only write the app makes, from the marks Server Action.
// Reading them is `getMarks` in `watch-list.ts` (never cached).
import { eq, sql } from "drizzle-orm";
import type { getDb, ScriptDb } from "@/db";
import { marks, movies } from "@/db/schema";

type Writer = Pick<ScriptDb, "insert" | "select">;

/** The app's client (HTTP), or a script's or test's (pool, transaction): their builders write the same SQL. */
export type WriteDb = Pick<ReturnType<typeof getDb>, "insert" | "select"> | Writer;

export type MarkValue = { watched: boolean; want: boolean };

/**
 * Sets a film's marks to exactly `value` (the whole state, so the last request to land is the
 * state shown). One statement: the row is written only if the film exists. Returns false when
 * it doesn't. A film with neither mark keeps its row with both off.
 */
export async function writeMark(db: WriteDb, movieId: number, value: MarkValue): Promise<boolean> {
  if (value.watched && value.want) throw new Error("A film can't be both watched and wanted");
  // The two clients differ only in their result types, which `returning` doesn't touch.
  const d = db as Writer;
  const rows = await d
    .insert(marks)
    .select(
      d
        .select({
          movieId: movies.id,
          watched: sql<boolean>`${value.watched}::boolean`.as("watched"),
          want: sql<boolean>`${value.want}::boolean`.as("want"),
          updatedAt: sql<Date>`now()`.as("updated_at"),
        })
        .from(movies)
        .where(eq(movies.id, movieId)),
    )
    .onConflictDoUpdate({
      target: marks.movieId,
      set: { watched: value.watched, want: value.want, updatedAt: sql`now()` },
    })
    .returning({ movieId: marks.movieId });
  return rows.length === 1;
}
