// `npx tsx scripts/research/critics.ts [--award austin-critics,boston-society] [--years 2012-2026] [--refresh] [--offline]`
// (IMPLEMENTATION_PLAN.md §3.4, task 4.2 on): the film results of the critics groups for each film
// year, into `data/editions/<award>/<year>.json`, and the facts of every new film into
// `data/movies/<year>.json`. Same rules as `majors.ts`: results come from Wikipedia pages read by
// label, never guessed; what a group's sources don't give is written as `partial` (with a note
// saying what is missing) or `no_data`, and the script prints every doubt for a person to settle.
// - Groups with a page per year (Austin, Boston Society, BIFA, AAFCA's early years) are read as
//   blocks (`lib/critics-pages.ts`): nominee boxes, bold-label lists, headings with lists.
// - AAFCA's Best Picture and top ten come from the "Top Ten Films of the Year" table of its main
//   article (a winner and nine nominees a year; its own labels are the ceremony year from 2022).
// - AWFJ's "EDA Best of Awards" table and BOFCA's "Selected past winners" table cover every year.
// - Atlanta, Black and Central Florida have no Wikipedia page: every year is `no_data`.
// - Peabody's documentary honorees come from the decade lists (a film counts for its own film year, not the year of
//   the honours; series and episodes are left out); Phoenix FCS has only its Best Picture winner table.
import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import { z } from "zod";
import type { EditionFile, MoviesFile, ResultEntry } from "../../src/lib/data-files";
import { checkArgs, readEnvFile } from "../lib/target";
import { plainTitle } from "./lib/facts";
import { createFetcher } from "./lib/fetcher";
import { blockRows, daysIn, guessTitles, leadDates, readBlocks, type BlockRow } from "./lib/critics-pages";
import { filmRef, newFilms, researched, researchFilms, unresolvedReport, type ResearchedFilm } from "./lib/films";
import { resolveArticles } from "./lib/resolve";
import type { Fetcher } from "./lib/fetcher";
import type { Element } from "domhandler";
import { clean, filmOf, linkOf, ownContent, readWikitables, type FilmLink } from "./lib/tables";
import { findOnTmdb } from "./lib/tmdb-search";
import { FILM_TYPES, isFilm, releaseYears } from "./lib/wikidata-search";
import { entityIds, type Entity } from "./lib/wikidata";
import { fetchPage } from "./lib/wikipedia";
import { addMovies, movieKey, readMoviesFiles, writeEdition } from "./lib/writer";
import { infoboxDate } from "./majors";

const DATA_DIR = "data";
export const SOURCES = "scripts/research/sources/critics.json";

const date = z.iso.date();
export const sourcesSchema = z
  .object({
    /** "<award>/<year>" → a day the page doesn't state (or states loosely), with where it came from. */
    dates: z.record(z.string(), z.object({ nominationsOn: date.optional(), winnersOn: date.optional(), why: z.string().min(1) }).strict()),
    /** "<award>/<year>/<category>" → why the group gave no such prize that year (so its absence is not a gap). */
    absent: z.record(z.string(), z.string().min(1)),
    /** By the article the page links (or, unlinked, the text): a link the page gets wrong or leaves out. */
    linkFixes: z.record(z.string(), z.object({ article: z.string().optional(), wd: z.string().regex(/^Q\d+$/).optional(), why: z.string() }).strict()),
    /** A film with no Wikipedia article or Wikidata item, found on TMDB: by "<award> <year> <text on the page>". */
    tmdbSearch: z.record(
      z.string(),
      z.object({ directors: z.array(z.string()).min(1), country: z.string().regex(/^[A-Z]{2}$/), why: z.string() }).strict(),
    ),
    /** Films with no IMDb ID and no Wikidata item, left out (§11), by "<award> <year> <text on the page>". */
    leaveOut: z.record(z.string(), z.object({ why: z.string() }).strict()),
    /** A film's year when no record, release date or title gives it (Peabody honorees), by the article it is on, with where it came from. */
    filmYears: z.record(z.string(), z.object({ year: z.number().int().min(2012), why: z.string().min(1) }).strict()),
    /** English titles that read better than Wikidata's, by IMDb ID. */
    titles: z.record(z.string().regex(/^tt\d+$/), z.string().min(1)),
  })
  .strict();
export type Sources = z.infer<typeof sourcesSchema>;

export const flat = (label: string) => label.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

type Row = { category: string; link: FilmLink; outcome: "won" | "runner_up" | "nominated" };

/** What one group's sources give for one year. */
export type Read = {
  rows: Row[];
  /** Categories with no result on the sources (not counting those the group gave no prize for). */
  missing: string[];
  winnersOn?: string;
  nominationsOn?: string;
  urls: string[];
  /** What the sources leave out, said in the note of a `partial` edition. */
  gaps: string[];
  problems: string[];
};

type Cat = {
  slug: string;
  label: RegExp;
  /** A list of further films the group names with its winner (NBR's "Top 5 International Films"): all are nominees. */
  tops?: RegExp;
  /** Several lists match (Astra 2025's Best Picture in two genres): all are read, each with its own winner. */
  multi?: boolean;
};

type Group = {
  slug: string;
  name: string;
  /** Film years with a source; the others are `no_data` with `why`. */
  years: [number, number];
  why: string;
  /** Whether the group announces nominees (a `loaded` edition then needs a nominations day). */
  winnersOnly: boolean;
  /** The nominees (or runners-up, or a top list) come out on the day of the winners: the day stands for both without a note. */
  nomineesSameDay?: boolean;
  /** The group honours several films in a category (Peabody's documentary winners): more than one winner is no doubt. */
  manyWinners?: boolean;
  read: (year: number, ctx: Ctx) => Promise<Read | null>;
};

type Ctx = {
  fetcher: Fetcher;
  page: (title: string) => Promise<{ html: string; url: string }>;
  sources: Sources;
  problems: string[];
};

const CATEGORIES = {
  international: /^(best)?(foreign|nonenglish|international)(language)?(independent)?film$/,
  documentary: /^bestdocumentary(feature|film)?$/,
  animated: /^bestanimat(ed|ion)(film|feature)?$/,
  // Gotham, Astra and Houston call it a "feature" (Houston: "Foreign Language Feature").
  internationalFeature: /^(best)?(foreign|nonenglish|international)(language)?(independent)?(film|feature)$/,
};

