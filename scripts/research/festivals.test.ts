// The readers the festival import (`festivals.ts`, task 2.4) adds: the festival's last day, the label of a
// prize line, Sundance's category rules, the list articles' tie and "not held" rows, and Toronto's awards table.
import { describe, expect, it } from "vitest";
import registry from "../../data/awards.json";
import { findAward } from "../../src/lib/awards";
import { cannesWinners, sundanceWinners } from "./festivals";
import { addDays, cannesCategory, CANNES_CATEGORIES, festivalLastDay, readListArticle, readPrizeLines, readTiffYear, splitLine, sundanceCategory } from "./lib/festival-pages";

const infobox = (date: string) => `<table class="infobox"><tr><th>Festival date</th><td>${date}</td></tr></table>`;
const wikitable = (section: string, rows: string) =>
  `<div class="mw-heading mw-heading3"><h3>${section}</h3></div><table class="wikitable"><tbody>${rows}</tbody></table>`;

describe("festivalLastDay", () => {
  it.each([
    ["14–25 May 2014", "2014-05-25"],
    ["16th – 27th of May 2012", "2012-05-27"],
    ["20 February – 1 March 2020", "2020-03-01"],
    ["January 23 to February 2, 2020", "2020-02-02"],
    ["January 19–29, 2012", "2012-01-29"],
    ["January 20 to 30, 2022", "2022-01-30"],
    ["12–23 May 2026 (2026-05-12) (2026-05-23)", "2026-05-23"],
    ["Opening: 13 February 2025 (2025-02-13) Closing: 23 February 2025 (2025-02-23)", "2025-02-23"],
  ])("reads %s", (text, day) => expect(festivalLastDay(infobox(text))).toBe(day));

  it("is null without a date row", () => expect(festivalLastDay("<table class='infobox'></table>")).toBeNull());
});

describe("addDays", () => {
  it("steps over month and year ends", () => {
    expect(addDays("2020-03-01", -1)).toBe("2020-02-29");
    expect(addDays("2025-01-01", -1)).toBe("2024-12-31");
  });
});

describe("splitLine", () => {
  it.each([
    ["Palme d'Or: Anora by Sean Baker", "Palme d'Or", "Anora by Sean Baker"],
    ["Grand Jury Prize: Documentary - The House I Live In", "Grand Jury Prize: Documentary", "The House I Live In"],
    ["U.S. Dramatic: Josephine (Beth de Araújo)", "U.S. Dramatic", "Josephine (Beth de Araújo)"],
    ["U.S. Dramatic – In the Summers (Alessandra Lacorazza)", "U.S. Dramatic", "In the Summers (Alessandra Lacorazza)"],
  ])("splits %s", (text, label, rest) => expect(splitLine(text)).toEqual({ label, rest }));
});

describe("sundanceCategory", () => {
  it.each([
    ["", "Grand Jury Prize: Dramatic", "us-dramatic-jury"],
    ["", "World Cinema Jury Prize: Documentary", "world-documentary-jury"],
    ["", "Audience Award: U. S. Dramatic presented by Acura", "us-dramatic-audience"],
    ["Grand Jury Prizes", "World Cinema Dramatic Competition", "world-dramatic-jury"],
    ["Audience Awards", "U.S. Documentary", "us-documentary-audience"],
    ["", "US Dramatic Audience Award", "us-dramatic-audience"],
    ["Special Jury Prizes", "U.S. Dramatic Special Jury Award: Ensemble Cast", null],
    ["Directing, Screenwriting and Editing", "U.S. Dramatic Competition", null],
    ["", "Audience Award: Best of NEXT", null],
    ["Audience Awards", "Festival Favorite", null],
    ["", "Jury Prize: Short Filmmaking", null],
  ])("%s / %s", (heading, label, category) => expect(sundanceCategory(heading, label)).toBe(category));
});

const heading = (level: number, name: string) =>
  `<div class="mw-heading mw-heading${level}"><h${level}>${name}</h${level}></div>`;
