// A film just added to the watch list gets its scores straight away, not at the next daily run.
// A film added by hand is first linked to TMDB (`link-film.ts`), or it could never get a score.
// The add answers at once; the Watch list then asks `POST /api/watch-list/scores`, which waits for
// them (usually 2 to 4 s) and the page refreshes, so they show with no reload (owner, 2026-11-17).
// A slow or failed fetch only means they come later. Not imported by the scripts: it needs Next's
// request context.
import "server-only";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { getDb } from "@/db";
import { getMovieCatalogue } from "@/lib/movie-catalogue";
import { runScores, type ScoreClients, type ScoreStore } from "./batch";
import { scoreClientsFromEnv } from "./index";
import { linkFilmToTmdb } from "./link-film";
import { createScoreStore, RECHECK_HOURS } from "./store";

/**
 * Fetches and saves one film's scores unless they were checked in the last `RECHECK_HOURS` (a
 * re-add spends no OMDb call). True when the film was checked; throws when the run was refused or
 * rate-limited, so the caller logs it. Exported for the unit tests.
 */
export async function fetchFilmScores(
  store: ScoreStore,
  clients: ScoreClients,
  movieId: number,
  now: () => Date = () => new Date(),
): Promise<boolean> {
  const freshSince = now().getTime() - RECHECK_HOURS * 3_600_000;
  const unchecked: ScoreStore = {
    ...store,
    queue: async (opts) =>
      (await store.queue(opts)).filter((f) => f.scoresCheckedAt === null || f.scoresCheckedAt.getTime() < freshSince),
  };
  const summary = await runScores(unchecked, clients, { source: "film", ids: [movieId], now });
  if (summary.stoppedBy !== "done") {
    throw new Error(`Stopped: ${summary.stoppedBy}${summary.stopReason ? ` (${summary.stopReason})` : ""}`);
  }
  if (summary.errors.length > 0) console.error("Some score calls failed", { movieId, errors: summary.errors });
  return summary.checked > 0;
}

/** A film added by hand gets its TMDB and IMDb IDs when TMDB has a clear match. Never throws. */
async function linkHandAddedFilm(db: ReturnType<typeof getDb>, movieId: number): Promise<boolean> {
  try {
    return await linkFilmToTmdb(db, await getMovieCatalogue(), movieId);
  } catch (error) {
    console.error("Linking a watch-list film to TMDB failed", { movieId }, error);
    return false;
  }
}

/** How long the scores request waits (usually 2 to 4 s) before answering without them. */
export const SCORE_WAIT_MS = 25_000;

/**
 * Links a hand-added film and fetches its scores, waiting up to `waitMs`. True when scores were
 * saved in time: the caller expires the cached scores and the page refreshes. Past the wait, the
 * fetch finishes after the response and expires them itself. Never throws: the film is already
 * saved, and the daily run is the fallback.
 */
export async function fetchScoresForAdd(movieId: number, waitMs = SCORE_WAIT_MS): Promise<boolean> {
  const failed = (error: unknown) => console.error("Fetching scores for a watch-list film failed", { movieId }, error);
  const work = (async () => {
    const db = getDb();
    // Linking clears the film's last check, so the fetch below always takes a just-linked film.
    await linkHandAddedFilm(db, movieId);
    return fetchFilmScores(createScoreStore(db), scoreClientsFromEnv(), movieId);
  })().catch((error: unknown) => {
    failed(error);
    return false;
  });
  const late = Symbol("late");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const first = await Promise.race([work, new Promise<typeof late>((resolve) => (timer = setTimeout(() => resolve(late), waitMs)))]);
  clearTimeout(timer);
  if (first !== late) return first;
  try {
    after(async () => {
      if (await work) revalidateTag("scores", { expire: 0 });
    });
  } catch (error) {
    failed(error);
  }
  return false;
}
