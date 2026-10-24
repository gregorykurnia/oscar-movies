// Unit tests for the IMDb importer (task 6.1): the fetcher's POST and page caches, the season rule,
// title matching, the label map and the merge rules of docs/imdb-import.md §3.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { awardsFileSchema, type EditionFile } from "../../src/lib/data-files";
import { mapNominations, mergeImdb, readImdbPart, sourcesSchema, splitNote, SOURCES, wikipediaPart, type ImdbRow, type MergeInput } from "./imdb";
import { createFetcher } from "./lib/fetcher";
import { chooseTitle, editionSeasons, samePerson, type ImdbCandidate, type ImdbNomination } from "./lib/imdb";

const noSleep = async () => {};

describe("fetcher postJson and getText", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  function setup() {
    const dir = mkdtempSync(join(tmpdir(), "imdb-fetcher-"));
    dirs.push(dir);
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method ?? "GET", body: init?.body as string | undefined });
      if (String(input).endsWith("/page")) return new Response("<p>page</p>", { status: 200 });
      return new Response(JSON.stringify({ echo: init?.body ?? null }), { status: 200 });
    }) as typeof fetch;
    return { dir, calls, fetcher: createFetcher({ cacheDir: dir, fetchImpl, sleep: noSleep }), fetchImpl };
  }

  it("caches a POST by URL and body: another body is another request, the same body is not", async () => {
    const { dir, calls, fetcher, fetchImpl } = setup();
    await fetcher.postJson("https://example.org/gql", { q: 1 }, { label: "q" });
    await fetcher.postJson("https://example.org/gql", { q: 2 }, { label: "q" });
    await fetcher.postJson("https://example.org/gql", { q: 1 }, { label: "q" });
    expect(calls.map((c) => c.body)).toEqual(['{"q":1}', '{"q":2}']);
    expect(calls[0].method).toBe("POST");
    expect(readdirSync(dir)).toHaveLength(2);
    const offline = createFetcher({ cacheDir: dir, fetchImpl, offline: true });
    expect(await offline.postJson("https://example.org/gql", { q: 2 }, { label: "q" })).toEqual({ echo: '{"q":2}' });
    await expect(offline.postJson("https://example.org/gql", { q: 3 }, { label: "q" })).rejects.toThrow(/Offline and not cached/);
  });

  it("keeps a page's text apart from a JSON answer at the same URL", async () => {
    const { dir, calls, fetcher } = setup();
    expect(await fetcher.getText("https://example.org/page", { label: "p" })).toBe("<p>page</p>");
    expect(await fetcher.getText("https://example.org/page", { label: "p" })).toBe("<p>page</p>");
    expect(calls).toHaveLength(1);
    const [file] = readdirSync(dir);
    expect(JSON.parse(readFileSync(join(dir, file), "utf8"))).toEqual({ text: "<p>page</p>" });
    // getJson of the same URL is a different cache key, so it goes to the network.
    await fetcher.getJson("https://example.org/page", { label: "p" }).catch(() => undefined);
    expect(calls).toHaveLength(2);
  });
});

const nom = (titleId: string, year: number, instance = 1, extra: Partial<ImdbNomination> = {}): ImdbNomination & { event: string } => ({
  id: `an-${titleId}-${year}`,
  titleId,
  event: "ev0000001",
  edition: { id: `ed-${year}-${instance}`, year, instance },
  category: "Best Film",
  award: "Award",
  won: false,
  ...extra,
});

