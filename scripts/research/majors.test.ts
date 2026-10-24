// The readers the major-award import (`majors.ts`, task 2.2) adds: the labelled-cell tables of
// the older pages and the guilds' pages, winners found by a bold film name, and the dates.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AWARDS, infoboxDate, ordinal, pageMentions } from "./majors";
import { readAfiYear, sectionMentions } from "./afi";
import { readArticleYears, readHeadingWinner, readLabelledCells, readNomineeLists, readWikitables } from "./lib/tables";

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
      "40th Annie Awards",
      "6th Cinema Eye Honors",
      "25th European Film Awards",
      "28th Independent Spirit Awards",
      "17th Satellite Awards",
    ]);
    expect(pages(2025)[2]).toBe("32nd Actor Awards");
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(112)).toBe("112th");
  });
  it("only use categories the registry has", () => {
    // data/awards.json is the registry: every category here must be one of its slugs, and every
    // registry category is read here unless IMDb fills it (`sources/imdb.json`, Cinema Eye's newer ones).
    const registry = JSON.parse(readFileSync("data/awards.json", "utf8")) as Array<{ slug: string; categories: Array<{ slug: string }> }>;
    const imdb = JSON.parse(readFileSync("scripts/research/sources/imdb.json", "utf8")) as { events: Record<string, string[]> };
    for (const a of AWARDS) {
      const known = registry.find((r) => r.slug === a.slug)?.categories.map((c) => c.slug) ?? [];
      const read = Object.keys(a.categories).sort();
      if (imdb.events[a.slug]) expect(known, a.slug).toEqual(expect.arrayContaining(read));
      else expect(read, a.slug).toEqual([...known].sort());
    }
  });
});

describe("the readers task 2.3 adds", () => {
  it("reads a winner standing bare above the nominees (the older Spirit Awards pages)", () => {
    const html = table(`
      <tr><th>Best Feature</th><th>Best Director</th></tr>
      <tr>
        <td><i><b><a href="/wiki/Silver_Linings_Playbook">Silver Linings Playbook</a></b></i><ul><li><i><a href="/wiki/Bernie_(2011_film)">Bernie</a></i></li></ul></td>
        <td><i><b><a href="/wiki/Moonrise_Kingdom">Moonrise Kingdom</a></b></i></td>
      </tr>`);
    const lists = readLabelledCells(html);
    expect(lists.map((l) => l.category)).toEqual(["Best Feature", "Best Director"]);
    expect(names(lists[0])).toEqual(["*Silver Linings Playbook", "Bernie"]);
    expect(names(lists[1])).toEqual(["*Moonrise Kingdom"]);
  });

  it("marks a row with the winner's gold background (the European Film Awards 2020-2022)", () => {
    const html = table(`
      <tr><th>English title</th><th>Director(s)</th></tr>
      <tr><td>Compartment No. 6</td><td>Juho Kuosmanen</td></tr>
      <tr style="background:#FAEB86"><td>Quo Vadis, Aida?</td><td>Jasmila Žbanić</td></tr>`);
    const rows = readWikitables(html)[0].rows;
    expect(rows.map((r) => r[0].shaded)).toEqual([false, true]);
  });

  it("reads a category article by year, the winner in bold, the year in the leading digits", () => {
    const html = table(`
      <tr><th>Year</th><th>English title</th><th>Director(s)</th></tr>
      <tr><td>2013(26th)</td><td><b><i><a href="/wiki/The_Great_Beauty">The Great Beauty</a></i></b></td><td><b>Paolo Sorrentino</b></td></tr>
      <tr><td>2013(26th)</td><td><i><a href="/wiki/Blancanieves">Blancanieves</a></i></td><td>Pablo Berger</td></tr>
      <tr><td>2014(27th)</td><td><b><i><a href="/wiki/Ida_(film)">Ida</a></i></b></td><td><b>Pawel Pawlikowski</b></td></tr>`);
    const years = readArticleYears(html);
    expect([...years.keys()]).toEqual([2013, 2014]);
    expect(years.get(2013)?.map((n) => `${n.winner ? "*" : ""}${n.film?.text}`)).toEqual(["*The Great Beauty", "Blancanieves"]);
    expect(years.get(2014)?.[0].film?.article).toBe("Ida (film)");
  });

  it("finds a winner listed under a 'Winners in <year>' heading by the line's label", () => {
    const html = `<div class="mw-heading mw-heading3"><h3 id="w">Winners in 2013</h3></div>
      <ul><li>Outstanding Achievement in Nonfiction Feature Filmmaking - <i><a href="/wiki/5_Broken_Cameras">5 Broken Cameras</a></i> - Dir. <a href="/wiki/Emad_Burnat">Emad Burnat</a></li>
      <li>Outstanding Achievement in Direction - <i><a href="/wiki/Detropia">Detropia</a></i></li></ul>
      <div class="mw-heading mw-heading3"><h3 id="x">Winners in 2014</h3></div><ul><li>Outstanding Achievement in Direction - <i>Other</i></li></ul>`;
    const label = /^Outstanding (Achievement in )?Non-?[Ff]iction Feature/;
    expect(readHeadingWinner(html, "Winners in 2013", label)).toEqual({ article: "5 Broken Cameras", text: "5 Broken Cameras" });
    expect(readHeadingWinner(html, "Winners in 2014", label)).toBeNull();
    expect(readHeadingWinner(html, "Winners in 2030", label)).toBeNull();
  });
});

describe("the AFI Top 10 reader", () => {
  const html = `<div class="mw-heading mw-heading2"><h2 id="a">2019</h2></div>
    <p>The 2019 AFI Awards honored the Top 10 Films. The winners were announced on December 4, 2019, while the ceremony was held on January 3, 2020.</p>
    <div class="multicol-float"><div class="mw-heading mw-heading3"><h3 id="b">Top 10 Films</h3></div>
    <ul><li><i><a href="/wiki/1917_(2019_film)">1917</a></i></li><li><i><a href="/wiki/The_Farewell_(2019_film)">The Farewell</a></i></li><li><i>Judas</i> (a 2021 film)</li></ul></div>
    <div class="multicol-float"><div class="mw-heading mw-heading3"><h3 id="c">Top 10 Television Programs</h3></div><ul><li><i><a href="/wiki/Fleabag">Fleabag</a></i></li></ul></div>
    <div class="mw-heading mw-heading2"><h2 id="d">2020</h2></div><p>next</p>`;
  it("takes the film list of the year's section only", () => {
    const year = readAfiYear(html, 2019);
    expect(year?.films).toEqual([
      { article: "1917 (2019 film)", text: "1917" },
      { article: "The Farewell (2019 film)", text: "The Farewell" },
      { article: null, text: "Judas" },
    ]);
    expect(readAfiYear(html, 2020)).toBeNull();
    expect(readAfiYear(html, 2026)).toBeNull();
  });
  it("checks a date against the section's text", () => {
    const text = readAfiYear(html, 2019)?.text ?? "";
    expect(sectionMentions(text, "2019-12-04")).toBe(true);
    expect(sectionMentions(text, "2019-12-05")).toBe(false);
  });
});
