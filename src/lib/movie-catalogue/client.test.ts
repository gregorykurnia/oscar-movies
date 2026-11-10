import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createTmdbCatalogue } from "./client";
import { catalogueFixtureFetch, catalogueFixtureMovies } from "./fixtures";

const details = catalogueFixtureMovies[0];
const page = (results: unknown[] = [details], extra = {}) => ({ page: 1, total_pages: 1, total_results: results.length, results, ...extra });
const withBody = (body: unknown) => vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
afterEach(() => vi.useRealTimers());

describe("bounded TMDB catalogue", () => {
  it("makes one fixed-host uncached adult-filtered request with the token only in its header", async () => {
    const fetchImpl = withBody(page([details], { total_pages: 1000 }));
    const result = await createTmdbCatalogue("secret-test-token", fetchImpl).search("  Mother & child  ");
    expect(result).toEqual({ ok: true, value: {
      films: [{ tmdbId: 99004001, title: "Mother", originalTitle: "마더", year: 2009, overview: details.overview }],
      page: 1, nextPage: 2,
    } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(new URL(String(url)).origin).toBe("https://api.themoviedb.org");
    expect(new URL(String(url)).searchParams.get("query")).toBe("Mother & child");
    expect(new URL(String(url)).searchParams.get("include_adult")).toBe("false");
    expect(init).toMatchObject({ cache: "no-store", redirect: "error", headers: { authorization: "Bearer secret-test-token" } });
    expect(String(url) + JSON.stringify(result)).not.toContain("secret-test-token");
  });

  it("validates search text, page and IDs before fetching", async () => {
    const fetchImpl = withBody(page());
    const client = createTmdbCatalogue("test", fetchImpl);
    for (const query of ["", "   ", "a".repeat(201)]) expect(await client.search(query)).toEqual({ ok: false, error: "invalid-input" });
    for (const n of [0, -1, 1.5, NaN, Infinity, 501]) expect(await client.search("Mother", n)).toEqual({ ok: false, error: "invalid-input" });
    for (const id of [0, -1, 1.5, NaN, Infinity, 2_147_483_648]) expect(await client.details(id)).toEqual({ ok: false, error: "invalid-input" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await createTmdbCatalogue(undefined, fetchImpl).search("Mother")).toEqual({ ok: false, error: "unavailable" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts boundary queries/pages and never paginates past 500", async () => {
    const result = await createTmdbCatalogue("test", withBody(page([], { page: 500, total_pages: 999 }))).search("a".repeat(200), 500);
    expect(result).toEqual({ ok: true, value: { films: [], page: 500, nextPage: null } });
  });

  it("distinguishes empty results and retains same-title films, upcoming films and unknown years", async () => {
    const client = createTmdbCatalogue("test", catalogueFixtureFetch);
    const result = await client.search("fixture:all");
    expect(result.ok && result.value.films.map((film) => [film.title, film.year])).toEqual([
      ["Mother", 2009], ["Mother", 1926], ["Upcoming fixture", 2030], ["Unknown year fixture", null], ["Deleted fixture", 2024],
    ]);
    expect(await client.search("fixture:empty")).toEqual({ ok: true, value: { films: [], page: 1, nextPage: null } });
  });

  it.each([
    [401, "refused"], [403, "refused"], [404, "not-found"], [429, "rate-limited"], [500, "provider-error"], [302, "provider-error"],
  ])("maps HTTP %s without forwarding its response or retrying", async (status, error) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("secret provider body", { status: Number(status) }));
    expect(await createTmdbCatalogue("test", fetchImpl).search("Mother")).toEqual({ ok: false, error });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("contains thrown network errors and invalid/oversized JSON", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("Bearer secret from network"));
    expect(await createTmdbCatalogue("test", fetchImpl).search("Mother")).toEqual({ ok: false, error: "network" });
    for (const text of ["not JSON", "x".repeat(256 * 1024 + 1)]) {
      fetchImpl.mockResolvedValueOnce(new Response(text));
      expect(await createTmdbCatalogue("test", fetchImpl).search("Mother")).toEqual({ ok: false, error: "invalid-response" });
    }
  });

  it.each([
    null, {}, page([{ ...details, id: -1 }]), page([{ ...details, title: "x".repeat(301) }]),
    page([{ ...details, original_title: "x".repeat(301) }]), page([{ ...details, overview: "x".repeat(10_001) }]),
    page([{ ...details, release_date: "2024-02-30" }]), page([{ ...details, release_date: "0000-01-01" }]),
    page(Array(21).fill(details)), page([details], { page: 2 }),
  ])("refuses malformed or unbounded search reply %#", async (body) => {
    expect(await createTmdbCatalogue("test", withBody(body)).search("Mother")).toEqual({ ok: false, error: "invalid-response" });
  });

  it("drops adult results and bounds displayed overviews", async () => {
    const result = await createTmdbCatalogue("test", withBody(page([
      { ...details, adult: true }, { ...details, overview: "a".repeat(600) },
    ]))).search("Mother");
    expect(result.ok && result.value.films).toHaveLength(1);
    expect(result.ok && result.value.films[0].overview).toHaveLength(500);
  });

  it.each(["fetch", "body"])("times out %s after exactly eight seconds and aborts", async (phase) => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      if (phase === "fetch") return new Promise(() => {});
      return Promise.resolve(new Response(new ReadableStream({
        start(controller) { init?.signal?.addEventListener("abort", () => controller.error(new Error("aborted"))); },
      })));
    });
    const pending = createTmdbCatalogue("test", fetchImpl).search("Mother");
    await vi.advanceTimersByTimeAsync(7999);
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toEqual({ ok: false, error: "timeout" });
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("fetches fresh details with all identities, countries and the existing score parser", async () => {
    const fetchImpl = withBody(details);
    const result = await createTmdbCatalogue("test", fetchImpl).details(details.id);
    expect(String(fetchImpl.mock.calls[0][0])).toBe("https://api.themoviedb.org/3/movie/99004001?append_to_response=external_ids");
    expect(result).toMatchObject({ ok: true, value: {
      tmdbId: details.id, imdbId: "tt99004001", wikidataId: "Q99004001", title: "Mother", originalTitle: "마더",
      year: 2009, language: "ko", countries: ["KR"], tmdbScore: 7.6,
    } });
    const upcoming = await createTmdbCatalogue("test", catalogueFixtureFetch).details(99004003);
    expect(upcoming).toMatchObject({ ok: true, value: { imdbId: null, wikidataId: null, countries: [], tmdbScore: null } });
    expect(await createTmdbCatalogue("test", catalogueFixtureFetch).details(99004005)).toEqual({ ok: false, error: "not-found" });
  });

  it.each([
    { id: 2 }, { imdb_id: "bad" }, { vote_count: -1 }, { vote_count: 1.5 }, { vote_average: 11 },
    { origin_country: ["invalid"] }, { original_language: "invalid" }, { external_ids: {} , adult: true },
    { external_ids: { imdb_id: "tt2" } }, { external_ids: { wikidata_id: "bad" } },
  ])("rejects invalid/mismatched detail fields %#", async (patch) => {
    expect(await createTmdbCatalogue("test", withBody({ ...details, ...patch })).details(details.id)).toEqual({ ok: false, error: "invalid-response" });
  });

  it("preserves language without inventing countries and handles TMDB's special language codes", async () => {
    for (const [code, language] of [["cn", "yue"], ["xx", null], ["ja", "ja"]]) {
      const result = await createTmdbCatalogue("test", withBody({ ...details, original_language: code, origin_country: [], production_countries: [], vote_count: 0 })).details(details.id);
      expect(result).toMatchObject({ ok: true, value: { language, countries: [], tmdbScore: null } });
    }
  });
});
