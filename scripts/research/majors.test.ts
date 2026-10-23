// The readers the major-award import (`majors.ts`, task 2.2) adds: the labelled-cell tables of
// the older pages and the guilds' pages, winners found by a bold film name, and the dates.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AWARDS, infoboxDate, ordinal, pageMentions } from "./majors";
import { readLabelledCells, readNomineeLists } from "./lib/tables";

const table = (rows: string) => `<table class="wikitable"><tbody>${rows}</tbody></table>`;
const names = (l: { nominees: Array<{ film: { text: string } | null; winner: boolean }> }) =>
  l.nominees.map((n) => `${n.winner ? "*" : ""}${n.film?.text}`);

describe("readLabelledCells", () => {
  it("joins a group header and a column header (the older Golden Globes pages)", () => {
    const html = table(`
      <tr><th colspan="2">Best Motion Picture</th></tr>
      <tr><th>Drama</th><th>Musical or Comedy</th></tr>
      <tr>
        <td><ul><li><i><b><a href="/wiki/Argo_(2012_film)">Argo</a></b></i><ul><li><i><a href="/wiki/Lincoln_(film)">Lincoln</a></i></li></ul></li></ul></td>
        <td><ul><li><i><b><a href="/wiki/Les_Mis">Les Misérables</a></b></i><ul><li><i><a href="/wiki/Moonrise_Kingdom">Moonrise Kingdom</a></i></li></ul></li></ul></td>
      </tr>`);
    const lists = readLabelledCells(html);
    expect(lists.map((l) => l.category)).toEqual(["Best Motion Picture Drama", "Best Motion Picture Musical or Comedy"]);
    expect(names(lists[0])).toEqual(["*Argo", "Lincoln"]);
    expect(names(lists[1])).toEqual(["*Les Misérables", "Moonrise Kingdom"]);
  });

  it("starts afresh when a header row follows a row of cells with no group header of its own", () => {
    const html = table(`
      <tr><th colspan="2">Best Supporting Performance</th></tr>
      <tr><th>Actor</th><th>Actress</th></tr>
      <tr><td><ul><li><i><b><a href="/wiki/A">A</a></b></i></li></ul></td><td><ul><li><i><b><a href="/wiki/B">B</a></b></i></li></ul></td></tr>
      <tr><th>Best Animated Feature Film</th><th>Best Foreign Language Film</th></tr>
      <tr><td><ul><li><i><b><a href="/wiki/Brave">Brave</a></b></i></li></ul></td><td><ul><li><i><b><a href="/wiki/Amour">Amour</a></b></i></li></ul></td></tr>`);
    expect(readLabelledCells(html).map((l) => l.category)).toEqual([
      "Best Supporting Performance Actor",
      "Best Supporting Performance Actress",
      "Best Animated Feature Film",
      "Best Foreign Language Film",
    ]);
  });

  it("reads a single header over a winner paragraph and a list (the DGA and Screen Actors Guild pages)", () => {
    const html = table(`
      <tr><th colspan="2">Feature Film</th></tr>
      <tr><td colspan="2"><p><b><a href="/wiki/Ben_Affleck">Ben Affleck</a> – <i><a href="/wiki/Argo_(2012_film)">Argo</a></i></b></p>
        <ul><li><a href="/wiki/Kathryn_Bigelow">Kathryn Bigelow</a> – <i><a href="/wiki/Zero_Dark_Thirty">Zero Dark Thirty</a></i></li></ul></td></tr>`);
    const [list] = readLabelledCells(html);
    expect(list.category).toBe("Feature Film");
    expect(names(list)).toEqual(["*Argo", "Zero Dark Thirty"]);
  });

  it("takes a bold film name as the winner even when the line goes on with producers (the PGA pages)", () => {
    const html = table(`
      <tr><th>Documentary</th></tr>
      <tr><td><ul><li><b><i><a href="/wiki/Life_Itself">Life Itself</a></i> (Magnolia Pictures)</b> – <a href="/wiki/X">Garrett Basch</a>, Steve James, and Zak Piper, Mark Smith
        <ul><li><i><a href="/wiki/Virunga">Virunga</a></i> (Netflix) – A and B</li></ul></li></ul></td></tr>`);
    expect(names(readLabelledCells(html)[0])).toEqual(["*Life Itself", "Virunga"]);
  });

  it("reads two winners for a tie", () => {
    const html = table(`
      <tr><th>Theatrical</th></tr>
      <tr><td><ul><li><b><i><a href="/wiki/12_Years_a_Slave_(film)">12 Years a Slave</a></i> – Brad Pitt (TIE)</b></li>
        <li><b><i><a href="/wiki/Gravity_(2013_film)">Gravity</a></i> – Alfonso Cuarón (TIE)</b>
        <ul><li><i><a href="/wiki/Her_(2013_film)">Her</a></i> – Megan Ellison</li></ul></li></ul></td></tr>`);
    expect(names(readLabelledCells(html)[0])).toEqual(["*12 Years a Slave", "*Gravity", "Her"]);
  });
});