describe("editionSeasons", () => {
  it("takes the film year most nominees have, of Y and Y − 1", () => {
    const years: Record<string, number> = { a: 2023, b: 2023, c: 2024, d: 2024, e: 2024, f: 2023 };
    const seasons = editionSeasons([nom("a", 2024), nom("b", 2024), nom("c", 2024), nom("d", 2025), nom("e", 2025), nom("f", 2025)], (t) => years[t]);
    expect(seasons.get("ed-2024-1")).toBe(2023);
    expect(seasons.get("ed-2025-1")).toBe(2024);
  });

  it("splits two editions in one calendar year (Atlanta 2021)", () => {
    const years: Record<string, number> = { a: 2020, b: 2020, c: 2021, d: 2021 };
    const seasons = editionSeasons([nom("a", 2021, 1), nom("b", 2021, 1), nom("c", 2021, 2), nom("d", 2021, 2)], (t) => years[t]);
    expect(seasons.get("ed-2021-1")).toBe(2020);
    expect(seasons.get("ed-2021-2")).toBe(2021);
  });

  it("settles a tie or an unknown year by the event's usual lag", () => {
    const years: Record<string, number> = { a: 2019, b: 2020, c: 2020, d: 2021, x: 2021, y: 2022 };
    const december = editionSeasons([nom("a", 2020), nom("b", 2020), nom("c", 2020), nom("d", 2021), nom("x", 2022), nom("y", 2022)], (t) => years[t]);
    expect(december.get("ed-2020-1")).toBe(2020);
    expect(december.get("ed-2022-1")).toBe(2022);
    const unknown = editionSeasons([nom("q", 2018)], () => undefined);
    expect(unknown.get("ed-2018-1")).toBe(2017);
  });
});

describe("samePerson and chooseTitle", () => {
  it("matches a credit by family name and first initial, ignoring accents and punctuation", () => {
    expect(samePerson("Agnès Varda", "Agnes Varda")).toBe(true);
    expect(samePerson("J.R. Smith", "John Smith")).toBe(true);
    expect(samePerson("Jane Smith", "John Smith")).toBe(true);
    expect(samePerson("Mary Smith", "John Smith")).toBe(false);
    expect(samePerson("John Smyth", "John Smith")).toBe(false);
    expect(samePerson("", "John Smith")).toBe(false);
  });

  const hit = (id: string, year: number, type: string, directors: string[]): ImdbCandidate => ({ id, title: "Flow", year, type, directors });

  it("takes the one feature within two years sharing a director", () => {
    const candidates = [hit("tt1", 2024, "movie", ["Gints Zilbalodis"]), hit("tt2", 2024, "short", ["Gints Zilbalodis"]), hit("tt3", 2010, "movie", ["Gints Zilbalodis"]), hit("tt4", 2024, "movie", ["Someone Else"])];
    expect(chooseTitle(candidates, 2024, ["Gints Zilbalodis"])).toEqual({ ok: true, id: "tt1" });
  });

  it("refuses none or several", () => {
    expect(chooseTitle([hit("tt4", 2024, "movie", ["Someone Else"])], 2024, ["Gints Zilbalodis"])).toMatchObject({ ok: false, reason: /no IMDb title/ });
    expect(chooseTitle([hit("tt1", 2024, "movie", ["G. Zilbalodis"]), hit("tt5", 2023, "tvMovie", ["Gints Zilbalodis"])], 2024, ["Gints Zilbalodis"])).toMatchObject({ ok: false, reason: /2 IMDb titles/ });
  });
});

