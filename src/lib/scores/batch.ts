// The score batch (plan §5.4), shared by `/api/cron/scores` and `npm run scores:refresh`. The
// database sits behind `ScoreStore` and the APIs behind `ScoreClients`, so the rules here are
// unit tested without either.
import type { ClientResult, OmdbScores, TmdbScores } from "./clients";
import { mergeScores, SCORE_KEYS, type FetchedScores, type ScoreKey, type ScoreUpdate, type StoredScores } from "./merge";

export type QueueFilm = StoredScores & {
  id: number;
  imdbId: string | null;
  tmdbId: number | null;
  year: number;
  scoresCheckedAt: Date | null;
};

export type QueueOptions = { now: Date; years?: { from: number; to: number } };

export type ScoreStore = {
  /** The films due, in the order to check them (`store.ts` has the rule). */
  queue(opts: QueueOptions): Promise<QueueFilm[]>;
  save(movieId: number, update: ScoreUpdate): Promise<void>;
  record(summary: RunSummary): Promise<void>;
};

export type ScoreClients = {
  omdb(imdbId: string): Promise<ClientResult<OmdbScores>>;
  tmdb(tmdbId: number): Promise<ClientResult<TmdbScores>>;
};

export type StopReason = "done" | "call-limit" | "deadline" | "rate-limited" | "refused" | "failing";

export type RunSummary = {
  source: "cron" | "script";
  due: number;
  checked: number;
  omdbCalls: number;
  tmdbCalls: number;
  confirmed: Record<ScoreKey, number>;
  /** Films with at least one score that differs from the stored one. */
  changedFilms: number;
  failures: number;
  /** The first few failures, for the `data_loads` row. */
  errors: { movieId: number; reason: string }[];
  stoppedBy: StopReason;
  stopReason?: string;
};

/** At most this many OMDb calls a run; more while films were never checked (free key: 1,000 a day). */
export const OMDB_CALLS = { normal: 300, catchUp: 900 } as const;
export const DEADLINE_MS = 250_000;
const MAX_ERRORS_KEPT = 20;
/** This many films in a row with every call failing means the source is down: stop. */
const MAX_FAILING_IN_A_ROW = 10;
const RATE_LIMIT_TRIES = 3;
const RATE_LIMIT_WAIT_MS = 5_000;
const RATE_LIMIT_WAIT_MAX_MS = 30_000;

export type RunOptions = {
  source: RunSummary["source"];
  years?: QueueOptions["years"];
  /** Overrides the OMDb call cap (`--limit`). */
  maxOmdbCalls?: number;
  deadlineMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runScores(store: ScoreStore, clients: ScoreClients, opts: RunOptions): Promise<RunSummary> {
  const now = opts.now ?? (() => new Date());
  const sleep = opts.sleep ?? realSleep;
  const log = opts.log ?? (() => {});
  const started = now().getTime();
  const deadline = started + (opts.deadlineMs ?? DEADLINE_MS);

  const queue = await store.queue({ now: now(), years: opts.years });
  const maxOmdb =
    opts.maxOmdbCalls ?? (queue.some((f) => f.scoresCheckedAt === null) ? OMDB_CALLS.catchUp : OMDB_CALLS.normal);

  const summary: RunSummary = {
    source: opts.source,
    due: queue.length,
    checked: 0,
    omdbCalls: 0,
    tmdbCalls: 0,
    confirmed: Object.fromEntries(SCORE_KEYS.map((k) => [k, 0])) as Record<ScoreKey, number>,
    changedFilms: 0,
    failures: 0,
    errors: [],
    stoppedBy: "done",
  };
  const stop = (by: StopReason, reason?: string) => {
    summary.stoppedBy = by;
    if (reason) summary.stopReason = reason;
  };
  const fail = (movieId: number, reason: string) => {
    summary.failures++;
    if (summary.errors.length < MAX_ERRORS_KEPT) summary.errors.push({ movieId, reason });
  };

  /** One call, waiting and trying again on a rate limit. */
  async function call<T>(fn: () => Promise<ClientResult<T>>): Promise<ClientResult<T>> {
    for (let attempt = 1; ; attempt++) {
      const result = await fn();
      if (result.kind !== "rate-limited") return result;
      const wait = Math.min(result.retryAfterMs ?? RATE_LIMIT_WAIT_MS, RATE_LIMIT_WAIT_MAX_MS);
      if (attempt >= RATE_LIMIT_TRIES || now().getTime() + wait > deadline) return result;
      log(`Rate limited; waiting ${Math.round(wait / 1000)} s.`);
      await sleep(wait);
    }
  }

  let failingInARow = 0;
  for (const film of queue) {
    if (now().getTime() >= deadline) {
      stop("deadline");
      break;
    }
    if (film.imdbId && summary.omdbCalls >= maxOmdb) {
      stop("call-limit", `${maxOmdb} OMDb calls`);
      break;
    }

    const fetched: FetchedScores = {};
    let calls = 0;
    let failed = 0;
    let halt: { by: StopReason; reason: string } | null = null;

    if (film.imdbId) {
      calls++;
      summary.omdbCalls++;
      const result = await call(() => clients.omdb(film.imdbId!));
      if (result.kind === "ok") Object.assign(fetched, result.value);
      else if (result.kind === "failed") {
        failed++;
        fail(film.id, result.reason);
      } else halt = result.kind === "stop" ? { by: "refused", reason: result.reason } : { by: "rate-limited", reason: "OMDb" };
    }
    if (!halt && film.tmdbId !== null) {
      calls++;
      summary.tmdbCalls++;
      const result = await call(() => clients.tmdb(film.tmdbId!));
      if (result.kind === "ok") Object.assign(fetched, result.value);
      else if (result.kind === "failed") {
        failed++;
        fail(film.id, result.reason);
      } else halt = result.kind === "stop" ? { by: "refused", reason: result.reason } : { by: "rate-limited", reason: "TMDB" };
    }
    // A refused or rate-limited call says nothing about the film: leave it due for the next run.
    if (halt) {
      stop(halt.by, halt.reason);
      break;
    }

    const merged = mergeScores(film, fetched, now());
    await store.save(film.id, merged.update);
    summary.checked++;
    for (const key of merged.confirmed) summary.confirmed[key]++;
    if (merged.changed.length > 0) summary.changedFilms++;

    failingInARow = calls > 0 && failed === calls ? failingInARow + 1 : 0;
    if (failingInARow >= MAX_FAILING_IN_A_ROW) {
      stop("failing", `${MAX_FAILING_IN_A_ROW} films in a row had every call fail`);
      break;
    }
  }

  await store.record(summary);
  return summary;
}

/** One line for the script's output and the logs. */
export function describeRun(s: RunSummary): string {
  const c = s.confirmed;
  const stopped = s.stoppedBy === "done" ? "" : ` Stopped early: ${s.stoppedBy}${s.stopReason ? ` (${s.stopReason})` : ""}.`;
  return (
    `Checked ${s.checked} of ${s.due} films due (${s.omdbCalls} OMDb, ${s.tmdbCalls} TMDB calls). ` +
    `Confirmed IMDb ${c.imdbRating}, RT ${c.rtScore}, MC ${c.mcScore}, TMDB ${c.tmdbScore}; ` +
    `${s.changedFilms} films changed; ${s.failures} failed calls.${stopped}`
  );
}
