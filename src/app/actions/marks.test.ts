import { beforeEach, expect, it, vi } from "vitest";
const { transaction, writeMark } = vi.hoisted(() => ({ transaction: vi.fn(), writeMark: vi.fn() }));
vi.mock("@/db", () => ({ withFilmTransaction: transaction }));
vi.mock("@/data/marks", () => ({ writeMark }));
import { saveMark } from "./marks";
beforeEach(() => {
  vi.resetAllMocks();
  transaction.mockImplementation((write) => write({ locked: true }));
  writeMark.mockResolvedValue(true);
});
it("routes both want and watched changes through the shared transaction", async () => {
  for (const state of [{ want: true, watched: false }, { want: false, watched: true }]) {
    expect(await saveMark({ movieId: 1, ...state })).toEqual({ ok: true });
    expect(writeMark).toHaveBeenLastCalledWith({ locked: true }, 1, state);
  }
  expect(transaction).toHaveBeenCalledTimes(2);
});
it("rejects invalid input before opening a transaction", async () => {
  expect(await saveMark({ movieId: 1, want: true, watched: true })).toEqual({ ok: false });
  expect(transaction).not.toHaveBeenCalled();
});