describe("mapNominations", () => {
  it("keeps mapped labels only, files each by its edition's film year and lets a win beat a nomination", () => {
    const labels = { "Best Film": "picture", "Best Documentary": "documentary", "Cinema Eye Audience Choice Prize": "audience" };
    const seasons = new Map([["ev0000001/2024/1", 2023], ["ev0000001/2025/1", 2024]]);
    const rows = mapNominations(
      [
        nom("tt1", 2024, 1, { won: true }),
        nom("tt1", 2024, 1, { category: "Best Film", won: false, id: "dup" }),
        nom("tt2", 2024, 1),
        nom("tt3", 2024, 1, { category: "Best Actor" }),
        nom("tt4", 2025, 1, { category: null, award: "Cinema Eye Audience Choice Prize", won: true }),
        nom("tt5", 2026, 1),
      ],
      labels,
      seasons,
      (t) => `T${t}`,
    );
    expect([...rows.keys()].sort()).toEqual([2023, 2024]);
    expect(rows.get(2023)).toEqual([
      { category: "picture", imdb: "tt1", title: "Ttt1", won: true, edition: "ev0000001/2024/1" },
      { category: "picture", imdb: "tt2", title: "Ttt2", won: false, edition: "ev0000001/2024/1" },
    ]);
    expect(rows.get(2024)).toEqual([{ category: "audience", imdb: "tt4", title: "Ttt4", won: true, edition: "ev0000001/2025/1" }]);
  });

  it("the committed label map names only categories the registry has", () => {
    const sources = sourcesSchema.parse(JSON.parse(readFileSync(SOURCES, "utf8")));
    const registry = awardsFileSchema.parse(JSON.parse(readFileSync("data/awards.json", "utf8")));
    for (const [award, labels] of Object.entries(sources.labels)) {
      const entry = registry.find((a) => a.slug === award);
      expect(entry, award).toBeDefined();
      expect(sources.events[award], award).toBeDefined();
      for (const category of Object.values(labels)) expect(entry!.categories.map((c) => c.slug), `${award} ${category}`).toContain(category);
    }
  });

  it("each false-tie correction (`notWinners`) names an award and category the registry has", () => {
    const sources = sourcesSchema.parse(JSON.parse(readFileSync(SOURCES, "utf8")));
    const registry = awardsFileSchema.parse(JSON.parse(readFileSync("data/awards.json", "utf8")));
    for (const key of Object.keys(sources.notWinners)) {
      const [award, , category] = key.split(" ");
      expect(registry.find((a) => a.slug === award)?.categories.map((c) => c.slug), key).toContain(category);
    }
  });
});

const AWARD: MergeInput["award"] = {
  slug: "atlanta-critics",
  shortName: "Atlanta",
  winnersOnly: false,
  categories: [
    { slug: "picture", name: "Best Film", oscarCategory: "picture", sortOrder: 1 },
    { slug: "documentary", name: "Best Documentary", oscarCategory: "documentary", sortOrder: 2 },
    { slug: "animated", name: "Best Animated Film", oscarCategory: "animated", sortOrder: 3 },
  ],
} as MergeInput["award"];

const row = (category: string, imdb: string, won = false): ImdbRow => ({ category, imdb, title: imdb.toUpperCase(), won, edition: "ev0005289/2025/1" });
const noData: EditionFile = { award: "atlanta-critics", year: 2024, status: "no_data", sourceUrls: [], note: "Atlanta has no data for 2024 films.", results: [], screenings: [] };

