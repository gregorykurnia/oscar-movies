// The readers the critics-groups import (`critics.ts`, task 4.2) adds: bold-label lists with
// runner-ups, headings with lists, lines naming two films, the dates in a page's opening
// sentences, AAFCA's top-ten table, and the year its main article files a film under; task 4.3 adds
// the winner-in-its-own-line nominee boxes (Critics' Choice to 2015), a bold winner line under a heading
// (Florida 2013) and "Runner-up: None"; task 4.5 adds LAFCA's runner-up one level under the winner and
// NSFC's numbered lines ("1. A <br> 2. B"); task 4.6 adds "(Runner-up)" in bold (Online Film Critics Society 2017)
// and the New York Film Critics Online article, which has no page for most years; task 4.7 adds Peabody's documentary
// section of a decade list; task 4.8 adds the category tables (Toronto, Vancouver), a `dl` label over a list,
// St. Louis's nested lists and the Dorian Awards' year headings; task 4.9 adds WAFCA's nominees in a `dl` under the winner (to 2019)
// or nested under it (2020).
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aafcaLabelYear, dorianFilmYear, GROUPS, readAafcaTopTen, readPeabodyDocumentaries, sourcesSchema } from "./critics";
import { blockRows, daysIn, leadDates, readBlocks, readCategoryTables, readDtBlocks, readNestedBlocks, withoutSection } from "./lib/critics-pages";
import { readNomineeLists } from "./lib/tables";

/** No Wikipedia data: `no_data`, or (Phase 6) filled from IMDb's award records alone. */
const noWikipedia = (e: { status: string; note?: string; sourceUrls?: string[] }) =>
  e.status === "no_data" || (e.status === "partial" && (e.sourceUrls ?? []).every((u) => u.startsWith("https://www.imdb.com/")) && /From IMDb's award records/.test(e.note ?? ""));

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

  it("reads past St., takes a winners sentence as the winners' day and 'awarded' as an awards day (Phase 4 review)", () => {
    expect(
      leadDates(`<p>The nominees for the 15th St. Louis Film Critics Association Awards were announced on December 9, 2018. The winners were announced on December 16, 2018.</p>`),
    ).toEqual({ nominationsOn: "2018-12-09", winnersOn: "2018-12-16" });
    expect(
      leadDates(`<p>The 18th Online Film Critics Society, honoring the best in film for 2014, were announced on December 8, 2014. The winners were announced on December 15, 2014.</p>`),
    ).toEqual({ nominationsOn: "2014-12-08", winnersOn: "2014-12-15" });
    expect(
      leadDates(`<p>The 17th Toronto Film Critics Association Awards, honoring the best in film for 2013, were awarded on December 17, 2013. The award for Best Canadian Film was announced on January 7, 2014.</p>`),
    ).toEqual({ winnersOn: "2013-12-17" });
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
  const edition = (path: string) => JSON.parse(readFileSync(`data/editions/${path}.json`, "utf8")) as { status: string; note?: string; sourceUrls?: string[]; results: Array<{ category: string; outcome: string; title: string }> };
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
      expect(noWikipedia(e), slug).toBe(true);
      expect(e.note, slug).toBeTruthy();
    }
  });
});

describe("layouts of task 4.5", () => {
  it("reads LAFCA's runner-up nested a level under the winner", () => {
    const html = `<ul><li><b>Best Film:</b><ul><li><b><i><a href="/wiki/Anora">Anora</a></i></b>
      <ul><li>Runner-up: <i><a href="/wiki/The_Brutalist">The Brutalist</a></i></li></ul></li></ul></li></ul>`;
    const film = readBlocks(html).find((b) => b.label === "Best Film");
    expect(blockRows(film!).map((r) => [r.link.text, r.outcome])).toEqual([
      ["Anora", "won"],
      ["The Brutalist", "runner_up"],
    ]);
  });

  it("reads numbered lines under a heading (NSFC 2013): the bold line wins, a tie has two bold lines, an unlinked title is its italic text", () => {
    const html = `<div class="mw-heading"><h3>Best Non-Fiction Film</h3></div>
      <p>1. <b><i><a href="/wiki/The_Act_of_Killing">The Act of Killing</a></i> (TIE)</b> <br>
      1. <b><i>At Berkeley</i> (TIE)</b> <br>
      2. <i><a href="/wiki/Leviathan_(2012_film)">Leviathan</a></i></p>`;
    const [block] = readBlocks(html);
    expect(blockRows(block).map((r) => [r.link.text, r.outcome])).toEqual([
      ["The Act of Killing", "won"],
      ["At Berkeley", "won"],
      ["Leviathan", "nominated"],
    ]);
  });

  it("takes dates from the opening paragraphs, not from a floated results box (London)", () => {
    const html = `<div style="float: right"><p>45th London Film Critics' Circle Awards</p><p>2 February 2025 and more words</p></div>
      <p>The 45th Awards honoured the best in film of 2024, as chosen by the Circle.</p>
      <p>The nominations were announced on 19 December 2024. Anora led the field.</p>`;
    expect(leadDates(html)).toEqual({ nominationsOn: "2024-12-19" });
  });
});

