// Reads a festival year page's lineup (task 5.1, `scripts/research/lineups.ts`): the film tables under
// the page's selection headings ("Official Selection", "Parallel sections"), and the prize lines under
// "Official Awards" (and a few of the festival's own "Independent Awards" headings).
// - A table row is one film: English title (a link when the film has an article), original title,
//   director(s), production countries. A row's title cell may span the original title's column.
// - A table's own sub-heading rows (a `th` across the table: "Short Films Competition", "Restored Prints")
//   are kept with each row, so the script can leave out what isn't a feature film.
// - A prize line is "Label: Film by Director" or "Label: Person for Film", with nested lines for special
//   mentions; the films are the italic names.
// Everything here only reads a page; the script decides which sections count and checks the result.
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { clean, filmsOf, linkOf, ownContent, type FilmLink } from "./tables";

export type LineupRow = {
  /** The headings above the table, from the first level below the page's top section. */
  h2: string;
  h3: string;
  h4: string;
  /** The table's sub-heading row above this one ("" when none). */
  sub: string;
  film: FilmLink;
  originalTitle: string;
  directors: string;
  /** Production countries as the page names them. */
  countries: string[];
};

export const SELECTION_H2 = /official selection|official sections|independent sections|parallel (?:sections|programs)|selection/i;

/** A title cell's note after the name: "(QP)", "(CdO, QP)" (Cannes' Caméra d'Or, Œil d'or and Queer Palm tags), "(opening film)". */
const NOTE = /\s*\((?:opening|closing|centerpiece)[^)]*\)|\s*\((?:(?:CdO|ŒdO|QP)(?:,\s*)?)+\)/g;

/** The heading levels above a node, tracked in document order. */
class Headings {
  h2 = "";
  h3 = "";
  h4 = "";
  set(level: number, text: string) {
    if (level === 2) [this.h2, this.h3, this.h4] = [text, "", ""];
    else if (level === 3) [this.h3, this.h4] = [text, ""];
    else this.h4 = text;
  }
}

function headingOf($: cheerio.CheerioAPI, el: Element): { level: number; text: string } | null {
  const cls = $(el).attr("class") ?? "";
  const m = cls.match(/\bmw-heading([2-4])\b/);
  if (!m) return null;
  return { level: Number(m[1]), text: clean($(el).find(`h${m[1]}`).first().text()) };
}

type Grid = Array<Array<{ el: Element; header: boolean }>>;

/** Rows of cells with rowspan and colspan spread out; a row that is one header across the table has `sub`. */
function readRows($: cheerio.CheerioAPI, table: Element): Array<{ sub?: string; cells: Grid[number] }> {
  const trs = $(table).find("> tbody > tr, > thead > tr, > tr").toArray();
  const grid: Grid = [];
  trs.forEach((tr, r) => {
    grid[r] ??= [];
    let c = 0;
    $(tr)
      .children("td, th")
      .each((_, el) => {
        while (grid[r][c] !== undefined) c++;
        const rowspan = Math.max(1, Number($(el).attr("rowspan")) || 1);
        const colspan = Math.max(1, Number($(el).attr("colspan")) || 1);
        for (let dr = 0; dr < rowspan && r + dr < trs.length; dr++) {
          grid[r + dr] ??= [];
          for (let dc = 0; dc < colspan; dc++) grid[r + dr][c + dc] = { el: el as Element, header: (el as Element).tagName === "th" };
        }
        c += colspan;
      });
  });
  return grid.map((cells) => {
    const distinct = new Set(cells.map((x) => x.el));
    const sub = cells.length > 1 && distinct.size === 1 && cells[0].header ? clean($(cells[0].el).text()) : undefined;
    return { sub, cells };
  });
}

/** The film a title cell names: its first link (its text is the title), else its text without the notes. */
export function titleCell($: cheerio.CheerioAPI, el: Element): FilmLink {
  const node = $(el).clone();
  node.find("sup.reference, .reference, style, small").remove();
  const link = node.find("a").toArray().find((a) => ($(a).attr("href") ?? "").startsWith("/wiki/") && clean($(a).text()));
  if (link) return linkOf($, $(link) as cheerio.Cheerio<Element>);
  const text = clean(node.text()).replace(NOTE, "").trim();
  return { article: null, text };
}

