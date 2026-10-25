// The Watch list actions' input checks (7.4): anyone with the address can call them, so bad
// input never reaches the database. The writes themselves are tested on `test` in
// `tests/db/mark-write.test.ts`.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { writeWantAtTop, writeWantOrder, writeRelease } = vi.hoisted(() => ({
  writeWantAtTop: vi.fn(),
  writeWantOrder: vi.fn(),
  writeRelease: vi.fn(),
}));
vi.mock("@/db", () => ({ getDb: () => ({}) }));
vi.mock("@/data/marks", () => ({ writeWantAtTop, writeWantOrder, writeRelease }));

import { addToWatchList, reorderWatchList, setRelease } from "./watch-list";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("addToWatchList", () => {
  it("adds a film by id", async () => {
    writeWantAtTop.mockResolvedValue(true);
    expect(await addToWatchList(12)).toEqual({ ok: true });
    expect(writeWantAtTop).toHaveBeenCalledWith({}, 12);
  });

  it.each([[0], [-3], [1.5], ["12"], [null]])("refuses %j without writing", async (id) => {
    expect(await addToWatchList(id as number)).toEqual({ ok: false });
    expect(writeWantAtTop).not.toHaveBeenCalled();
  });

  it("says so when the film doesn't exist or the write fails", async () => {
    writeWantAtTop.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("down"));
    expect(await addToWatchList(12)).toEqual({ ok: false });
    expect(await addToWatchList(12)).toEqual({ ok: false });
  });
});

describe("reorderWatchList", () => {
  it("saves an order", async () => {
    writeWantOrder.mockResolvedValue("ok");
    expect(await reorderWatchList([3, 1, 2])).toEqual({ ok: true });
    expect(writeWantOrder).toHaveBeenCalledWith({}, [3, 1, 2]);
  });

  it("reports a stale order", async () => {
    writeWantOrder.mockResolvedValue("stale");
    expect(await reorderWatchList([3, 1])).toEqual({ ok: false, reason: "stale" });
  });

  it.each([[[1, 1]], [[1, 0]], [[1, 2.5]], ["1,2"]])("refuses %j without writing", async (ids) => {
    expect(await reorderWatchList(ids as number[])).toEqual({ ok: false, reason: "failed" });
    expect(writeWantOrder).not.toHaveBeenCalled();
  });

  it("reports a failed write", async () => {
    writeWantOrder.mockRejectedValue(new Error("down"));
    expect(await reorderWatchList([1])).toEqual({ ok: false, reason: "failed" });
  });
});

describe("setRelease", () => {
  it("saves a date and a trimmed platform", async () => {
    writeRelease.mockResolvedValue(true);
    expect(await setRelease(7, "2026-12-12", "  Netflix ")).toEqual({ ok: true });
    expect(writeRelease).toHaveBeenCalledWith({}, 7, { releaseOn: "2026-12-12", platform: "Netflix" });
  });

  it("saves TBD and a blank platform as empty", async () => {
    writeRelease.mockResolvedValue(true);
    expect(await setRelease(7, null, "   ")).toEqual({ ok: true });
    expect(writeRelease).toHaveBeenCalledWith({}, 7, { releaseOn: null, platform: null });
  });

  it.each([
    ["a date that isn't one", 7, "12 Dec 2026", null],
    ["an impossible date", 7, "2026-02-30", null],
    ["a platform over 40 characters", 7, null, "x".repeat(41)],
    ["a bad film id", 0, null, null],
  ])("refuses %s without writing", async (_, id, date, platform) => {
    expect(await setRelease(id as number, date as string | null, platform as string | null)).toEqual({ ok: false });
    expect(writeRelease).not.toHaveBeenCalled();
  });
});
