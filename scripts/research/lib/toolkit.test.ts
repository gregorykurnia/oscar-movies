// Unit tests for the toolkit's parts on small hand-made inputs: the fetcher's cache and
// manners, wikitables, the resolver's redirects and dead links, the TMDB fallback, slugs and
// the writer's formatting and merges. The saved-page test is research.test.ts.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { EditionFile, MoviesFile } from "../../../src/lib/data-files";
import { bcp47, fetchFacts, plainTitle } from "./facts";
import { createFetcher, USER_AGENT } from "./fetcher";
import { resolveArticles } from "./resolve";
import { slugify, uniqueSlug } from "./slug";
import { column, readNomineeLists, readWikitables } from "./tables";
import type { Claim } from "./wikidata";
import { titleFromHref } from "./wikipedia";
import { formatEditionFile, formatMoviesFile, inline, mergeEdition } from "./writer";

type Route = (url: URL) => unknown;

/** A fetch that answers JSON by URL and records each call. */
function fakeFetch(route: Route, calls: Array<{ url: string; headers: Record<string, string> }> = []) {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), headers: (init?.headers ?? {}) as Record<string, string> });
    const body = route(url);
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
}

const noSleep = async () => {};

describe("createFetcher", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  it("sends a polite user agent, caches responses and serves the cache next time", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fetcher-"));
    dirs.push(dir);
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchImpl = fakeFetch(() => ({ ok: 1 }), calls);
    const first = createFetcher({ cacheDir: dir, fetchImpl, sleep: noSleep });
    expect(await first.getJson("https://example.org/a", { label: "a" })).toEqual({ ok: 1 });
    expect(calls[0].headers["User-Agent"]).toBe(USER_AGENT);
    const second = createFetcher({ cacheDir: dir, fetchImpl, offline: true });
    expect(await second.getJson("https://example.org/a", { label: "a" })).toEqual({ ok: 1 });
    expect(calls).toHaveLength(1);
    await expect(second.getJson("https://example.org/b")).rejects.toThrow(/Offline and not cached/);
  });

  it("makes one request at a time, even when callers don't wait", async () => {
    let inFlight = 0;
    let most = 0;
    const fetchImpl = (async () => {
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return new Response("{}");
    }) as unknown as typeof fetch;
    const fetcher = createFetcher({ cacheDir: null, fetchImpl, minIntervalMs: 0 });
    await Promise.all([1, 2, 3].map((n) => fetcher.getJson(`https://example.org/${n}`)));
    expect(most).toBe(1);
    expect(fetcher.requests).toBe(3);
  });

  it("retries a 429 and gives up on a 404", async () => {
    let n = 0;
    const fetchImpl = fakeFetch((url) =>
      url.pathname === "/busy" && n++ === 0 ? new Response("", { status: 429 }) : url.pathname === "/gone" ? new Response("", { status: 404 }) : { done: true },
    );
    const fetcher = createFetcher({ cacheDir: null, fetchImpl, sleep: noSleep });
    expect(await fetcher.getJson("https://example.org/busy")).toEqual({ done: true });
    await expect(fetcher.getJson("https://example.org/gone")).rejects.toThrow(/404/);
  });
});

