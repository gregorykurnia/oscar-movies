// Writing marks (plan §5.6) and, from 7.4, the Watch list's order and release notes, used by
// the marks, Watch list and film-creation actions. Reading them is in
// `watch-list.ts` (never cached).
//
// Each low-level write is one SQL statement. Rank-changing actions run it inside the shared
// locked transaction; release notes alone still use HTTP. A film that becomes wanted goes
// to the top and the films above its old place shift down one; a film that stops being wanted
// loses its rank and its Watch queue place; only `writeRelease` touches the release notes,
// including tentative status. `writeQueued` moves a wanted film into or out of the Watch queue.
import { and, eq, sql } from "drizzle-orm";
import type { FilmTransaction, getDb, ScriptDb } from "@/db";
import { marks } from "@/db/schema";

type Executor = Pick<ScriptDb, "execute">;

/** The app's client (HTTP), or a script's or test's (pool, transaction): both run the same SQL. */
export type WriteDb = Pick<ReturnType<typeof getDb>, "execute"> | Executor;

export type MarkValue = { watched: boolean; want: boolean };

export type ReleaseValue = {
  /** `YYYY-MM-DD`, the first date the owner can watch it; null = TBD. */
  releaseOn: string | null;
  releaseTentative: boolean;
  /** 1–40 characters, or null. */
  platform: string | null;
};

// Both clients' results carry `rows`; their types differ only in what `execute` is typed as.
async function rows(db: WriteDb, query: ReturnType<typeof sql>): Promise<Array<Record<string, unknown>>> {
  const result = await (db as Executor).execute(query);
  return result.rows;
}

/**
 * Sets a film's marks to exactly `value` (the whole state, so the last request to land is the
 * state shown); with `top`, a wanted film also moves to the top of the order even if it was
 * already wanted (Add a film). One statement: the row is written only if the film exists.
 * Returns false when it doesn't. A film with neither mark keeps its row with both off.
 */
async function upsertMark(db: WriteDb, movieId: number, value: MarkValue, top: boolean): Promise<boolean> {
  if (value.watched && value.want) throw new Error("A film can't be both watched and wanted");
  // `old_rank`: the film's place if it's wanted now. Moving to the top shifts down the wanted
  // films above that place (all of them when it wasn't wanted); unwanting moves the films
  // below it up one, so the order stays 1…n. Unwanting, or Add a film's move to the top, also
  // takes it out of the Watch queue (`old_queue`), closing the gap there; a film that stays
  // wanted otherwise keeps its queue place.
  const found = await rows(
    db,
    sql`
      with film as (select id from movies where id = ${movieId}),
      prev as (
        select (select want_rank from marks where movie_id = ${movieId} and want) as old_rank,
               (select queue_rank from marks where movie_id = ${movieId} and want) as old_queue,
               coalesce((select want from marks where movie_id = ${movieId}), false) as was_wanted
      ),
      to_top as (
        select ${value.want}::boolean and (${top}::boolean or not prev.was_wanted) as v from prev
      ),
      shifted as (
        update marks set want_rank = want_rank + 1
        where (select v from to_top) and exists (select 1 from film)
          and want and want_rank is not null and movie_id <> ${movieId}
          and want_rank < coalesce((select old_rank from prev), 2147483647)
        returning movie_id
      ),
      closed as (
        update marks set want_rank = want_rank - 1
        where not ${value.want}::boolean and (select old_rank from prev) is not null
          and want and want_rank > (select old_rank from prev) and movie_id <> ${movieId}
        returning movie_id
      ),
      left_queue as (
        update marks set queue_rank = queue_rank - 1
        where (not ${value.want}::boolean or ${top}::boolean) and (select old_queue from prev) is not null
          and want and queue_rank > (select old_queue from prev) and movie_id <> ${movieId}
        returning movie_id
      )
      insert into marks (movie_id, watched, want, want_rank, updated_at)
      select id, ${value.watched}::boolean, ${value.want}::boolean,
             case when ${value.want}::boolean then 1 end, now()
      from film
      on conflict (movie_id) do update set
        watched = excluded.watched,
        want = excluded.want,
        want_rank = case
          when not excluded.want then null
          when (select v from to_top) then 1
          else marks.want_rank
        end,
        queue_rank = case when excluded.want and not ${top}::boolean then marks.queue_rank end,
        updated_at = now()
      returning movie_id`,
  );
  return found.length === 1;
}

/** The marks action's write: sets the film's whole marks state (see `upsertMark`). */
export function writeMark(db: WriteDb, movieId: number, value: MarkValue): Promise<boolean> {
  return upsertMark(db, movieId, value, false);
}

/** Add a film: want on, watched off, first in the order (already wanted: moved to the top). */
export function writeWantAtTop(db: WriteDb, movieId: number): Promise<boolean> {
  return upsertMark(db, movieId, { watched: false, want: true }, true);
}

/**
 * Renumbers the films of one list 1…n in the order given: Want to watch (`want_rank`, the wanted
 * films not in the queue) or the Watch queue (`queue_rank`). Refused ("stale"), writing nothing,
 * unless `orderedIds` are exactly that list's films now: a page that's out of date (a film
 * wanted, unwanted, queued or unqueued in another tab) must reload, not drop or invent a place.
 */
