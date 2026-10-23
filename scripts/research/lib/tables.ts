// Reads award data out of Wikipedia's parsed HTML (cheerio). Two shapes cover the award pages:
// - nominee lists: the "Winners and nominees" box of the Oscars (and BAFTA, Globes, Critics'
//   Choice) pages, one cell per category with the winner in bold, marked ‡, and the nominees
//   listed under it;
// - wikitables: submission lists, festival lineups and critics' lists, read row by row with
//   rowspan and colspan spread out, so every row has every column.
// Films are returned as the article title their link points to, which the resolver turns
// into a Wikidata item and an IMDb ID. The visible text is kept for unresolved films.
import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { titleFromHref } from "./wikipedia";

export type FilmLink = {
  /** Article title the link points to; `null` for a red link or plain text. */
  article: string | null;
  /** The text shown on the page. */
  text: string;
  /** A QID set by hand for a film the page doesn't link (or links wrongly); wins over `article`. */
  wd?: string;
};

export type Nominee = {
  film: FilmLink | null;
  winner: boolean;
  /** The whole line as text (people, country, language), for checks and notes. */
  line: string;
};

export type NomineeList = { category: string; nominees: Nominee[] };

const WINNER_MARK = /[‡‡]/;

export const clean = (text: string) => text.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();

export function linkOf($: cheerio.CheerioAPI, a: cheerio.Cheerio<Element>): FilmLink {
  const href = a.attr("href") ?? "";
  const red = a.hasClass("new") || href.includes("redlink=1");
  return { article: red ? null : titleFromHref(href), text: clean(a.text()) };
}

/** A list item's own content: the item without the lists nested inside it. */
export function ownContent($: cheerio.CheerioAPI, li: Element): cheerio.Cheerio<AnyNode> {
  const copy = $(li).clone();
  copy.find("ul, ol").remove();
  copy.find("sup.reference, .reference").remove();
  return copy;
}

/** The film a nominee line names: the first italic link, else the first italic text. */
export function filmOf($: cheerio.CheerioAPI, own: cheerio.Cheerio<AnyNode>): FilmLink | null {
  const italic = own.find("i").first();
  if (italic.length === 0) return null;
  const a = italic.is("a") ? italic : italic.find("a").first();
  const parentLink = italic.closest("a");
  if (a.length > 0) return linkOf($, a as cheerio.Cheerio<Element>);
  if (parentLink.length > 0) return linkOf($, parentLink as cheerio.Cheerio<Element>);
  return { article: null, text: clean(italic.text()) };
}

/**
 * Every nominee box on the page: a cell whose first element is a header (a `div` or `b`
 * holding the category name) followed by lists of nominees. Winners are the lines in bold or
 * marked ‡ (ties give two).
 */
export function readNomineeLists(html: string): NomineeList[] {
  const $ = cheerio.load(html);
  const lists: NomineeList[] = [];
  $("td, th").each((_, cell) => {
    const header = $(cell).children("div, p, b").first();
    const items = $(cell).find("li");
    if (header.length === 0 || items.length === 0) return;
    const category = clean(header.text());
    if (!category) return;
    const nominees = items.toArray().map((li): Nominee => nomineeOf($, ownContent($, li)));
    lists.push({ category, nominees });
  });
  return lists;
}

/** One nominee line; a bold film name (even inside the italics), or a mark ‡, makes it a winner. */
function nomineeOf($: cheerio.CheerioAPI, own: cheerio.Cheerio<AnyNode>): Nominee {
  const line = clean(own.text());
  const film = filmOf($, own);
  const boldText = clean(own.find("b").text());
  // Bold covers the film's name, or half the line (a winner's line may name the producers too).
  const bold = boldText.length > 0 && (boldText.length >= line.length / 2 || (film !== null && boldText.includes(film.text)));
  return { film, winner: bold || WINNER_MARK.test(line), line };
}

/**
 * The older award pages (and the guilds' pages) lay each category out as a table cell under
 * a header row: `th` rows name the category (one wide header) or a group and then its columns
 * (a header row of several `th`, such as Drama | Musical or Comedy), and the `td` below holds
 * the winner (a bold paragraph or list item) and the nominees. The label is the group and the
 * column header joined, or the single header.
 */
export function readLabelledCells(html: string): NomineeList[] {
  const $ = cheerio.load(html);
  const lists: NomineeList[] = [];
  $("table.wikitable").each((_, table) => {
    let group = "";
    let groupFresh = false;
    let columns: string[] = [];
    $(table)
      .find("> tbody > tr, > tr")
      .each((_, tr) => {
        const ths = $(tr).children("th");
        const tds = $(tr).children("td");
        if (tds.length === 0) {
          if (ths.length === 1) {
            group = clean(ths.text());
            groupFresh = true;
            columns = [];
          } else if (ths.length > 1) {
            // Headers that follow a row of cells, with no group header of their own, stand alone.
            if (!groupFresh) group = "";
            columns = ths.toArray().map((th) => clean($(th).text()));
          }
          return;
        }
        tds.each((i, td) => {
          const label = [group, columns[i]].filter(Boolean).join(" ");
          const lines: Nominee[] = [];
          // The Spirit pages' older layout: the winner stands bare (or in bold italics) above the list of nominees.
          if ($(td).children("p").length === 0) {
            const lead = $(td).clone();
            lead.find("ul, ol, sup.reference, .reference").remove();
            if (clean(lead.text())) lines.push(nomineeOf($, lead));
          }
          $(td)
            .children("p")
            .each((_, p) => {
              const own = $(p).clone();
              own.find("sup.reference, .reference").remove();
              if (clean(own.text())) lines.push(nomineeOf($, own));
            });
          $(td)
            .find("li")
            .each((_, li) => {
              lines.push(nomineeOf($, ownContent($, li)));
            });
          if (lines.length > 0) lists.push({ category: label, nominees: lines });
        });
        // A row of cells uses up the headers above it; the next header row starts afresh.
        columns = [];
        groupFresh = false;
      });
  });
  return lists;
}

