// The marks on the page (plan §5.1, §5.6), kept outside React so every rule is unit tested:
// a tap flips the mark at once (watched clears want, want clears watched), the save runs
// behind it, the gold ring shows only after 400ms, a failed save flips the mark back with a
// red ring for 2s and a toast, and of two quick taps the last one wins. A film has at most one
// save in flight: a tap during it waits, and only the newest waiting state is sent when it
// settles, so saves reach the database in tap order even when a navigation lets Next run
// Server Actions side by side (1.R). `MarksProvider` holds one store for the whole app.
import type { MarkValue } from "@/data/marks";
import type { MarkKind, MarkStatus } from "./Marks";

export type { MarkValue };

export type SaveMark = (input: { movieId: number } & MarkValue) => Promise<{ ok: boolean }>;

/** Details for the failure toast; `retry` sends the same state again. */
export type MarkFailure = { movieId: number; title: string; shown: MarkValue; retry: () => void };

/** One film's marks as a component reads them. Replaced (never mutated) when they change. */
export type FilmMarksSnapshot = {
  value: MarkValue;
  status: Partial<Record<MarkKind, MarkStatus>>;
};

/** loading: marks not read yet; ready; failed: the marks couldn't be read, so they can't be changed. */
export type MarksPhase = "loading" | "ready" | "failed";

export const SAVING_DELAY_MS = 400;
export const FAILED_RING_MS = 2000;

const NONE: MarkValue = { watched: false, want: false };
const IDLE: FilmMarksSnapshot = { value: NONE, status: {} };

/** What the server renders (it never has the marks): hydration must start from exactly this. */
export const SERVER_SNAPSHOT = { film: IDLE, phase: "loading" as MarksPhase };

/** The state after tapping one mark: on clears the other mark, off clears only itself. */
export function applyTap(current: MarkValue, kind: MarkKind): MarkValue {
  if (current[kind]) return { ...current, [kind]: false };
  return kind === "watched" ? { watched: true, want: false } : { watched: false, want: true };
}

/** "Hamnet is back to not watched." (guide §11 Errors) */
export function failureMessage(title: string, shown: MarkValue): string {
  const state = shown.watched ? "watched" : shown.want ? "want to watch" : "not watched";
  return `${title} is back to ${state}. Check the connection and try again.`;
}

/** One save: the state sent, the mark tapped, and its number. */
type Request = { seq: number; kind: MarkKind; target: MarkValue; title: string };

const same = (a: MarkValue, b: MarkValue) => a.watched === b.watched && a.want === b.want;

type Film = {
  snapshot: FilmMarksSnapshot;
  /** The state the database holds, as far as the replies tell. */
  confirmed: MarkValue;
  /** The newest request's number; a reply to any older one doesn't change what's shown. */
  seq: number;
  /** The newest request whose reply has arrived. */
  settledSeq: number;
  /** The request `confirmed` came from, so an older success arriving late can't overwrite it. */
  confirmedSeq: number;
  /** A save is on its way; taps meanwhile wait in `queued`. */
  inFlight: boolean;
  /** The newest tap made while a save was in flight (older waiting taps are dropped). */
  queued: Request | null;
  timers: ReturnType<typeof setTimeout>[];
};