function pageRead(
  slug: string,
  spec: {
    page: (year: number) => string;
    categories: Array<Cat & { span?: [number, number] }>;
    topTen?: RegExp;
    /** Category → the first film year its nominees (not just its winner) are listed. */
    nomineesFrom?: number;
    /** Also read rows of wikitables with the category in the first cell and the film in the last (AAFCA's oldest pages). */
    tables?: boolean;
    winnersOnly: boolean;
  },
): Group["read"] {
  return async (year, ctx) => {
    const title = spec.page(year);
    let page;
    try {
      page = await ctx.page(title);
    } catch (error) {
      if (!/doesn't exist/.test(String(error))) throw error;
      return null;
    }
    const blocks = readBlocks(page.html);
    const wikitables = spec.tables ? readWikitables(page.html) : [];
    const local: string[] = [];
    const gaps: string[] = [];
    const rows: Row[] = [];
    const missing: string[] = [];
    const label = `${slug} ${year}`;
    for (const cat of spec.categories) {
      if (cat.span && (year < cat.span[0] || year > cat.span[1])) continue;
      if (ctx.sources.absent[`${slug}/${year}/${cat.slug}`]) continue;
      const hits = blocks.filter((b) => cat.label.test(flat(b.label)));
      const found: BlockRow[][] = hits.map((b) => blockRows(b));
      for (const t of wikitables) {
        for (const row of t.rows) {
          if (row.length < 2 || !cat.label.test(flat(row[0].text))) continue;
          const filmCell = row[row.length - 1];
          found.push([{ link: filmCell.film ?? { article: null, text: filmCell.text }, outcome: "won" }]);
        }
      }
      const filled = found.filter((f) => f.length > 0);
      const same = filled.length > 0 && filled.every((f) => JSON.stringify(f.map((r) => [r.link.text, r.outcome])) === JSON.stringify(filled[0].map((r) => [r.link.text, r.outcome])));
      if (filled.length === 0) {
        missing.push(cat.slug);
        local.push(`${label}: ${cat.slug} not found on the page`);
        continue;
      }
      if (!same && cat.multi) {
        for (const list of filled) rows.push(...list.map((r) => ({ category: cat.slug, link: r.link, outcome: r.outcome })));
        continue;
      }
      if (!same) {
        missing.push(cat.slug);
        local.push(`${label}: ${cat.slug} matches ${filled.length} different lists`);
        continue;
      }
      rows.push(...filled[0].map((r) => ({ category: cat.slug, link: r.link, outcome: r.outcome })));
      if (!rows.some((r) => r.category === cat.slug && r.outcome === "won")) local.push(`${label}: ${cat.slug} has no winner`);
      if (cat.tops) {
        const tops = blocks.filter((b) => cat.tops!.test(flat(b.label)));
        if (tops.length === 1) rows.push(...blockRows(tops[0]).map((r) => ({ category: cat.slug, link: r.link, outcome: "nominated" as const })));
      }
    }
    if (spec.topTen) {
      const tops = blocks.filter((b) => spec.topTen!.test(flat(b.label)));
      if (tops.length === 1) rows.push(...blockRows(tops[0]).map((r) => ({ category: "picture", link: r.link, outcome: "nominated" as const })));
    }
    if (spec.nomineesFrom && year < spec.nomineesFrom) gaps.push("only the winners are listed (and a top ten for Best Film)");
    // The opening sentences first (the day the results came out), then the infobox's date (BIFA 2020's ceremony).
    const dates = leadDates(page.html);
    dates.winnersOn ??= infoboxDate(page.html) ?? undefined;
    return { rows, missing, ...dates, urls: [page.url], gaps, problems: local };
  };
}

/** The "Top Ten Films of the Year" table of AAFCA's main article: label year → winner and the nine others. */
export function readAafcaTopTen(html: string): Map<number, { winner: FilmLink; others: FilmLink[] }> {
  const $ = cheerio.load(html);
  const out = new Map<number, { winner: FilmLink; others: FilmLink[] }>();
  $("table.wikitable").each((_, table) => {
    const heads = $(table).find("th").toArray().map((th) => clean($(th).text()));
    if (!heads.includes("Winner") || !heads.some((h) => /Top Films/.test(h))) return;
    $(table)
      .find("tr")
      .each((_, tr) => {
        const tds = $(tr).children("td");
        const year = Number(clean(tds.eq(0).text()));
        if (!year || tds.length < 3) return;
        const winner = filmOf($, tds.eq(1).clone());
        const others = tds
          .eq(2)
          .find("li")
          .toArray()
          .flatMap((li) => {
            const own = $(li).clone();
            own.find("sup.reference, .reference").remove();
            const film = filmOf($, own);
            return film ? [film] : [];
          });
        if (winner) out.set(year, { winner, others });
      });
  });
  return out;
}

/** AAFCA: the main article's label year is the film year to 2019 and the ceremony year from 2022 (2020 and 2021 are missing). */
export const aafcaLabelYear = (filmYear: number) => (filmYear <= 2019 ? filmYear : filmYear + 1);

const AAFCA_PAGES: Group["read"] = pageRead("african-american-critics", {
  page: (y) => `African-American Film Critics Association Awards ${y}`,
  categories: [
    // AAFCA's Best World Cinema (2013, 2014) is its prize for films not in English.
    { slug: "international", label: /^best(foreign(language)?film|worldcinema)$/ },
    { slug: "documentary", label: CATEGORIES.documentary },
    { slug: "animated", label: /^bestanimat(ed|ion)(film|feature)?$/ },
  ],
  tables: true,
  winnersOnly: true,
});

async function readAafca(year: number, ctx: Ctx): Promise<Read | null> {
  const main = await ctx.page("African-American Film Critics Association");
  const top = readAafcaTopTen(main.html).get(aafcaLabelYear(year));
  const fromPage = year <= 2018 ? await AAFCA_PAGES(year, ctx) : null;
  if (!top && !fromPage) return null;
  const rows: Row[] = [];
  if (top) {
    rows.push({ category: "picture", link: top.winner, outcome: "won" });
    for (const link of top.others) rows.push({ category: "picture", link, outcome: "nominated" });
  }
  const gaps: string[] = [];
  const missing = fromPage?.missing ?? [];
  if (!fromPage) {
    gaps.push("only Best Picture and the top ten are listed, from the group's article (no page for this year)");
    missing.push("international", "documentary", "animated");
  } else rows.push(...fromPage.rows);
  if (!top) missing.push("picture");
  return {
    rows,
    missing,
    winnersOn: fromPage?.winnersOn,
    urls: [...(top ? [main.url] : []), ...(fromPage?.urls ?? [])],
    gaps,
    problems: fromPage?.problems.filter((p) => !/picture/.test(p)) ?? [],
  };
}

/** A year-by-category table (AWFJ): "Year | Category | Nominee", the winner marked "(WON)", ties marked twice. */
async function readAwfj(year: number, ctx: Ctx): Promise<Read | null> {
  const page = await ctx.page("Alliance of Women Film Journalists");
  const table = readWikitables(page.html).find((t) => /Best of/.test(t.section) && t.headers.includes("Nominee"));
  if (!table) throw new Error("AWFJ: the EDA Best of Awards table is gone from the page");
  const wanted: Array<Cat> = [
    { slug: "picture", label: /^bestfilm$/ },
    { slug: "international", label: /^best(nonenglishlanguage|international)film$/ },
    { slug: "documentary", label: /^bestdocumentary$/ },
    { slug: "animated", label: /^bestanimatedfilm$/ },
  ];
  const rows: Row[] = [];
  for (const row of table.rows) {
    if (Number(row[0].text) !== year) continue;
    const cat = wanted.find((c) => c.label.test(flat(row[1].text)));
    if (!cat) continue;
    const cell = row[2];
    // "Name – Director (WON)", "Name (WON/TIE)": the film is the italic name, or the text before the dash and the marks.
    const text = clean(cell.text.replace(/\s*\((WON|TIE)[^)]*\)/g, "").split(/\s[–-]\s/)[0]);
    rows.push({
      category: cat.slug,
      link: cell.film ?? { article: cell.links[0]?.article ?? null, text },
      outcome: /\(WON\b/.test(cell.text) ? "won" : "nominated",
    });
  }
  if (rows.length === 0) return null;
  const missing = wanted.map((c) => c.slug).filter((s) => !rows.some((r) => r.category === s));
  return {
    rows,
    missing,
    urls: [page.url],
    gaps: ["Wikipedia gives no announcement date"],
    problems: [],
  };
}

/** BOFCA's "Selected past winners" table: the Best Picture winner of each year (the year is the film year). */
async function readBofca(year: number, ctx: Ctx): Promise<Read | null> {
  const page = await ctx.page("Boston Online Film Critics Association");
  const table = readWikitables(page.html).find((t) => t.headers.includes("Best Picture"));
  if (!table) throw new Error("BOFCA: the Selected past winners table is gone from the page");
  const col = table.headers.indexOf("Best Picture");
  const row = table.rows.find((r) => Number(r[0].text) === year);
  if (!row) return null;
  const cell = row[col];
  return {
    rows: [{ category: "picture", link: cell.film ?? { article: null, text: cell.text }, outcome: "won" }],
    missing: ["international", "documentary", "animated"],
    urls: [page.url],
    gaps: ["Wikipedia lists only the Best Picture winner (full lists are on the group's own site, not loaded) and gives no announcement date"],
    problems: [],
  };
}

/** Georgia's "Top categories winners history" table: the Best Film winner of each year ("2012 - 2nd" is the film year, then the edition). */
async function readGeorgia(year: number, ctx: Ctx): Promise<Read | null> {
  const page = await ctx.page("Georgia Film Critics Association");
  const table = readWikitables(page.html).find((t) => t.headers.includes("Best Film") && t.headers.includes("Year"));
  if (!table) throw new Error("Georgia: the winners history table is gone from the page");
  const col = table.headers.indexOf("Best Film");
  const row = table.rows.find((r) => parseInt(r[0].text, 10) === year);
  if (!row) return null;
  const cell = row[col];
  return {
    rows: [{ category: "picture", link: cell.film ?? { article: null, text: cell.text }, outcome: "won" }],
    missing: ["international", "documentary", "animated"],
    urls: [page.url],
    gaps: ["Wikipedia lists only the Best Film winner (nominees and the other categories are on the group's own site, not loaded) and gives no announcement date"],
    problems: [],
  };
}

/** Kansas City's "Selected past winners" table: the Best Film winner of each year (a tie names two films). */
async function readKansasCity(year: number, ctx: Ctx): Promise<Read | null> {
  const page = await ctx.page("Kansas City Film Critics Circle");
  const table = readWikitables(page.html).find((t) => t.headers.includes("Best Film") && t.headers.includes("Year"));
  if (!table) throw new Error("Kansas City: the Selected past winners table is gone from the page");
  const col = table.headers.indexOf("Best Film");
  const row = table.rows.find((r) => parseInt(r[0].text, 10) === year);
  if (!row) return null;
  const cell = row[col];
  const films = cell.links.length > 0 ? cell.links : [{ article: null, text: cell.text }];
  return {
    rows: films.map((link) => ({ category: "picture", link, outcome: "won" as const })),
    missing: ["international", "documentary", "animated"],
    urls: [page.url],
    gaps: ["Wikipedia lists only the Best Film winner (the other categories are on the group's own site, not loaded) and gives no announcement date"],
    problems: [],
  };
}

/** London: the ceremony's day is in the floated results box at the top of each year's page. */
const LONDON_PAGES = pageRead("london-critics", {
  page: (y) => `London Film Critics Circle Awards ${y}`,
  categories: [
    { slug: "picture", label: /^filmoftheyear$/ },
    { slug: "international", label: /^foreignlanguagefilmoftheyear$/ },
    { slug: "documentary", label: /^documentaryoftheyear$/ },
  ],
  winnersOnly: false,
});

async function londonRead(year: number, ctx: Ctx): Promise<Read | null> {
  const read = await LONDON_PAGES(year, ctx);
  if (!read || read.winnersOn) return read;
  const page = await ctx.page(`London Film Critics Circle Awards ${year}`);
  const $ = cheerio.load(page.html);
  const box = clean($("div[style*='float']").first().text());
  const winnersOn = daysIn(box)[0];
  return winnersOn ? { ...read, winnersOn } : read;
}

/** Las Vegas' "Best Picture winners" table: the winner of each year (the year is the film year). */
async function readLasVegas(year: number, ctx: Ctx): Promise<Read | null> {
  const page = await ctx.page("Las Vegas Film Critics Society");
  const table = readWikitables(page.html).find((t) => t.headers.includes("Best Picture") && t.headers.includes("Year"));
  if (!table) throw new Error("Las Vegas: the Best Picture winners table is gone from the page");
  const col = table.headers.indexOf("Best Picture");
  const row = table.rows.find((r) => parseInt(r[0].text, 10) === year);
  if (!row) return null;
  const cell = row[col];
  return {
    rows: [{ category: "picture", link: cell.film ?? { article: null, text: cell.text }, outcome: "won" }],
    missing: ["international", "documentary", "animated"],
    urls: [page.url],
    gaps: ["Wikipedia lists only the Best Picture winner (the other categories are on the group's own site, not loaded) and gives no announcement date"],
    problems: [],
  };
}

/**
 * Cinema for Peace: one heading per ceremony year (Berlin, February: the year after the films), each
 * with a bullet per prize, "The Cinema for Peace Dove for The Most Valuable Film of the Year: A by X; B by Y".
 * Only the winners are listed from 2011 on; a prize shared by several films has them all as winners.
 */
async function readCinemaForPeace(year: number, ctx: Ctx): Promise<Read | null> {
  const page = await ctx.page("Cinema for Peace Awards");
  const $ = cheerio.load(page.html);
  const prizes: Array<{ slug: string; label: RegExp }> = [
    { slug: "most-valuable-film", label: /^The Cinema for Peace Dove for The Most Valuable Film of the Year:/ },
    { slug: "most-valuable-documentary", label: /^The Cinema for Peace Dove for The Most Valuable Documentary of the Year:/ },
  ];
  const heading = $("h3")
    .toArray()
    .find((h) => clean($(h).text()) === String(year + 1));
  if (!heading) return null;
  let node = $(heading).closest(".mw-heading").next();
  while (node.length > 0 && !node.is("ul, .mw-heading")) node = node.next();
  if (!node.is("ul")) return null;
  const rows: Row[] = [];
  const missing: string[] = [];
  for (const prize of prizes) {
    const li = node
      .children("li")
      .toArray()
      .find((l) => prize.label.test(clean($(l).text())));
    if (!li) {
      missing.push(prize.slug);
      continue;
    }
    const own = ownContent($, li);
    const anchors = own.find("a").toArray().map((a) => linkOf($, $(a) as cheerio.Cheerio<Element>));
    for (const segment of clean(own.text()).replace(prize.label, "").split(/;\s*/)) {
      const title = clean(segment.split(/\s+by\s+/)[0]);
      if (!title) continue;
      rows.push({ category: prize.slug, link: anchors.find((a) => flat(a.text) === flat(title)) ?? { article: null, text: title }, outcome: "won" });
    }
  }
  if (rows.length === 0) return null;
  return {
    rows,
    missing,
    urls: [page.url],
    gaps: ["Wikipedia lists only the winners of each prize and gives no ceremony date"],
    problems: [],
  };
}

/** Phoenix FCS's "Best Picture winners" table: the winner of each year (the year is the film year). */
async function readPhoenix(year: number, ctx: Ctx): Promise<Read | null> {
  const page = await ctx.page("Phoenix Film Critics Society");
  const table = readWikitables(page.html).find((t) => t.headers.includes("Best Picture") && t.headers.includes("Year"));
  if (!table) throw new Error("Phoenix: the Best Picture winners table is gone from the page");
  const col = table.headers.indexOf("Best Picture");
  const row = table.rows.find((r) => parseInt(r[0].text, 10) === year);
  if (!row) return null;
  const cell = row[col];
  return {
    rows: [{ category: "picture", link: cell.film ?? { article: null, text: cell.text }, outcome: "won" }],
    missing: ["international", "documentary", "animated"],
    urls: [page.url],
    gaps: ["Wikipedia lists only the Best Picture winner (the other categories are on the group's own site, not loaded) and gives no announcement date"],
    problems: [],
  };
}

/** The Peabody lists with a "Documentary" section (the 2014 honorees on), one page per decade. */
const PEABODY_LISTS = (heading: number) => `List of Peabody Award winners (${heading >= 2020 ? "2020–2029" : "2010–2019"})`;

/** The film links of the documentary honorees under one year's heading of a Peabody list: every wiki link of the "Area of excellence" cell. */
export function readPeabodyDocumentaries(html: string, heading: number): FilmLink[] {
  const $ = cheerio.load(html);
  const h2 = $("h2")
    .toArray()
    .find((h) => clean($(h).text()) === String(heading));
  if (!h2) return [];
  const links: FilmLink[] = [];
  for (let node = $(h2).closest(".mw-heading").next(); node.length > 0 && !node.is(".mw-heading2"); node = node.next()) {
    if (!node.is("table")) continue;
    let section = "";
    node.find("tr").each((_, tr) => {
      const cells = $(tr).children("td");
      if (cells.length === 0) {
        const th = $(tr).children("th");
        if (th.length === 1 && th.attr("colspan")) section = clean(th.text());
        return;
      }
      if (!/^documentar/i.test(section) || cells.length < 2) return;
      const own = cells.eq(1).clone();
      own.find("sup.reference, .reference").remove();
      own
        .find("a")
        .toArray()
        .forEach((a) => {
          const link = linkOf($, $(a) as cheerio.Cheerio<Element>);
          if (link.article && !links.some((l) => l.article === link.article)) links.push(link);
        });
    });
  }
  return links;
}

/**
 * The film year of a Peabody honouree: the year of its film record when it has one, else its first release on Wikidata,
 * else the year in its article's title; `sources.filmYears` settles the rest by hand.
 */
function filmYear(film: { page: string; wd: string; imdb?: string; entity: Entity }, sources: Sources, records: Map<number, MoviesFile>): number | undefined {
  const fixed = sources.filmYears[film.page];
  if (fixed) return fixed.year;
  for (const [year, file] of records) {
    if (Object.entries(file).some(([key, m]) => key === film.imdb || key === film.wd || m.wd === film.wd)) return year;
  }
  const released = releaseYears(film.entity);
  if (released.length > 0) return Math.min(...released);
  const titled = film.page.match(/\((\d{4}) (?:documentary )?film\)/);
  return titled ? Number(titled[1]) : undefined;
}

/**
 * Peabody's documentary honorees. Wikipedia files them under the year of the honours, which is not the film's year
 * (a 2020 film is under 2021): a film counts for the year it was first released, taken from the headings of that
 * year and the next. Only a link that leads to a film (not a series, an episode, a studio) counts.
 */
async function readPeabody(year: number, ctx: Ctx): Promise<Read | null> {
  const rows: Row[] = [];
  const urls: string[] = [];
  const local: string[] = [];
  const unplaced = new Set<string>();
  const records = readMoviesFiles(DATA_DIR);
  for (const heading of [year, year + 1]) {
    if (heading > 2025) continue;
    const page = await ctx.page(PEABODY_LISTS(heading));
    if (!urls.includes(page.url)) urls.push(page.url);
    const links = readPeabodyDocumentaries(page.html, heading);
    const resolved = await resolveArticles(ctx.fetcher, links.map((l) => l.article as string));
    for (const link of links) {
      const r = resolved.get(link.article as string);
      if (!r?.ok) continue;
      const types = entityIds(r.film.entity, "P31");
      if (!types.some((id) => FILM_TYPES.has(id))) continue;
      const first = filmYear(r.film, ctx.sources, records);
      if (first === undefined) {
        if (!unplaced.has(link.text)) local.push(`peabody ${year}: ${link.text} has no film year (no release date on Wikidata, no film record, none in its title), skipped`);
        unplaced.add(link.text);
        continue;
      }
      if (first === year) rows.push({ category: "documentary", link: { ...link, article: r.film.page }, outcome: "won" });
    }
  }
  if (rows.length === 0) return null;
  return {
    rows,
    missing: [],
    urls,
    gaps: ["only the documentary honorees that Wikipedia links to a film are loaded (series, episodes and films named without a link are not)"],
    problems: local,
  };
}

const ordinal = (n: number) => `${n}${[11, 12, 13].includes(n % 100) ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

const FILM_CATEGORIES = [
  { slug: "picture", label: /^best(film|picture)$/ },
  { slug: "international", label: CATEGORIES.international },
  { slug: "documentary", label: CATEGORIES.documentary },
  { slug: "animated", label: CATEGORIES.animated },
];

/**
 * New York Film Critics Online: a page of its own only for 2025 (nominee boxes, with the nominees and the day of both
 * announcements). The earlier years are in the group's main article, one heading per year: a "Top 10 Films" list
 * (alphabetical, all of them honoured: nominees for Best Picture) and a "Various Awards" bullet list of winners
 * ("Best Film: …"); 2024 has the bullets directly with "Runner-up" lines. No dates there.
 */
const NYFCO_PAGES = pageRead("new-york-online", {
  page: (y) => `${y} New York Film Critics Online Awards`,
  categories: [
    { slug: "picture", label: /^best(film|picture)$/ },
    { slug: "international", label: CATEGORIES.internationalFeature },
    { slug: "documentary", label: CATEGORIES.documentary },
    { slug: "animated", label: CATEGORIES.animated },
  ],
  winnersOnly: false,
});

const NYFCO_LINES: Array<{ slug: string; label: RegExp }> = [
  { slug: "picture", label: /^best(film|picture)$/ },
  { slug: "international", label: CATEGORIES.internationalFeature },
  { slug: "documentary", label: CATEGORIES.documentary },
  { slug: "animated", label: CATEGORIES.animated },
];

async function readNyfco(year: number, ctx: Ctx): Promise<Read | null> {
  const own = await NYFCO_PAGES(year, ctx);
  if (own) return own;
  const page = await ctx.page("New York Film Critics Online");
  const $ = cheerio.load(page.html);
  const heading = $("h2")
    .toArray()
    .find((h) => clean($(h).text()) === String(year));
  if (!heading) return null;
  const rows: Row[] = [];
  const local: string[] = [];
  let section = "";
  for (let node = $(heading).closest(".mw-heading").next(); node.length > 0 && !node.is(".mw-heading2"); node = node.next()) {
    if (node.is(".mw-heading3")) section = clean(node.text());
    if (!node.is("ul")) continue;
    for (const li of node.children("li").toArray()) {
      const content = ownContent($, li);
      if (/^top\b/i.test(section)) {
        const film = filmOf($, content);
        if (film) rows.push({ category: "picture", link: film, outcome: "nominated" });
        else local.push(`new-york-online ${year}: a line of "${section}" names no film ("${clean(content.text())}")`);
        continue;
      }
      const text = clean(content.text());
      const cat = NYFCO_LINES.find((c) => c.label.test(flat(text.split(":")[0])));
      if (!cat) continue;
      const film = filmOf($, content);
      if (!film) {
        local.push(`new-york-online ${year}: ${cat.slug} names no film ("${text}")`);
        continue;
      }
      rows.push({ category: cat.slug, link: film, outcome: "won" });
      for (const r of $(li).children("ul").children("li").toArray()) {
        const runner = filmOf($, ownContent($, r));
        if (runner && /^runner/i.test(clean(ownContent($, r).text()))) rows.push({ category: cat.slug, link: runner, outcome: "runner_up" });
      }
    }
  }
  if (rows.length === 0) return null;
  // A year whose list gives no Best Picture winner (2018) still has its top list; the gap is said instead of "not found".
  const noPictureWinner = rows.some((r) => r.category === "picture") && !rows.some((r) => r.category === "picture" && r.outcome === "won");
  const missing = NYFCO_LINES.map((c) => c.slug).filter((s) => !rows.some((r) => r.category === s && r.outcome === "won") && !(s === "picture" && noPictureWinner));
  const runnerUps = rows.some((r) => r.outcome === "runner_up");
  return {
    rows,
    missing,
    urls: [page.url],
    gaps: [
      runnerUps ? "only the winners, their runners-up and (Best Picture) a top list are listed" : "only the winners (and a top list for Best Picture) are listed",
      ...(noPictureWinner ? ["the page names no Best Picture winner for this year"] : []),
    ],
    problems: local,
  };
}

/** A group with no Wikipedia page of its awards and no other source found: every year is `no_data`. */
function noPage(slug: string, name: string, full: string): Group {
  return {
    slug,
    name,
    years: [2100, 2100],
    why: `Wikipedia has no page for ${full}'s awards and no other source was found for them`,
    winnersOnly: false,
    read: async () => null,
  };
}