describe("readNomineeLists", () => {
  it("finds a winner whose bold sits inside the italics (the recent Golden Globes boxes)", () => {
    const html = `<table><tr><td><div><b>Best Motion Picture – Drama</b></div>
      <ul><li><i><b><a href="/wiki/Hamnet_(film)">Hamnet</a></b></i><ul><li><i><a href="/wiki/Sinners_(2025_film)">Sinners</a></i></li></ul></li></ul></td></tr></table>`;
    expect(names(readNomineeLists(html)[0])).toEqual(["*Hamnet", "Sinners"]);
  });
});

describe("dates", () => {
  const infobox = (date: string) => `<table class="infobox"><tr><th>Date</th><td>${date}</td></tr></table>`;
  it("reads the ceremony date in each format the pages use", () => {
    expect(infoboxDate(infobox("January 13, 2013"))).toBe("2013-01-13");
    expect(infoboxDate(infobox("10 February 2013"))).toBe("2013-02-10");
    expect(infoboxDate(infobox("January 27, 2013 (2013-01-27)"))).toBe("2013-01-27");
  });
  it("takes the last day of a two-day ceremony", () => expect(infoboxDate(infobox("10–11 April 2021"))).toBe("2021-04-11"));
  it("has no date when the infobox has none", () => expect(infoboxDate("<p>nothing</p>")).toBeNull());
  it("finds a day in the page's text, in either order, with or without the year beside it", () => {
    expect(pageMentions("<p>Nominations were announced on December 13, 2012.</p>", "2012-12-13")).toBe(true);
    expect(pageMentions("<p>announced on 9 January 2013</p>", "2013-01-09")).toBe(true);
    expect(pageMentions("<p>announced on December 14, 2012</p>", "2012-12-13")).toBe(false);
  });
});

describe("the awards", () => {
  it("name the ceremony page for the film year", () => {
    const pages = (year: number) => AWARDS.map((a) => a.page(year));
    expect(pages(2012)).toEqual([
      "70th Golden Globe Awards",
      "66th British Academy Film Awards",
      "19th Screen Actors Guild Awards",
      "24th Producers Guild of America Awards",
      "65th Directors Guild of America Awards",
    ]);
    expect(pages(2025)[2]).toBe("32nd Actor Awards");
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(112)).toBe("112th");
  });
  it("only use categories the registry has", () => {
    // data/awards.json is the registry: every category here must be one of its slugs.
    const registry = JSON.parse(readFileSync("data/awards.json", "utf8")) as Array<{ slug: string; categories: Array<{ slug: string }> }>;
    for (const a of AWARDS) {
      const known = registry.find((r) => r.slug === a.slug)?.categories.map((c) => c.slug) ?? [];
      expect(Object.keys(a.categories).sort(), a.slug).toEqual([...known].sort());
    }
  });
});