/** Every film row of the selection tables on the page. */
export function readLineupTables(html: string, selection: RegExp = SELECTION_H2): LineupRow[] {
  const $ = cheerio.load(html);
  const heads = new Headings();
  const rows: LineupRow[] = [];
  $(".mw-heading, table.wikitable").each((_, node) => {
    const el = node as Element;
    const h = headingOf($, el);
    if (h) return void heads.set(h.level, h.text);
    if (!selection.test(heads.h2)) return;
    const table = readRows($, el);
    const head = table.find((r) => r.cells.length > 0 && r.cells.every((c) => c.header) && r.sub === undefined);
    if (!head) return;
    const names = head.cells.map((c) => clean($(c.el).text()).toLowerCase());
    const col = {
      title: names.findIndex((n) => /title/.test(n) && !/original/.test(n)),
      original: names.findIndex((n) => /original/.test(n)),
      directors: names.findIndex((n) => /director/.test(n)),
      countries: names.findIndex((n) => /country/.test(n)),
    };
    // Sundance's documentary tables have only an "Original title" column: that is the title.
    if (col.title < 0 && col.original >= 0) [col.title, col.original] = [col.original, -1];
    if (col.title < 0 || col.directors < 0) return;
    let sub = "";
    for (const r of table) {
      if (r === head) continue;
      if (r.sub !== undefined) {
        sub = r.sub;
        continue;
      }
      if (r.cells.length === 0 || r.cells.every((c) => c.header)) continue;
      const text = (i: number) => (i >= 0 && r.cells[i] ? clean($(r.cells[i].el).clone().find("sup.reference, .reference, style").remove().end().text()) : "");
      const film = titleCell($, r.cells[col.title].el);
      if (!film.text) continue;
      const countries = text(col.countries)
        .split(/\s*,\s*/)
        .filter(Boolean);
      rows.push({ h2: heads.h2, h3: heads.h3, h4: heads.h4, sub, film, originalTitle: text(col.original).replace(NOTE, "").trim(), directors: text(col.directors), countries });
    }
  });
  return rows;
}

export type PrizeEntry = {
  /** The h3 heading above the line. */
  heading: string;
  /** The prize's own name: the text before the colon, or the heading when the line has none. */
  label: string;
  film: FilmLink;
};

const AWARDS_H2 = /awards/i;

/** The prize lines under the page's award headings, one list per heading, one entry per film named on a line. */
export function readPrizeSections(html: string, options: { dash?: boolean } = {}): Array<{ h2: string; h3: string; entries: PrizeEntry[] }> {
  const $ = cheerio.load(html);
  const heads = new Headings();
  const out: Array<{ h2: string; h3: string; entries: PrizeEntry[] }> = [];
  $(".mw-heading, ul").each((_, node) => {
    const el = node as Element;
    const h = headingOf($, el);
    if (h) return void heads.set(h.level, h.text);
    if (!AWARDS_H2.test(heads.h2) || $(el).parents("li, table").length > 0) return;
    const entries: PrizeEntry[] = [];
    // A nested line without a label of its own ("Third Prize:" over two films) takes its parent's.
    const visit = (li: Element, inherited: string) => {
      const own = ownContent($, li);
      const text = clean(own.text());
      const colon = text.indexOf(":");
      // Sundance's lines read "U.S. Dramatic – Film by Director".
      const dash = options.dash && colon < 0 ? text.indexOf(" – ") : -1;
      const label = colon > 0 && colon < 90 ? text.slice(0, colon).trim() : dash > 0 && dash < 90 ? text.slice(0, dash).trim() : inherited;
      for (const film of filmsOf($, own)) entries.push({ heading: heads.h3, label, film });
      $(li).children("ul").children("li").each((_, child) => visit(child as Element, label));
    };
    $(el).children("li").each((_, li) => visit(li as Element, heads.h4 || heads.h3));
    out.push({ h2: heads.h2, h3: heads.h3, entries });
  });
  return out;
}

/** A prize table ("Award", "Film", "Director", as on Toronto's page): one entry per row, the film in the second column. */
export function readPrizeTable(html: string, awardsH2: RegExp = AWARDS_H2): PrizeEntry[] {
  const $ = cheerio.load(html);
  const heads = new Headings();
  const out: PrizeEntry[] = [];
  $(".mw-heading, table.wikitable").each((_, node) => {
    const el = node as Element;
    const h = headingOf($, el);
    if (h) return void heads.set(h.level, h.text);
    if (!awardsH2.test(heads.h2)) return;
    const rows = readRows($, el);
    const head = rows.find((r) => r.cells.length > 0 && r.cells.every((c) => c.header) && r.sub === undefined);
    if (!head) return;
    const names = head.cells.map((c) => clean($(c.el).text()).toLowerCase());
    const [award, film] = [names.findIndex((n) => /award|prize/.test(n)), names.findIndex((n) => /film|title/.test(n))];
    if (award < 0 || film < 0) return;
    for (const r of rows) {
      if (r === head || r.sub !== undefined || r.cells.length === 0 || r.cells.every((c) => c.header)) continue;
      const title = titleCell($, r.cells[film].el);
      const label = clean($(r.cells[award].el).clone().find("sup.reference, .reference").remove().end().text());
      if (title.text && label) out.push({ heading: "", label, film: title });
    }
  });
  return out;
}
