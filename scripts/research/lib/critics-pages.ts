// Page readers for the critics groups (IMPLEMENTATION_PLAN.md task 4.2): their Wikipedia pages
// come in more layouts than the major awards': nominee boxes and labelled cells (`tables.ts`),
// bold-label bullet lists ("Best Film:" with the winner and "Runner-up:" lines under it), and
// headings each followed by a bullet list. All of them end up as `Block`s: a label and its lines.
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { clean, linkOf, nomineeOf, ownContent, readLabelledCells, readNomineeLists, readWikitables, type FilmLink, type Nominee } from "./tables";

export type Item = Nominee & {
  /** A "Runner-up: …" line. */
  runnerUp: boolean;
  /** The line's first link, or its text before a dash: the film of a line with no italics (BIFA's 2013 page). */
  plain: FilmLink;
};

export type Block = {
  label: string;
  items: Item[];
  /** Every line that isn't a runner-up is a winner (a bold label with the winner under it), instead of the bold line being the winner. */
  winnersAreAll: boolean;
};

const RUNNER_UP = /^runners?-?\s?ups?\b/i;
/** "Runner-up: None" (Florida 2023): a line that says there was no runner-up. */
const NO_RUNNER_UP = /^runners?-?\s?ups?:?\s*(none|n\/a)\.?$/i;

function itemOf($: cheerio.CheerioAPI, li: Element): Item {
  const own = ownContent($, li);
  const text = clean(own.text());
  const a = own.find("a").first();
  const plain = a.length > 0 ? linkOf($, a as cheerio.Cheerio<Element>) : { article: null, text: clean(text.split(/\s[–-]\s/)[0]) };
  return { ...nomineeOf($, own), runnerUp: RUNNER_UP.test(text), plain };
}

/** "Best Film:" in bold, with its lines in the list under it (nested in the same item, or the list that follows). */
export function readLabelBlocks(html: string): Block[] {
  const $ = cheerio.load(html);
  const blocks: Block[] = [];
  $("b, strong").each((_, b) => {
    const label = clean($(b).text()).replace(/:$/, "");
    const container = $(b).parent();
    if (!label || !container.is("li, p, div, dt")) return;
    // A nominee box's header (`readNomineeLists` and `readPlainWinnerCells` read those).
    if (container.is("div") && container.parent().is("td, th")) return;
    const own = container.clone();
    own.find("ul, ol, sup.reference").remove();
    if (clean(own.text()).replace(/:$/, "") !== label) return;
    const next = (container.is("dt") ? container.parent("dl") : container).next();
    const list = container.is("li") ? container.children("ul, ol").first() : next.is("ul, ol") ? next : $();
    if (list.length === 0) return;
    // LAFCA nests "Runner-up: …" one level under the winner's line.
    const lines = list
      .children("li")
      .toArray()
      .flatMap((li) => [li, ...$(li).children("ul, ol").children("li").toArray().filter((r) => RUNNER_UP.test(clean(ownContent($, r).text())))]);
    // WAFCA: the winner's list, then the nominees in a `dl` > `dd` > list after it (to 2019) or a list nested under the winner (2020).
    const others = container.is("p") ? [...list.next("dl").find("ul, ol").first().children("li").toArray(), ...list.children("li").children("ul, ol").children("li").toArray()] : [];
    if (others.length > 0) {
      blocks.push({ label, items: [...lines.map((li) => ({ ...itemOf($, li), winner: true })), ...others.map((li) => itemOf($, li))], winnersAreAll: false });
      return;
    }
    blocks.push({ label, items: lines.map((li) => itemOf($, li)), winnersAreAll: true });
  });
  return blocks;
}

/** A heading with a bullet list under it (the list may follow a line or two of description). */
export function readHeadingBlocks(html: string): Block[] {
  const $ = cheerio.load(html);
  const blocks: Block[] = [];
  $("h2, h3, h4").each((_, h) => {
    const label = clean($(h).text());
    const start = $(h).closest(".mw-heading").length > 0 ? $(h).closest(".mw-heading") : $(h);
    let node = start.next();
    // The winner may stand in a bold line of its own above the runners-up (Florida's pages).
    const lead: Item[] = [];
    while (node.length > 0 && !node.is(".mw-heading, h2, h3, h4, ul, ol, table")) {
      if (node.is("p") && node.find("b").length > 0 && node.find("i").length > 0 && clean(node.text()).length < 150) lead.push(itemOf($, node.get(0) as Element));
      node = node.next();
    }
    if (!label || !node.is("ul, ol")) return;
    blocks.push({ label, items: [...lead, ...node.children("li").toArray().map((li) => itemOf($, li))], winnersAreAll: false });
  });
  return blocks;
}