describe("tables", () => {
  it("turns a link into its article title, and skips files and red links", () => {
    expect(titleFromHref("/wiki/I%27m_Still_Here_(2024_film)")).toBe("I'm Still Here (2024 film)");
    expect(titleFromHref("/wiki/File:Poster.jpg")).toBeNull();
    const [list] = readNomineeLists(
      `<table><tr><td><div><b>Best Picture</b></div><ul><li><b><i><a href="/wiki/A">A</a></i> ‡</b><ul>
       <li><i><a href="/w/index.php?title=B_film&action=edit&redlink=1" class="new">B</a></i> – someone</li>
       <li><i>C</i></li></ul></li></ul></td></tr></table>`,
    );
    expect(list.category).toBe("Best Picture");
    expect(list.nominees.map((n) => [n.film, n.winner])).toEqual([
      [{ article: "A", text: "A" }, true],
      [{ article: null, text: "B" }, false],
      [{ article: null, text: "C" }, false],
    ]);
  });

  it("spreads rowspan and colspan so every row has every column", () => {
    const [table] = readWikitables(
      `<div class="mw-heading mw-heading2"><h2 id="Submissions">Submissions</h2></div>
       <table class="wikitable"><tbody>
       <tr><th>Country</th><th>Film title</th><th>Result</th></tr>
       <tr><td rowspan="2"><a href="/wiki/Brazil">Brazil</a></td><td><i><a href="/wiki/X_(film)">X</a></i><sup class="reference">[1]</sup></td><td rowspan="2">Nominee</td></tr>
       <tr><td><i><a href="/wiki/Y">Y</a></i></td></tr>
       <tr><td colspan="2">Withdrawn</td><td>–</td></tr>
       </tbody></table>`,
    );
    expect(table.section).toBe("Submissions");
    expect(table.headers).toEqual(["Country", "Film title", "Result"]);
    const film = column(table, /film title/i);
    expect(table.rows.map((r) => [r[0].text, r[film].film?.article ?? r[film].text, r[2].text])).toEqual([
      ["Brazil", "X (film)", "Nominee"],
      ["Brazil", "Y", "Nominee"],
      ["Withdrawn", "Withdrawn", "–"],
    ]);
    expect(() => column(table, /director/i)).toThrow(/No column/);
  });
});

describe("resolveArticles", () => {
  it("follows redirects and reports links that lead nowhere", async () => {
    const fetchImpl = fakeFetch((url) => {
      if (url.hostname === "en.wikipedia.org") {
        return {
          query: {
            normalized: [{ from: "old_title", to: "Old title" }],
            redirects: [{ from: "Old title", to: "New title" }],
            pages: [
              { title: "New title", pageprops: { wikibase_item: "Q1" } },
              { title: "No item", pageprops: {} },
              { title: "Gone", missing: true },
            ],
          },
        };
      }
      return {
        entities: {
          Q1: {
            id: "Q1",
            claims: {
              P345: [
                { rank: "deprecated", mainsnak: { snaktype: "value", datavalue: { type: "string", value: "tt999" } } },
                { rank: "normal", mainsnak: { snaktype: "value", datavalue: { type: "string", value: "tt123" } } },
              ],
            },
          },
        },
      };
    });
    const fetcher = createFetcher({ cacheDir: null, fetchImpl, minIntervalMs: 0 });
    const out = await resolveArticles(fetcher, ["old_title", "No item", "Gone"]);
    const found = out.get("old_title");
    expect(found?.ok && [found.film.page, found.film.wd, found.film.imdb, found.film.tmdb]).toEqual(["New title", "Q1", "tt123", undefined]);
    expect(out.get("No item")).toMatchObject({ ok: false, reason: '"No item" has no Wikidata item' });
    expect(out.get("Gone")).toMatchObject({ ok: false, reason: "no such Wikipedia article" });
  });
});

describe("fetchFacts", () => {
  const value = (v: unknown, type: string): Claim[] => [{ rank: "normal", mainsnak: { snaktype: "value", datavalue: { type, value: v } } }];

  it("asks TMDB for what Wikidata lacks, and only then", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const wikidata = createFetcher({
      cacheDir: null,
      minIntervalMs: 0,
      fetchImpl: fakeFetch(() => ({ claims: {} })),
    });
    const tmdbFetcher = createFetcher({
      cacheDir: null,
      minIntervalMs: 0,
      fetchImpl: fakeFetch(
        (url) =>
          url.pathname.startsWith("/3/find/")
            ? { movie_results: [{ id: 42, original_language: "fr" }] }
            : { origin_country: ["FR"], production_countries: [{ iso_3166_1: "FR" }, { iso_3166_1: "BE" }], original_language: "fr" },
        calls,
      ),
    });
    const entity = { id: "Q5", labels: { en: { value: "The Film" } }, claims: { P1476: value({ text: "Le Film", language: "fr" }, "monolingualtext") } };
    const facts = await fetchFacts(wikidata, { article: "The Film", page: "The Film", wd: "Q5", imdb: "tt5", entity }, "The Film", {
      fetcher: tmdbFetcher,
      token: "secret",
    });
    expect(facts).toEqual({ title: "The Film", originalTitle: "Le Film", originalLang: "fr", countries: ["FR", "BE"], language: "fr", wd: "Q5", tmdb: 42 });
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(["/3/find/tt5", "/3/movie/42"]);
    expect(calls[0].headers.Authorization).toBe("Bearer secret");
  });

  it("writes no TMDB fields without a token, and leaves countries empty rather than guess", async () => {
    const wikidata = createFetcher({ cacheDir: null, minIntervalMs: 0, fetchImpl: fakeFetch(() => ({ claims: {} })) });
    const entity = { id: "Q6", sitelinks: { enwiki: { title: "Quiet (2019 film)" } } };
    expect(await fetchFacts(wikidata, { article: "Quiet", page: "Quiet", wd: "Q6", entity }, "Quiet")).toEqual({
      title: "Quiet",
      countries: [],
      wd: "Q6",
    });
  });

  it("tidies titles and language tags", () => {
    expect(plainTitle("Flow (2024 film)")).toBe("Flow");
    expect(plainTitle("Wicked (film)")).toBe("Wicked");
    expect(plainTitle("Persona (1966 Swedish film)")).toBe("Persona");
    expect(bcp47("pt-br")).toBe("pt-BR");
    expect(bcp47("zh-hant")).toBe("zh-hant");
  });
});

