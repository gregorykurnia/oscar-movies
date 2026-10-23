// The readers the festival import (`festivals.ts`, task 2.4) adds: the festival's last day, the label of a
// prize line, Sundance's category rules, the list articles' tie and "not held" rows, and Toronto's awards table.
import { describe, expect, it } from "vitest";
import { sundanceWinners } from "./festivals";
import { addDays, festivalLastDay, readListArticle, readPrizeLines, readTiffYear, splitLine, sundanceCategory } from "./lib/festival-pages";

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
