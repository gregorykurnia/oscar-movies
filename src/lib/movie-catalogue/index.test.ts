import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ readBranch: vi.fn(), fetch: vi.fn<typeof fetch>() }));
vi.mock("@/db", () => ({ getDb: () => "guarded-connection" }));
vi.mock("@/db/meta", () => ({ readDbBranch: state.readBranch }));
import { getMovieCatalogue } from "./index";

beforeEach(() => {
  vi.stubEnv("MOVIE_CATALOGUE_FIXTURES", "1");
  vi.stubEnv("EXPECT_DB_BRANCH", "test");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("TMDB_READ_TOKEN", "never-use-this-test-secret");
  state.readBranch.mockReset().mockResolvedValue("test");
  state.fetch.mockReset();
  vi.stubGlobal("fetch", state.fetch);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("server-side catalogue fixtures", () => {
  it("checks the actual database and exercises search and details without provider network", async () => {
    const client = await getMovieCatalogue();
    expect(state.readBranch).toHaveBeenCalledWith("guarded-connection");
    expect(await client.search("Mother")).toMatchObject({ ok: true, value: { films: [{ year: 2009 }, { year: 1926 }] } });
    expect(await client.details(99004003)).toMatchObject({ ok: true, value: { imdbId: null } });
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it.each(["production", null])("refuses fixtures against the actual %s branch", async (branch) => {
    state.readBranch.mockResolvedValue(branch);
    await expect(getMovieCatalogue()).rejects.toThrow("guarded test database");
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("refuses without EXPECT_DB_BRANCH=test and on production deployments even with test env", async () => {
    vi.stubEnv("EXPECT_DB_BRANCH", "");
    await expect(getMovieCatalogue()).rejects.toThrow("guarded test database");
    vi.stubEnv("EXPECT_DB_BRANCH", "test");
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(getMovieCatalogue()).rejects.toThrow("guarded test database");
    expect(state.readBranch).not.toHaveBeenCalled();
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("does not fall back to provider network when a guard fails or test fixtures are missing", async () => {
    state.readBranch.mockRejectedValueOnce(new Error("db unavailable"));
    await expect(getMovieCatalogue()).rejects.toThrow("db unavailable");
    vi.stubEnv("MOVIE_CATALOGUE_FIXTURES", "");
    await expect(getMovieCatalogue()).rejects.toThrow("test fixtures are required");
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["fixture:malformed", "invalid-response"], ["fixture:401", "refused"], ["fixture:403", "refused"],
    ["fixture:429", "rate-limited"], ["fixture:timeout", "timeout"], ["fixture:offline", "network"],
  ])("serves deterministic %s failure inside the server", async (query, error) => {
    expect(await (await getMovieCatalogue()).search(query)).toEqual({ ok: false, error });
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("uses the real client only outside fixture/test mode", async () => {
    vi.stubEnv("MOVIE_CATALOGUE_FIXTURES", "");
    vi.stubEnv("EXPECT_DB_BRANCH", "");
    vi.stubEnv("TMDB_READ_TOKEN", "");
    expect(await (await getMovieCatalogue()).search("Mother")).toEqual({ ok: false, error: "unavailable" });
    expect(state.readBranch).not.toHaveBeenCalled();
    expect(state.fetch).not.toHaveBeenCalled();
  });
});