describe("task 4.5 editions", () => {
  const edition = (path: string) => JSON.parse(readFileSync(`data/editions/${path}.json`, "utf8")) as { status: string; note?: string; sourceUrls?: string[]; results: Array<{ category: string; outcome: string; title: string }> };
  const of = (path: string, category: string, outcome: string) => edition(path).results.filter((r) => r.category === category && r.outcome === outcome).map((r) => r.title).sort();

  it("keeps LAFCA's ties as two winners (2022 Best Film) and its runner-up", () => {
    expect(of("los-angeles-critics/2022", "picture", "won")).toEqual(["Everything Everywhere All at Once", "Tár"]);
    expect(of("los-angeles-critics/2024", "picture", "runner_up")).toEqual(["The Brutalist"]);
  });

  it("lists NBR's Best Film with its top ten, and the top five in International and Documentary as nominees", () => {
    expect(of("nbr/2024", "picture", "won")).toEqual(["Wicked"]);
    expect(edition("nbr/2024").results.filter((r) => r.category === "picture")).toHaveLength(11);
    expect(of("nbr/2024", "international", "won")).toEqual(["The Seed of the Sacred Fig"]);
    expect(edition("nbr/2024").results.filter((r) => r.category === "international")).toHaveLength(6);
  });

  it("marks Las Vegas partial (Best Picture winner only) and NSFC years with no foreign prize on the page partial", () => {
    expect(edition("las-vegas-critics/2023").status).toBe("partial");
    expect(of("las-vegas-critics/2023", "picture", "won")).toEqual(["Oppenheimer"]);
    expect(edition("national-society/2019").note).toMatch(/international/);
  });

  it("marks groups with no page as no_data, with a note", () => {
    for (const slug of ["latino-entertainment-journalists", "michigan-critics", "minnesota-critics", "music-city-critics", "new-jersey-critics"]) {
      const e = edition(`${slug}/2020`);
      expect(noWikipedia(e), slug).toBe(true);
      expect(e.note, slug).toBeTruthy();
    }
  });
});

describe("layouts of task 4.6", () => {
  it("reads a bold line marked (Runner-up) as a runner-up, not a second winner (Online Film Critics Society 2017)", () => {
    const html = `<table class="wikitable"><tr><th>Best Picture</th></tr><tr><td><ul>
      <li><i><b><a href="/wiki/Get_Out">Get Out</a></b></i></li>
      <li><b><i><a href="/wiki/The_Shape_of_Water_(film)">The Shape of Water</a></i> (Runner-up)</b></li>
      <li><i><a href="/wiki/Dunkirk_(2017_film)">Dunkirk</a></i></li></ul></td></tr></table>`;
    const block = readBlocks(html).find((b) => b.label === "Best Picture");
    expect(blockRows(block!).map((r) => [r.link.text, r.outcome])).toEqual([
      ["Get Out", "won"],
      ["The Shape of Water", "runner_up"],
      ["Dunkirk", "nominated"],
    ]);
  });
});

