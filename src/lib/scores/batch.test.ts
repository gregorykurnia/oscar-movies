import { describe, expect, it } from "vitest";
import { OMDB_CALLS_PER_RUN, refreshFromYear, runScores, type ImdbRatingsResult, type QueueFilm, type RunSummary, type ScoreClients, type ScoreStore } from "./batch";
import type { ClientResult, OmdbScores, TmdbScores } from "./clients";
import { mergeScores, type ScoreUpdate } from "./merge";

const NOW = new Date("2026-10-22T20:00:00Z");
const stored = { imdbRating: 7.5, rtScore: 90, mcScore: 80, tmdbScore: 7.2 };

function film(id: number, extra: Partial<QueueFilm> = {}): QueueFilm {
  return { id, imdbId: `tt${id}`, tmdbId: id, year: 2025, scoresCheckedAt: null, ...stored, ...extra };
}

function fakeStore(queue: QueueFilm[]) {
  const saved: { id: number; update: ScoreUpdate }[] = [];
  const recorded: RunSummary[] = [];
  const store: ScoreStore = {
    queue: async () => queue,
    save: async (id, update) => void saved.push({ id, update }),
    record: async (s) => void recorded.push(s),
  };
  return { store, saved, recorded };
}

const ok = <T>(value: T): ClientResult<T> => ({ kind: "ok", value });
const rated = (value: Map<string, number>): ImdbRatingsResult => ({ kind: "ok", value });
const clients = (
  omdb: (id: string) => ClientResult<OmdbScores>,
  tmdb: (id: number) => ClientResult<TmdbScores> = () => ok({ tmdbScore: 7.4 }),
  imdbRatings: (ids: string[]) => ImdbRatingsResult = () => ({ kind: "ok", value: new Map() }),
): ScoreClients => ({ imdbRatings: async (ids) => imdbRatings(ids), omdb: async (id) => omdb(id), tmdb: async (id) => tmdb(id) });

const run = (store: ScoreStore, c: ScoreClients, extra = {}) =>
  runScores(store, c, { source: "script", now: () => NOW, sleep: async () => {}, ...extra });

const SCORE_FIELDS = ["imdbRating", "rtScore", "mcScore", "tmdbScore", "imdbAt", "rtAt", "mcAt", "tmdbAt"];

describe("mergeScores", () => {
  it("never writes null over a stored score, and moves only the confirmed dates", () => {
    const merged = mergeScores(stored, { imdbRating: 7.6, rtScore: null, mcScore: null }, NOW);
    expect(merged.update).toEqual({ scoresCheckedAt: NOW, imdbRating: 7.6, imdbAt: NOW });
    expect(merged.confirmed).toEqual(["imdbRating"]);
    expect(merged.changed).toEqual(["imdbRating"]);
  });

  it("confirms an unchanged value (its date moves) without counting a change", () => {
    const merged = mergeScores(stored, { tmdbScore: 7.2 }, NOW);
    expect(merged.update).toEqual({ scoresCheckedAt: NOW, tmdbScore: 7.2, tmdbAt: NOW });
    expect(merged.changed).toEqual([]);
  });
});

describe("runScores: a failed call never clears a score", () => {
  it("writes only scoresCheckedAt when both calls fail", async () => {
    const { store, saved, recorded } = fakeStore([film(1)]);
    const fail = { kind: "failed", reason: "down" } as const;
    const summary = await run(store, clients(() => fail, () => fail));
    expect(saved).toEqual([{ id: 1, update: { scoresCheckedAt: NOW } }]);
    expect(summary.failures).toBe(2);
    expect(recorded).toHaveLength(1);
  });

  it("keeps the OMDb scores when only TMDB fails, and the other way round", async () => {
    const { store, saved } = fakeStore([film(1), film(2)]);
    await run(
      store,
      clients(
        (id) => (id === "tt1" ? ok({ imdbRating: 7.7, rtScore: null, mcScore: 81 }) : { kind: "failed", reason: "x" }),
        (id) => (id === 1 ? { kind: "failed", reason: "x" } : ok({ tmdbScore: null })),
      ),
    );
    expect(saved[0].update).toEqual({ scoresCheckedAt: NOW, imdbRating: 7.7, imdbAt: NOW, mcScore: 81, mcAt: NOW });
    expect(saved[1].update).toEqual({ scoresCheckedAt: NOW });
    for (const { update } of saved) {
      for (const field of SCORE_FIELDS) {
        if (field in update) expect(update[field as keyof ScoreUpdate]).not.toBeNull();
      }
    }
  });

  it("leaves a film untouched (still due) when the run is refused or rate-limited", async () => {
    for (const halt of [
      { kind: "stop", reason: "OMDb: Request limit reached!" },
      { kind: "rate-limited", retryAfterMs: null },
    ] as const) {
      const { store, saved, recorded } = fakeStore([film(1), film(2)]);
      const summary = await run(store, clients(() => halt));
      expect(saved).toEqual([]);
      expect(summary.stoppedBy).toBe(halt.kind === "stop" ? "refused" : "rate-limited");
      expect(recorded[0].checked).toBe(0);
    }
  });
});

