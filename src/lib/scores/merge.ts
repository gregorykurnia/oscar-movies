// The merge rule (plan §5.4): a failed call or "N/A" never overwrites a stored score with null,
// and a score's `*_at` moves only when the source confirmed a value. `scoresCheckedAt` always
// moves, so a film that keeps failing doesn't hold up the queue.

export const SCORE_KEYS = ["imdbRating", "rtScore", "mcScore", "tmdbScore"] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

export const SCORE_AT: Record<ScoreKey, "imdbAt" | "rtAt" | "mcAt" | "tmdbAt"> = {
  imdbRating: "imdbAt",
  rtScore: "rtAt",
  mcScore: "mcAt",
  tmdbScore: "tmdbAt",
};

export type StoredScores = Record<ScoreKey, number | null>;
/** What the calls brought back: a number, null for "N/A", or absent when the call failed. */
export type FetchedScores = Partial<Record<ScoreKey, number | null>>;

export type ScoreUpdate = Partial<Record<ScoreKey, number>> &
  Partial<Record<(typeof SCORE_AT)[ScoreKey], Date>> & { scoresCheckedAt: Date };

export type Merged = { update: ScoreUpdate; confirmed: ScoreKey[]; changed: ScoreKey[] };

export function mergeScores(stored: StoredScores, fetched: FetchedScores, now: Date): Merged {
  const update: ScoreUpdate = { scoresCheckedAt: now };
  const confirmed: ScoreKey[] = [];
  const changed: ScoreKey[] = [];
  for (const key of SCORE_KEYS) {
    const value = fetched[key];
    if (typeof value !== "number") continue;
    update[key] = value;
    update[SCORE_AT[key]] = now;
    confirmed.push(key);
    if (stored[key] !== value) changed.push(key);
  }
  return { update, confirmed, changed };
}