describe("slugs", () => {
  it("are plain ASCII from the title, with the year (then a number) when taken", () => {
    expect(slugify("Emilia Pérez")).toBe("emilia-perez");
    expect(slugify("I'm Still Here")).toBe("im-still-here");
    expect(slugify("Wallace & Gromit: Vengeance Most Fowl")).toBe("wallace-and-gromit-vengeance-most-fowl");
    expect(uniqueSlug("Flow", 2024, new Set())).toBe("flow");
    expect(uniqueSlug("Flow", 2024, new Set(["flow"]))).toBe("flow-2024");
    expect(uniqueSlug("Flow", 2024, new Set(["flow", "flow-2024"]))).toBe("flow-2024-2");
    expect(uniqueSlug("…", 2024, new Set())).toBe("film");
  });
});

describe("writer", () => {
  it("writes the repo's data files back byte for byte", () => {
    const movies = readFileSync("data/movies/2024.json", "utf8");
    expect(formatMoviesFile(JSON.parse(movies) as MoviesFile)).toBe(movies);
    const edition = readFileSync("data/editions/oscars/2024.json", "utf8");
    expect(formatEditionFile(JSON.parse(edition) as EditionFile)).toBe(edition);
    expect(inline({ a: 1, b: undefined, c: ["US", "GB"] })).toBe('{ "a": 1, "c": ["US", "GB"] }');
  });

  const edition = (results: EditionFile["results"]): EditionFile => ({
    award: "oscars",
    year: 2024,
    status: "loaded",
    sourceUrls: [],
    results,
    screenings: [],
  });

  it("keeps listed films in place, appends new ones and drops ones no longer on the page", () => {
    const old = edition([
      { category: "picture", imdb: "tt2", title: "B", outcome: "nominated" },
      { category: "picture", imdb: "tt1", title: "A", outcome: "nominated" },
      { category: "picture", imdb: "tt9", title: "Gone", outcome: "nominated" },
    ]);
    const next = edition([
      { category: "picture", imdb: "tt1", title: "A", outcome: "won" },
      { category: "picture", imdb: "tt3", title: "C", outcome: "nominated" },
      { category: "picture", imdb: "tt2", title: "B", outcome: "nominated" },
    ]);
    expect(mergeEdition(old, next).results.map((r) => `${r.imdb}:${r.outcome}`)).toEqual(["tt2:nominated", "tt1:won", "tt3:nominated"]);
  });

  it("keeps a film resolved by hand when the rerun still can't resolve it", () => {
    const old = edition([{ category: "documentary", wd: "Q77", title: "Small Doc", outcome: "nominated" }]);
    const next = edition([{ category: "documentary", title: "Small Doc", outcome: "won", unresolved: true }]);
    expect(mergeEdition(old, next).results).toEqual([{ category: "documentary", wd: "Q77", imdb: undefined, title: "Small Doc", outcome: "won" }]);
  });
});
