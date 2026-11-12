import { beforeEach, describe, expect, it, vi } from "vitest";
const { transaction, saveFilm, details, catalogue, updateTag, fetchScores } = vi.hoisted(() => ({
  transaction: vi.fn(), saveFilm: vi.fn(), details: vi.fn(), catalogue: vi.fn(), updateTag: vi.fn(), fetchScores: vi.fn(),
}));
vi.mock("@/lib/scores/after-add", () => ({ fetchScoresAfterResponse: fetchScores }));
vi.mock("@/db", () => ({ withFilmTransaction: transaction }));
vi.mock("@/data/add-film", () => ({ saveFilm }));
vi.mock("@/lib/movie-catalogue", () => ({ getMovieCatalogue: catalogue }));
vi.mock("next/cache", () => ({ updateTag }));
import { addFilm } from "./add-film";
import { addFilmInputSchema, addFilmSlug, type AddFilmInput } from "@/lib/add-film";

const manual: AddFilmInput = { kind: "manual", localId: "276f39f4-a1fd-46b8-8ac6-f63e3e5b0111", title: "  New film  ", year: 2030 };
const selected: AddFilmInput = { kind: "catalogue", localId: manual.localId, tmdbId: 123 };
const film = { id: 99, slug: "new-film", title: "New film", year: 2030 };
beforeEach(() => {
  vi.resetAllMocks();
  transaction.mockImplementation((write) => write({ tx: true }));
  saveFilm.mockResolvedValue({ ok: true, film, created: true });
  catalogue.mockResolvedValue({ details });
  details.mockResolvedValue({ ok: true, value: { tmdbId: 123, title: "Trusted title", year: 2030 } });
});

describe("add film validation and identity", () => {
  it.each([
    { ...manual, title: " " }, { ...manual, title: "a".repeat(301) },
    { ...manual, year: 1799 }, { ...manual, year: 10000 }, { ...manual, year: 2030.1 },
    { ...manual, year: "2030" }, { ...manual, localId: "bad" }, { ...selected, tmdbId: 0 },
    { ...selected, title: "Forged metadata" }, { ...selected, imdbId: "tt123" },
    { ...manual, duplicate: { kind: "use", movieId: 0 } }, { ...manual, duplicate: { kind: "merge" } },
  ])("rejects bad input without any database or provider access: %j", async (raw) => {
    expect(await addFilm(raw as AddFilmInput)).toEqual({ ok: false, reason: "invalid-input" });
    expect(transaction).not.toHaveBeenCalled();
    expect(catalogue).not.toHaveBeenCalled();
  });

  it("accepts title/year boundaries, trims and normalizes UUID case", () => {
    expect(addFilmInputSchema.parse({ ...manual, localId: manual.localId.toUpperCase(), year: 1800 })).toMatchObject({ title: "New film", year: 1800, localId: manual.localId });
    expect(addFilmInputSchema.safeParse({ ...manual, title: "a".repeat(300), year: 9999 }).success).toBe(true);
  });

  it("builds stable, collision-safe slugs for repeated and non-Latin titles", () => {
    expect(addFilmSlug("Été", 2030, manual.localId)).toBe(`ete-2030-${manual.localId}`);
    expect(addFilmSlug("映画", 2030, "tmdb-123")).toBe("film-2030-tmdb-123");
    expect(addFilmSlug("Mother", 2009, "tmdb-1")).not.toBe(addFilmSlug("Mother", 2009, "tmdb-2"));
  });
});

describe("add film action", () => {
  it("saves manual input without needing a catalogue and invalidates cached misses after commit", async () => {
    expect(await addFilm(manual)).toEqual({ ok: true, film, created: true, refreshRequired: false });
    expect(catalogue).not.toHaveBeenCalled();
    expect(saveFilm).toHaveBeenCalledWith({ tx: true }, { input: { ...manual, title: "New film" } });
    expect(updateTag).toHaveBeenCalledWith("awards");
    expect(transaction.mock.invocationCallOrder[0]).toBeLessThan(updateTag.mock.invocationCallOrder[0]);
    expect(fetchScores).toHaveBeenCalledWith(99);
  });

  it("fetches trusted details before opening the transaction", async () => {
    await addFilm(selected);
    expect(details).toHaveBeenCalledWith(123);
    expect(details.mock.invocationCallOrder[0]).toBeLessThan(transaction.mock.invocationCallOrder[0]);
    expect(saveFilm).toHaveBeenCalledWith({ tx: true }, expect.objectContaining({ details: { tmdbId: 123, title: "Trusted title", year: 2030 } }));
  });

  it.each(["unavailable", "not-found", "refused", "timeout", "rate-limited", "invalid-response"])("keeps %s failures out of transactions", async (error) => {
    details.mockResolvedValue({ ok: false, error });
    expect(await addFilm(selected)).toEqual({ ok: false, reason: error });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("requires an explicit missing year before writing", async () => {
    details.mockResolvedValue({ ok: true, value: { tmdbId: 123, year: null } });
    expect(await addFilm(selected)).toEqual({ ok: false, reason: "missing-year" });
    expect(transaction).not.toHaveBeenCalled();
    expect((await addFilm({ ...selected, year: 2035 })).ok).toBe(true);
  });

  it.each(["identity-conflict", "draft-changed", "duplicate"])("returns a recoverable %s refusal without invalidating caches", async (reason) => {
    const result = { ok: false, reason, ...(reason === "duplicate" ? { matches: [film] } : {}) };
    saveFilm.mockResolvedValue(result);
    expect(await addFilm(manual)).toEqual(result);
    expect(updateTag).not.toHaveBeenCalled();
    expect(fetchScores).not.toHaveBeenCalled();
  });

  it("reports a transaction failure without returning success", async () => {
    transaction.mockRejectedValue(new Error("rollback"));
    expect(await addFilm(manual)).toEqual({ ok: false, reason: "failed" });
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("keeps the saved identity and supplies a refresh hint if post-commit invalidation fails", async () => {
    updateTag.mockImplementation(() => { throw new Error("cache unavailable"); });
    expect(await addFilm(manual)).toEqual({ ok: true, film, created: true, refreshRequired: true });
    saveFilm.mockResolvedValue({ ok: true, film, created: false });
    expect(await addFilm(manual)).toEqual({ ok: true, film, created: false, refreshRequired: true });
  });
});