describe("task 4.6 editions", () => {
  const edition = (path: string) => JSON.parse(readFileSync(`data/editions/${path}.json`, "utf8")) as { status: string; note?: string; sourceUrls?: string[]; winnersOn?: string; nominationsOn?: string; results: Array<{ category: string; outcome: string; title: string }> };
  const of = (path: string, category: string, outcome: string) => edition(path).results.filter((r) => r.category === category && r.outcome === outcome).map((r) => r.title).sort();

  it("reads the New York Circle's winners with their runners-up (2012) and its Non-Fiction prize as the documentary", () => {
    expect(of("new-york-critics/2012", "picture", "won")).toEqual(["Zero Dark Thirty"]);
    expect(of("new-york-critics/2012", "picture", "runner_up")).toEqual(["Argo", "The Master"]);
    expect(of("new-york-critics/2024", "documentary", "won")).toEqual(["No Other Land"]);
    expect(edition("new-york-critics/2024").nominationsOn).toBeUndefined();
  });

  it("reads New York Online's main article for 2012 to 2024 (partial, no dates) and its own 2025 page (loaded, both days)", () => {
    expect(of("new-york-online/2012", "picture", "won")).toEqual(["Zero Dark Thirty"]);
    expect(edition("new-york-online/2012").results.filter((r) => r.category === "picture")).toHaveLength(10);
    expect(edition("new-york-online/2012").status).toBe("partial");
    expect(edition("new-york-online/2018").note).toMatch(/no Best Picture winner/);
    expect(of("new-york-online/2024", "picture", "runner_up")).toEqual(["The Brutalist"]);
    const e = edition("new-york-online/2025");
    expect([e.status, e.nominationsOn, e.winnersOn]).toEqual(["loaded", "2025-12-08", "2025-12-15"]);
  });

  it("keeps Online FCS 2017's winner and runner-up apart, and takes 2012's days from its sentence", () => {
    expect(of("online-critics/2017", "picture", "won")).toEqual(["Get Out"]);
    expect(of("online-critics/2017", "picture", "runner_up")).toEqual(["The Shape of Water"]);
    const e = edition("online-critics/2012");
    expect([e.status, e.nominationsOn, e.winnersOn]).toEqual(["loaded", "2012-12-24", "2012-12-31"]);
  });

  it("finds 56 Up and 100 Meters on TMDB, not as Wikidata items with no IMDb ID", () => {
    expect(of("online-critics/2013", "documentary", "nominated")).toContain("56 Up");
    expect(edition("new-york-online/2025").results.some((r) => r.title.toLowerCase() === "100 meters")).toBe(true);
    const movies = JSON.parse(readFileSync("data/movies/2013.json", "utf8")) as Record<string, unknown>;
    expect(Object.keys(movies)).not.toContain("Q2716721");
  });

  it("marks groups with no page as no_data, with a note", () => {
    for (const slug of ["north-carolina-critics", "north-dakota-critics", "north-texas-critics", "oklahoma-critics", "online-female-critics", "online-ftv"]) {
      const e = edition(`${slug}/2020`);
      expect(noWikipedia(e), slug).toBe(true);
      expect(e.note, slug).toBeTruthy();
    }
  });
});

describe("layouts of task 4.7", () => {
  it("reads the film links of the Documentary honorees section of a Peabody list, and no other section", () => {
    const html = `<div class="mw-heading mw-heading2"><h2 id="2021">2021</h2></div>
      <table class="wikitable"><tr><th>Recipient</th><th>Area of excellence</th></tr>
      <tr><th colspan="2"><i>Entertainment honorees</i></th></tr>
      <tr><td>Studio</td><td><i><a href="/wiki/Ted_Lasso">Ted Lasso</a></i></td></tr>
      <tr><th colspan="2"><i>Documentary honorees</i></th></tr>
      <tr><td>Frontline with CineDiaz</td><td><i><a href="/wiki/A_Thousand_Cuts">A Thousand Cuts</a></i><sup class="reference"><a href="#cite_note-47">[47]</a></sup></td></tr>
      <tr><td>American Documentary: POV</td><td><i><a href="/wiki/POV_(TV_series)">POV</a></i>, for <i><a href="/wiki/Mayor_(2020_film)">Mayor</a></i></td></tr>
      </table>
      <div class="mw-heading mw-heading2"><h2 id="2022">2022</h2></div>
      <table class="wikitable"><tr><th colspan="2">Documentary honorees</th></tr><tr><td>X</td><td><a href="/wiki/Aftershock">Aftershock</a></td></tr></table>`;
    expect(readPeabodyDocumentaries(html, 2021).map((l) => l.article)).toEqual(["A Thousand Cuts", "POV (TV series)", "Mayor (2020 film)"]);
    expect(readPeabodyDocumentaries(html, 2023)).toEqual([]);
  });
});

