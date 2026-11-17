import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
const runScores = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));
vi.mock("@/db", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/scores", () => ({
  runScores,
  createScoreStore: () => ({}),
  scoreClientsFromEnv: () => ({}),
  describeRun: () => "",
}));

const linkHandAddedFilms = vi.fn();
vi.mock("@/lib/movie-catalogue", () => ({ getMovieCatalogue: async () => ({}) }));
vi.mock("@/lib/scores/link-film", () => ({ linkHandAddedFilms }));

const { GET } = await import("./route");

const get = (headers: Record<string, string> = {}) =>
  GET(new Request("http://localhost/api/cron/scores", { headers }));

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", "s3cret");
  runScores.mockReset().mockResolvedValue({ checked: 3 });
  linkHandAddedFilms.mockReset().mockResolvedValue(0);
  revalidateTag.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/scores", () => {
  it("refuses a missing or wrong secret and runs nothing", async () => {
    expect((await get()).status).toBe(401);
    expect((await get({ authorization: "Bearer nope" })).status).toBe(401);
    expect((await get({ authorization: "s3cret" })).status).toBe(401);
    expect(runScores).not.toHaveBeenCalled();
  });

  it("refuses every call when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await get({ authorization: "Bearer " })).status).toBe(401);
    vi.stubEnv("CRON_SECRET", undefined);
    expect((await get({ authorization: "Bearer undefined" })).status).toBe(401);
    expect(runScores).not.toHaveBeenCalled();
  });

  it("runs the batch with the right secret and expires the scores", async () => {
    const response = await get({ authorization: "Bearer s3cret" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ checked: 3 });
    expect(runScores).toHaveBeenCalledWith({}, {}, expect.objectContaining({ source: "cron" }));
    expect(revalidateTag).toHaveBeenCalledWith("scores", { expire: 0 });
  });

  it("retries linking hand-added films to TMDB before it scores", async () => {
    linkHandAddedFilms.mockResolvedValue(2);
    await get({ authorization: "Bearer s3cret" });
    expect(linkHandAddedFilms).toHaveBeenCalledWith({}, {}, expect.any(Number));
    expect(linkHandAddedFilms.mock.invocationCallOrder[0]).toBeLessThan(runScores.mock.invocationCallOrder[0]);
    // The batch gets what's left of its 250 seconds.
    const { deadlineMs } = runScores.mock.calls[0][2];
    expect(deadlineMs).toBeGreaterThan(0);
    expect(deadlineMs).toBeLessThanOrEqual(250_000);
  });
});
