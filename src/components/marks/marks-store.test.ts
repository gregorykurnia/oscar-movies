import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTap,
  createMarksStore,
  FAILED_RING_MS,
  failureMessage,
  SAVING_DELAY_MS,
  type MarkFailure,
  type MarkValue,
} from "./marks-store";

// Plan §5.6: flip at once, ring after 400ms, flip back on failure, last tap wins.

type Call = { input: { movieId: number } & MarkValue; resolve: (ok: boolean) => void; reject: () => void };

function setup(marks: ({ movieId: number } & MarkValue)[] = []) {
  const calls: Call[] = [];
  const failures: MarkFailure[] = [];
  const store = createMarksStore({
    save: (input) =>
      new Promise((resolve, reject) => {
        calls.push({ input, resolve: (ok) => resolve({ ok }), reject: () => reject(new Error("network")) });
      }),
    onFailure: (f) => failures.push(f),
  });
  store.hydrate(marks);
  return { store, calls, failures };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("applyTap", () => {
  it("watched clears want, and want clears watched", () => {
    expect(applyTap({ watched: false, want: true }, "watched")).toEqual({ watched: true, want: false });
    expect(applyTap({ watched: true, want: false }, "want")).toEqual({ watched: false, want: true });
  });

  it("turning a mark off leaves the other alone", () => {
    expect(applyTap({ watched: true, want: false }, "watched")).toEqual({ watched: false, want: false });
    expect(applyTap({ watched: false, want: true }, "want")).toEqual({ watched: false, want: false });
  });
});

describe("marks store", () => {
  it("marking watched clears want at once and saves the whole state", async () => {
    const { store, calls } = setup([{ movieId: 7, watched: false, want: true }]);
    store.tap(7, "watched", "Hamnet");
    expect(store.get(7).value).toEqual({ watched: true, want: false });
    expect(calls.map((c) => c.input)).toEqual([{ movieId: 7, watched: true, want: false }]);
    calls[0].resolve(true);
    await flush();
    expect(store.get(7)).toEqual({ value: { watched: true, want: false }, status: {} });
  });

  it("shows the saving ring only after 400ms", async () => {
    const { store, calls } = setup();
    store.tap(1, "want", "Flow");
    await vi.advanceTimersByTimeAsync(SAVING_DELAY_MS - 1);
    expect(store.get(1).status).toEqual({});
    await vi.advanceTimersByTimeAsync(1);
    expect(store.get(1).status).toEqual({ want: "saving" });
    calls[0].resolve(true);
    await flush();
    expect(store.get(1)).toEqual({ value: { watched: false, want: true }, status: {} });
  });

  it("a quick save never shows the ring", async () => {
    const { store, calls } = setup();
    store.tap(1, "watched", "Flow");
    calls[0].resolve(true);
    await vi.advanceTimersByTimeAsync(SAVING_DELAY_MS * 2);
    expect(store.get(1).status).toEqual({});
  });

  it("flips back on failure, with the red ring for 2s and a toast", async () => {
    const { store, calls, failures } = setup([{ movieId: 3, watched: false, want: true }]);
    store.tap(3, "watched", "Hamnet");
    expect(store.get(3).value).toEqual({ watched: true, want: false });
    calls[0].resolve(false);
    await flush();
    expect(store.get(3)).toEqual({ value: { watched: false, want: true }, status: { watched: "failed" } });
    expect(failures).toHaveLength(1);
    expect(failureMessage(failures[0].title, failures[0].shown)).toBe(
      "Hamnet is back to want to watch. Check the connection and try again.",
    );
    await vi.advanceTimersByTimeAsync(FAILED_RING_MS);
    expect(store.get(3)).toEqual({ value: { watched: false, want: true }, status: {} });
  });

  it("a request that throws (no connection) also flips back", async () => {
    const { store, calls, failures } = setup();
    store.tap(4, "watched", "Hamnet");
    calls[0].reject();
    await flush();
    expect(store.get(4).value).toEqual({ watched: false, want: false });
    expect(failureMessage("Hamnet", failures[0].shown)).toBe(
      "Hamnet is back to not watched. Check the connection and try again.",
    );
  });

  it("Try again sends the same state again", async () => {
    const { store, calls, failures } = setup();
    store.tap(5, "want", "Flow");
    calls[0].resolve(false);
    await flush();
    failures[0].retry();
    expect(store.get(5).value).toEqual({ watched: false, want: true });
    expect(calls[1].input).toEqual({ movieId: 5, watched: false, want: true });
    calls[1].resolve(true);
    await flush();
    expect(store.get(5)).toEqual({ value: { watched: false, want: true }, status: {} });
  });

  describe("two quick taps: the last one wins", () => {
    it("the second waits for the first, then is sent", async () => {
      const { store, calls } = setup();
      store.tap(9, "watched", "Anora");
      store.tap(9, "watched", "Anora");
      expect(store.get(9).value).toEqual({ watched: false, want: false });
      // One save in flight per film: the database sees the taps in order.
      expect(calls).toHaveLength(1);
      calls[0].resolve(true);
      await flush();
      // The older reply doesn't flip the mark back on.
      expect(store.get(9).value).toEqual({ watched: false, want: false });
      expect(calls.map((c) => c.input)).toEqual([
        { movieId: 9, watched: true, want: false },
        { movieId: 9, watched: false, want: false },
      ]);
      calls[1].resolve(true);
      await flush();
      expect(store.get(9)).toEqual({ value: { watched: false, want: false }, status: {} });
    });

    it("only the newest waiting tap is sent", async () => {
      const { store, calls } = setup();
      store.tap(9, "watched", "Anora");
      store.tap(9, "want", "Anora");
      store.tap(9, "watched", "Anora");
      calls[0].resolve(true);
      await flush();
      expect(calls.map((c) => c.input)).toEqual([{ movieId: 9, watched: true, want: false }]);
      // The newest state equals what was just saved: nothing more to send.
      expect(calls).toHaveLength(1);
      expect(store.get(9)).toEqual({ value: { watched: true, want: false }, status: {} });
    });

    it("sends the newest waiting tap when it differs", async () => {
      const { store, calls } = setup();
      store.tap(9, "watched", "Anora");
      store.tap(9, "want", "Anora");
      store.tap(9, "want", "Anora");
      store.tap(9, "want", "Anora");
      calls[0].resolve(true);
      await flush();
      expect(calls.map((c) => c.input)).toEqual([
        { movieId: 9, watched: true, want: false },
        { movieId: 9, watched: false, want: true },
      ]);
      calls[1].resolve(true);
      await flush();
      expect(store.get(9)).toEqual({ value: { watched: false, want: true }, status: {} });
    });

    it("an older request failing doesn't flip back or toast, and the newer is still sent", async () => {
      const { store, calls, failures } = setup();
      store.tap(9, "watched", "Anora");
      store.tap(9, "want", "Anora");
      calls[0].resolve(false);
      await flush();
      expect(failures).toHaveLength(0);
      expect(store.get(9).value).toEqual({ watched: false, want: true });
      calls[1].resolve(true);
      await flush();
      expect(store.get(9)).toEqual({ value: { watched: false, want: true }, status: {} });
    });

    it("the newest failing flips back to what the database last confirmed", async () => {
      const { store, calls, failures } = setup();
      store.tap(9, "want", "Anora");
      store.tap(9, "watched", "Anora");
      calls[0].resolve(true);
      await flush();
      calls[1].resolve(false);
      await flush();
      expect(store.get(9)).toEqual({ value: { watched: false, want: true }, status: { watched: "failed" } });
      expect(failures).toHaveLength(1);
    });

    it("a new tap clears the red ring", async () => {
      const { store, calls } = setup();
      store.tap(2, "watched", "Anora");
      calls[0].resolve(false);
      await flush();
      store.tap(2, "watched", "Anora");
      expect(store.get(2)).toEqual({ value: { watched: true, want: false }, status: {} });
    });

    it("Try again on an old toast does nothing after a newer tap", async () => {
      const { store, calls, failures } = setup();
      store.tap(4, "watched", "Anora");
      calls[0].resolve(false);
      await flush();
      store.tap(4, "want", "Anora");
      calls[1].resolve(true);
      await flush();
      failures[0].retry();
      expect(calls).toHaveLength(2);
      expect(store.get(4).value).toEqual({ watched: false, want: true });
    });
  });

  it("counts the films shown as want to watch, once the marks are read", () => {
    const store = createMarksStore({ save: () => new Promise(() => {}), onFailure: () => {} });
    expect(store.wantCount()).toBeUndefined();
    store.hydrate([
      { movieId: 1, watched: false, want: true },
      { movieId: 2, watched: true, want: false },
    ]);
    expect(store.wantCount()).toBe(1);
    store.tap(3, "want", "Flow");
    expect(store.wantCount()).toBe(2);
    store.tap(1, "watched", "Hamnet");
    expect(store.wantCount()).toBe(1);
  });

  it("other films are untouched", () => {
    const { store } = setup([{ movieId: 1, watched: true, want: false }]);
    store.tap(2, "want", "Flow");
    expect(store.get(1).value).toEqual({ watched: true, want: false });
  });

  it("taps do nothing until the marks are read, or if they couldn't be", () => {
    const save = vi.fn(() => Promise.resolve({ ok: true }));
    const store = createMarksStore({ save, onFailure: () => {} });
    expect(store.getPhase()).toBe("loading");
    store.tap(1, "watched", "Flow");
    store.hydrate(null);
    expect(store.getPhase()).toBe("failed");
    store.tap(1, "watched", "Flow");
    expect(save).not.toHaveBeenCalled();
    expect(store.get(1).value).toEqual({ watched: false, want: false });
  });

  it("new server marks replace the shown ones, except for a film still saving", async () => {
    const { store, calls } = setup([
      { movieId: 1, watched: true, want: false },
      { movieId: 2, watched: false, want: true },
    ]);
    store.tap(2, "want", "Flow");
    store.hydrate([
      { movieId: 2, watched: false, want: true },
      { movieId: 3, watched: true, want: false },
    ]);
    expect(store.get(1).value).toEqual({ watched: false, want: false });
    expect(store.get(2).value).toEqual({ watched: false, want: false });
    expect(store.get(3).value).toEqual({ watched: true, want: false });
    calls[0].resolve(true);
    await flush();
    expect(store.get(2).value).toEqual({ watched: false, want: false });
  });

  it("notifies subscribers and keeps an unchanged film's snapshot", () => {
    const { store } = setup([{ movieId: 1, watched: true, want: false }]);
    const before = store.get(1);
    const listener = vi.fn();
    store.subscribe(listener);
    store.tap(2, "want", "Flow");
    expect(listener).toHaveBeenCalled();
    expect(store.get(1)).toBe(before);
  });
});
