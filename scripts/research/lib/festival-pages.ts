// Reads the festivals' prizes out of Wikipedia's parsed HTML (task 2.4, `scripts/research/festivals.ts`).
// - The list articles of Cannes, Venice and Berlin ("Palme d'Or": a table per decade, one row per year).
// - A festival year page's prize lines ("Palme d'Or: Anora by Sean Baker"): the second source those winners
//   are checked against, and Sundance's only source (its pages differ from year to year, so each line is
//   classified by its label and the heading above it).
// - TIFF's "Awards" table: one row per prize, the runners-up after the winner.
// Everything here only reads a page; a line it can't place is left out of the result and found by the
// script's own checks (a category with no winner is reported, never guessed).
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { clean, filmOf, ownContent, readWikitables, type FilmLink } from "./tables";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** `YYYY-MM-DD` plus `days` (negative for earlier). */
export function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The festival's last day from the infobox's "Festival date" (or "Date") row: the last ISO date when the row has
 * them ("(2026-05-23)"), else the last day number next to the last month ("14–25 May 2014", "January 23 to
 * February 2, 2020", "16th – 27th of May 2012", "20 February – 1 March 2020").
 */
export function festivalLastDay(html: string): string | null {
  const $ = cheerio.load(html);
  $("sup.reference, style").remove();
  const row = $("table.infobox tr")
    .toArray()
    .find((tr) => /^(Festival date|Dates?)/i.test($(tr).children("th").text().trim()));
  if (!row) return null;
  const text = $(row).children("td").text().replace(/\s+/g, " ").trim();
  const isos = [...text.matchAll(/\((\d{4}-\d{2}-\d{2})\)/g)].map((m) => m[1]);
  if (isos.length > 0) return isos[isos.length - 1];
  const year = text.match(/\b(\d{4})\b/g)?.pop();
  const months = [...text.matchAll(new RegExp(`\\b(${MONTHS.join("|")})\\b`, "g"))].map((m) => MONTHS.indexOf(m[1]) + 1);
  const days = [...text.replace(/\b\d{4}\b/g, " ").matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\b/g)].map((m) => Number(m[1]));
  if (!year || months.length === 0 || days.length === 0) return null;
  return iso(Number(year), months[months.length - 1], days[days.length - 1]);
}

// ---------------------------------------------------------------------------------------------
// The list articles.

export type ListWinner = { film: FilmLink; text: string };

/**
 * Winners by year from a prize's own article: the decade tables whose first column is "Year" ("2012", "2012 (62nd)").
 * The film is the English-title cell's link; a year with two rows is a tie. A year whose only row is a note
 * ("Festival cancelled…", no film link and no director) comes back as `notHeld`.
 */
export function readListArticle(html: string): { winners: Map<number, ListWinner[]>; notHeld: Map<number, string> } {
  const winners = new Map<number, ListWinner[]>();
  const notHeld = new Map<number, string>();
  for (const table of readWikitables(html)) {
    if (!/^\d{4}s$/.test(table.section) || !/^Year/i.test(table.headers[0] ?? "")) continue;
    const film = table.headers.findIndex((h) => /^(English title|Title|Film)/i.test(h));
    if (film < 0) continue;
    for (const row of table.rows) {
      const year = Number(row[0]?.text.match(/^(\d{4})/)?.[1]);
      const cell = row[film];
      if (!year || !cell?.text) continue;
      // A note spread across every column has the same text in all of them.
      if (row.length > 2 && row[1] === row[row.length - 1] && !cell.film && cell.links.length === 0) {
        notHeld.set(year, cell.text);
        continue;
      }
      const link = cell.film ?? cell.links[0] ?? { article: null, text: cell.text };
      winners.set(year, [...(winners.get(year) ?? []), { film: link, text: cell.text.replace(/\s*[†‡§*]+$/, "") }]);
    }
  }
  return { winners, notHeld };
}

// ---------------------------------------------------------------------------------------------
// Prize lines on a year page.

export type PrizeLine = {
  /** The heading (h3, h4) above the list it sits in, when there is one. */
  heading: string;
  /** What is before the film: "Palme d'Or", "U.S. Dramatic Competition". */
  label: string;
  film: FilmLink | null;
  text: string;
};

/** The year page's awards section: from the "Awards" (or "Official awards") heading to the next heading of its level or higher. */
function awardsSection($: cheerio.CheerioAPI, names: RegExp): cheerio.Cheerio<Element> | null {
  const heading = $(".mw-heading")
    .toArray()
    .find((h) => names.test($(h).find("h2, h3").first().text().trim()));
  if (!heading) return null;
  const level = /mw-heading(\d)/.exec($(heading).attr("class") ?? "")?.[1] ?? "2";
  const stop = Array.from({ length: Number(level) }, (_, i) => `.mw-heading${i + 1}`).join(", ");
  return $("<div></div>").append($(heading).nextUntil(stop).clone()).children() as unknown as cheerio.Cheerio<Element>;
}

/** Splits "Palme d'Or: Anora by Sean Baker", "U.S. Dramatic – In the Summers (A. L.)" and the like into label and rest. */
export function splitLine(text: string): { label: string; rest: string } | null {
  // A dash with spaces ends the label ("Grand Jury Prize: Documentary – Weiner"); without one the colon does ("U.S. Dramatic: Josephine").
  const one = text.match(/^(.+?)\s[–—-]\s(.+)$/) ?? text.match(/^(.+?):\s*(.+)$/);
  return one ? { label: one[1], rest: one[2] } : null;
}

