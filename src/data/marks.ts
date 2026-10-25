// Writing marks (plan §5.6) and, from 7.4, the Watch list's order and release notes: the only
// writes the app makes, from the marks and Watch list Server Actions. Reading them is in
// `watch-list.ts` (never cached).
//
// Each write is one SQL statement, so it is its own transaction on both clients: the app's
// HTTP driver has no interactive transactions. A film that becomes wanted goes to the top of
// the order and the films above its old place shift down one; a film that stops being wanted
// loses its rank; nothing here touches `release_on` or `platform` except `writeRelease`.
import { sql } from "drizzle-orm";
import type { getDb, ScriptDb } from "@/db";

type Executor = Pick<ScriptDb, "execute">;

/** The app's client (HTTP), or a script's or test's (pool, transaction): both run the same SQL. */
export type WriteDb = Pick<ReturnType<typeof getDb>, "execute"> | Executor;

export type MarkValue = { watched: boolean; want: boolean };

export type ReleaseValue = {
  /** `YYYY-MM-DD`, the first date the owner can watch it; null = TBD. */
  releaseOn: string | null;
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
  // films above that place (all of them when it wasn't wanted), so the order stays 1…n.
  const found = await rows(
    db,
    sql`
      with film as (select id from movies where id = ${movieId}),
      prev as (
        select (select want_rank from marks where movie_id = ${movieId} and want) as old_rank,
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
 * Renumbers the wanted films 1…n in the order given. Refused ("stale"), writing nothing,
 * unless `orderedIds` are exactly the films wanted now: a page that's out of date (a film
 * wanted or unwanted in another tab) must reload, not drop or invent a place.
 */
export async function writeWantOrder(db: WriteDb, orderedIds: number[]): Promise<"ok" | "stale"> {
  if (new Set(orderedIds).size !== orderedIds.length) throw new Error("A film appears twice in the order");
  // A Postgres array literal: drizzle would expand a JS array into a list of parameters.
  const ids = `{${orderedIds.map((id) => Math.trunc(id)).join(",")}}`;
  const result = await rows(
    db,
    sql`
      with given as (
        select movie_id, rank::int as rank from unnest(${ids}::int[]) with ordinality as t(movie_id, rank)
      ),
      wanted as (select movie_id from marks where want),
      ok as (
        select (select count(*) from wanted) = (select count(*) from given)
           and not exists (select 1 from wanted w where w.movie_id not in (select movie_id from given)) as v
      ),
      updated as (
        update marks set want_rank = given.rank
        from given
        where marks.movie_id = given.movie_id and (select v from ok)
        returning marks.movie_id
      )
      select (select v from ok) as ok, (select count(*) from updated)::int as written`,
  );
  return result[0]?.ok === true ? "ok" : "stale";
}

/**
 * Sets a film's release date and platform (both, exactly as given; nulls clear). Keeps its
 * marks; a film with no row gets one with both marks off. Returns false when the film doesn't exist.
 */
export async function writeRelease(db: WriteDb, movieId: number, value: ReleaseValue): Promise<boolean> {
  const found = await rows(
    db,
    sql`
      insert into marks (movie_id, release_on, platform, updated_at)
      select id, ${value.releaseOn}::date, ${value.platform}::text, now() from movies where id = ${movieId}
      on conflict (movie_id) do update set
        release_on = excluded.release_on, platform = excluded.platform, updated_at = now()
      returning movie_id`,
  );
  return found.length === 1;
}
