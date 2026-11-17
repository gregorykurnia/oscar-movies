"use server";

import { z } from "zod";
import { getDb, withFilmTransaction } from "@/db";
import { writeQueued, writeQueueOrder, writeRelease, writeWantAtTop, writeWantOrder } from "@/data/marks";
import { fetchScoresAfterResponse } from "@/lib/scores/after-add";

// The Watch list's Server Actions (plan §4, Phase 7 notes): Add a film, the owner's order and
// release notes. Like the marks action, anyone with the address can call them, so each checks
// its input; the writes check that the films exist. None revalidates: the Watch list reads
// the marks per request.

export type WatchListResult = { ok: boolean };
export type ReorderResult = { ok: true } | { ok: false; reason: "stale" | "failed" };

const movieId = z.number().int().positive().max(2_147_483_647);

/** Add a film: want to watch, not watched, first in the order (already wanted: moved to the top). */
export async function addToWatchList(raw: number): Promise<WatchListResult> {
  const parsed = movieId.safeParse(raw);
  if (!parsed.success) return { ok: false };
  try {
    const ok = await withFilmTransaction((tx) => writeWantAtTop(tx, parsed.data));
    if (ok) fetchScoresAfterResponse(parsed.data);
    return { ok };
  } catch (error) {
    console.error("addToWatchList failed", { movieId: parsed.data }, error);
    return { ok: false };
  }
}

const orderInput = z
  .array(movieId)
  .max(5000)
  .refine((ids) => new Set(ids).size === ids.length, "A film appears twice in the order");

/**
 * Saves the order of Want to watch (`list` "want", the default) or of the Watch queue, top first.
 * `stale`: the ids aren't exactly that list's films now (another tab changed it), so nothing
 * was written and the page should reload.
 */
export async function reorderWatchList(raw: number[], list: "want" | "queue" = "want"): Promise<ReorderResult> {
  const parsed = orderInput.safeParse(raw);
  if (!parsed.success || (list !== "want" && list !== "queue")) return { ok: false, reason: "failed" };
  const write = list === "queue" ? writeQueueOrder : writeWantOrder;
  try {
    const result = await withFilmTransaction((tx) => write(tx, parsed.data));
    return result === "ok" ? { ok: true } : { ok: false, reason: "stale" };
  } catch (error) {
    console.error("reorderWatchList failed", { list, count: parsed.data.length }, error);
    return { ok: false, reason: "failed" };
  }
}

/**
 * Puts a wanted film in the Watch queue (at its end) or takes it out (back to the top of Want to
 * watch). Not ok when the film isn't wanted any more (the page should reload) or the save failed.
 */
export async function setQueued(rawMovieId: number, queued: boolean): Promise<WatchListResult> {
  const parsed = movieId.safeParse(rawMovieId);
  if (!parsed.success || typeof queued !== "boolean") return { ok: false };
  try {
    return { ok: await withFilmTransaction((tx) => writeQueued(tx, parsed.data, queued)) };
  } catch (error) {
    console.error("setQueued failed", { movieId: parsed.data, queued }, error);
    return { ok: false };
  }
}

const releaseInput = z
  .object({
    movieId,
    releaseOn: z.iso.date().nullable(),
    releaseTentative: z.boolean(),
    // Free text; blank means none.
    platform: z
      .string()
      .trim()
      .max(40)
      .nullable()
      .transform((p) => (p ? p : null)),
  })
  .strict();

/** Sets release notes; legacy callers save confirmed dates, and TBD always clears tentative. */
export async function setRelease(
  rawMovieId: number,
  releaseOn: string | null,
  platform: string | null,
  releaseTentative = false,
): Promise<WatchListResult> {
  const parsed = releaseInput.safeParse({ movieId: rawMovieId, releaseOn, platform, releaseTentative });
  if (!parsed.success) return { ok: false };
  const { movieId: id, ...value } = parsed.data;
  try {
    return { ok: await writeRelease(getDb(), id, { ...value, releaseTentative: value.releaseOn !== null && value.releaseTentative }) };
  } catch (error) {
    console.error("setRelease failed", { movieId: id }, error);
    return { ok: false };
  }
}