/**
 * Every list item and paragraph of the awards section as a prize line. Prose ("The winner of the U.S. Grand
 * Jury Prize: Dramatic Award was Clemency") is turned into the same shape.
 */
export function readPrizeLines(html: string, names = /^(Official awards|Awards?)$/i): PrizeLine[] {
  const $ = cheerio.load(html);
  $("sup.reference, style").remove();
  const section = awardsSection($, names);
  if (!section) return [];
  const lines: PrizeLine[] = [];
  const wrap = $("<div></div>").append(section.clone());
  wrap.find("li, p").each((_, el) => {
    if ($(el).parents("table").length > 0 && $(el).closest("li").length === 0) return;
    const own = ownContent($, el as Element);
    const text = clean(own.text());
    if (!text || text.startsWith("^")) return;
    const prose = text.match(/^The winner of the (.+?)(?: Award)? was (.+)$/);
    const split = prose ? { label: prose[1], rest: prose[2] } : splitLine(text);
    if (!split) return;
    const list = $(el).closest("ul, ol");
    const heading = clean(
      (list.length > 0 ? list : $(el)).prevAll(".mw-heading").first().find("h2, h3, h4").first().text(),
    );
    lines.push({ heading, label: clean(split.label), film: filmOf($, own), text });
  });
  return lines;
}

// ---------------------------------------------------------------------------------------------
// Sundance.

export const SUNDANCE_CATEGORIES = [
  "us-dramatic-jury",
  "us-dramatic-audience",
  "world-dramatic-jury",
  "world-dramatic-audience",
  "us-documentary-jury",
  "us-documentary-audience",
  "world-documentary-jury",
  "world-documentary-audience",
] as const;

const NOT_THE_MAIN_PRIZES = /special|directing|screenwriting|editing|cinematography|short|next|favorite|institute|innovator|achievement|waldo|orwell|sloan|jonathan|nhk|adobe|acting|score|breakthrough/;

/** The Sundance category a prize line is the winner of (heading and label together), or null for any other prize. */
export function sundanceCategory(heading: string, label: string): (typeof SUNDANCE_CATEGORIES)[number] | null {
  const all = `${heading} ${label}`
    .toLowerCase()
    .replace(/u\.\s?s\./g, "us")
    .replace(/\bpresented by .*$/, "");
  if (NOT_THE_MAIN_PRIZES.test(all)) return null;
  const region = /world/.test(all) ? "world" : /\bus\b/.test(all) || /dramatic|documentary/.test(all) ? "us" : null;
  const genre = /documentar/.test(all) ? "documentary" : /dramatic/.test(all) ? "dramatic" : null;
  // The label's own word wins over the heading's ("Grand Jury Prize" under "Audience Awards" is not an audience prize).
  const kindOf = (t: string) => (/audience/.test(t) ? "audience" : /jury/.test(t) ? "jury" : null);
  const kind = kindOf(label.toLowerCase()) ?? kindOf(all);
  if (!region || !genre || !kind) return null;
  return `${region}-${genre}-${kind}` as (typeof SUNDANCE_CATEGORIES)[number];
}

/** A year's section of the "List of Sundance Film Festival award winners" article, as prize lines. */
export function readSundanceListYear(html: string, year: number): PrizeLine[] {
  const $ = cheerio.load(html);
  $("sup.reference, style").remove();
  const heading = $(".mw-heading3")
    .toArray()
    .find((h) => $(h).find("h3").text().trim() === String(year));
  if (!heading) return [];
  const wrap = $("<div></div>").append($(heading).nextUntil(".mw-heading").clone());
  const lines: PrizeLine[] = [];
  wrap.find("li, p").each((_, el) => {
    const own = ownContent($, el as Element);
    const text = clean(own.text());
    const split = text ? splitLine(text) : null;
    if (split) lines.push({ heading: "", label: clean(split.label), film: filmOf($, own), text });
  });
  return lines;
}

// ---------------------------------------------------------------------------------------------
// Toronto.

export type TiffPrize = { category: "peoples-choice" | "peoples-choice-documentary" | "peoples-choice-international"; outcome: "won" | "runner_up"; film: FilmLink; text: string; label: string };

/** The People's Choice rows of a TIFF year page's "Awards" table (Midnight Madness and the rest are not followed). */
export function readTiffYear(html: string): TiffPrize[] {
  const prizes: TiffPrize[] = [];
  for (const table of readWikitables(html)) {
    if (!/^Awards?$/i.test(table.headers[0] ?? "")) continue;
    const filmCol = table.headers.findIndex((h) => /^(Film|English title)$/i.test(h));
    if (filmCol < 0) continue;
    for (const row of table.rows) {
      const label = row[0]?.text ?? "";
      const lower = label.toLowerCase().replace(/[’‘]/g, "'");
      if (!lower.startsWith("people's choice") && !lower.startsWith("international people's choice")) continue;
      if (/midnight/.test(lower)) continue;
      const category = lower.startsWith("international") ? "peoples-choice-international" : /documentar/.test(lower) ? "peoples-choice-documentary" : "peoples-choice";
      const cell = row[filmCol];
      if (!cell?.text) continue;
      const film = cell.film ?? cell.links[0] ?? { article: null, text: cell.text };
      prizes.push({ category, outcome: /runner up/.test(lower) ? "runner_up" : "won", film, text: cell.text, label });
    }
  }
  return prizes;
}

