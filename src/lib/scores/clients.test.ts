import { describe, expect, it } from "vitest";
import { fetchLetterboxd, fetchOmdb, fetchTmdb, parseLetterboxd, parseOmdb, parseTmdb } from "./clients";

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

  it("has no score when TMDB rates 0.0 with votes (no real rating is below 0.5)", () => {
    expect(parseTmdb({ vote_average: 0, vote_count: 1 })).toEqual({ kind: "ok", value: { tmdbScore: null } });
  });

  it("stops on a refused token and fails the film on a 404", async () => {
    expect((await fetchTmdb(1, "t", json({}, 401))).kind).toBe("stop");
    expect((await fetchTmdb(1, "t", json({}, 404))).kind).toBe("failed");
  });
});

const filmPage = (ld: string) =>
  `<html><head><script type="application/ld+json">\n/* <![CDATA[ */\n${ld}\n/* ]]> */\n</script></head></html>`;

/** A page answer as fetch gives it after following redirects to `url`. */
const page = (html: string, url: string, status = 200) =>
  (async () => {
    const response = new Response(html, { status });
    Object.defineProperty(response, "url", { value: url });
    return response;
  }) as typeof fetch;

describe("Letterboxd", () => {
  it("reads the rating from the page's film data", () => {
    const html = filmPage('{"@type":"Movie","aggregateRating":{"@type":"AggregateRating","ratingValue":3.76,"ratingCount":2688991}}');
    expect(parseLetterboxd(html)).toEqual({ kind: "ok", value: { lbRating: 3.76 } });
  });

  it("has no rating when the film has none yet", () => {
    expect(parseLetterboxd(filmPage('{"@type":"Movie","name":"Soon"}'))).toEqual({ kind: "ok", value: { lbRating: null } });
  });

  it("fails the film on a page without film data (a block page)", () => {
    expect(parseLetterboxd("<html>Just a moment...</html>").kind).toBe("failed");
  });

  it("follows the TMDB link to the film page", async () => {
    const html = filmPage('{"aggregateRating":{"ratingValue":4.1}}');
    expect(await fetchLetterboxd(1, page(html, "https://letterboxd.com/film/anora/"))).toEqual({ kind: "ok", value: { lbRating: 4.1 } });
  });

  it("has no rating when Letterboxd doesn't have the film (no redirect)", async () => {
    expect(await fetchLetterboxd(1, page("<html>TMDB Import Result</html>", "https://letterboxd.com/tmdb/1/"))).toEqual({
      kind: "ok",
      value: { lbRating: null },
    });
  });

  it("finds the film data when its script tag carries other attributes", () => {
    const html = '<script nonce="x" type="application/ld+json">{"aggregateRating":{"ratingValue":3.5}}</script>';
    expect(parseLetterboxd(html)).toEqual({ kind: "ok", value: { lbRating: 3.5 } });
  });

  it("fails the film when the page drops mid-download", async () => {
    const stalled = (async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.error(new DOMException("The operation timed out.", "TimeoutError"));
        },
      });
      const response = new Response(body, { status: 200 });
      Object.defineProperty(response, "url", { value: "https://letterboxd.com/film/anora/" });
      return response;
    }) as typeof fetch;
    expect(await fetchLetterboxd(1, stalled)).toMatchObject({ kind: "failed" });
  });

  it("fails the film on a block or server error, and reports a 429", async () => {
    expect((await fetchLetterboxd(1, page("", "https://letterboxd.com/tmdb/1/", 403))).kind).toBe("failed");
    expect((await fetchLetterboxd(1, page("", "https://letterboxd.com/tmdb/1/", 503))).kind).toBe("failed");
    expect((await fetchLetterboxd(1, page("", "https://letterboxd.com/tmdb/1/", 429))).kind).toBe("rate-limited");
  });
});
