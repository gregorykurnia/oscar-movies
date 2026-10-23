// The lineup import (`lineups.ts`, task 5.1): the table and prize readers on small pages, the section and
// prize rules, and the loaded files against the film counts the festivals published.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readEdition } from "./lib/writer";
import { readLineupTables, readPrizeSections, readPrizeTable, titleCell } from "./lib/lineup-pages";
import * as cheerio from "cheerio";
import { lineupFilms, prizeLines, prizeText, rowsOfPrize, sectionName, sourcesLineupSchema, LINEUPS } from "./lineups";

const heading = (level: number, text: string) => `<div class="mw-heading mw-heading${level}"><h${level}>${text}</h${level}></div>`;
const head = `<tr><th>English Title</th><th>Original Title</th><th>Director(s)</th><th>Production Country</th></tr>`;
const row = (title: string, original: string, director: string, country: string) =>
  `<tr><td>${title}</td><td>${original}</td><td>${director}</td><td>${country}</td></tr>`;
const table = (rows: string) => `<table class="wikitable"><tbody>${head}${rows}</tbody></table>`;

const page = [
  heading(2, "Official Selection"),
  heading(3, "In Competition (Venezia 82)"),
  table(
    `<tr><td colspan="2"><i><a href="/wiki/Alpha_(2025_film)">Alpha</a></i> <small>(QP)</small></td><td>Julia Ducournau</td><td>France, Belgium</td></tr>` +
      row('<i><a href="/wiki/Case_137">Case 137</a></i>', "<i>Dossier 137</i>", "Dominik Moll", "France"),
  ),
  heading(3, "Critics' Week (Semaine de la critique)"),
  table(
    `<tr><th colspan="4">In Competition</th></tr>` +
      row("<i>Kika</i>", "Kika", "Alexe Poukine", "Belgium") +
      `<tr><th colspan="4">Short Films Competition</th></tr>` +
      row("<i>Glasses</i>", "안경", "Yumi Joung", "South Korea") +
      `<tr><th colspan="4">Special Screenings</th></tr>` +
      row("Dandelion's Odyssey (closing film) (CdO)", "Planètes", "Momoko Seto", "France"),
  ),
  heading(3, "Cannes Classics"),
  table(row('<i><a href="/wiki/Barry_Lyndon">Barry Lyndon</a></i> (1975)', "", "Stanley Kubrick", "United Kingdom")),
  heading(2, "Official Awards"),
  heading(3, "In Competition"),
  `<ul><li>Palme d'Or: <i><a href="/wiki/Alpha_(2025_film)">Alpha</a></i> by Julia Ducournau</li>` +
    `<li>Jury Prize:<ul><li><i><a href="/wiki/Case_137">Case 137</a></i> by Dominik Moll</li><li><i>Kika</i> by Alexe Poukine</li></ul></li></ul>`,
  heading(3, "Caméra d'Or"),
  `<ul><li>Caméra d'Or: <i>Kika</i> by Alexe Poukine<ul><li><b>Special Mention</b>: <i>Alpha</i> by Julia Ducournau</li></ul></li></ul>`,
  heading(2, "Independent Awards"),
  heading(3, "Critics' Week"),
  `<ul><li>Grand Prize: <i>Kika</i> by Alexe Poukine</li><li>French Touch Prize of the Jury: <i>French Touch</i></li></ul>`,
  heading(3, "FIPRESCI Prize"),
  `<ul><li>In Competition: <i>Alpha</i> by Julia Ducournau</li></ul>`,
].join("");

describe("readLineupTables", () => {
  const rows = readLineupTables(page);

  it("reads a film a row, with a title cell that spans the original title", () => {
    const alpha = rows[0];
    expect(alpha).toMatchObject({ h3: "In Competition (Venezia 82)", sub: "", directors: "Julia Ducournau", countries: ["France", "Belgium"] });
    expect(alpha.film).toEqual({ article: "Alpha (2025 film)", text: "Alpha" });
    expect(rows[1].originalTitle).toBe("Dossier 137");
  });

  it("keeps a table's sub-heading with each row and takes the notes off an unlinked title", () => {
    const critics = rows.filter((r) => r.h3.startsWith("Critics"));
    expect(critics.map((r) => [r.film.text, r.sub])).toEqual([
      ["Kika", "In Competition"],
      ["Glasses", "Short Films Competition"],
      ["Dandelion's Odyssey", "Special Screenings"],
    ]);
  });

  it("leaves out tables that aren't under a selection heading", () => {
    expect(rows.every((r) => r.h2 === "Official Selection")).toBe(true);
  });
});

