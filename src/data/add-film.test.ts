import { expect, it, vi } from "vitest";
import type { FilmTransaction } from "@/db";
import { saveFilm } from "./add-film";

const draft = { input: { kind: "manual" as const, localId: "276f39f4-a1fd-46b8-8ac6-f63e3e5b0111", title: "Retry", year: 2030 } };
it("re-reads once through a new savepoint after a unique conflict", async () => {
  const result = { ok: true, film: { id: 1, slug: "retry", title: "Retry", year: 2030 }, created: false };
  const transaction = vi.fn().mockRejectedValueOnce({ cause: { code: "23505" } }).mockResolvedValueOnce(result);
  expect(await saveFilm({ transaction } as unknown as FilmTransaction, draft)).toEqual(result);
  expect(transaction).toHaveBeenCalledTimes(2);
});
it("bounds conflicts to two attempts and never retries unrelated failures", async () => {
  const transaction = vi.fn().mockRejectedValue({ cause: { code: "23505" } });
  expect(await saveFilm({ transaction } as unknown as FilmTransaction, draft)).toEqual({ ok: false, reason: "identity-conflict" });
  expect(transaction).toHaveBeenCalledTimes(2);
  transaction.mockReset().mockRejectedValue(new Error("mark insert failed"));
  await expect(saveFilm({ transaction } as unknown as FilmTransaction, draft)).rejects.toThrow("mark insert failed");
  expect(transaction).toHaveBeenCalledTimes(1);
});