/** The nominee list whose header matches `category` exactly (case-insensitive), or throws. */
export function nomineeList(lists: NomineeList[], category: string | RegExp): NomineeList {
  const found = lists.filter((l) =>
    typeof category === "string" ? l.category.toLowerCase() === category.toLowerCase() : category.test(l.category),
  );
  if (found.length !== 1) {
    throw new Error(`Expected one nominee list for ${String(category)}, found ${found.length}.`);
  }
  return found[0];
}

export type Cell = {
  text: string;
  links: FilmLink[];
  /** The film the cell names (its first italic link), when it names one. */
  film: FilmLink | null;
  bold: boolean;
  header: boolean;
  /** The row has the winner's gold background (`background:#FAEB86`), Wikipedia's mark where nothing is bold. */
  shaded?: boolean;
};

export type Table = {
  /** The heading of the section the table sits in. */
  section: string;
  caption: string;
  headers: string[];
  rows: Cell[][];
};

function cellOf($: cheerio.CheerioAPI, el: Element): Cell {
  const node = $(el).clone();
  node.find("sup.reference, .reference, style").remove();
  const links = node
    .find("a")
    .toArray()
    .map((a) => linkOf($, $(a)))
    .filter((l) => l.text.length > 0);
  const film = filmOf($, node) ?? null;
  const text = clean(node.text());
  const boldText = clean(node.find("b").text());
  return { text, links, film, bold: boldText.length > 0 && boldText.length >= text.length / 2, header: el.tagName === "th" };
}

/** Every `table.wikitable` on the page, with rowspan and colspan spread out. */
export function readWikitables(html: string): Table[] {
  const $ = cheerio.load(html);
  return $("table.wikitable")
    .toArray()
    .map((table): Table => {
      const heading = $(table).prevAll(".mw-heading, h2, h3, h4").first();
      const section = clean(heading.find("h2, h3, h4").addBack("h2, h3, h4").first().text());
      const caption = clean($(table).children("caption").text());
      const grid: Cell[][] = [];
      const trs = $(table).find("> tbody > tr, > thead > tr, > tr").toArray();
      trs.forEach((tr, r) => {
        grid[r] ??= [];
        let c = 0;
        $(tr)
          .children("td, th")
          .each((_, el) => {
            while (grid[r][c] !== undefined) c++;
            const cell = { ...cellOf($, el), shaded: /FAEB86/i.test($(tr).attr("style") ?? "") };
            const rowspan = Math.max(1, Number($(el).attr("rowspan")) || 1);
            const colspan = Math.max(1, Number($(el).attr("colspan")) || 1);
            for (let dr = 0; dr < rowspan && r + dr < trs.length; dr++) {
              grid[r + dr] ??= [];
              for (let dc = 0; dc < colspan; dc++) grid[r + dr][c + dc] = cell;
            }
            c += colspan;
          });
      });
      const headerRows = grid.filter((row) => row.length > 0 && row.every((cell) => cell.header));
      const headers = (headerRows[0] ?? []).map((cell) => cell.text);
      return { section, caption, headers, rows: grid.filter((row) => !headerRows.includes(row)) };
    });
}

/** The column whose header matches, or throws (so a changed page fails loudly). */
export function column(table: Table, header: RegExp): number {
  const i = table.headers.findIndex((h) => header.test(h));
  if (i < 0) throw new Error(`No column matching ${String(header)} in [${table.headers.join(" | ")}].`);
  return i;
}

/**
 * A category article ("European Film Award for Best Film"): one row per nominee, the year in the
 * first column and the winner in bold. Returns the nominees by the year the first column gives
 * (the leading four digits, "2013(26th)"); rows without a film cell are skipped.
 */
export function readArticleYears(html: string): Map<number, Nominee[]> {
  const years = new Map<number, Nominee[]>();
  for (const table of readWikitables(html)) {
    const film = table.headers.findIndex((h) => /^(Film|English title|Winner)/i.test(h));
    if (film < 0) continue;
    for (const row of table.rows) {
      const year = Number(row[0]?.text.match(/^(\d{4})/)?.[1]);
      const cell = row[film];
      if (!year || !cell || !cell.text) continue;
      const link = cell.film ?? cell.links[0] ?? null;
      const line = cell.text.replace(/\s*[†‡*]+$/, "");
      years.set(year, [...(years.get(year) ?? []), { film: link ?? { article: null, text: line }, winner: cell.bold, line }]);
    }
  }
  return years;
}

/**
 * The winner of a main article that lists each year's prizes as a bulleted list under a "Winners in
 * <year>" heading (Cinema Eye Honors): the film named on the line that starts with `label`.
 */
export function readHeadingWinner(html: string, heading: string, label: RegExp): FilmLink | null {
  const $ = cheerio.load(html);
  const h = $("h2, h3, h4")
    .toArray()
    .find((el) => clean($(el).text()) === heading);
  if (!h) return null;
  const after = $(h).closest(".mw-heading").length > 0 ? $(h).closest(".mw-heading") : $(h);
  const list = after.nextAll("ul").first();
  for (const li of list.children("li").toArray()) {
    const own = ownContent($, li);
    if (label.test(clean(own.text()))) return filmOf($, own);
  }
  return null;
}