describe("runScores: limits", () => {
  it("retries after a rate limit and carries on", async () => {
    let calls = 0;
    const { store, saved } = fakeStore([film(1)]);
    const summary = await run(
      store,
      clients(() => (++calls === 1 ? { kind: "rate-limited", retryAfterMs: 1000 } : ok({ imdbRating: 8, rtScore: 95, mcScore: 88 }))),
    );
    expect(summary.stoppedBy).toBe("done");
    expect(saved[0].update.imdbRating).toBe(8);
  });

  it("stops at the OMDb call cap (five runs a day stay under OMDb's 1,000)", async () => {
    const checked = new Date("2026-09-01T00:00:00Z");
    const many = (n: number, extra: Partial<QueueFilm>) => Array.from({ length: n }, (_, i) => film(i + 1, extra));
    const c = clients(() => ok({ imdbRating: 7, rtScore: null, mcScore: null }));

    const due = await run(fakeStore(many(310, { scoresCheckedAt: checked })).store, c);
    expect([due.omdbCalls, due.stoppedBy]).toEqual([180, "call-limit"]);

    const fresh = await run(fakeStore(many(310, {})).store, c);
    expect([fresh.omdbCalls, fresh.stoppedBy]).toEqual([180, "call-limit"]);
    expect(OMDB_CALLS_PER_RUN * 5).toBeLessThan(1000);

    const limited = await run(fakeStore(many(10, {})).store, c, { maxOmdbCalls: 4 });
    expect(limited.omdbCalls).toBe(4);
  });

  it("stops at the deadline", async () => {
    let t = NOW.getTime();
    const { store, saved } = fakeStore([film(1), film(2), film(3)]);
    const summary = await runScores(store, clients(() => ok({ imdbRating: 7, rtScore: null, mcScore: null })), {
      source: "cron",
      deadlineMs: 250_000,
      now: () => new Date((t += 100_000)),
    });
    expect(summary.stoppedBy).toBe("deadline");
    expect(saved.length).toBeLessThan(3);
  });

  it("stops when every call keeps failing", async () => {
    const { store } = fakeStore(Array.from({ length: 30 }, (_, i) => film(i + 1)));
    const fail = { kind: "failed", reason: "down" } as const;
    const summary = await run(store, clients(() => fail, () => fail));
    expect([summary.checked, summary.stoppedBy]).toEqual([10, "failing"]);
  });

  it("skips OMDb for a film with no IMDb ID", async () => {
    const { store, saved } = fakeStore([film(1, { imdbId: null })]);
    const summary = await run(store, clients(() => ok({ imdbRating: 1, rtScore: 1, mcScore: 1 })));
    expect([summary.omdbCalls, summary.tmdbCalls]).toEqual([0, 1]);
    expect(saved[0].update).toEqual({ scoresCheckedAt: NOW, tmdbScore: 7.4, tmdbAt: NOW });
  });
});

describe("refreshFromYear: films still in the Oscar race", () => {
  it.each([
    ["2026-11-12T00:00:00Z", 2026],
    ["2027-01-05T00:00:00Z", 2026],
    ["2027-03-31T23:59:00Z", 2026],
    ["2027-04-01T00:00:00Z", 2027],
    ["2028-02-10T00:00:00Z", 2027],
  ])("on %s refreshes films from %i on", (at, from) => {
    expect(refreshFromYear(new Date(at), 2099)).toBe(from);
  });

  it("keeps the live season's films while the app still shows that season (a late ceremony)", () => {
    expect(refreshFromYear(new Date("2027-04-20T00:00:00Z"), 2026)).toBe(2026);
  });
});