async function writeOrder(db: WriteDb, list: "want" | "queue", orderedIds: number[]): Promise<"ok" | "stale"> {
  if (new Set(orderedIds).size !== orderedIds.length) throw new Error("A film appears twice in the order");
  // A Postgres array literal: drizzle would expand a JS array into a list of parameters.
  const ids = `{${orderedIds.map((id) => Math.trunc(id)).join(",")}}`;
  const queue = list === "queue";
  const result = await rows(
    db,
    sql`
      with given as (
        select movie_id, rank::int as rank from unnest(${ids}::int[]) with ordinality as t(movie_id, rank)
      ),
      listed as (select movie_id from marks where want and (queue_rank is not null) = ${queue}::boolean),
      ok as (
        select (select count(*) from listed) = (select count(*) from given)
           and not exists (select 1 from listed l where l.movie_id not in (select movie_id from given)) as v
      ),
      updated as (
        update marks set
          want_rank = case when ${queue}::boolean then marks.want_rank else given.rank end,
          queue_rank = case when ${queue}::boolean then given.rank else marks.queue_rank end
        from given
        where marks.movie_id = given.movie_id and (select v from ok)
        returning marks.movie_id
      )
      select (select v from ok) as ok, (select count(*) from updated)::int as written`,
  );
  return result[0]?.ok === true ? "ok" : "stale";
}

/** Saves the Want to watch order (the wanted films not in the Watch queue), top first. */
export function writeWantOrder(db: WriteDb, orderedIds: number[]): Promise<"ok" | "stale"> {
  return writeOrder(db, "want", orderedIds);
}

/** Saves the Watch queue's order, top first. */
export function writeQueueOrder(db: WriteDb, orderedIds: number[]): Promise<"ok" | "stale"> {
  return writeOrder(db, "queue", orderedIds);
}

/**
 * Puts a wanted film in the Watch queue (at its end) or takes it out (back to the top of Want to
 * watch). Joining the queue gives up its Want to watch place, closing the gap; leaving closes
 * the gap in the queue. Doing what's already done changes nothing. Returns false when the
 * film isn't wanted (unmarked in another tab, or no such film): only wanted films queue.
 * Two statements: run it in the locked transaction.
 */
export async function writeQueued(db: WriteDb, movieId: number, queued: boolean): Promise<boolean> {
  const [film] = await rows(db, sql`select want_rank, queue_rank from marks where movie_id = ${movieId} and want`);
  if (!film) return false;
  if ((film.queue_rank !== null) === queued) return true;
  if (queued) {
    await rows(
      db,
      sql`
        with closed as (
          update marks set want_rank = want_rank - 1
          where ${film.want_rank as number | null}::int is not null and want and want_rank > ${film.want_rank as number | null}::int
            and movie_id <> ${movieId}
          returning movie_id
        )
        update marks set
          queue_rank = coalesce((select max(queue_rank) from marks), 0) + 1,
          want_rank = null,
          updated_at = now()
        where movie_id = ${movieId}
        returning movie_id`,
    );
  } else {
    await rows(
      db,
      sql`
        with closed as (
          update marks set queue_rank = queue_rank - 1
          where queue_rank > ${film.queue_rank as number}::int and movie_id <> ${movieId}
          returning movie_id
        ),
        shifted as (
          update marks set want_rank = want_rank + 1
          where want and want_rank is not null and movie_id <> ${movieId}
          returning movie_id
        )
        update marks set queue_rank = null, want_rank = 1, updated_at = now()
        where movie_id = ${movieId}
        returning movie_id`,
    );
  }
  return true;
}

// PostgreSQL's row version lets the Watch list retry a save from the same snapshot.
export const markVersion = sql<string>`${marks}.xmin::text`;

/** Save only the star on a wanted film. Lock the row until the transaction commits. */
export async function writeFavorite(
  tx: FilmTransaction,
  movieId: number,
  favorite: boolean,
  expectedVersion?: string,
): Promise<boolean> {
  const [current] = await tx
    .select({ favorite: marks.favorite, version: markVersion })
    .from(marks)
    .where(and(eq(marks.movieId, movieId), eq(marks.want, true)))
    .for("update");
  if (!current) return false;
  // A retry whose save landed can confirm it without writing. An old request whose
  // desired value differs from the current one needs a fresh read before another edit.
  if (current.favorite === favorite) return true;
  if (expectedVersion !== undefined && current.version !== expectedVersion) return false;
  const saved = await tx.update(marks).set({ favorite }).where(eq(marks.movieId, movieId)).returning({ movieId: marks.movieId });
  return saved.length === 1;
}

/**
 * Sets a film's release date, tentative flag and platform (exactly as given; nulls clear). Keeps its
 * marks; a film with no row gets one with both marks off. Returns false when the film doesn't exist.
 */
export async function writeRelease(db: WriteDb, movieId: number, value: ReleaseValue): Promise<boolean> {
  const found = await rows(
    db,
    sql`
      insert into marks (movie_id, release_on, release_tentative, platform, updated_at)
      select id, ${value.releaseOn}::date, ${value.releaseTentative}::boolean, ${value.platform}::text, now() from movies where id = ${movieId}
      on conflict (movie_id) do update set
        release_on = excluded.release_on, release_tentative = excluded.release_tentative,
        platform = excluded.platform, updated_at = now()
      returning movie_id`,
  );
  return found.length === 1;
}