describe("titleCell", () => {
  it("is the first link, or the text without the festival's tags", () => {
    const $ = cheerio.load(`<table><tr><td id="a"><i><a href="/wiki/X_(film)">X</a></i> <small>(CdO, QP)</small></td><td id="b">Plain Title (opening film) (ŒdO)</td></tr></table>`);
    expect(titleCell($, $("#a")[0])).toEqual({ article: "X (film)", text: "X" });
    expect(titleCell($, $("#b")[0])).toEqual({ article: null, text: "Plain Title" });
  });
});

describe("lineupFilms", () => {
  const films = lineupFilms(readLineupTables(page), {}, 2025);

  it("names a section by its heading, without the parentheses, and leaves out shorts and classics", () => {
    expect(films.map((f) => [f.section, f.row.film.text])).toEqual([
      ["In Competition", "Alpha"],
      ["In Competition", "Case 137"],
      ["Critics' Week", "Kika"],
      ["Critics' Week", "Dandelion's Odyssey"],
    ]);
  });

  it("leaves out a film shown with a year long before the festival", () => {
    const old = [{ h2: "Official Selection", h3: "Forum", h4: "", sub: "", film: { article: null, text: "The Lie (1987)" }, originalTitle: "", directors: "K", countries: [] }];
    expect(lineupFilms(old, {}, 2025)).toEqual([]);
    expect(lineupFilms(old, {})).toHaveLength(1);
  });
});

describe("sectionName", () => {
  it.each([
    ["In Competition (Venezia 82)", "In Competition"],
    ["Directors' Fortnight (Quinzaine des cinéastes)", "Directors' Fortnight"],
    ["22nd Giornate degli Autori", "Giornate degli Autori"],
    ["40. Settimana Internazionale della Critica", "Settimana Internazionale della Critica"],
  ])("%s → %s", (heading, name) => expect(sectionName(heading)).toBe(name));

  it("takes the festival's own name from the sources", () => {
    expect(sectionName("40. Settimana Internazionale della Critica", { "Settimana Internazionale della Critica": "International Critics' Week" })).toBe("International Critics' Week");
  });
});

describe("prizes", () => {
  const spec = LINEUPS.find((l) => l.slug === "cannes")!;
  const lines = prizeLines(page, spec);
  const films = lineupFilms(readLineupTables(page), {}, 2025);

  it("reads the official awards and the festival's own, with nested lines under their parent's label", () => {
    expect(lines.map((l) => `${l.text} → ${l.entry.film.text}`)).toEqual([
      "Palme d'Or → Alpha",
      "Jury Prize → Case 137",
      "Jury Prize → Kika",
      "Caméra d'Or → Kika",
      "Special Mention (Caméra d'Or) → Alpha",
      "Grand Prize (Critics' Week) → Kika",
    ]);
  });

  it("skips an italic name inside the prize's own name, and awards that aren't the festival's", () => {
    expect(lines.some((l) => /French Touch|FIPRESCI/.test(l.text))).toBe(false);
  });

  it("finds a prize's film by article, else by title", () => {
    expect(rowsOfPrize(films, lines[0].entry).map((f) => f.row.film.text)).toEqual(["Alpha"]);
    expect(rowsOfPrize(films, lines[2].entry).map((f) => f.row.film.text)).toEqual(["Kika"]);
  });

  it("names the section a prize belongs to when the label alone is unclear", () => {
    const [s] = readPrizeSections(page);
    expect(prizeText({ ...s.entries[0], heading: "Orizzonti", label: "Best Film" })).toBe("Best Film (Orizzonti)");
    expect(prizeText({ ...s.entries[0], heading: "Un Certain Regard", label: "Un Certain Regard Prize" })).toBe("Un Certain Regard Prize");
    expect(prizeText({ ...s.entries[0], heading: "Main Competition (Venezia 82)", label: "Golden Lion" })).toBe("Golden Lion");
  });
});

