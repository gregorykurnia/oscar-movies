// A film just added to the watch list gets its scores straight away, not at the next daily run.
// It runs after the Server Action has answered, so the save never waits on OMDb or TMDB, and a
// failure only means the daily run picks the film up as usual. Not imported by the scripts: it
// needs Next's request context.
import "server-only";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { getDb } from "@/db";
import { runScores, type ScoreClients, type ScoreStore } from "./batch";
import { scoreClientsFromEnv } from "./index";
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

/** Never throws: the film is already saved, and the daily run is the fallback. */
export function fetchScoresAfterResponse(movieId: number): void {
  const failed = (error: unknown) => console.error("Fetching scores for a watch-list film failed", { movieId }, error);
  try {
    after(async () => {
      try {
        if (await fetchFilmScores(createScoreStore(getDb()), scoreClientsFromEnv(), movieId)) {
          revalidateTag("scores", { expire: 0 });
        }
      } catch (error) {
        failed(error);
      }
    });
  } catch (error) {
    failed(error);
  }
}
