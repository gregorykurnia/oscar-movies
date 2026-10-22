import { describe, expect, it } from "vitest";
import { runScores, type QueueFilm, type RunSummary, type ScoreClients, type ScoreStore } from "./batch";
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
const clients = (
  omdb: (id: string) => ClientResult<OmdbScores>,
  tmdb: (id: number) => ClientResult<TmdbScores> = () => ok({ tmdbScore: 7.4 }),
): ScoreClients => ({ omdb: async (id) => omdb(id), tmdb: async (id) => tmdb(id) });

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

  it("stops at the OMDb call cap, more while films were never checked", async () => {
    const checked = new Date("2026-09-01T00:00:00Z");
    const many = (n: number, extra: Partial<QueueFilm>) => Array.from({ length: n }, (_, i) => film(i + 1, extra));
    const c = clients(() => ok({ imdbRating: 7, rtScore: null, mcScore: null }));

    const due = await run(fakeStore(many(310, { scoresCheckedAt: checked })).store, c);
    expect([due.omdbCalls, due.stoppedBy]).toEqual([300, "call-limit"]);

    const fresh = await run(fakeStore(many(910, {})).store, c);
    expect([fresh.omdbCalls, fresh.stoppedBy]).toEqual([900, "call-limit"]);

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