const cannesSection = (name: string, ...items: string[]) =>
  `${heading(3, name)}<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
const film = (article: string, title: string) => `<i><a href="/wiki/${article}">${title}</a></i>`;
const official = heading(2, "Official Awards");
const independent = heading(2, "Independent Awards");
const ucr = (...items: string[]) => cannesSection("Un Certain Regard", ...items);
const ecumenical = (...items: string[]) => cannesSection("Prize of the Ecumenical Jury", ...items);

describe("Cannes sidebar prizes", () => {
  // Prize lines and markup shapes from the cached 2012–2026 year pages. The 2020 page lists selections only.
  it.each([
    [2012, official + ucr(`Prix Un Certain Regard: ${film("After_Lucia", "Después de Lucía")} by Michel Franco`,
      `Un Certain Regard Special Jury Prize: ${film("Le_Grand_Soir_(film)", "Le grand soir")} by Benoît Delépine and Gustave de Kervern`)
      + independent + cannesSection("Critics' Week", `Grand Prix Nespresso: ${film("Aqu%C3%AD_y_all%C3%A1", "Aquí y allá")} by Antonio Méndez Esparza`)
      + ecumenical(`${film("The_Hunt_(2012_film)", "The Hunt")} by Thomas Vinterberg<ul><li>Special Mention: ${film("Beasts_of_the_Southern_Wild", "Beasts of the Southern Wild")} by Benh Zeitlin</li></ul>`),
    [["ucr-prize", "Después de Lucía"], ["ucr-jury-prize", "Le grand soir"], ["critics-week-grand-prize", "Aquí y allá"], ["ecumenical-jury", "The Hunt"]]],
    [2013, independent + cannesSection("Critics' Week", "Nespresso Grand Prize: <i>Salvo</i> by Fabio Grassadonia and Antonio Piazza")
      + ecumenical(`${film("The_Past_(2013_film)", "The Past")} by Asghar Farhadi<ul><li>Special Mention:</li><li>${film("Miele_(film)", "Miele")} by Valeria Golino</li></ul>`),
    [["critics-week-grand-prize", "Salvo"], ["ecumenical-jury", "The Past"]]],
    [2014, independent + cannesSection("FIPRESCI Prize", `${film("Winter_Sleep_(film)", "Winter Sleep")} by Nuri Bilge Ceylan (In Competition)`,
      `${film("Jauja_(film)", "Jauja")} by Lisandro Alonso (Un Certain Regard)`,
      `${film("Love_at_First_Fight_(film)", "Love at First Fight")} by Thomas Cailley (Director's Fortnight)`),
    [["fipresci-competition", "Winter Sleep"], ["fipresci-ucr", "Jauja"]]],
    [2015, official + ucr(`Prix Un Certain Regard: ${film("Rams_(2015_film)", "Rams")} by Grímur Hákonarson`), [["ucr-prize", "Rams"]]],
    [2016, independent + ecumenical(`${film("It%27s_Only_the_End_of_the_World", "It's Only the End of the World")} by Xavier Dolan`,
      `Commendations:<ul><li>${film("I,_Daniel_Blake", "I, Daniel Blake")} by Ken Loach</li></ul>`), [["ecumenical-jury", "It's Only the End of the World"]]],
    [2017, official + ucr(`Un Certain Regard Award: ${film("A_Man_of_Integrity", "A Man of Integrity")} by Mohammad Rasoulof`), [["ucr-prize", "A Man of Integrity"]]],
    [2018, independent + cannesSection("FIPRESCI Prizes", `Un Certain Regard: ${film("Girl_(2018_film)", "Girl")} by Lukas Dhont`), [["fipresci-ucr", "Girl"]]],
    [2019, official + ucr(`Jury Prize: ${film("Fire_Will_Come", "Fire Will Come")} by Oliver Laxe`,
      `Special Jury Prize: ${film("Libert%C3%A9_(2019_film)", "Liberté")} by Albert Serra`)
      + independent + cannesSection("FIPRESCI Prizes", `Parallel section: ${film("The_Lighthouse_(2019_film)", "The Lighthouse")} by Robert Eggers (Directors' Fortnight)`)
      + cannesSection("Critics' Week", `<b><i>Nespresso</i> Grand Prize</b>: ${film("I_Lost_My_Body", "I Lost My Body")} by Jérémy Clapin`),
    [["ucr-jury-prize", "Fire Will Come"], ["critics-week-grand-prize", "I Lost My Body"]]],
    [2020, heading(2, "Official sections") + "<p>The Official Selection has been divided in sub-categories, as directors or genres, not as competitors.</p>", []],
    [2021, official + ucr(`Un Certain Regard Award: ${film("Unclenching_the_Fists", "Unclenching the Fists")} by Kira Kovalenko`)
      + independent + cannesSection("Critics' Week", "<b><i>Nespresso</i> Grand Prize</b>: <i>Feathers</i> by Omar El Zohairy"),
    [["ucr-prize", "Unclenching the Fists"], ["critics-week-grand-prize", "Feathers"]]],
    [2022, independent + cannesSection("Critics' Week", `Grand Prize: ${film("The_Pack_(2022_film)", "The Pack")} by Andrés Ramírez Pulido`),
      [["critics-week-grand-prize", "The Pack"]]],
    [2023, official + ucr(`Un Certain Regard Prize: ${film("How_to_Have_Sex", "How to Have Sex")} by Molly Manning Walker`), [["ucr-prize", "How to Have Sex"]]],
    [2024, official + ucr(`Un Certain Regard Prize: ${film("Black_Dog_(2024_film)", "Black Dog")} by Guan Hu`,
      `Un Certain Regard Jury Prize: ${film("Souleymane%27s_Story", "Souleymane's Story")} by Boris Lojkine`)
      + independent + cannesSection("FIPRESCI Prizes", `In Competition: ${film("The_Seed_of_the_Sacred_Fig", "The Seed of the Sacred Fig")} by Mohammad Rasoulof`,
        `Un Certain Regard: ${film("Souleymane%27s_Story", "Souleymane's Story")} by Boris Lojkine`)
      + ecumenical(`${film("The_Seed_of_the_Sacred_Fig", "The Seed of the Sacred Fig")} by Mohammad Rasoulof`)
      + cannesSection("Critics' Week", `Grand Prize: ${film("Simon_of_the_Mountain", "Simon of the Mountain")} by Federico Luis`)
      + cannesSection("Directors' Fortnight", `Audience Award: ${film("Universal_Language_(2024_film)", "Universal Language")} by Matthew Rankin`),
    [["ucr-prize", "Black Dog"], ["ucr-jury-prize", "Souleymane's Story"], ["fipresci-competition", "The Seed of the Sacred Fig"],
      ["fipresci-ucr", "Souleymane's Story"], ["ecumenical-jury", "The Seed of the Sacred Fig"],
      ["critics-week-grand-prize", "Simon of the Mountain"], ["fortnight-audience-award", "Universal Language"]]],
    [2025, independent + ecumenical(`<a href="/wiki/Prize_of_the_Ecumenical_Jury"><i>Prix du Jury Œcuménique</i></a>: ${film("Young_Mothers", "Young Mothers")} by Jean-Pierre and Luc Dardenne`),
      [["ecumenical-jury", "Young Mothers"]]],
    [2026, independent + cannesSection("FIPRESCI Prize", `Un Certain Regard: ${film("Ben%27Imana", "Ben'Imana")} by Marie Clémentine Dusabejambo`), [["fipresci-ucr", "Ben'Imana"]]],
  ] as const)("classifies the fixed %i Cannes page lines", (_year, html, expected) => {
    expect(cannesWinners(html).winners.map(({ category, link }) => [category, link.text])).toEqual(expected);
  });

  it("keeps nested mentions, commendations, unrelated awards and parallel FIPRESCI results out of the winners", () => {
    const result = cannesWinners(official + cannesSection("Caméra d'Or", `Caméra d'Or: ${film("Ben%27Imana", "Ben'Imana")} by Marie Clémentine Dusabejambo`)
      + independent + ecumenical(`${film("It%27s_Only_the_End_of_the_World", "It's Only the End of the World")} by Xavier Dolan`,
        `Commendations:<ul><li>${film("I,_Daniel_Blake", "I, Daniel Blake")} by Ken Loach</li></ul>`,
        `Special Mention: ${film("Beasts_of_the_Southern_Wild", "Beasts of the Southern Wild")} by Benh Zeitlin`)
      + cannesSection("FIPRESCI Prizes", `Parallel sections (first features): ${film("A_Girl_Unknown", "A Girl Unknown")} by Zou Jing`));
    expect(result.winners.map(({ link }) => link.article)).toEqual(["It's Only the End of the World"]);
    expect(result.skipped.map(({ label, text }) => [label, text])).toEqual([
      ["Commendations", "Commendations:"], ["Commendations", "I, Daniel Blake by Ken Loach"],
      ["Special Mention", "Special Mention: Beasts of the Southern Wild by Benh Zeitlin"],
      ["Parallel sections (first features)", "Parallel sections (first features): A Girl Unknown by Zou Jing"],
    ]);
  });

  it("keeps both linked films in a tie and reports the cached 2024 directing tie as skipped", () => {
    const a = film("The_Damned_(2024_Minervini_film)", "The Damned");
    const b = film("On_Becoming_a_Guinea_Fowl", "On Becoming a Guinea Fowl");
    const tie = `<ul><li>${a} by Roberto Minervini</li><li>${b} by Rungano Nyoni</li></ul>`;
    const result = cannesWinners(official + ucr(`Un Certain Regard Best Director:${tie}`, `Jury Prize: ${a} and ${b} (tie)`));
    expect(result.winners.map(({ category, link }) => [category, link.article])).toEqual([
      ["ucr-jury-prize", "The Damned (2024 Minervini film)"], ["ucr-jury-prize", "On Becoming a Guinea Fowl"],
    ]);
    expect(result.skipped.map(({ text }) => text)).toEqual([
      "Un Certain Regard Best Director:", "The Damned by Roberto Minervini", "On Becoming a Guinea Fowl by Rungano Nyoni",
    ]);
  });

  it.each([
    [" Critics’ Week ", "GRAND PRIX", "critics-week-grand-prize"],
    ["In Competition", "Grand Prix", null],
    ["In Competition", "Jury Prize", null],
    ["Un Certain Regard", "Jury Prize", "ucr-jury-prize"],
    ["Un Certain Regard", "", null],
    ["", "Jury Prize", null],
    ["Directors' Fortnight", `Audience Award ${"x".repeat(1000)}`, null],
  ])("uses both heading %s and label %s", (section, label, category) => {
    expect(cannesCategory(section, label)).toBe(category);
  });

  it("reads the seven parser categories back from the winners-only Cannes registry", () => {
    expect(findAward("cannes")).toMatchObject({ winnersOnly: true, oscarCategories: ["picture", "international"] });
    const award = registry.find(({ slug }) => slug === "cannes");
    expect(award?.categories.slice(3).map(({ slug, oscarCategory, sortOrder }) => [slug, oscarCategory, sortOrder])).toEqual(
      CANNES_CATEGORIES.map((slug, index) => [slug, "international", index + 4]),
    );
  });
});

