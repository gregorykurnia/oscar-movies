// One entry for the cron route and `npm run scores:refresh` (plan §5.4).
import { fetchOmdb, fetchTmdb } from "./clients";
import type { ScoreClients } from "./batch";

export { describeRun, runScores, type RunSummary } from "./batch";
export { createScoreStore } from "./store";

/** The real clients, with the keys from the environment. Throws when one is missing. */
export function scoreClientsFromEnv(env: Record<string, string | undefined> = process.env): ScoreClients {
  const { OMDB_API_KEY: omdbKey, TMDB_READ_TOKEN: tmdbToken } = env;
  if (!omdbKey || !tmdbToken) throw new Error("OMDB_API_KEY and TMDB_READ_TOKEN must both be set.");
  return {
    omdb: (imdbId) => fetchOmdb(imdbId, omdbKey),
    tmdb: (tmdbId) => fetchTmdb(tmdbId, tmdbToken),
  };
}