describe("Sundance and Toronto pages (5.2)", () => {
  const sundance = [
    heading(2, "Films"),
    heading(3, "U.S. Documentary Competition"),
    `<table class="wikitable"><tbody><tr><th>Original title</th><th>Director(s)</th><th>Production Country</th></tr>` +
      `<tr><td><i><a href="/wiki/Seeds_(2025_film)">Seeds</a></i></td><td>Brittany Shyne</td><td rowspan="2">United States</td></tr>` +
      `<tr><td><i>Predators</i></td><td>David Osit</td></tr></tbody></table>`,
    heading(3, "Episodic"),
    table(row("<i>Pilot</i>", "Pilot", "A. Writer", "United States")),
    heading(3, "From the Collection"),
    table(row("<i>Old</i>", "Old", "A. Director", "United States")),
    heading(2, "Awards"),
    heading(3, "Grand Jury Prizes"),
    `<ul><li>U.S. Documentary – <i><a href="/wiki/Seeds_(2025_film)">Seeds</a></i> by Brittany Shyne</li><li>Short Film – <i>Tiny</i> by Someone</li></ul>`,
  ].join("");
  const toronto = [
    heading(2, "Awards"),
    heading(3, "Regular awards"),
    `<table class="wikitable"><tbody><tr><th>Award</th><th>Film</th><th>Director</th></tr>` +
      `<tr><td>People's Choice Award</td><td><i><a href="/wiki/Hamnet_(film)">Hamnet</a></i></td><td>Chloé Zhao</td></tr>` +
      `<tr><td>Platform Prize, Honorable Mention</td><td><i>Hen</i></td><td>Lizzie</td></tr></tbody></table>`,
    heading(2, "Film market"),
    table(row("<i>Market</i>", "Market", "M. Maker", "Canada")),
  ].join("");

  it("takes the original title column as the title when a table has no English one, and only the page's own selection headings", () => {
    const rows = readLineupTables(sundance, LINEUPS.find((l) => l.slug === "sundance")!.selection);
    expect(rows.filter((r) => r.h3 === "U.S. Documentary Competition").map((r) => `${r.film.text} | ${r.countries}`)).toEqual(["Seeds | United States", "Predators | United States"]);
    expect(lineupFilms(rows, {}, 2025).map((f) => f.row.film.text)).toEqual(["Seeds", "Predators"]);
    expect(readLineupTables(toronto, LINEUPS.find((l) => l.slug === "tiff")!.selection)).toEqual([]);
  });

  it("reads Sundance's dash lines as labels and leaves out the short film prizes", () => {
    const lines = prizeLines(sundance, LINEUPS.find((l) => l.slug === "sundance")!);
    expect(lines.map((l) => `${l.text} → ${l.entry.film.text}`)).toEqual(["U.S. Documentary (Grand Jury Prizes) → Seeds"]);
  });

  it("reads Toronto's prize table, the film in its second column", () => {
    expect(readPrizeTable(toronto).map((e) => `${e.label} → ${e.film.text}`)).toEqual(["People's Choice Award → Hamnet", "Platform Prize, Honorable Mention → Hen"]);
    expect(prizeLines(toronto, LINEUPS.find((l) => l.slug === "tiff")!).map((l) => l.text)).toEqual(["People's Choice Award", "Platform Prize, Honorable Mention"]);
  });

  it("leaves out a programme of shorts that is listed as one row", () => {
    const rows = readLineupTables(
      [heading(2, "Program"), heading(3, "Special Events"), table(row('Redefined: Short Film Showcase"Butter Chicken to Go"', "", "Prajj", "Canada") + row("<i>Real</i>", "", "R. Eal", "Canada"))].join(""),
      /program/i,
    );
    expect(lineupFilms(rows, {}, 2026).map((f) => f.row.film.text)).toEqual(["Real"]);
  });
});

describe("the loaded lineups against the published counts", () => {
  const sources = sourcesLineupSchema.parse(JSON.parse(readFileSync("scripts/research/sources/lineups.json", "utf8")));

  it("has a published count for every section it checks, and each adds up", () => {
    const keys = Object.keys(sources.published);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const [award, year, ...rest] = key.split("/");
      const section = rest.join("/");
      const edition = readEdition("data", award, Number(year));
      expect(edition, key).toBeDefined();
      const shown = edition!.screenings.filter((s) => s.section === section).length;
      const prefix = `${award} ${year} `;
      // A film left out on purpose still counts, unless the festival's own count leaves it out too.
      const leftOut = Object.entries(sources.leaveOut).filter(([k, v]) => k.startsWith(prefix) && !v.notCounted && LEFT_OUT_SECTIONS[k] === section).length;
      expect(shown + leftOut + (sources.published[key].apart ?? 0), key).toBe(sources.published[key].films);
    }
  });

  it("has no unresolved screening and no film twice in a section", () => {
    for (const { slug } of LINEUPS) {
      for (const year of [2025, 2026]) {
        const edition = readEdition("data", slug, year);
        expect(edition?.screenings.length, `${slug} ${year}`).toBeGreaterThan(0);
        const ids = (edition?.screenings ?? []).map((s) => `${s.section}\u0000${s.imdb ?? s.wd}`);
        expect(new Set(ids).size).toBe(ids.length);
        expect((edition?.screenings ?? []).every((s) => !s.unresolved)).toBe(true);
      }
    }
  });
});

/** The section each left-out film belonged to (the sources name the film, not its section). */
const LEFT_OUT_SECTIONS: Record<string, string> = {
  "venice 2025 Memory": "Giornate degli Autori",
  "venice 2025 I Want Her Dead": "Giornate degli Autori",
  "venice 2025 Full Speed Backward!": "Giornate degli Autori",
  "venice 2025 A Near Thing": "Giornate degli Autori",
  "berlin 2025 Underage": "Generation",
  "sundance 2026 Troublemaker: The Story Behind the Mandela Tapes": "Premieres",
};