describe("readPrizeLines and sundanceWinners", () => {
  const html = `
    <div class="mw-heading mw-heading2"><h2>Awards</h2></div>
    <div class="mw-heading mw-heading3"><h3>Grand Jury Prizes</h3></div>
    <ul><li>U.S. Dramatic Competition – <i><a href="/wiki/CODA_(2021_film)">CODA</a></i> (Siân Heder)</li></ul>
    <div class="mw-heading mw-heading3"><h3>Audience Awards</h3></div>
    <ul><li>U.S. Dramatic Competition – <i>CODA</i> (Siân Heder)</li></ul>
    <p>The winner of the World Cinema Grand Jury Prize: Dramatic was <i><a href="/wiki/Hive_(2021_film)">Hive</a></i>, directed by Blerta Basholli.</p>
    <div class="mw-heading mw-heading2"><h2>References</h2></div>
    <ul><li>Not a prize: line</li></ul>`;
  const lines = readPrizeLines(html);

  it("keeps the heading above a list and reads prose as a line", () => {
    expect(lines.map((l) => [l.heading, l.label, l.film?.text])).toEqual([
      ["Grand Jury Prizes", "U.S. Dramatic Competition", "CODA"],
      ["Audience Awards", "U.S. Dramatic Competition", "CODA"],
      ["Audience Awards", "World Cinema Grand Jury Prize: Dramatic", "Hive"],
    ]);
  });

  it("takes the year page's line first and the list's for what the page lacks", () => {
    const list = [{ heading: "", label: "World Cinema Audience Award: Dramatic", film: { article: null, text: "Hive" }, text: "" }];
    const winners = sundanceWinners(lines, list);
    expect(winners.get("us-dramatic-jury")?.map((w) => w.source)).toEqual(["page"]);
    expect(winners.get("world-dramatic-audience")?.map((w) => w.source)).toEqual(["list"]);
  });
});

