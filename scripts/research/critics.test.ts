// The readers the critics-groups import (`critics.ts`, task 4.2) adds: bold-label lists with
// runner-ups, headings with lists, lines naming two films, the dates in a page's opening
// sentences, AAFCA's top-ten table, and the year its main article files a film under; task 4.3 adds
// the winner-in-its-own-line nominee boxes (Critics' Choice to 2015), a bold winner line under a heading
// (Florida 2013) and "Runner-up: None".
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aafcaLabelYear, GROUPS, readAafcaTopTen, sourcesSchema } from "./critics";
import { blockRows, daysIn, leadDates, readBlocks } from "./lib/critics-pages";
import { readNomineeLists } from "./lib/tables";

describe("readBlocks", () => {
  it("reads a bold label with a winner and a runner-up line under it (Boston Society)", () => {
    const html = `<ul>
      <li><b>Best Film:</b><ul><li><i><a href="/wiki/Zero_Dark_Thirty">Zero Dark Thirty</a></i></li>
        <li>Runner-up: <i><a href="/wiki/Amour_(2012_film)">Amour</a></i> and <i><a href="/wiki/Moonrise_Kingdom">Moonrise Kingdom</a></i></li></ul></li>
      <li><b>Best Actor:</b><ul><li><a href="/wiki/DDL">Daniel Day-Lewis</a> – <i><a href="/wiki/Lincoln_(film)">Lincoln</a></i></li></ul></li></ul>`;
    const film = readBlocks(html).find((b) => b.label === "Best Film");
    expect(blockRows(film!).map((r) => [r.link.text, r.outcome])).toEqual([
      ["Zero Dark Thirty", "won"],
      ["Amour", "runner_up"],
      ["Moonrise Kingdom", "runner_up"],
    ]);
  });

  it("finds a label that stands in a definition list above its bullet list (AAFCA)", () => {
    const html = `<dl><dt><b>Best Picture</b></dt></dl><ul><li><i><a href="/wiki/Black_Panther_(film)">Black Panther</a></i></li></ul>`;
    expect(readBlocks(html).map((b) => b.label)).toEqual(["Best Picture"]);
  });

  it("reads a heading followed by a list, the winner in bold (BIFA), and a line with no italics as the film itself", () => {
    const html = `<div class="mw-heading"><h3>Best Foreign Independent Film</h3></div>
      <ul><li><b>Blue is the Warmest Colour</b></li><li><i><a href="/wiki/The_Great_Beauty">The Great Beauty</a></i></li></ul>`;
    const [block] = readBlocks(html);
    expect(block.label).toBe("Best Foreign Independent Film");
    expect(blockRows(block).map((r) => [r.link.text, r.outcome])).toEqual([
      ["Blue is the Warmest Colour", "won"],
      ["The Great Beauty", "nominated"],
    ]);
  });

  it("names both films of a tie, in one italic or in two, and leaves out an alternative title in brackets", () => {
    const html = `<table><tr><td><b>Best Film</b><ul>
      <li><i><a href="/wiki/Palm_Springs_(film)">Palm Springs</a> and <a href="/wiki/Sound_of_Metal">Sound of Metal</a> (TIE)</i></li>
      <li><i><a href="/wiki/A">A</a></i> and <i><a href="/wiki/B">B</a></i> (TIE)</li>
      <li><i><a href="/wiki/A_Simple_Life">A Simple Life</a></i> (<i>Tao jie</i>)</li></ul></td></tr></table>`;
    const [list] = readNomineeLists(html);
    expect(list.nominees.map((n) => n.films.map((f) => f.text))).toEqual([["Palm Springs", "Sound of Metal"], ["A", "B"], ["A Simple Life"]]);
  });
});

describe("layouts of task 4.3", () => {
  it("reads a nominee box whose winner is a bold line above the others (Critics' Choice 2012), once", () => {
    const html = `<table><tr><td><div><b>Best Picture</b></div>
      <p><i><b><a href="/wiki/Argo_(2012_film)">Argo</a></b></i></p>
      <ul><li><i><a href="/wiki/Lincoln_(film)">Lincoln</a></i></li><li><i><a href="/wiki/Life_of_Pi_(film)">Life of Pi</a></i></li></ul></td></tr></table>`;
    const blocks = readBlocks(html);
    expect(blocks.map((b) => b.label)).toEqual(["Best Picture"]);
    expect(blockRows(blocks[0]).map((r) => [r.link.text, r.outcome])).toEqual([
      ["Argo", "won"],
      ["Lincoln", "nominated"],
      ["Life of Pi", "nominated"],
    ]);
  });

  it("keeps a nominee box whose winner heads the list as one block (Critics' Choice 2019 on)", () => {
    const html = `<table><tr><td><div><b><a href="/wiki/X">Best Picture</a></b></div><ul>
      <li><i><b><a href="/wiki/Once">Once</a></b></i><ul><li><i><a href="/wiki/Joker_(2019_film)">Joker</a></i></li></ul></li></ul></td></tr></table>`;
    const blocks = readBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blockRows(blocks[0]).map((r) => [r.link.text, r.outcome])).toEqual([
      ["Once", "won"],
      ["Joker", "nominated"],
    ]);
  });

  it("reads the bold winner line between a heading and the runner-up list (Florida 2013)", () => {
    const html = `<div class="mw-heading"><h3>Best Picture</h3></div><p><i><b><a href="/wiki/12_Years_a_Slave_(film)">12 Years a Slave</a></b></i></p>
      <ul><li><b>Runner-up:</b> <i><a href="/wiki/American_Hustle">American Hustle</a></i></li></ul>`;
    expect(blockRows(readBlocks(html)[0]).map((r) => [r.link.text, r.outcome])).toEqual([
      ["12 Years a Slave", "won"],
      ["American Hustle", "runner_up"],
    ]);
  });

  it("does not take a description paragraph for a winner, nor 'Runner-up: None' for a film (Florida 2023)", () => {
    const html = `<div class="mw-heading"><h3>Best Film</h3></div><p>Given for the year's <b>best</b> film, chosen by vote among all the members of the circle over many weeks of discussion and polling.</p>
      <ul><li><i><a href="/wiki/Poor_Things_(film)">Poor Things</a></i></li><li>Runner-up: None</li></ul>`;
    expect(blockRows(readBlocks(html)[0]).map((r) => [r.link.text, r.outcome])).toEqual([["Poor Things", "nominated"]]);
  });
});

