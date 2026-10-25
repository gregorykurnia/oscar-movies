// Task 7.2: the infobox reader on saved samples (tests/fixtures/research/infobox/: lists, a plain-text
// pair and a footnote cut from real articles, and a hand-made flag template), and the reordering,
// report and batching rules on small inputs. Nothing here reaches the network.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { MoviesFile } from "../../src/lib/data-files";
import { findCountryCode } from "./lib/countries";
import { createFetcher } from "./lib/fetcher";
import { countryNames, countryParam, primaryCountryName } from "./lib/infobox";
import { applyPrimaryCountries, fetchWikitexts, formatReport, readReport, sitelinkTitles, withPrimary } from "./primary-country";

const sample = (name: string) => readFileSync(`tests/fixtures/research/infobox/${name}.wikitext`, "utf8");

describe("infobox country line", () => {
  it("reads a bulleted list with footnotes on its items", () => {
    const raw = countryParam(sample("list"));
    expect(raw).toMatch(/^\{\{plainlist/i);
    expect(countryNames(raw as string)).toEqual(["United Kingdom", "United States"]);
    expect(primaryCountryName(sample("list"))).toBe("United Kingdom");
  });

  it("reads plain text with a comma, a slash and a <br> between names", () => {
    expect(countryNames(countryParam(sample("plain-text-pair")) as string)).toEqual(["Romania", "Germany", "Finland"]);
    expect(countryNames(countryParam(sample("slash")) as string)).toEqual(["Czech Republic", "Germany"]);
    expect(countryNames("France<br />Belgium")).toEqual(["France", "Belgium"]);
  });

  it("reads flag templates and drops the icon-only one and the comment", () => {
    expect(countryNames(countryParam(sample("flag-template")) as string)).toEqual(["France", "Belgium"]);
    expect(primaryCountryName(sample("flag-template"))).toBe("France");
  });

  it("drops footnotes, including a long cite template with links inside", () => {
    const names = countryNames(countryParam(sample("footnote")) as string);
    expect(names[0]).toBe("Spain");
    expect(names).not.toContain("Animation Chico and Rita wins European film award");
    expect(countryNames("United States<ref name=afi/><ref>{{cite web|url=http://x.org/a|title=A, B}}</ref>")).toEqual(["United States"]);
    expect(countryNames("{{ubl|United Kingdom{{#tag:ref| a note, with commas}}|Germany}}")[0]).toBe("United Kingdom");
  });

  it("reads links by their target, lists by their template, and keeps names with 'and' whole", () => {
    expect(countryNames("[[United States|U.S.]]\n[[Germany]]")).toEqual(["United States", "Germany"]);
    expect(countryNames("{{hlist\n  | [[China]]\n  | [[Hong Kong]]}}")).toEqual(["China", "Hong Kong"]);
    expect(countryNames("{{Ublist|Hong Kong|United States}}")).toEqual(["Hong Kong", "United States"]);
    expect(countryNames("Bosnia and Herzegovina<br>France")).toEqual(["Bosnia and Herzegovina", "France"]);
    expect(countryNames("São Tomé and Príncipe, Portugal")).toEqual(["São Tomé and Príncipe", "Portugal"]);
    expect(countryNames("France and Belgium")).toEqual(["France", "Belgium"]);
  });

  it("says null when the page has no infobox or its infobox has no country", () => {
    expect(primaryCountryName("Just a paragraph about a film.")).toBeNull();
    expect(primaryCountryName("{{Infobox film\n| director = Someone\n}}")).toBeNull();
    expect(primaryCountryName("{{Infobox film\n| country = \n| language = French\n}}")).toBeNull();
    expect(primaryCountryName("{{Infobox film\n| countries = [[Italy]]\n}}")).toBe("Italy");
  });

  it("maps the names infoboxes use to ISO codes", () => {
    expect(["United States", "USA", "England", "Czech Republic", "Hong Kong", "Eswatini"].map(findCountryCode)).toEqual(["US", "US", "GB", "CZ", "HK", "SZ"]);
    expect(findCountryCode("Atlantis")).toBeUndefined();
  });
});

describe("primary country", () => {
  it("moves a listed country to the front and adds an unlisted one there", () => {
    expect(withPrimary(["US", "GB", "FR"], "GB")).toEqual(["GB", "US", "FR"]);
    expect(withPrimary(["US", "GB"], "FR")).toEqual(["FR", "US", "GB"]);
    expect(withPrimary(["US", "GB"], "US")).toEqual(["US", "GB"]);
  });

  const files = (): Map<number, MoviesFile> =>
    new Map([
      [
        2024,
        {
          tt1: { slug: "a", title: "A", countries: ["US", "GB"], wd: "Q1" },
          tt2: { slug: "b", title: "B", countries: ["US", "GB"], wd: "Q2" },
          tt3: { slug: "c", title: "C", countries: ["US"], wd: "Q3" },
          tt4: { slug: "d", title: "D", countries: ["US", "FR"], wd: "Q4" },
          tt5: { slug: "e", title: "E", countries: ["US", "FR"], wd: "Q5" },
          tt6: { slug: "f", title: "F", countries: ["US", "FR"] },
          tt7: { slug: "g", title: "G", countries: ["US", "FR"], wd: "Q7" },
          tt8: { slug: "h", title: "H", countries: ["US", "FR"], wd: "Q8" },
        },
      ],
    ]);
  const titles = new Map([["Q1", "A (film)"], ["Q2", "B (film)"], ["Q3", "C (film)"], ["Q4", "D (film)"], ["Q5", "E (film)"], ["Q7", "G (film)"], ["Q8", "H (film)"]]);
  const texts = new Map([
    ["A (film)", "{{Infobox film\n| country = United Kingdom<br />United States\n}}"],
    ["B (film)", "{{Infobox film\n| country = United States\n}}"],
    ["C (film)", "{{Infobox film\n| country = Canada\n}}"],
    ["D (film)", "{{Infobox film\n| country = {{plainlist|\n* Italy\n* France\n}}\n}}"],
    ["E (film)", "{{Infobox film\n| director = X\n}}"],
    ["G (film)", "{{Infobox film\n| country = Atlantis\n}}"],
  ]);

  it("reorders films with a Wikidata item, an article and a known first name, single-country ones too", () => {
    const data = files();
    const summary = applyPrimaryCountries(data, titles, texts);
    const film = (k: string) => data.get(2024)?.[k].countries;
    expect(film("tt1")).toEqual(["GB", "US"]); // moved
    expect(film("tt2")).toEqual(["US", "GB"]); // already first
    expect(film("tt3")).toEqual(["CA", "US"]); // one country: the article's first is added
    expect(film("tt4")).toEqual(["IT", "US", "FR"]); // not listed: added at the front
    expect(film("tt5")).toEqual(["US", "FR"]); // infobox without a country
    expect(film("tt6")).toEqual(["US", "FR"]); // no Wikidata item
    expect(film("tt7")).toEqual(["US", "FR"]); // unknown name
    expect(film("tt8")).toEqual(["US", "FR"]); // no article text
    expect(summary).toMatchObject({ examined: 7, alreadyFirst: 1, noInfoboxCountry: 1, noArticle: 1 });
    expect([...summary.unmapped]).toEqual([["Atlantis", ["G (2024)"]]]);
    expect(summary.changes.map((c) => [c.key, c.old, c.next])).toEqual([["tt1", "US", "GB"], ["tt3", "US", "CA"], ["tt4", "US", "IT"]]);
  });

  it("changes nothing on a second pass", () => {
    const data = files();
    applyPrimaryCountries(data, titles, texts);
    expect(applyPrimaryCountries(data, titles, texts).changes).toEqual([]);
  });

  it("writes a report whose rows an earlier run's rows survive", () => {
    const first = formatReport([{ key: "tt1", year: 2024, title: "A | B", old: "US", next: "GB" }], new Map());
    expect(first).toContain("1 films changed.");
    const earlier = readReport(first);
    expect(earlier.get("tt1")).toMatchObject({ title: "A | B", old: "US", next: "GB" });
    const second = formatReport([{ key: "tt1", year: 2024, title: "A | B", old: "GB", next: "FR" }, { key: "tt4", year: 2023, title: "D", old: "US", next: "IT" }], earlier);
    expect(readReport(second).get("tt1")).toMatchObject({ old: "US", next: "FR" });
    expect(readReport(second).size).toBe(2);
    expect(second.indexOf("| D |")).toBeLessThan(second.indexOf("| A \\| B |"));
  });
});

describe("batching", () => {

  it("asks Wikidata for 50 sitelinks to a request", async () => {
    const urls: string[] = [];
    const fetcher = createFetcher({
      cacheDir: null,
      minIntervalMs: 0,
      fetchImpl: (async (url: string) => {
        urls.push(url);
        const ids = new URL(url).searchParams.get("ids")?.split("|") ?? [];
        return new Response(JSON.stringify({ entities: Object.fromEntries(ids.map((id) => [id, { sitelinks: id === "Q1" ? {} : { enwiki: { title: `T ${id}` } } }])) }));
      }) as unknown as typeof fetch,
    });
    const qids = Array.from({ length: 120 }, (_, i) => `Q${i + 1}`);
    const titles = await sitelinkTitles(fetcher, qids);
    expect(urls).toHaveLength(3);
    expect(titles.size).toBe(119);
    expect(titles.get("Q2")).toBe("T Q2");
  });

  it("reads wikitext through redirects and follows a continuation", async () => {
    let calls = 0;
    const fetcher = createFetcher({
      cacheDir: null,
      minIntervalMs: 0,
      fetchImpl: (async (url: string) => {
        calls++;
        const page = (title: string, content: string) => ({ title, revisions: [{ slots: { main: { content } } }] });
        if (!url.includes("rvcontinue")) {
          return new Response(JSON.stringify({ continue: { rvcontinue: "x", continue: "||" }, query: { redirects: [{ from: "Old", to: "New" }], pages: [page("New", "new text")] } }));
        }
        return new Response(JSON.stringify({ query: { pages: [page("Plain", "plain text"), { title: "Gone", missing: true }] } }));
      }) as unknown as typeof fetch,
    });
    const texts = await fetchWikitexts(fetcher, ["Old", "Plain", "Gone"]);
    expect(calls).toBe(2);
    expect(Object.fromEntries(texts)).toEqual({ Old: "new text", Plain: "plain text" });
  });
});