describe("task 4.7 editions", () => {
  const edition = (path: string) => JSON.parse(readFileSync(`data/editions/${path}.json`, "utf8")) as { status: string; note?: string; sourceUrls?: string[]; winnersOn?: string; nominationsOn?: string; results: Array<{ category: string; outcome: string; title: string }> };
  const of = (path: string, category: string, outcome: string) => edition(path).results.filter((r) => r.category === category && r.outcome === outcome).map((r) => r.title).sort();

  it("files each Peabody documentary under its film year, not the year of the honours (Writing with Fire: 2021 film, 2022 list)", () => {
    expect(of("peabody/2021", "documentary", "won")).toContain("Writing with Fire");
    expect(of("peabody/2022", "documentary", "won")).not.toContain("Writing with Fire");
    expect(of("peabody/2024", "documentary", "won")).toEqual(expect.arrayContaining(["No Other Land", "Night is Not Eternal"]));
    expect(of("peabody/2016", "documentary", "won")).toContain("O.J.: Made in America");
  });

  it("leaves 2012 and 2013 Peabody as no_data (no documentary section on the list), every other year partial with a note", () => {
    for (const year of [2012, 2013, 2026]) expect(edition(`peabody/${year}`).status, `${year}`).toBe("no_data");
    for (let year = 2014; year <= 2025; year++) {
      const e = edition(`peabody/${year}`);
      expect([e.status, Boolean(e.note)], `${year}`).toEqual(["partial", true]);
      expect(e.results.every((r) => r.category === "documentary" && r.outcome === "won")).toBe(true);
    }
  });

  it("reads Phoenix FCS's Best Picture winner table (partial) and San Diego's nominee boxes (loaded)", () => {
    expect(of("phoenix-critics-society/2025", "picture", "won")).toEqual(["One Battle After Another"]);
    expect(edition("phoenix-critics-society/2025").status).toBe("partial");
    expect(of("san-diego-critics/2019", "picture", "won")).toEqual(["The Irishman"]);
    expect(of("san-diego-critics/2019", "international", "won")).toEqual(["Parasite"]);
    expect(of("san-diego-critics/2019", "documentary", "won")).toEqual(["Love, Antosha"]);
    const e = edition("san-diego-critics/2019");
    expect([e.status, e.winnersOn]).toEqual(["loaded", "2019-12-09"]);
  });

  it("marks groups with no page as no_data, with a note", () => {
    for (const slug of ["philadelphia-critics", "phoenix-critics-circle", "pittsburgh-critics", "portland-critics", "puerto-rico-critics"]) {
      const e = edition(`${slug}/2020`);
      expect(noWikipedia(e), slug).toBe(true);
      expect(e.note, slug).toBeTruthy();
    }
  });
});

