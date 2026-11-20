// The score fetch after a watch-list add: one film, no data_loads row, no OMDb call for a film
// checked in the last 20 hours, and it never throws into the action that saved the film.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueFilm, RunSummary, ScoreClients, ScoreStore } from "./batch";
import type { ScoreUpdate } from "./merge";

const { after, revalidateTag } = vi.hoisted(() => ({ after: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after }));
vi.mock("next/cache", () => ({ revalidateTag }));
vi.mock("@/db", () => ({ getDb: () => ({}) }));
const { linkFilmToTmdb } = vi.hoisted(() => ({ linkFilmToTmdb: vi.fn() }));
vi.mock("@/lib/movie-catalogue", () => ({ getMovieCatalogue: async () => ({}) }));
vi.mock("./link-film", () => ({ linkFilmToTmdb }));

import { fetchFilmScores, fetchScoresForAdd } from "./after-add";

const NOW = new Date("2026-11-12T08:00:00Z");
const film = (scoresCheckedAt: Date | null): QueueFilm => ({
  id: 7, imdbId: "tt7", tmdbId: 7, year: 2026, scoresCheckedAt, imdbRating: null, rtScore: null, mcScore: null, tmdbScore: 6.1, lbRating: null,
});

function fakeStore(queue: QueueFilm[]) {
  const saved: { id: number; update: ScoreUpdate }[] = [];
  const recorded: RunSummary[] = [];
  const asked: unknown[] = [];
  const store: ScoreStore = {
    queue: async (opts) => (asked.push(opts), queue),
    save: async (id, update) => void saved.push({ id, update }),
    record: async (s) => void recorded.push(s),
  };
  return { store, saved, recorded, asked };
}
const omdb = vi.fn<ScoreClients["omdb"]>();
const clients: ScoreClients = {
  imdbRatings: async () => ({ kind: "ok", value: new Map([["tt7", 9.0]]) }),
  omdb,
  tmdb: async () => ({ kind: "ok", value: { tmdbScore: 6.4 } }),
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  omdb.mockResolvedValue({ kind: "ok", value: { imdbRating: 7.9, rtScore: 93, mcScore: 85 } });
});
afterEach(() => vi.unstubAllEnvs());

describe("fetchFilmScores", () => {
  it("saves that film's scores and writes no data_loads row", async () => {
    const { store, saved, recorded, asked } = fakeStore([film(null)]);
    expect(await fetchFilmScores(store, clients, 7, () => NOW)).toBe(true);
    expect(asked[0]).toMatchObject({ ids: [7] });
    expect(saved).toEqual([{ id: 7, update: expect.objectContaining({ imdbRating: 9.0, rtScore: 93, mcScore: 85, tmdbScore: 6.4 }) }]);
    expect(recorded).toEqual([]);
  });

  it("spends no call on a film checked in the last 20 hours", async () => {
    const { store, saved } = fakeStore([film(new Date(NOW.getTime() - 19 * 3_600_000))]);
    expect(await fetchFilmScores(store, clients, 7, () => NOW)).toBe(false);
    expect(omdb).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });

  it("throws when OMDb refuses, leaving the film due for the daily run", async () => {
    omdb.mockResolvedValue({ kind: "stop", reason: "Request limit reached!" });
    const { store, saved } = fakeStore([film(null)]);
    await expect(fetchFilmScores(store, clients, 7, () => NOW)).rejects.toThrow(/refused/);
    expect(saved).toEqual([]);
  });
});

describe("fetchScoresForAdd", () => {
  it("logs a failed link and a failed fetch (here: no keys), answers false and doesn't throw", async () => {
    vi.stubEnv("OMDB_API_KEY", "");
    linkFilmToTmdb.mockRejectedValue(new Error("TMDB down"));
    expect(await fetchScoresForAdd(5)).toBe(false);
    expect(linkFilmToTmdb).toHaveBeenCalledWith({}, {}, 5);
    expect(console.error).toHaveBeenCalledWith("Linking a watch-list film to TMDB failed", { movieId: 5 }, expect.any(Error));
    expect(console.error).toHaveBeenCalledWith("Fetching scores for a watch-list film failed", { movieId: 5 }, expect.any(Error));
    expect(after).not.toHaveBeenCalled();
  });

  it("past the wait, answers false and lets the fetch finish after the response", async () => {
    vi.useFakeTimers();
    try {
      let unblock!: (v: boolean) => void;
      linkFilmToTmdb.mockReturnValue(new Promise<boolean>((resolve) => (unblock = resolve)));
      vi.stubEnv("OMDB_API_KEY", "");
      let task: (() => Promise<void>) | undefined;
      after.mockImplementation((fn: () => Promise<void>) => void (task = fn));
      const answer = fetchScoresForAdd(5, 1_000);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await answer).toBe(false);
      expect(task).toBeDefined();
      unblock(true);
      await task!();
      // No keys here, so nothing was checked: no revalidation.
      expect(revalidateTag).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("doesn't throw when it can't schedule the late fetch", async () => {
    vi.useFakeTimers();
    try {
      linkFilmToTmdb.mockReturnValue(new Promise<boolean>(() => {}));
      after.mockImplementation(() => {
        throw new Error("outside a request");
      });
      const answer = fetchScoresForAdd(5, 10);
      await vi.advanceTimersByTimeAsync(10);
      expect(await answer).toBe(false);
      expect(console.error).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