export const GROUPS: Group[] = [
  {
    slug: "african-american-critics",
    name: "AAFCA",
    years: [2012, 2024],
    why: "Wikipedia's AAFCA article lists no winners for the 2020 films and the 2025 awards are not on it yet",
    winnersOnly: true,
    read: readAafca,
  },
  {
    slug: "women-film-journalists",
    name: "AWFJ",
    years: [2012, 2025],
    why: "the Alliance of Women Film Journalists' awards for these films are not on Wikipedia",
    winnersOnly: false,
    read: readAwfj,
  },
  {
    slug: "atlanta-critics",
    name: "Atlanta",
    years: [2100, 2100],
    why: "Wikipedia has no page for the Atlanta Film Critics Circle's awards and no other source was found for them",
    winnersOnly: false,
    read: async () => null,
  },
  {
    slug: "austin-critics",
    name: "Austin",
    years: [2012, 2025],
    why: "the Austin Film Critics Association's awards for these films are not on Wikipedia",
    winnersOnly: false,
    read: pageRead("austin-critics", {
      page: (y) => `Austin Film Critics Association Awards ${y}`,
      categories: [
        { slug: "picture", label: /^bestfilm$/ },
        { slug: "international", label: CATEGORIES.international },
        { slug: "documentary", label: CATEGORIES.documentary },
        { slug: "animated", label: CATEGORIES.animated },
      ],
      topTen: /^top(10|ten)films$/,
      nomineesFrom: 2015,
      winnersOnly: false,
    }),
  },
  {
    slug: "black-critics",
    name: "Black FCC",
    years: [2100, 2100],
    why: "Wikipedia has no page for the Black Film Critics Circle's awards and no other source was found for them",
    winnersOnly: false,
    read: async () => null,
  },
  {
    slug: "boston-online",
    name: "Boston Online",
    years: [2012, 2025],
    why: "the Boston Online Film Critics Association's winners for these films are not on Wikipedia",
    winnersOnly: true,
    read: readBofca,
  },
  {
    slug: "boston-society",
    name: "Boston Society",
    years: [2012, 2025],
    why: "the Boston Society of Film Critics' awards for these films are not on Wikipedia",
    winnersOnly: true,
    read: pageRead("boston-society", {
      page: (y) => `Boston Society of Film Critics Awards ${y}`,
      categories: [
        { slug: "picture", label: /^best(film|picture)$/ },
        { slug: "international", label: CATEGORIES.international },
        { slug: "documentary", label: CATEGORIES.documentary },
        { slug: "animated", label: CATEGORIES.animated },
      ],
      winnersOnly: true,
    }),
  },
  {
    slug: "british-independent",
    name: "BIFA",
    years: [2012, 2025],
    why: "the British Independent Film Awards for these films are not on Wikipedia",
    winnersOnly: false,
    read: pageRead("british-independent", {
      page: (y) => `British Independent Film Awards ${y}`,
      categories: [
        { slug: "picture", label: /^bestbritishindependentfilm$/ },
        { slug: "international", label: /^best(foreign|international)independentfilm$/ },
        { slug: "documentary", label: CATEGORIES.documentary },
      ],
      winnersOnly: false,
    }),
  },
  {
    slug: "central-florida-critics",
    name: "Central Florida",
    years: [2100, 2100],
    why: "Wikipedia has no page for the Central Florida Film Critics Society's awards and no other source was found for them",
    winnersOnly: false,
    read: async () => null,
  },
  {
    slug: "chicago-critics",
    name: "Chicago FCA",
    years: [2012, 2025],
    why: "the Chicago Film Critics Association's awards for these films are not on Wikipedia",
    winnersOnly: false,
    read: pageRead("chicago-critics", { page: (y) => `Chicago Film Critics Association Awards ${y}`, categories: FILM_CATEGORIES, winnersOnly: false }),
  },
  {
    slug: "chicago-indie-critics",
    name: "Chicago Indie Critics",
    years: [2100, 2100],
    why: "Wikipedia has no page for the Chicago Indie Critics' awards and no other source was found for them",
    winnersOnly: false,
    read: async () => null,
  },
  {
    slug: "cinema-for-peace",
    name: "Cinema for Peace",
    years: [2012, 2024],
    why: "the Cinema for Peace Awards for these films are not on Wikipedia (its list stops at the 2025 gala, for 2024 films)",
    winnersOnly: false,
    read: readCinemaForPeace,
  },
  {
    slug: "columbus-critics",
    name: "Columbus",
    years: [2100, 2100],
    why: "Wikipedia has no page for the Columbus Film Critics Association's awards and no other source was found for them",
    winnersOnly: false,
    read: async () => null,
  },
  {
    slug: "critics-choice",
    name: "Critics Choice",
    years: [2012, 2025],
    why: "the Critics' Choice Awards for these films are not on Wikipedia",
    winnersOnly: false,
    read: pageRead("critics-choice", { page: (y) => `${ordinal(y - 1994)} Critics' Choice Awards`, categories: FILM_CATEGORIES, winnersOnly: false }),
  },
  {
    slug: "critics-choice-documentary",
    name: "Critics Choice Documentary",
    years: [2016, 2026],
    why: "the first Critics' Choice Documentary Awards were in November 2016, so there are none for earlier films",
    winnersOnly: false,
    read: pageRead("critics-choice-documentary", {
      page: (y) => `${ordinal(y - 2015)} Critics' Choice Documentary Awards`,
      categories: [
        { slug: "feature", label: /^bestdocumentaryfeature$/ },
        // 2016–2018 call it "Best Direction for a Documentary Feature".
        { slug: "director", label: /^best(director|directionforadocumentaryfeature)$/ },
        { slug: "political", label: /^bestpoliticaldocumentary$/ },
      ],
      winnersOnly: false,
    }),
  },
  {
    slug: "dallas-fort-worth-critics",
    name: "Dallas-Fort Worth",
    years: [2012, 2025],
    why: "the Dallas–Fort Worth Film Critics Association's awards for these films are not on Wikipedia",
    winnersOnly: false,
    read: pageRead("dallas-fort-worth-critics", {
      page: (y) => `Dallas–Fort Worth Film Critics Association Awards ${y}`,
      categories: FILM_CATEGORIES,
      winnersOnly: false,
    }),
  },
  {
    slug: "florida-critics",
    name: "Florida",
    years: [2013, 2025],
    why: "the Florida Film Critics Circle's awards for these films are not on Wikipedia (it has a page for each year from 2013)",
    winnersOnly: false,
    read: pageRead("florida-critics", { page: (y) => `Florida Film Critics Circle Awards ${y}`, categories: FILM_CATEGORIES, winnersOnly: false }),
  },
  {
    slug: "georgia-critics",
    name: "Georgia",
    years: [2012, 2025],
    why: "the Georgia Film Critics Association's awards for these films are not on Wikipedia",
    winnersOnly: false,
    read: readGeorgia,
  },
  {
    slug: "gotham",
    name: "Gotham",
    years: [2012, 2025],
    why: "the Gotham Awards for these films are not on Wikipedia",
    winnersOnly: false,
    read: pageRead("gotham", {
      page: (y) => `Gotham Independent Film Awards ${y}`,
      categories: [
        { slug: "picture", label: /^bestfeature$/ },
        { slug: "international", label: CATEGORIES.internationalFeature },
        { slug: "documentary", label: CATEGORIES.documentary },
      ],
      winnersOnly: false,
    }),
  },
  noPage("greater-western-new-york-critics", "Greater Western New York", "the Greater Western New York Film Critics Association"),
  noPage("hawaii-critics", "Hawaii", "the Hawaii Film Critics Society"),
  {
    slug: "hollywood-critics",
    name: "Astra (Hollywood Critics Association)",
    years: [2019, 2025],
    why: "Wikipedia has a page for the Hollywood Critics Association's (now Astra) film awards only from the 3rd, for the 2019 films",
    winnersOnly: false,
    read: pageRead("hollywood-critics", {
      // The 3rd to 6th were the Hollywood Critics Association Film Awards, the 7th on the Astra Film Awards.
      page: (y) => (y <= 2022 ? `${ordinal(y - 2016)} Hollywood Critics Association Film Awards` : `${ordinal(y - 2016)} Astra Film Awards`),
      categories: [
        { slug: "picture", label: /^bestpicture(drama|comedyormusical)?$/, multi: true },
        { slug: "international", label: CATEGORIES.internationalFeature },
        { slug: "documentary", label: CATEGORIES.documentary },
        { slug: "animated", label: CATEGORIES.animated },
      ],
      winnersOnly: false,
    }),
  },
  {
    slug: "houston-critics",
    name: "Houston",
    years: [2012, 2025],
    why: "the Houston Film Critics Society's awards for these films are not on Wikipedia",
    winnersOnly: false,
    read: pageRead("houston-critics", {
      page: (y) => `Houston Film Critics Society Awards ${y}`,
      categories: [
        ...FILM_CATEGORIES.filter((c) => c.slug !== "international" && c.slug !== "animated"),
        { slug: "international", label: CATEGORIES.internationalFeature },
        // 2020's page says "Best Animated Feature Film".
        { slug: "animated", label: /^bestanimat(ed|ion)(feature)?(film)?$/ },
      ],
      winnersOnly: false,
    }),
  },
  noPage("indiana-critics", "Indiana", "the Indiana Film Journalists Association"),
  {
    slug: "international-cinephile-society",
    name: "International Cinephile Society",
    years: [2100, 2100],
    why: "Wikipedia gives the International Cinephile Society's results only for its first years (the 2000s films) and no other source was found for these films",
    winnersOnly: false,
    read: async () => null,
  },
  {
    slug: "ida",
    name: "IDA",
    years: [2100, 2100],
    why: "Wikipedia names only a few of the International Documentary Association's Best Feature winners in a sentence, with no full list of winners and nominees",
    winnersOnly: false,
    read: async () => null,
  },
  noPage("iowa-critics", "Iowa", "the Iowa Film Critics Association"),
  {
    slug: "kansas-city-critics",
    name: "Kansas City",
    years: [2012, 2025],
    why: "the Kansas City Film Critics Circle's awards for these films are not on Wikipedia",
    winnersOnly: true,
    read: readKansasCity,
  },
  {
    slug: "las-vegas-critics",
    name: "Las Vegas",
    years: [2012, 2025],
    why: "the Las Vegas Film Critics Society's awards for these films are not on Wikipedia",
    winnersOnly: true,
    read: readLasVegas,
  },
  noPage("latino-entertainment-journalists", "Latino Entertainment", "the Latino Entertainment Journalists Association"),
  {
    slug: "london-critics",
    name: "London",
    years: [2012, 2025],
    why: "the London Film Critics' Circle's awards for these films are not on Wikipedia",
    winnersOnly: false,
    read: londonRead,
  },
  {
    slug: "los-angeles-critics",
    name: "Los Angeles",
    years: [2012, 2025],
    why: "the Los Angeles Film Critics Association's awards for these films are not on Wikipedia",
    winnersOnly: false,
    nomineesSameDay: true,
    read: pageRead("los-angeles-critics", {
      page: (y) => `${y} Los Angeles Film Critics Association Awards`,
      categories: [
        // A tie is in the label ("Best Picture (TIE)").
        { slug: "picture", label: /^best(film|picture)(tie)?$/ },
        { slug: "international", label: /^best(film(notintheenglishlanguage)|(foreign|nonenglish|international)(language)?film)(tie)?$/ },
        { slug: "documentary", label: /^bestdocumentary(nonfiction)?(film)?(tie)?$/ },
        { slug: "animated", label: /^bestanimat(ed|ion)(film|feature)?(tie)?$/ },
      ],
      winnersOnly: false,
    }),
  },
  noPage("michigan-critics", "Michigan", "the Michigan Movie Critics Guild"),
  noPage("minnesota-critics", "Minnesota", "the Minnesota Film Critics Alliance"),
  noPage("music-city-critics", "Music City", "the Music City Film Critics' Association"),
  {
    slug: "national-society",
    name: "NSFC",
    years: [2012, 2025],
    why: "the National Society of Film Critics' awards for these films are not on Wikipedia",
    winnersOnly: false,
    nomineesSameDay: true,
    read: pageRead("national-society", {
      page: (y) => `${y} National Society of Film Critics Awards`,
      categories: [
        { slug: "picture", label: /^best(picture|film)$/ },
        { slug: "international", label: /^best(film(notintheenglishlanguage)|(foreign|nonenglish|international)(language)?film)$/ },
        { slug: "documentary", label: /^bestnon(fiction|-fiction)film$/ },
      ],
      winnersOnly: false,
    }),
  },
  {
    slug: "nbr",
    name: "NBR",
    years: [2012, 2025],
    why: "the National Board of Review's awards for these films are not on Wikipedia",
    winnersOnly: false,
    nomineesSameDay: true,
    read: pageRead("nbr", {
      page: (y) => `National Board of Review Awards ${y}`,
      categories: [
        { slug: "picture", label: /^bestfilm$/, tops: /^top(10|ten)films$/ },
        { slug: "international", label: /^best(foreign|international)(language)?film$/, tops: /^top(5|five)?(foreign|international)(language)?films$/ },
        { slug: "documentary", label: /^bestdocumentary(film)?$/, tops: /^top(5|five)?documentar(y|ies)(films)?$/ },
        { slug: "animated", label: /^bestanimat(ed|ion)(film|feature)?$/ },
      ],
      winnersOnly: false,
    }),
  },
  noPage("new-jersey-critics", "New Jersey", "the New Jersey Film Critics Circle"),
  {
    slug: "new-york-critics",
    name: "New York Circle",
    years: [2012, 2025],
    why: "the New York Film Critics Circle's awards for these films are not on Wikipedia",
    winnersOnly: true,
    read: pageRead("new-york-critics", {
      page: (y) => `${y} New York Film Critics Circle Awards`,
      categories: [
        { slug: "picture", label: /^best(film|picture)$/ },
        { slug: "international", label: CATEGORIES.international },
        { slug: "documentary", label: /^bestnon(fiction|-fiction)film$/ },
        { slug: "animated", label: CATEGORIES.animated },
      ],
      winnersOnly: true,
    }),
  },
  {
    slug: "new-york-online",
    name: "New York Online",
    years: [2012, 2025],
    why: "the New York Film Critics Online awards for these films are not on Wikipedia",
    winnersOnly: false,
    read: readNyfco,
  },
  noPage("north-carolina-critics", "North Carolina", "the North Carolina Film Critics Association"),
  noPage("north-dakota-critics", "North Dakota", "the North Dakota Film Society"),
  noPage("north-texas-critics", "North Texas", "the North Texas Film Critics Association"),
  noPage("oklahoma-critics", "Oklahoma", "the Oklahoma Film Critics Circle"),
  {
    slug: "online-critics",
    name: "Online FCS",
    years: [2012, 2025],
    why: "the Online Film Critics Society's awards for these films are not on Wikipedia",
    winnersOnly: false,
    read: pageRead("online-critics", {
      page: (y) => `Online Film Critics Society Awards ${y}`,
      categories: [
        { slug: "picture", label: /^best(film|picture)$/ },
        { slug: "international", label: /^best(filmnotintheenglishlanguage|(foreign|nonenglish|international)(language)?film)$/ },
        { slug: "documentary", label: CATEGORIES.documentary },
        { slug: "animated", label: CATEGORIES.animated },
      ],
      winnersOnly: false,
    }),
  },
  noPage("online-female-critics", "Online Female", "the Online Association of Female Film Critics"),
  noPage("online-ftv", "Online FTV", "the Online Film & Television Association"),
  {
    slug: "peabody",
    name: "Peabody",
    years: [2014, 2025],
    why: "Wikipedia's Peabody lists for 2012 and 2013 are one table of every area, with no documentary section, and the 2026 honours are not announced yet",
    winnersOnly: true,
    manyWinners: true,
    read: readPeabody,
  },
  noPage("philadelphia-critics", "Philadelphia", "the Philadelphia Film Critics Circle"),
  noPage("phoenix-critics-circle", "Phoenix CC", "the Phoenix Critics Circle"),
  {
    slug: "phoenix-critics-society",
    name: "Phoenix FCS",
    years: [2012, 2025],
    why: "the Phoenix Film Critics Society's awards for these films are not on Wikipedia",
    winnersOnly: false,
    read: readPhoenix,
  },
  noPage("pittsburgh-critics", "Pittsburgh", "the Pittsburgh Film Critics Association"),
  noPage("portland-critics", "Portland", "the Portland Critics Association"),
  noPage("puerto-rico-critics", "Puerto Rico", "the Puerto Rico Critics Association"),
  {
    slug: "san-diego-critics",
    name: "San Diego",
    years: [2012, 2025],
    why: "the San Diego Film Critics Society's awards for these films are not on Wikipedia",
    winnersOnly: false,
    read: pageRead("san-diego-critics", { page: (y) => `San Diego Film Critics Society Awards ${y}`, categories: FILM_CATEGORIES, winnersOnly: false }),
  },
];