/** A heading with numbered lines in a paragraph ("1. A <br> 2. B"): NSFC's 2012 and 2013 pages; the bold line is the winner. */
export function readRankedLines(html: string): Block[] {
  const $ = cheerio.load(html);
  const blocks: Block[] = [];
  $("h2, h3, h4").each((_, h) => {
    const label = clean($(h).text());
    const start = $(h).closest(".mw-heading").length > 0 ? $(h).closest(".mw-heading") : $(h);
    const node = start.next();
    if (!label || !node.is("p")) return;
    const items: Item[] = [];
    for (const segment of (node.html() ?? "").split(/<br\s*\/?>/i)) {
      const $$ = cheerio.load(segment, null, false);
      $$("sup.reference, .reference").remove();
      if (!/^\d+\.\s/.test(clean($$.root().text()))) continue;
      const own = $$.root();
      const link = own.find("a").first();
      const italic = own.find("i").first();
      const text = italic.length > 0 ? clean(italic.text()) : clean(own.text().replace(/^\d+\.\s*/, "").split(/\s[–-]\s/)[0]);
      items.push({ ...nomineeOf($$, own), runnerUp: false, plain: link.length > 0 ? linkOf($$, link as cheerio.Cheerio<Element>) : { article: null, text } });
    }
    if (items.length > 0) blocks.push({ label, items, winnersAreAll: false });
  });
  return blocks;
}

/**
 * A nominee box whose winner is a line of its own (a bold `p`) between the header and the list of
 * the others: the Critics' Choice pages to 2015. `readNomineeLists` reads such a box without its winner.
 */
export function readPlainWinnerCells(html: string): Block[] {
  const $ = cheerio.load(html);
  const blocks: Block[] = [];
  $("td, th").each((_, cell) => {
    const header = $(cell).children("div").first();
    const lines = $(cell).children("p").toArray();
    if (header.length === 0 || lines.length === 0) return;
    const label = clean(header.text());
    const items = [...lines, ...$(cell).children("ul, ol").children("li").toArray()].map((el) => itemOf($, el as Element));
    if (label && items.length > 0) blocks.push({ label, items, winnersAreAll: false });
  });
  return blocks;
}

/** A `dl` holding one `dt` with the category, then the list of its nominees (the winner in bold): Vancouver's 2014–2018 pages. */
export function readDtBlocks(html: string): Block[] {
  const $ = cheerio.load(html);
  const blocks: Block[] = [];
  $("dl").each((_, dl) => {
    const dts = $(dl).children("dt");
    const list = $(dl).next();
    if (dts.length !== 1 || !list.is("ul, ol")) return;
    blocks.push({ label: clean(dts.text()), items: list.children("li").toArray().map((li) => itemOf($, li)), winnersAreAll: false });
  });
  return blocks;
}

/**
 * A heading with a list whose lines nest: the winner, under it "Runner-up: …" lines and the other nominees one level
 * further down (St. Louis). Every line at any depth is an item; the bold top-level line is the winner.
 */
export function readNestedBlocks(html: string): Block[] {
  const $ = cheerio.load(html);
  const blocks: Block[] = [];
  $("h2, h3, h4").each((_, h) => {
    const label = clean($(h).text());
    const start = $(h).closest(".mw-heading").length > 0 ? $(h).closest(".mw-heading") : $(h);
    const next = start.next();
    // The page may wrap the list in a definition list (St. Louis 2013 and 2015).
    const list = next.is("dl") ? next.find("ul, ol").first() : next;
    if (!label || !list.is("ul, ol")) return;
    const items = list
      .find("li")
      .toArray()
      .map((li) => itemOf($, li))
      .filter((item) => item.line);
    if (items.length > 0) blocks.push({ label, items, winnersAreAll: false });
  });
  return blocks;
}

/**
 * A table with a "Category" column (rowspan: one cell for the category's rows) and a "Films" column: the first row of
 * a category is its winner, the others its nominees (Toronto's 2013–2020 and Vancouver's pages).
 */
export function readCategoryTables(html: string): Block[] {
  const blocks: Block[] = [];
  for (const table of readWikitables(html)) {
    const films = table.headers.findIndex((h) => /^films?$/i.test(h));
    if (!/^category/i.test(table.headers[0] ?? "") || films < 0) continue;
    const seen = new Map<object, Block>();
    for (const row of table.rows) {
      if (row.length <= films) continue;
      const cell = row[0];
      let block = seen.get(cell);
      if (!block) {
        block = { label: cell.text, items: [], winnersAreAll: false };
        seen.set(cell, block);
        blocks.push(block);
      }
      const filmCell = row[films];
      const first = block.items.length === 0;
      const link = filmCell.film ?? { article: null, text: filmCell.text };
      block.items.push({ film: filmCell.film, films: filmCell.film ? [filmCell.film] : [], winner: first, line: filmCell.text, runnerUp: false, plain: link });
    }
  }
  return blocks;
}