describe("task 4.8 readers", () => {
  const row = (cat: string | null, rowspan: number, person: string, film: string) =>
    `<tr>${cat ? `<td rowspan="${rowspan}">${cat}</td>` : ""}<td>${person}</td><td><i><a href="/wiki/${film.replace(/ /g, "_")}">${film}</a></i></td></tr>`;

  it("reads a category table: the first row of a category is the winner, the others nominees", () => {
    const html = `<table class="wikitable"><tr><th>Category</th><th>Winners and nominees</th><th>Films</th></tr>
      ${row("Best Film", 3, "Bong Joon-ho", "Parasite")}${row(null, 0, "Noah Baumbach", "Marriage Story")}${row(null, 0, "Martin Scorsese", "The Irishman")}
      ${row("Best Documentary", 2, "A", "Honeyland")}${row(null, 0, "B", "Apollo 11")}</table>`;
    const blocks = readCategoryTables(html);
    expect(blocks.map((b) => b.label)).toEqual(["Best Film", "Best Documentary"]);
    expect(blockRows(blocks[0]).map((r) => [r.link.text, r.outcome])).toEqual([["Parasite", "won"], ["Marriage Story", "nominated"], ["The Irishman", "nominated"]]);
    expect(blockRows(blocks[1]).map((r) => [r.link.text, r.outcome])).toEqual([["Honeyland", "won"], ["Apollo 11", "nominated"]]);
  });

  it("reads a definition-list label over its bullet list, the winner in bold (Vancouver 2014–2018)", () => {
    const html = `<dl><dt>Best Film</dt></dl><ul><li><i><b><a href="/wiki/Moonlight_(film)">Moonlight</a></b></i></li><li><i><a href="/wiki/La_La_Land">La La Land</a></i></li></ul>`;
    const [block] = readDtBlocks(html);
    expect(blockRows(block).map((r) => [r.link.text, r.outcome])).toEqual([["Moonlight", "won"], ["La La Land", "nominated"]]);
  });

  it("leaves out a section by its heading (Vancouver's Canadian categories)", () => {
    const html = `<div class="mw-heading mw-heading3"><h3>International</h3></div><p>keep</p><div class="mw-heading mw-heading3"><h3>Canadian</h3></div><p>drop</p><div class="mw-heading mw-heading2"><h2>Notes</h2></div><p>after</p>`;
    const text = withoutSection(html, /^canadian/i);
    expect(text).toContain("keep");
    expect(text).toContain("after");
    expect(text).not.toContain("drop");
  });

  it("reads nested lists: the winner, a runner-up under it and the other nominees under that (St. Louis), even inside a dl", () => {
    const html = `<div class="mw-heading mw-heading3"><h3>Best Film</h3></div><dl><dd><ul><li><i><b><a href="/wiki/Argo">Argo</a></b></i>
      <ul><li>Runner-up: <i><a href="/wiki/Lincoln_(film)">Lincoln</a></i><ul><li><i><a href="/wiki/Her_(film)">Her</a></i></li></ul></li></ul></li></ul></dd></dl>`;
    const [block] = readNestedBlocks(html);
    expect(blockRows(block).map((r) => [r.link.text, r.outcome])).toEqual([["Argo", "won"], ["Lincoln", "runner_up"], ["Her", "nominated"]]);
  });

  it("maps a Dorian Awards heading to its film year", () => {
    expect([dorianFilmYear("2019"), dorianFilmYear("2020 (Film)"), dorianFilmYear("2022 (Film)"), dorianFilmYear("2025 (Film)"), dorianFilmYear("2024-25 (Television)")]).toEqual([2019, 2020, 2021, 2024, null]);
  });
});

describe("task 4.8 editions", () => {
  const edition = (path: string) => JSON.parse(readFileSync(`data/editions/${path}.json`, "utf8")) as { status: string; note?: string; sourceUrls?: string[]; winnersOn?: string; nominationsOn?: string; results: Array<{ category: string; outcome: string; title: string }> };
  const of = (path: string, category: string, outcome: string) => edition(path).results.filter((r) => r.category === category && r.outcome === outcome).map((r) => r.title).sort();

  it("reads Toronto's category tables (2019) and its side-by-side lists (2022)", () => {
    expect(of("toronto-critics/2019", "picture", "won")).toEqual(["Parasite"]);
    expect(of("toronto-critics/2019", "picture", "nominated")).toEqual(["Marriage Story", "The Irishman"]);
    expect(of("toronto-critics/2022", "picture", "won")).toEqual(["Aftersun"]);
    expect(of("toronto-critics/2022", "international", "won")).toHaveLength(1);
    expect(noWikipedia(edition("toronto-critics/2012"))).toBe(true);
  });

  it("reads Vancouver's international tables and leaves its Canadian section out; no animated prize is noted", () => {
    expect(of("vancouver-critics/2019", "picture", "won")).toEqual(["Parasite"]);
    expect(of("vancouver-critics/2016", "picture", "won")).toEqual(["Manchester by the Sea"]);
    expect(edition("vancouver-critics/2019").results.some((r) => r.title === "The Body Remembers When the World Broke Open")).toBe(false);
    expect(edition("vancouver-critics/2019").results.some((r) => r.category === "animated")).toBe(false);
    expect(edition("vancouver-critics/2022").note).toMatch(/no animated-feature prize/);
  });

  it("reads St. Louis, San Francisco and Seattle", () => {
    expect(of("st-louis-critics/2022", "picture", "won")).toEqual(["Everything Everywhere All at Once"]);
    expect(of("st-louis-critics/2022", "picture", "runner_up")).toEqual(["Women Talking"]);
    expect(of("san-francisco-critics/2022", "international", "won")).toHaveLength(1);
    expect(of("seattle-critics/2019", "picture", "won")).toEqual(["Parasite"]);
    for (const year of [2012, 2013, 2014, 2015, 2016, 2017]) expect(noWikipedia(edition(`san-francisco-critics/${year}`)), `${year}`).toBe(true);
  });

  it("files the winners-only groups as partial: Southeastern's Best Film and the Dorian Awards by film year", () => {
    expect(of("southeastern-critics/2025", "picture", "won")).toEqual(["One Battle After Another"]);
    expect(edition("southeastern-critics/2025").status).toBe("partial");
    expect(of("lgbtq-critics/2024", "picture", "won")).toEqual(["The Substance"]);
    expect(of("lgbtq-critics/2021", "picture", "won")).toEqual(["The Power of the Dog"]);
    expect(of("lgbtq-critics/2020", "documentary", "won")).toHaveLength(2);
    expect(edition("lgbtq-critics/2024").status).toBe("partial");
  });

  it("notes Seattle 2020's left-out documentary winner and marks Utah as no_data with a note", () => {
    expect(edition("seattle-critics/2020").status).toBe("partial");
    expect(edition("seattle-critics/2020").note).toMatch(/Seattle Mariners/);
    const utah = edition("utah-critics/2020");
    expect([noWikipedia(utah), Boolean(utah.note)]).toEqual([true, true]);
  });
});