describe("readListArticle", () => {
  const html = wikitable(
    "2010s",
    `<tr><th>Year</th><th>English Title</th><th>Director</th></tr>
     <tr><td>2014</td><td><i><a href="/wiki/Goodbye_to_Language">Goodbye to Language</a></i></td><td>Godard</td></tr>
     <tr><td>2014</td><td><i><a href="/wiki/Mommy_(2014_film)">Mommy</a></i></td><td>Dolan</td></tr>`,
  ).replace("</tbody>", `<tr><td>2020</td><td colspan="2">Festival cancelled due to the COVID-19 pandemic.</td></tr></tbody>`);

  it("gives a tie two winners and a year with only a note as not held", () => {
    const { winners, notHeld } = readListArticle(html);
    expect(winners.get(2014)?.map((w) => w.film.text)).toEqual(["Goodbye to Language", "Mommy"]);
    expect(notHeld.has(2020) || !winners.has(2020)).toBe(true);
  });
});

describe("readTiffYear", () => {
  const html = wikitable(
    "Awards",
    `<tr><th>Award</th><th>Film</th><th>Director</th></tr>
     <tr><td>People's Choice Award</td><td><i><a href="/wiki/Hamnet_(film)">Hamnet</a></i></td><td>Chloé Zhao</td></tr>
     <tr><td>People's Choice Award, First Runner Up</td><td><i>Frankenstein</i></td><td>del Toro</td></tr>
     <tr><td>International People's Choice Award</td><td><i>No Other Choice</i></td><td>Park</td></tr>
     <tr><td>People's Choice Award: Documentaries</td><td><i>The Road Between Us</i></td><td>Avrich</td></tr>
     <tr><td>People's Choice Award: Midnight Madness</td><td><i>Nirvanna</i></td><td>Johnson</td></tr>
     <tr><td>Platform Prize</td><td><i>Other</i></td><td>X</td></tr>`,
  );

  it("reads the film, international and documentary prizes and their runners-up, and nothing else", () => {
    expect(readTiffYear(html).map((p) => [p.category, p.outcome, p.film.text])).toEqual([
      ["peoples-choice", "won", "Hamnet"],
      ["peoples-choice", "runner_up", "Frankenstein"],
      ["peoples-choice-international", "won", "No Other Choice"],
      ["peoples-choice-documentary", "won", "The Road Between Us"],
    ]);
  });
});