describe("dates", () => {
  it("reads both day orders", () => {
    expect(daysIn("Announced on December 11, 2018 and held 6 February 2019.")).toEqual(["2018-12-11", "2019-02-06"]);
  });

  it("takes the sentence about nominations or nominees as the nominations day, the other as the winners' day", () => {
    const html = `<p>The 17th Awards, honoring the best in filmmaking for 2021, were announced on January 11, 2022. The nominations were announced on January 4, 2022.</p>`;
    expect(leadDates(html)).toEqual({ winnersOn: "2022-01-11", nominationsOn: "2022-01-04" });
    expect(leadDates(`<p>The 14th Awards were announced on January 7, 2019. The nominees were announced on December 27, 2018.</p>`)).toEqual({
      winnersOn: "2019-01-07",
      nominationsOn: "2018-12-27",
    });
  });

  it("gives no day for a page that has none", () => {
    expect(leadDates(`<p>Below are the winners for the 2013 African-American film Critics Associations.</p>`)).toEqual({});
  });
});

describe("AAFCA's top ten table", () => {
  const html = `<table class="wikitable"><tr><th>Year</th><th>Winner</th><th>Top Films of the Year</th></tr>
    <tr><td>2019</td><td><i><a href="/wiki/Us_(2019_film)">Us</a></i></td><td><ul><li><i><a href="/wiki/Parasite_(2019_film)">Parasite</a></i></li><li><i><a href="/wiki/Waves">Waves</a></i></li></ul></td></tr>
    <tr><td>2022</td><td><i><a href="/wiki/The_Harder_They_Fall">The Harder They Fall</a></i></td><td><ul><li><i><a href="/wiki/Passing">Passing</a></i></li></ul></td></tr></table>`;

  it("reads the winner and the others of each year", () => {
    const years = readAafcaTopTen(html);
    expect(years.get(2019)?.winner.text).toBe("Us");
    expect(years.get(2019)?.others.map((f) => f.text)).toEqual(["Parasite", "Waves"]);
  });

  it("files the 2021 films under 2022: the article's year is the ceremony year from 2022", () => {
    expect(aafcaLabelYear(2019)).toBe(2019);
    expect(aafcaLabelYear(2021)).toBe(2022);
    expect(readAafcaTopTen(html).get(aafcaLabelYear(2021))?.winner.text).toBe("The Harder They Fall");
  });
});

describe("the sources file and the groups", () => {
  it("is valid", () => {
    expect(() => sourcesSchema.parse(JSON.parse(readFileSync("scripts/research/sources/critics.json", "utf8")))).not.toThrow();
  });

  it("names each group by a registry slug, and each has an edition file for every year 2012-2026", () => {
    const registry = JSON.parse(readFileSync("data/awards.json", "utf8")) as Array<{ slug: string }>;
    for (const g of GROUPS) {
      expect(registry.map((a) => a.slug)).toContain(g.slug);
      for (let year = 2012; year <= 2026; year++) expect(existsSync(`data/editions/${g.slug}/${year}.json`), `${g.slug}/${year}`).toBe(true);
    }
  });
});

describe("task 4.4 editions", () => {
  const edition = (path: string) => JSON.parse(readFileSync(`data/editions/${path}.json`, "utf8")) as { status: string; note?: string; results: Array<{ category: string; outcome: string; title: string }> };
  const winners = (path: string, category: string) => edition(path).results.filter((r) => r.category === category && r.outcome === "won");

  it("lists Gotham's International Feature only from the 2020 films, and says why before", () => {
    expect(edition("gotham/2019").results.some((r) => r.category === "international")).toBe(false);
    expect(winners("gotham/2020", "international")).toHaveLength(1);
  });

  it("records both Best Picture winners of Astra 2025 (Drama and Comedy or Musical) and says so", () => {
    expect(winners("hollywood-critics/2025", "picture").map((r) => r.title).sort()).toEqual(["One Battle After Another", "Sinners"]);
    expect(edition("hollywood-critics/2025").note).toMatch(/split Best Picture/);
  });

  it("keeps a Kansas City tie as two winners, and marks the group's editions partial (Best Film only)", () => {
    expect(winners("kansas-city-critics/2018", "picture")).toHaveLength(2);
    expect(edition("kansas-city-critics/2018").status).toBe("partial");
  });

  it("marks groups with no page as no_data, with a note", () => {
    for (const slug of ["greater-western-new-york-critics", "hawaii-critics", "indiana-critics", "iowa-critics", "international-cinephile-society", "ida"]) {
      const e = edition(`${slug}/2020`);
      expect(e.status, slug).toBe("no_data");
      expect(e.note, slug).toBeTruthy();
    }
  });
});