describe("runScores: one film just added", () => {
  it("asks the store for that film only and writes no data_loads row", async () => {
    const { store, saved, recorded } = fakeStore([film(7)]);
    let asked: unknown;
    const queue = store.queue;
    store.queue = (opts) => ((asked = opts), queue(opts));
    const summary = await run(store, clients(() => ok({ imdbRating: 8, rtScore: 95, mcScore: 88 })), { source: "film", ids: [7] });
    expect(asked).toMatchObject({ ids: [7] });
    expect(summary.checked).toBe(1);
    expect(saved[0].update).toMatchObject({ imdbRating: 8, rtScore: 95, mcScore: 88, tmdbScore: 7.4 });
    expect(recorded).toEqual([]);
  });
});

describe("runScores: IMDb ratings from IMDb's own file", () => {
  const omdb = () => ok({ imdbRating: 7.9, rtScore: 95, mcScore: 98 });

  it("downloads the file once for the run and prefers its rating over OMDb's", async () => {
    const { store, saved } = fakeStore([film(1), film(2)]);
    const asked: string[][] = [];
    const ratings = (ids: string[]) => (asked.push(ids), rated(new Map([["tt1", 9.0]])));
    const summary = await run(store, clients(omdb, undefined, ratings));
    expect(asked).toEqual([["tt1", "tt2"]]);
    expect(saved[0].update).toMatchObject({ imdbRating: 9.0, rtScore: 95, mcScore: 98 });
    // Not in the file (too few votes): OMDb's rating stands.
    expect(saved[1].update).toMatchObject({ imdbRating: 7.9 });
    expect(summary.imdbFileFailed).toBeUndefined();
  });

  it("keeps the file's rating when OMDb fails for that film", async () => {
    const { store, saved } = fakeStore([film(1)]);
    await run(store, clients(() => ({ kind: "failed", reason: "OMDb: down" }), undefined, () => rated(new Map([["tt1", 8.4]]))));
    expect(saved[0].update).toMatchObject({ imdbRating: 8.4 });
    // OMDb's scores aren't touched: the stored RT and Metacritic stay.
    expect(saved[0].update).not.toHaveProperty("rtScore");
  });

  it("falls back to OMDb's rating, and says so, when the file can't be read", async () => {
    const { store, saved } = fakeStore([film(1)]);
    const summary = await run(store, clients(omdb, undefined, () => ({ kind: "failed", reason: "IMDb ratings file: HTTP 503" })));
    expect(saved[0].update).toMatchObject({ imdbRating: 7.9 });
    expect(summary.imdbFileFailed).toBe("IMDb ratings file: HTTP 503");
    expect(summary.stoppedBy).toBe("done");
  });

  it("doesn't download the file when no film due has an IMDb ID", async () => {
    let downloads = 0;
    const { store } = fakeStore([film(1, { imdbId: null })]);
    await run(store, clients(omdb, undefined, () => (downloads++, rated(new Map()))));
    expect(downloads).toBe(0);
  });

  it("asks the file only for the films the run can reach", async () => {
    const asked: string[][] = [];
    const { store } = fakeStore(Array.from({ length: 5 }, (_, i) => film(i + 1)));
    await run(store, clients(omdb, undefined, (ids) => (asked.push(ids), rated(new Map()))), { maxOmdbCalls: 2 });
    expect(asked).toEqual([["tt1", "tt2"]]);
  });

  it("doesn't count a film the file rated as failing when OMDb and TMDB are down", async () => {
    const films = Array.from({ length: 12 }, (_, i) => film(i + 1));
    const down = () => ({ kind: "failed" as const, reason: "down" });
    const all = new Map(films.map((f) => [f.imdbId!, 8.0]));
    const { store, saved } = fakeStore(films);
    const summary = await run(store, clients(down, down, () => rated(all)));
    expect(summary.stoppedBy).toBe("done");
    expect(saved).toHaveLength(12);
  });
});
