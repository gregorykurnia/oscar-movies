import { describe, expect, it } from "vitest";
import { fetchOmdb, fetchTmdb, parseOmdb, parseTmdb } from "./clients";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  (async () => new Response(JSON.stringify(body), { status, headers })) as typeof fetch;

describe("parseOmdb", () => {
  it("reads IMDb, Tomatometer and Metascore", () => {
    expect(
      parseOmdb({
        Response: "True",
        imdbRating: "8.1",
        Metascore: "85",
        Ratings: [
          { Source: "Internet Movie Database", Value: "8.1/10" },
          { Source: "Rotten Tomatoes", Value: "97%" },
        ],
      }),
    ).toEqual({ kind: "ok", value: { imdbRating: 8.1, rtScore: 97, mcScore: 85 } });
  });

  it("turns N/A and missing values into null, not 0", () => {
    expect(parseOmdb({ Response: "True", imdbRating: "N/A", Metascore: "N/A", Ratings: [] })).toEqual({
      kind: "ok",
      value: { imdbRating: null, rtScore: null, mcScore: null },
    });
  });

  it("stops the run on the daily limit or a bad key, and fails the film otherwise", () => {
    expect(parseOmdb({ Response: "False", Error: "Request limit reached!" }).kind).toBe("stop");
    expect(parseOmdb({ Response: "False", Error: "Invalid API key!" }).kind).toBe("stop");
    expect(parseOmdb({ Response: "False", Error: "Incorrect IMDb ID." }).kind).toBe("failed");
  });
});

describe("fetchOmdb", () => {
  it("reports a 429 as rate-limited with Retry-After", async () => {
    expect(await fetchOmdb("tt1", "k", json({}, 429, { "retry-after": "3" }))).toEqual({
      kind: "rate-limited",
      retryAfterMs: 3000,
    });
  });

  it("reads the limit message even on HTTP 401", async () => {
    const result = await fetchOmdb("tt1", "k", json({ Response: "False", Error: "Request limit reached!" }, 401));
    expect(result.kind).toBe("stop");
  });

  it("fails the film on a network error or a 5xx", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect((await fetchOmdb("tt1", "k", down)).kind).toBe("failed");
    expect((await fetchOmdb("tt1", "k", json({}, 503))).kind).toBe("failed");
  });
});

describe("TMDB", () => {
  it("rounds the user score to one decimal", () => {
    expect(parseTmdb({ vote_average: 7.918, vote_count: 1199 })).toEqual({ kind: "ok", value: { tmdbScore: 7.9 } });
  });

  it("has no score without votes", () => {
    expect(parseTmdb({ vote_average: 0, vote_count: 0 })).toEqual({ kind: "ok", value: { tmdbScore: null } });
  });

  it("stops on a refused token and fails the film on a 404", async () => {
    expect((await fetchTmdb(1, "t", json({}, 401))).kind).toBe("stop");
    expect((await fetchTmdb(1, "t", json({}, 404))).kind).toBe("failed");
  });
});