describe("task 4.9 readers and editions", () => {
  it("reads a bold paragraph label, the winner's list and the nominees in a definition list after it, or nested under the winner", () => {
    const html = `<p><b>Best Film</b></p><ul><li><i><b><a href="/wiki/Zero_Dark_Thirty">Zero Dark Thirty</a></b></i></li></ul>
      <dl><dd><ul><li><i><a href="/wiki/Argo_(2012_film)">Argo</a></i></li><li><i><a href="/wiki/Lincoln_(film)">Lincoln</a></i></li></ul></dd></dl>
      <p><b>Best Documentary</b></p><ul><li><i><b><a href="/wiki/Boys_State">Boys State</a></b></i><ul><li><i><a href="/wiki/Collective">Collective</a></i></li></ul></li></ul>`;
    const blocks = readBlocks(html);
    expect(blockRows(blocks.find((b) => b.label === "Best Film")!).map((r) => [r.link.text, r.outcome])).toEqual([
      ["Zero Dark Thirty", "won"],
      ["Argo", "nominated"],
      ["Lincoln", "nominated"],
    ]);
    expect(blockRows(blocks.find((b) => b.label === "Best Documentary")!).map((r) => [r.link.text, r.outcome])).toEqual([
      ["Boys State", "won"],
      ["Collective", "nominated"],
    ]);
  });

  const edition = (path: string) => JSON.parse(readFileSync(`data/editions/${path}.json`, "utf8")) as { status: string; note?: string; nominationsOn?: string; results: Array<{ category: string; outcome: string; title: string }> };
  const of = (path: string, category: string, outcome: string) => edition(path).results.filter((r) => r.category === category && r.outcome === outcome).map((r) => r.title).sort();

  it("loads Washington DC 2012–2025 with its winners and nominees; 2026 is no_data", () => {
    expect(of("washington-dc-critics/2012", "picture", "won")).toEqual(["Zero Dark Thirty"]);
    expect(of("washington-dc-critics/2012", "picture", "nominated")).toHaveLength(4);
    expect(of("washington-dc-critics/2020", "picture", "won")).toEqual(["Nomadland"]);
    expect(of("washington-dc-critics/2020", "international", "nominated")).toHaveLength(4);
    expect(edition("washington-dc-critics/2020").nominationsOn).toBe("2021-02-06");
    expect(of("washington-dc-critics/2023", "international", "won")).toEqual(["Anatomy of a Fall"]);
    for (let year = 2012; year <= 2025; year++) expect(edition(`washington-dc-critics/${year}`).status).toBe("loaded");
    expect(edition("washington-dc-critics/2026").status).toBe("no_data");
  });
});
