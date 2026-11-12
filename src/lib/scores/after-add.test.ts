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

import { fetchFilmScores, fetchScoresAfterResponse } from "./after-add";

const NOW = new Date("2026-11-12T08:00:00Z");
const film = (scoresCheckedAt: Date | null): QueueFilm => ({
  id: 7, imdbId: "tt7", tmdbId: 7, year: 2026, scoresCheckedAt, imdbRating: null, rtScore: null, mcScore: null, tmdbScore: 6.1,
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
const clients: ScoreClients = { omdb, tmdb: async () => ({ kind: "ok", value: { tmdbScore: 6.4 } }) };

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
    expect(saved).toEqual([{ id: 7, update: expect.objectContaining({ imdbRating: 7.9, rtScore: 93, mcScore: 85, tmdbScore: 6.4 }) }]);
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

describe("fetchScoresAfterResponse", () => {
  it("doesn't throw when it can't schedule the fetch", () => {
    after.mockImplementation(() => {
      throw new Error("outside a request");
    });
    expect(() => fetchScoresAfterResponse(5)).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });

  it("logs a failed fetch (here: no keys) without revalidating", async () => {
    vi.stubEnv("OMDB_API_KEY", "");
    let task: (() => Promise<void>) | undefined;
    after.mockImplementation((fn: () => Promise<void>) => void (task = fn));
    fetchScoresAfterResponse(5);
    await task!();
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});