export function createMarksStore({ save, onFailure }: { save: SaveMark; onFailure: (failure: MarkFailure) => void }) {
  const films = new Map<number, Film>();
  const listeners = new Set<() => void>();
  let phase: MarksPhase = "loading";

  const emit = () => listeners.forEach((listener) => listener());

  function film(movieId: number): Film {
    let f = films.get(movieId);
    if (!f) {
      f = { snapshot: IDLE, confirmed: NONE, seq: 0, settledSeq: 0, confirmedSeq: 0, inFlight: false, queued: null, timers: [] };
      films.set(movieId, f);
    }
    return f;
  }

  const pending = (f: Film) => f.settledSeq < f.seq;

  function clearTimers(f: Film) {
    f.timers.forEach(clearTimeout);
    f.timers = [];
  }

  function show(f: Film, value: MarkValue, status: FilmMarksSnapshot["status"] = {}) {
    f.snapshot = { value, status };
  }

  /** Shows `target` at once and saves it as the film's whole state. `kind` is the mark tapped. */
  function set(movieId: number, kind: MarkKind, target: MarkValue, title: string) {
    if (phase !== "ready") return;
    const f = film(movieId);
    const seq = ++f.seq;
    clearTimers(f);
    show(f, target);
    f.timers.push(
      setTimeout(() => {
        if (f.seq !== seq || !pending(f)) return;
        show(f, f.snapshot.value, { [kind]: "saving" });
        emit();
      }, SAVING_DELAY_MS),
    );
    emit();
    const request: Request = { seq, kind, target, title };
    if (f.inFlight) f.queued = request;
    else send(movieId, f, request);
  }

  function send(movieId: number, f: Film, request: Request) {
    f.inFlight = true;
    const done = (ok: boolean) => {
      f.inFlight = false;
      const next = f.queued;
      f.queued = null;
      finish(movieId, f, request, ok);
      if (!next) return;
      // The database already holds the newest state: nothing left to send.
      if (ok && same(next.target, request.target)) finish(movieId, f, next, true);
      else send(movieId, f, next);
    };
    save({ movieId, ...request.target }).then(
      (result) => done(result?.ok === true),
      () => done(false),
    );
  }

  /** A save's reply: what the database holds, and what's shown if it's the newest tap. */
  function finish(movieId: number, f: Film, { seq, kind, target, title }: Request, ok: boolean) {
    f.settledSeq = Math.max(f.settledSeq, seq);
    if (ok && seq > f.confirmedSeq) {
      f.confirmed = target;
      f.confirmedSeq = seq;
    }
    // An older reply: the newer request decides what's shown.
    if (seq !== f.seq) return;
    clearTimers(f);
    if (ok) {
      show(f, target);
    } else {
      const shown = f.confirmed;
      show(f, shown, { [kind]: "failed" });
      f.timers.push(
        setTimeout(() => {
          if (f.seq !== seq) return;
          show(f, f.snapshot.value);
          emit();
        }, FAILED_RING_MS),
      );
      // Try again from an old toast does nothing once a newer tap was made.
      onFailure({ movieId, title, shown, retry: () => f.seq === seq && set(movieId, kind, target, title) });
    }
    emit();
  }

  const get = (movieId: number): FilmMarksSnapshot => films.get(movieId)?.snapshot ?? IDLE;

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getPhase: () => phase,
    get,
    /** Films shown as want to watch (the phone menu's "N to watch"); undefined until the marks are read. */
    wantCount(): number | undefined {
      if (phase !== "ready") return undefined;
      let n = 0;
      for (const f of films.values()) if (f.snapshot.value.want) n++;
      return n;
    },
    /**
     * The marks read on the server (`null`: they couldn't be read). Films with a save in
     * flight keep what the page shows; every other film takes the server's state.
     */
    hydrate(marks: ({ movieId: number } & MarkValue)[] | null) {
      if (marks === null) {
        if (phase === "loading") phase = "failed";
        emit();
        return;
      }
      const server = new Map(marks.map((m) => [m.movieId, { watched: m.watched, want: m.want }]));
      for (const [movieId, f] of films) {
        if (pending(f) || server.has(movieId)) continue;
        f.confirmed = NONE;
        if (f.snapshot.value.watched || f.snapshot.value.want) show(f, NONE, f.snapshot.status);
      }
      for (const [movieId, value] of server) {
        const f = film(movieId);
        if (pending(f)) continue;
        f.confirmed = value;
        if (f.snapshot.value.watched !== value.watched || f.snapshot.value.want !== value.want) {
          show(f, value, f.snapshot.status);
        }
      }
      phase = "ready";
      emit();
    },
    tap(movieId: number, kind: MarkKind, title: string) {
      set(movieId, kind, applyTap(get(movieId).value, kind), title);
    },
  };
}

export type MarksStore = ReturnType<typeof createMarksStore>;