describe("mergeImdb", () => {
  const merge = (existing: EditionFile | undefined, rows: ImdbRow[], extra: Partial<MergeInput> = {}) =>
    mergeImdb({ award: AWARD, year: 2024, existing, rows, absent: new Set(), leftOut: [], ...extra });

  it("turns a no_data edition into a partial one with IMDb's rows, the event page and a note", () => {
    const out = merge(noData, [row("picture", "tt1", true), row("picture", "tt2"), row("documentary", "tt3", true)]);
    expect(out.edition).toMatchObject({ status: "partial", sourceUrls: ["https://www.imdb.com/event/ev0005289/2025/1/"] });
    expect(out.edition.results).toEqual([
      { category: "picture", imdb: "tt1", title: "TT1", outcome: "won" },
      { category: "picture", imdb: "tt2", title: "TT2", outcome: "nominated" },
      { category: "documentary", imdb: "tt3", title: "TT3", outcome: "won" },
    ]);
    expect(out.edition.note).toBe(
      "From IMDb's award records: Best Film; Best Documentary (winners only). IMDb gives no announcement date. Not on IMDb: Best Animated Film.",
    );
    expect(out.edition.winnersOn).toBeUndefined();
  });

  it("keeps Wikipedia's results and reports where IMDb differs, never writing it", () => {
    const wiki: EditionFile = {
      ...noData,
      status: "loaded",
      winnersOn: "2024-12-10",
      nominationsOn: "2024-12-01",
      sourceUrls: ["https://en.wikipedia.org/wiki/X"],
      note: undefined,
      results: [
        { category: "picture", imdb: "tt1", title: "TT1", outcome: "won" },
        { category: "picture", imdb: "tt2", title: "TT2", outcome: "nominated" },
        { category: "documentary", imdb: "tt3", title: "TT3", outcome: "won" },
        { category: "animated", imdb: "tt5", title: "TT5", outcome: "won" },
      ],
    };
    const out = merge(wiki, [row("picture", "tt2", true), row("picture", "tt1"), row("documentary", "tt3", true), row("animated", "tt5", true)]);
    expect(out.edition).toEqual(wiki);
    expect(out.changed).toEqual([]);
    expect(out.compared.map((c) => [c.category, c.winnersAgree, c.nomineesAgree])).toEqual([
      ["picture", false, true],
      ["documentary", true, null],
      ["animated", true, null],
    ]);
  });

  it("adds IMDb's nominees under the same winner, and fills an empty category of a partial edition", () => {
    const wiki: EditionFile = {
      ...noData,
      status: "partial",
      sourceUrls: ["https://en.wikipedia.org/wiki/X"],
      note: "Only the winners are listed.",
      results: [{ category: "picture", imdb: "tt1", title: "TT1", outcome: "won" }],
    };
    const out = merge(wiki, [row("picture", "tt1", true), row("picture", "tt2"), row("animated", "tt6", true), row("animated", "tt7")]);
    expect(out.edition.results).toEqual([
      { category: "picture", imdb: "tt1", title: "TT1", outcome: "won" },
      { category: "picture", imdb: "tt2", title: "TT2", outcome: "nominated" },
      { category: "animated", imdb: "tt6", title: "TT6", outcome: "won" },
      { category: "animated", imdb: "tt7", title: "TT7", outcome: "nominated" },
    ]);
    expect(out.edition.status).toBe("partial");
    expect(out.edition.sourceUrls).toEqual(["https://en.wikipedia.org/wiki/X", "https://www.imdb.com/event/ev0005289/2025/1/"]);
    expect(out.edition.note).toBe(
      "Only the winners are listed. From IMDb's award records: Best Animated Film; nominees for Best Film. IMDb gives no announcement date. Not on IMDb: Best Documentary.",
    );
  });

  it("adds no nominees when the winners differ or the group names only winners", () => {
    const wiki: EditionFile = { ...noData, status: "partial", sourceUrls: ["https://en.wikipedia.org/wiki/X"], note: "n", results: [{ category: "picture", imdb: "tt1", title: "TT1", outcome: "won" }] };
    expect(merge(wiki, [row("picture", "tt9", true), row("picture", "tt2")]).edition.results).toHaveLength(1);
    const winnersOnly = mergeImdb({ award: { ...AWARD, winnersOnly: true }, year: 2024, existing: wiki, rows: [row("picture", "tt1", true), row("picture", "tt2")], absent: new Set(), leftOut: [] });
    expect(winnersOnly.edition.results).toHaveLength(1);
  });

  it("leaves a category the group didn't give empty, and names films left out", () => {
    const out = merge(noData, [row("picture", "tt1", true), row("animated", "tt6", true)], { absent: new Set(["animated"]), leftOut: [{ title: "Gone", reason: "no film record could be matched" }] });
    expect(out.edition.results.map((r) => r.category)).toEqual(["picture"]);
    expect(out.problems[0]).toMatch(/animated/);
    expect(out.edition.note).toContain('Left out: "Gone" (no film record could be matched).');
  });

  it("leaves a no_data edition alone when IMDb has nothing", () => {
    expect(merge(noData, []).edition).toBe(noData);
    expect(merge(undefined, []).edition.status).toBe("no_data");
  });

  it("changes nothing on a second run (an earlier run's rows and sentence are read back)", () => {
    const wiki: EditionFile = {
      ...noData,
      status: "partial",
      sourceUrls: ["https://en.wikipedia.org/wiki/X"],
      note: "Only the winners are listed.",
      results: [{ category: "picture", imdb: "tt1", title: "TT1", outcome: "won" }],
    };
    const rows = [row("picture", "tt1", true), row("picture", "tt2"), row("animated", "tt6", true)];
    const first = merge(wiki, rows).edition;
    expect(merge(first, rows).edition).toEqual(first);
    expect(wikipediaPart(first, AWARD)).toEqual(wiki);
    const fromNothing = merge(noData, rows).edition;
    expect(merge(fromNothing, rows).edition).toEqual(fromNothing);
    expect(wikipediaPart(fromNothing, AWARD)).toBeNull();
  });

  // Phase 6 review.
  it("writes an honoree list as named films, not winners, with no tie", () => {
    const out = merge(noData, [row("documentary", "tt3", true), row("documentary", "tt4", true)], { honorees: new Set(["documentary"]) });
    expect(out.edition.results.map((r) => r.outcome)).toEqual(["nominated", "nominated"]);
    expect(out.problems).toEqual([]);
    expect(out.edition.note).not.toContain("tie");
  });

  it("writes only the winners of a winners-only group", () => {
    const out = mergeImdb({ award: { ...AWARD, winnersOnly: true }, year: 2024, existing: noData, rows: [row("picture", "tt1", true), row("picture", "tt2")], absent: new Set(), leftOut: [] });
    expect(out.edition.results).toEqual([{ category: "picture", imdb: "tt1", title: "TT1", outcome: "won" }]);
  });

  it("leaves out a category with no winner and says so; names a tie", () => {
    const out = merge(noData, [row("picture", "tt1", true), row("picture", "tt2", true), row("documentary", "tt3"), row("documentary", "tt4")]);
    expect(out.edition.results.map((r) => r.imdb)).toEqual(["tt1", "tt2"]);
    expect(out.edition.note).toContain("IMDb names more than one winner (a tie) in: Best Film.");
    expect(out.edition.note).toContain("IMDb lists no winner in: Best Documentary (not loaded).");
    expect(readImdbPart(splitNote(out.edition.note).imdb).filled).toEqual(["Best Film"]);
    expect(merge(out.edition, [row("picture", "tt1", true), row("picture", "tt2", true), row("documentary", "tt3"), row("documentary", "tt4")]).edition).toEqual(out.edition);
  });

  it("keeps a loaded edition loaded when only a series or short is left out, and names each film once", () => {
    const wiki: EditionFile = { ...noData, status: "loaded", winnersOn: "2024-12-10", nominationsOn: "2024-12-01", sourceUrls: ["https://en.wikipedia.org/wiki/X"], note: undefined, results: [{ category: "picture", imdb: "tt1", title: "TT1", outcome: "won" }, { category: "picture", imdb: "tt2", title: "TT2", outcome: "nominated" }] };
    const series = { title: "Box", reason: "a series" };
    const out = merge(wiki, [row("documentary", "tt3", true), row("documentary", "tt4")], { leftOut: [series, series] });
    expect(out.edition.status).toBe("loaded");
    expect(out.edition.note).toContain('Left out: "Box" (a series).');
    expect(merge(wiki, [row("documentary", "tt3", true), row("documentary", "tt4")], { leftOut: [{ title: "Gone", reason: "no film record could be matched" }] }).edition.status).toBe("partial");
  });

  it("says Wikipedia, not 'the source', lacked the categories IMDb filled", () => {
    const wiki: EditionFile = { ...noData, status: "partial", sourceUrls: ["https://en.wikipedia.org/wiki/X"], note: "Not found on the source: documentary.", results: [{ category: "picture", imdb: "tt1", title: "TT1", outcome: "won" }] };
    expect(merge(wiki, [row("documentary", "tt3", true)]).edition.note).toMatch(/^Not on Wikipedia: documentary\. From IMDb's award records: Best Documentary/);
  });

  it("reads its own sentence back", () => {
    const { base, imdb } = splitNote("Only the winners are listed. From IMDb's award records: Best Film (winners only); Best Documentary; nominees for Best Animated Film; Darryl F. Zanuck Award. IMDb gives no announcement date.");
    expect(base).toBe("Only the winners are listed.");
    expect(readImdbPart(imdb)).toEqual({ filled: ["Best Film", "Best Documentary"], nomineesAdded: ["Best Animated Film", "Darryl F. Zanuck Award"] });
    expect(readImdbPart("From IMDb's award records: nominees for Best Film; Best Documentary.")).toEqual({ filled: [], nomineesAdded: ["Best Film", "Best Documentary"] });
  });
});
