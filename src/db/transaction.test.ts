import { beforeEach, expect, it, vi } from "vitest";
const { execute, close, transaction, drizzle } = vi.hoisted(() => ({ execute: vi.fn(), close: vi.fn(), transaction: vi.fn(), drizzle: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@neondatabase/serverless", () => ({ Pool: class { end = close; constructor(public options: unknown) {} } }));
vi.mock("drizzle-orm/neon-serverless", () => ({ drizzle }));
import { withFilmTransaction } from "./index";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DATABASE_URL_POOLED", "test-pooled-connection");
  drizzle.mockReturnValue({ transaction });
  transaction.mockImplementation((write) => write({ execute }));
});

it("locks before any callback reads/writes and closes the request pool after commit", async () => {
  const write = vi.fn().mockResolvedValue("saved");
  expect(await withFilmTransaction(write)).toBe("saved");
  expect(execute).toHaveBeenCalledTimes(1);
  expect(execute.mock.invocationCallOrder[0]).toBeLessThan(write.mock.invocationCallOrder[0]);
  expect(close).toHaveBeenCalledTimes(1);
  expect(drizzle.mock.calls[0][0].client.options).toEqual({ connectionString: "test-pooled-connection" });
});

it("closes after a callback failure or lock failure", async () => {
  await expect(withFilmTransaction(async () => { throw new Error("mark failed"); })).rejects.toThrow("mark failed");
  execute.mockRejectedValueOnce(new Error("lock failed"));
  const write = vi.fn();
  await expect(withFilmTransaction(write)).rejects.toThrow("lock failed");
  expect(write).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(2);
});

it("reports a committed write as saved even if closing the pool fails (9.R)", async () => {
  close.mockRejectedValueOnce(new Error("close failed"));
  expect(await withFilmTransaction(vi.fn().mockResolvedValue("saved"))).toBe("saved");
});