function parseList(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

function parseYears(argv: string[]): number[] {
  const spec = parseList(argv, "--years") ?? "2012-2026";
  const m = spec.match(/^(\d{4})(?:-(\d{4}))?$/);
  if (!m) throw new Error(`--years takes 2012-2026 or 2024, not "${spec}"`);
  const [from, to] = [Number(m[1]), Number(m[2] ?? m[1])];
  return Array.from({ length: to - from + 1 }, (_, k) => from + k);
}

export const loose = (t: string) => t.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

function fixLink(link: FilmLink, sources: Sources): FilmLink {
  const fix = sources.linkFixes[link.article ?? link.text];
  if (!fix) return link;
  return { text: link.text, article: fix.article ?? link.article, ...(fix.wd ? { wd: fix.wd } : {}) };
}

async function main() {
  const argv = process.argv.slice(2);
  checkArgs(argv, { flags: ["--refresh", "--offline"], values: ["--years", "--award"] });
  const years = parseYears(argv);
  const wanted = parseList(argv, "--award")?.split(",");
  const groups = GROUPS.filter((g) => !wanted || wanted.includes(g.slug));
  if (wanted) for (const w of wanted) if (!GROUPS.some((g) => g.slug === w)) throw new Error(`No group "${w}" here (${GROUPS.map((g) => g.slug).join(", ")}).`);
  const sources = sourcesSchema.parse(JSON.parse(readFileSync(SOURCES, "utf8")));
  const fetcher = createFetcher({ cacheDir: ".cache/wiki", refresh: argv.includes("--refresh"), offline: argv.includes("--offline") });
  const token = readEnvFile(".env.test").TMDB_READ_TOKEN;
  const tmdb = token ? { fetcher: createFetcher({ cacheDir: ".cache/tmdb", offline: argv.includes("--offline") }), token } : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const problems: string[] = [];
  const titles: string[] = [];
  const pages = new Map<string, { html: string; url: string }>();
  const ctx: Ctx = {
    fetcher,
    page: async (title) => {
      if (!pages.has(title)) {
        const p = await fetchPage(fetcher, title);
        pages.set(title, { html: p.html, url: p.url });
      }
      return pages.get(title)!;
    },
    sources,
    problems,
  };

  for (const group of groups) {
    for (const year of years) {
      const label = `${group.slug} ${year}`;
      const inYears = year >= group.years[0] && year <= group.years[1];
      const read = inYears ? await group.read(year, ctx) : null;
      if (!read) {
        const edition: EditionFile = {
          award: group.slug,
          year,
          status: "no_data",
          sourceUrls: [],
          note:
            year >= 2026
              ? `The ${group.name} awards for ${year} films have not been announced yet (due late ${year} or early ${year + 1}).`
              : `${group.name} has no data for ${year} films: ${group.why}.`,
          results: [],
          screenings: [],
        };
        writeEdition(DATA_DIR, edition);
        console.log(`${label}: no_data`);
        continue;
      }

      const dateKey = `${group.slug}/${year}`;
      const manual = sources.dates[dateKey];
      let winnersOn = manual?.winnersOn ?? read.winnersOn;
      let nominationsOn = manual?.nominationsOn ?? read.nominationsOn;
      const local = [...read.problems];
      const gaps = [...read.gaps];
      if (winnersOn && nominationsOn && nominationsOn > winnersOn) local.push(`${label}: nominations ${nominationsOn} are after the winners ${winnersOn}`);
      const hasNominees = read.rows.some((r) => r.outcome === "nominated");
      if (!winnersOn) gaps.push("the announcement date is not stated");
      else if (!group.winnersOnly && (hasNominees || group.nomineesSameDay) && !nominationsOn) nominationsOn = winnersOn;
      const standIn = !group.winnersOnly && !group.nomineesSameDay && hasNominees && winnersOn && !read.nominationsOn && !manual?.nominationsOn;
      if (winnersOn && winnersOn > today) {
        local.push(`${label}: the winners' day ${winnersOn} is still ahead`);
        gaps.push(`the winners are announced on ${winnersOn}`);
        winnersOn = undefined;
      }

      const links = read.rows.map((r) => ({ ...r, link: fixLink(r.link, sources) }));
      const leftOut = (e: { link: FilmLink }) => sources.leaveOut[`${group.slug} ${year} ${e.link.text}`];
      const leftNames = new Set<string>();
      const kept = links.filter((e) => {
        const out = leftOut(e);
        if (out) {
          problems.push(`${label}: left out ${e.link.text} (${out.why})`);
          leftNames.add(e.link.text);
        }
        return !out;
      });
      if (leftNames.size > 0) gaps.push(`${[...leftNames].map((n) => `"${n}"`).join(", ")} ${leftNames.size > 1 ? "are" : "is"} left out (no film record could be matched)`);

      // A film the page names without a working link: the Wikipedia article "<title> (<year> film)" and the like,
      // taken only when its Wikidata item is a film released within a year of this one.
      const unlinked = [...new Set(kept.filter((e) => !e.link.article && !e.link.wd && !sources.tmdbSearch[`${group.slug} ${year} ${e.link.text}`]).map((e) => e.link.text))];
      const guessed = new Map<string, string>();
      if (unlinked.length > 0) {
        const candidates = unlinked.flatMap((text) => guessTitles(text, year));
        const resolved = await resolveArticles(fetcher, candidates);
        for (const text of unlinked) {
          for (const title of guessTitles(text, year)) {
            const r = resolved.get(title);
            if (r?.ok && isFilm(r.film.entity) && releaseYears(r.film.entity).some((y) => Math.abs(y - year) <= 1)) {
              guessed.set(text, r.film.page);
              break;
            }
          }
        }
      }
      for (const e of kept) {
        const g = !e.link.article && !e.link.wd ? guessed.get(e.link.text) : undefined;
        if (g) e.link = { ...e.link, article: g };
      }

      const films = await researchFilms(fetcher, kept.map((e) => e.link), tmdb);
      const viaTmdb = new Map<string, ResearchedFilm>();
      for (const e of kept) {
        const search = sources.tmdbSearch[`${group.slug} ${year} ${e.link.text}`];
        const known = researched(films, e.link);
        if (!search || (known.ok && known.imdb) || viaTmdb.has(e.link.text)) continue;
        const hit = tmdb ? await findOnTmdb(tmdb, { title: e.link.text, year, country: search.country, directors: search.directors }) : null;
        if (hit?.ok) viaTmdb.set(e.link.text, { ok: true, link: e.link, imdb: hit.imdb, facts: hit.facts });
        else problems.push(`${label}: ${e.link.text} wasn't found on TMDB (${hit ? hit.reason : "no TMDB token"})`);
      }
      const filmOfLink = (link: FilmLink): ResearchedFilm => viaTmdb.get(link.text) ?? researched(films, link);
      for (const f of [...films.values(), ...viaTmdb.values()]) {
        const title = f.ok && f.imdb ? sources.titles[f.imdb] : undefined;
        if (f.ok && title) f.facts.title = title;
      }

      // One row per film per category: its furthest stage.
      const rank = { nominated: 1, runner_up: 1, won: 2 } as Record<string, number>;
      const rows = new Map<string, ResultEntry>();
      for (const e of kept) {
        const film = filmOfLink(e.link);
        const id = `${e.category}\u0000${film.ok ? movieKey(film) : `title:${e.link.text}`}`;
        const before = rows.get(id);
        if (!before || rank[e.outcome] > rank[before.outcome]) rows.set(id, { category: e.category, ...filmRef(film), outcome: e.outcome });
      }
      const cats = [...new Set(kept.map((e) => e.category))];
      for (const category of cats) {
        const inCategory = [...rows.values()].filter((r) => r.category === category);
        const winners = inCategory.filter((r) => r.outcome === "won").length;
        if (winners !== 1 && !group.manyWinners) problems.push(`${label}: ${category} has ${winners} winners (a tie, if the page says so)`);
      }
      // A film TMDB replaced (Wikidata's item had no IMDb ID: a manga, a book) is not added from Wikidata too.
      const wikidataFilms = [...films].filter(([, f]) => !viaTmdb.has(f.link.text));
      const movies = addMovies(DATA_DIR, year, newFilms(new Map([...wikidataFilms, ...[...viaTmdb].map(([k, v]): [string, ResearchedFilm] => [`tmdb:${k}`, v])])));
      for (const f of [...wikidataFilms.map(([, f]) => f), ...viaTmdb.values()]) {
        if (f.ok && !f.imdb) problems.push(`${label}: check ${f.link.text} → ${f.wd} has no IMDb ID`);
        const isNew = f.ok && movies.added.includes(movieKey(f));
        if (isNew && f.ok && loose(f.facts.title) !== loose(f.link.text) && loose(f.facts.title) !== loose(plainTitle(f.link.article ?? ""))) {
          titles.push(`${label}: ${f.imdb ?? f.wd} is titled "${f.facts.title}", the page says "${f.link.text}"`);
        }
      }
      for (const [text, page] of guessed) problems.push(`${label}: no link for "${text}"; used the article "${page}" (a film released within a year)`);
      for (const line of unresolvedReport(new Map([...films].filter(([, f]) => !viaTmdb.has(f.link.text))))) problems.push(`${label}: unresolved ${line}`);
      problems.push(...local);

      const missing = read.missing;
      const complete = missing.length === 0 && gaps.length === 0 && Boolean(winnersOn) && (group.winnersOnly || Boolean(nominationsOn));
      const noteParts: string[] = [];
      if (missing.length > 0) noteParts.push(`Not found on the source: ${missing.join(", ")}.`);
      if (gaps.length > 0) noteParts.push(`${gaps[0][0].toUpperCase()}${gaps[0].slice(1)}${gaps.length > 1 ? `; ${gaps.slice(1).join("; ")}` : ""}.`);
      const absent = Object.keys(sources.absent)
        .filter((k) => k.startsWith(`${dateKey}/`))
        .map((k) => sources.absent[k]);
      if (absent.length > 0) noteParts.push(absent.join(" "));
      if (standIn) noteParts.push("The day the nominees were announced is not stated; the awards day stands in for it.");
      else if (!group.winnersOnly && !group.nomineesSameDay && !hasNominees && !nominationsOn && winnersOn && gaps.length === 0) noteParts.push("Only the winners and runners-up are listed, and the day the nominees were announced is not stated.");
      const edition: EditionFile = {
        award: group.slug,
        year,
        status: complete ? "loaded" : "partial",
        ...(nominationsOn && !group.winnersOnly ? { nominationsOn } : {}),
        ...(winnersOn ? { winnersOn } : {}),
        sourceUrls: read.urls,
        ...(noteParts.length > 0 ? { note: noteParts.join(" ") } : {}),
        results: [...rows.values()],
        screenings: [],
      };
      writeEdition(DATA_DIR, edition);
      const counts = cats.map((c) => `${c} ${[...rows.values()].filter((r) => r.category === c).length}`).join(", ");
      console.log(`${label}: ${edition.status}; ${counts}; ${movies.added.length} new films`);
    }
  }

  if (problems.length > 0) {
    console.log(`\n${problems.length} to look at:`);
    for (const p of problems) console.log(`- ${p}`);
  }
  if (titles.length > 0) {
    console.log(`\n${titles.length} new films whose title differs from the page (Wikidata's title is kept; fix by hand if wrong):`);
    for (const t of titles) console.log(`- ${t}`);
  }
  console.log(`${fetcher.requests} Wikipedia/Wikidata requests.`);
}

// Tests import the helpers; running the file does the research.
if (process.argv[1] && /critics\.ts$/.test(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