/** The page without the section a heading names and everything under it up to the next heading (Vancouver's Canadian categories). */
export function withoutSection(html: string, heading: RegExp): string {
  const $ = cheerio.load(html);
  $(".mw-heading, h2, h3, h4").each((_, el) => {
    const own = $(el).is(".mw-heading") ? $(el).find("h2, h3, h4").first() : $(el);
    if (!heading.test(clean(own.text()))) return;
    const start = $(el).is(".mw-heading") ? $(el) : $(el).parent(".mw-heading").length > 0 ? $(el).parent() : $(el);
    for (let node = start.next(); node.length > 0 && !node.is(".mw-heading, h2, h3, h4"); ) {
      const next = node.next();
      node.remove();
      node = next;
    }
  });
  return $.html();
}

/** Every block on a page, whatever its layout. */
export function readBlocks(html: string, extra: Array<(html: string) => Block[]> = []): Block[] {
  const asItems = (lists: ReturnType<typeof readNomineeLists>): Block[] =>
    lists.map((l) => ({
      label: l.category,
      // The Online Film Critics Society's 2017 page bolds its runners-up like its winners, but marks them "(Runner-up)".
      items: l.nominees.map((n) => ({ ...n, runnerUp: /\(runners?-?\s?ups?\)/i.test(n.line), plain: n.film ?? { article: null, text: clean(n.line.split(/\s[–-]\s/)[0]) } })),
      winnersAreAll: false,
    }));
  const plain = readPlainWinnerCells(html);
  const plainLabels = new Set(plain.map((b) => b.label));
  return [
    ...asItems(readNomineeLists(html)).filter((b) => !plainLabels.has(b.label)),
    ...plain,
    ...asItems(readLabelledCells(html)),
    ...readLabelBlocks(html),
    ...readHeadingBlocks(html),
    ...readRankedLines(html),
    ...extra.flatMap((read) => read(html)),
  ].filter((b) => b.items.length > 0);
}

export type BlockRow = { link: FilmLink; outcome: "won" | "runner_up" | "nominated" };

/** What a block says about films: the winners, the runners-up and the nominees (a line with no italic film is read as the film itself). */
export function blockRows(block: Block): BlockRow[] {
  return block.items.filter((item) => !NO_RUNNER_UP.test(item.line)).flatMap((item) => {
    const outcome = item.runnerUp ? "runner_up" : block.winnersAreAll || item.winner ? "won" : "nominated";
    return (item.films.length > 0 ? item.films : item.line ? [item.plain] : []).map((link) => ({ link, outcome }) as BlockRow);
  });
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Every day a sentence names ("December 11, 2018", "11 December 2018"), in order. */
export function daysIn(sentence: string): string[] {
  const month = `(${MONTHS.join("|")})`;
  const found: Array<{ at: number; day: string }> = [];
  for (const m of sentence.matchAll(new RegExp(`${month} (\\d{1,2})(?:st|nd|rd|th)?,? (\\d{4})`, "g"))) {
    found.push({ at: m.index ?? 0, day: iso(Number(m[3]), MONTHS.indexOf(m[1]) + 1, Number(m[2])) });
  }
  for (const m of sentence.matchAll(new RegExp(`(\\d{1,2})(?:st|nd|rd|th)? ${month},? (\\d{4})`, "g"))) {
    found.push({ at: m.index ?? 0, day: iso(Number(m[3]), MONTHS.indexOf(m[2]) + 1, Number(m[1])) });
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.day);
}

/**
 * The days a page's opening paragraphs give: a sentence that mentions nominations or nominees is
 * the nominations day; the first other sentence with a day and "announced", "given", "held",
 * "presented" or "took place" is the winners' day.
 */
export function leadDates(html: string): { nominationsOn?: string; winnersOn?: string } {
  const $ = cheerio.load(html);
  const lead = $("p")
    .toArray()
    // Not the paragraphs of a floated box (London's results box).
    .filter((p) => $(p).closest("div[style]").length === 0)
    .map((p) => clean($(p).clone().find("sup.reference").remove().end().text()))
    .filter((t) => t.length > 30)
    .slice(0, 3)
    .join(" ");
  const out: { nominationsOn?: string; winnersOn?: string } = {};
  for (const sentence of lead.split(/(?<=[a-z0-9)])\.\s+(?=[A-Z])/)) {
    const day = daysIn(sentence)[0];
    if (!day) continue;
    if (/nominat|nominee/i.test(sentence)) out.nominationsOn ??= day;
    else if (/announced|given|held|presented|took place|revealed/i.test(sentence)) out.winnersOn ??= day;
  }
  return out;
}

/** The titles to try for a film the page names without a working link: its year-qualified article names first. */
export function guessTitles(text: string, year: number): string[] {
  return [`${text} (${year} film)`, `${text} (${year - 1} film)`, `${text} (film)`, text];
}
