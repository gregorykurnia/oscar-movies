// `npx tsx scripts/research/majors.ts [--award golden-globes,bafta] [--years 2012-2026] [--refresh] [--offline]`
// (IMPLEMENTATION_PLAN.md §3.4, tasks 2.2 and 2.3): the film results of Golden Globes, BAFTA, Actor
// Awards (SAG until 2024), PGA, DGA (2.2) and Annie, Cinema Eye, European Film Awards, Independent
// Spirit and Satellite (2.3; AFI Top 10 has its own script, `afi.ts`) for each film year, into
// `data/editions/<award>/<year>.json`, and the facts of every new film into
// `data/movies/<year>.json`.
// - Results: the ceremony's Wikipedia page ("70th Golden Globe Awards"). Pages come in three
//   layouts, all read by `lib/tables.ts`: the nominee boxes of the recent pages, the older
//   header-row tables, and the guilds' one-cell-per-category tables. A category is found by
//   its label (`AWARDS` below); a label found twice or not at all is reported, never guessed.
// - Winners are the bold lines; each category has exactly one unless `sources/majors.json`
//   lists a tie.
// - Dates: the ceremony is the page's infobox date (the last day, for a two-day ceremony);
//   the nominations date is hand-transcribed in `sources/majors.json` (the day the film
//   categories were announced) and checked against the page's text.
// - A year whose ceremony hasn't happened has no page: it is written as `no_data`.
// Prints what it couldn't resolve and every disagreement between the sources; it never
// invents a result.
import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import { z } from "zod";
import type { EditionFile, ResultEntry } from "../../src/lib/data-files";
import { checkArgs, readEnvFile } from "../lib/target";
import { plainTitle } from "./lib/facts";
import { createFetcher } from "./lib/fetcher";
import { filmRef, newFilms, researched, researchFilms, unresolvedReport, type ResearchedFilm } from "./lib/films";
import { readArticleYears, readHeadingWinner, readLabelledCells, readNomineeLists, type FilmLink, type Nominee, type NomineeList } from "./lib/tables";
import { findOnTmdb } from "./lib/tmdb-search";
import { fetchPage, pageUrl } from "./lib/wikipedia";
import { addMovies, movieKey, writeEdition } from "./lib/writer";

const DATA_DIR = "data";
export const SOURCES = "scripts/research/sources/majors.json";

const date = z.iso.date();
export const sourcesSchema = z
  .object({
    /** Award → film year → the day the film categories' nominations came out. */
    nominationsOn: z.record(z.string(), z.record(z.string().regex(/^\d{4}$/), date)),
    /** By the article the page links (or, unlinked, the text): a link the page gets wrong or leaves out. */
    linkFixes: z.record(z.string(), z.object({ article: z.string().optional(), wd: z.string().regex(/^Q\d+$/).optional(), why: z.string() }).strict()),
    /** A film with no Wikipedia article or Wikidata item, found on TMDB: by "<award> <year> <text on the page>". */
    tmdbSearch: z.record(
      z.string(),
      z.object({ directors: z.array(z.string()).min(1), country: z.string().regex(/^[A-Z]{2}$/), why: z.string() }).strict(),
    ),
    /** Films with no IMDb ID and no Wikidata item, left out (§11), by "<award> <year> <text on the page>". */
    leaveOut: z.record(z.string(), z.object({ why: z.string() }).strict()),
    /** English titles that read better than Wikidata's, by IMDb ID. */
    titles: z.record(z.string().regex(/^tt\d+$/), z.string().min(1)),
    /** "<award>/<year>/<category>" → how many winners a tie gave. */
    ties: z.record(z.string(), z.number().int().min(2)),
    /** Award → film year → the day the winners came out, when that is not the ceremony (the infobox date). */
    winnersOn: z.record(z.string(), z.record(z.string().regex(/^\d{4}$/), date)),
    /** "<award>/<year>/<category>" → the winner of a year Wikipedia's article leaves out, from a source it cites. */
    manualWinners: z.record(z.string(), z.object({ article: z.string(), text: z.string(), url: z.url(), why: z.string() }).strict()),
    /** "<award>/<year>" → where a `nominationsOn` came from when the Wikipedia page doesn't state it. */
    externalDates: z.record(z.string(), z.string().min(1)),
  })
  .strict();
export type Sources = z.infer<typeof sourcesSchema>;

/** The label with everything but letters and digits dropped, lower case: the dash and spacing vary by year. */
const flat = (label: string) => label.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

type Spec = {
  slug: string;
  /** The Wikipedia page of the ceremony that honours films of `year`. */
  page: (year: number) => string;
  ordinal: (year: number) => string;
  /** Category slug → the labels (flattened, anchored) it goes by on the pages. */
  categories: Record<string, RegExp>;
  /** Category slug → the film years (inclusive) it was given in; outside them it isn't looked for. */
  span?: Record<string, [number, number]>;
  /** Category slug → its own Wikipedia article, read instead of the ceremony page (one row per nominee, winner in bold). */
  articles?: Record<string, string>;
  /** Years up to this one have no ceremony page; the winner comes from the main article (`readMainArticleWinners`). */
  winnerOnlyUntil?: { year: number; article: string };
};

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

export const AWARDS: Spec[] = [
  {
    slug: "golden-globes",
    page: (y) => `${ordinal(y - 1942)} Golden Globe Awards`,
    ordinal: (y) => ordinal(y - 1942),
    categories: {
      drama: /^bestmotionpicturedrama$/,
      "musical-comedy": /^bestmotionpicturemusicalorcomedy$/,
      "non-english": /^(other)?(bestmotionpicturenonenglishlanguage|bestnonenglishlanguagefilm|bestforeignlanguagefilm|nonenglishlanguage)$/,
      animated: /^(other)?(bestanimatedfeature(film)?|bestmotionpictureanimated|animated)$/,
    },
  },
  {
    slug: "bafta",
    page: (y) => `${ordinal(y - 1946)} British Academy Film Awards`,
    ordinal: (y) => ordinal(y - 1946),
    categories: {
      film: /^bestfilm$/,
      "non-english": /^bestfilmnotintheenglishlanguage$/,
      documentary: /^bestdocumentary$/,
      animated: /^bestanimatedfilm$/,
    },
  },
  {
    slug: "actor-awards",
    // The Screen Actors Guild Awards until the 31st; renamed Actor Awards for the 32nd.
    page: (y) => (y >= 2025 ? `${ordinal(y - 1993)} Actor Awards` : `${ordinal(y - 1993)} Screen Actors Guild Awards`),
    ordinal: (y) => ordinal(y - 1993),
    categories: { cast: /^outstandingperformancebyacastinamotionpicture$/ },
  },
  {
    slug: "pga",
    page: (y) => `${ordinal(y - 1988)} Producers Guild of America Awards`,
    ordinal: (y) => ordinal(y - 1988),
    categories: {
      theatrical: /^darrylfzanuckawardforoutstandingproduceroftheatricalmotionpictures$/,
      documentary: /^outstandingproducerofdocumentarytheatricalmotionpictures$/,
      animated: /^outstandingproducerofanimatedtheatricalmotionpictures$/,
    },
  },
  {
    slug: "dga",
    page: (y) => `${ordinal(y - 1947)} Directors Guild of America Awards`,
    ordinal: (y) => ordinal(y - 1947),
    categories: { feature: /^featurefilm$/, documentary: /^(documentaryfilm|documentaries|documentary)$/ },
  },
  {
    slug: "annie",
    page: (y) => `${ordinal(y - 1972)} Annie Awards`,
    ordinal: (y) => ordinal(y - 1972),
    categories: { feature: /^best(animated)?feature$/, "indie-feature": /^best(animated)?featureindependent$/ },
    // The independent feature prize first appears for 2015 films.
    span: { "indie-feature": [2015, 2025] },
  },
  {
    slug: "cinema-eye",
    page: (y) => `${ordinal(y - 2006)} Cinema Eye Honors`,
    ordinal: (y) => ordinal(y - 2006),
    categories: { feature: /^outstandingnonfictionfeature$/ },
    // The pages for the 6th–14th honors don't exist; the main article names each winner.
    winnerOnlyUntil: { year: 2020, article: "Cinema Eye Honors" },
  },
  {
    slug: "european-film-awards",
    page: (y) => `${ordinal(y - 1987)} European Film Awards`,
    ordinal: (y) => ordinal(y - 1987),
    categories: { film: /^$/, documentary: /^$/, animated: /^$/ },
    // The animated prize begins with the 2009 awards, so every year here has all three.
    articles: {
      film: "European Film Award for Best Film",
      documentary: "European Film Award for Best Documentary",
      animated: "European Film Award for Best Animated Feature Film",
    },
  },
  {
    slug: "spirit-awards",
    page: (y) => `${ordinal(y - 1984)} Independent Spirit Awards`,
    ordinal: (y) => ordinal(y - 1984),
    categories: {
      feature: /^best(feature|film)$/,
      international: /^bestinternationalfilm$/,
      documentary: /^bestdocumentaryfeature$/,
    },
  },
  {
    slug: "satellite",
    page: (y) => `${ordinal(y - 1995)} Satellite Awards`,
    ordinal: (y) => ordinal(y - 1995),
    categories: {
      picture: /^bestfilm$/,
      drama: /^bestmotionpicturedrama$/,
      "comedy-musical": /^bestmotionpicturecomedy(or)?musical$/,
      international: /^best(foreignlanguagefilm|motionpictureinternational)$/,
      documentary: /^best(documentaryfilm|motionpicturedocumentary)$/,
      animated: /^best(animatedormixedmediafilm|motionpictureanimatedormixedmedia)$/,
    },
    // One Best Film until 2017; the Drama and Comedy or Musical prizes from 2018.
    span: { picture: [2012, 2017], drama: [2018, 2025], "comedy-musical": [2018, 2025] },
  },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** The ceremony's date from the infobox: "January 13, 2013", "10 February 2013", "10–11 April 2021" (the last day). */
export function infoboxDate(html: string): string | null {
  const $ = cheerio.load(html);
  $("sup.reference, style").remove();
  const row = $("table.infobox tr")
    .toArray()
    .find((tr) => /^Date/.test($(tr).children("th").text().trim()));
  if (!row) return null;
  const text = $(row).children("td").text().replace(/\s+/g, " ").trim();
  const isoText = text.match(/\((\d{4}-\d{2}-\d{2})\)/);
  if (isoText) return isoText[1];
  const month = `(${MONTHS.join("|")})`;
  const us = text.match(new RegExp(`${month} (\\d{1,2}), (\\d{4})`));
  if (us) return iso(Number(us[3]), MONTHS.indexOf(us[1]) + 1, Number(us[2]));
  const uk = text.match(new RegExp(`(\\d{1,2})(?:\\s*[–-]\\s*(\\d{1,2}))? ${month} (\\d{4})`));
  if (uk) return iso(Number(uk[4]), MONTHS.indexOf(uk[3]) + 1, Number(uk[2] ?? uk[1]));
  return null;
}

/** Whether the page's text names this day ("December 13, 2012", "13 December 2012", or "December 13" with no year). */
export function pageMentions(html: string, day: string): boolean {
  const [y, m, d] = day.split("-").map(Number);
  const text = cheerio.load(html).text().replace(/\s+/g, " ");
  const month = MONTHS[m - 1];
  return new RegExp(`\\b${month} ${d}\\b|\\b${d} ${month}\\b`).test(text) && text.includes(String(y));
}

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

export function fixLink(link: FilmLink, sources: Sources): FilmLink {
  const fix = sources.linkFixes[link.article ?? link.text];
  if (!fix) return link;
  return { text: link.text, article: fix.article ?? link.article, ...(fix.wd ? { wd: fix.wd } : {}) };
}

export const loose = (t: string) => t.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

async function main() {
  const argv = process.argv.slice(2);
  checkArgs(argv, { flags: ["--refresh", "--offline"], values: ["--years", "--award"] });
  const years = parseYears(argv);
  const wanted = parseList(argv, "--award")?.split(",");
  const specs = AWARDS.filter((a) => !wanted || wanted.includes(a.slug));
  if (wanted) for (const w of wanted) if (!AWARDS.some((a) => a.slug === w)) throw new Error(`No award "${w}" here (${AWARDS.map((a) => a.slug).join(", ")}).`);
  const sources = sourcesSchema.parse(JSON.parse(readFileSync(SOURCES, "utf8")));
  const fetcher = createFetcher({
    cacheDir: ".cache/wiki",
    refresh: argv.includes("--refresh"),
    offline: argv.includes("--offline"),
  });
  const token = readEnvFile(".env.test").TMDB_READ_TOKEN;
  const tmdb = token ? { fetcher: createFetcher({ cacheDir: ".cache/tmdb", offline: argv.includes("--offline") }), token } : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const problems: string[] = [];
  const titles: string[] = [];

  const articleCache = new Map<string, Map<number, Nominee[]>>();
  const articleYears = async (title: string) => {
    if (!articleCache.has(title)) articleCache.set(title, readArticleYears((await fetchPage(fetcher, title)).html));
    return articleCache.get(title)!;
  };

  for (const spec of specs) {
    for (const year of years) {
      const label = `${spec.slug} ${year} (${spec.ordinal(year)})`;
      // Problems found for this edition; dropped when it turns out to hold no results at all (a ceremony still to come).
      const local: string[] = [];
      const manualUrls: string[] = [];
      // Years with no ceremony page: only the winner, from the main article (the edition is `partial`).
      const winnerOnly = spec.winnerOnlyUntil !== undefined && year <= spec.winnerOnlyUntil.year;
      let page;
      try {
        page = await fetchPage(fetcher, winnerOnly ? spec.winnerOnlyUntil!.article : spec.page(year));
      } catch (error) {
        // A ceremony that hasn't happened has no page.
        if (!/doesn't exist/.test(String(error))) throw error;
        const edition: EditionFile = {
          award: spec.slug,
          year,
          ordinal: spec.ordinal(year),
          status: "no_data",
          sourceUrls: [],
          note: `The ceremony for ${year} films has not taken place yet (early ${year + 1}).`,
          results: [],
          screenings: [],
        };
        if (year <= new Date().getFullYear() - 1) problems.push(`${label}: no Wikipedia page, written as no_data`);
        writeEdition(DATA_DIR, edition);
        console.log(`${label}: no_data`);
        continue;
      }

      const ceremonyOn = winnerOnly ? null : infoboxDate(page.html);
      const winnersOn = winnerOnly ? null : (sources.winnersOn[spec.slug]?.[String(year)] ?? ceremonyOn);
      const nominationsOn = winnerOnly ? undefined : sources.nominationsOn[spec.slug]?.[String(year)];
      if (!winnerOnly) {
        if (!ceremonyOn) local.push(`${label}: no ceremony date in the infobox`);
        const earlyWinners = sources.winnersOn[spec.slug]?.[String(year)];
        if (earlyWinners && !pageMentions(page.html, earlyWinners)) local.push(`${label}: the page doesn't mention the winners date ${earlyWinners}`);
        if (!nominationsOn) local.push(`${label}: no nominations date in ${SOURCES}`);
        else if (!sources.externalDates[`${spec.slug}/${year}`] && !pageMentions(page.html, nominationsOn)) local.push(`${label}: the page doesn't mention the nominations date ${nominationsOn}`);
        if (winnersOn && nominationsOn && nominationsOn >= winnersOn) local.push(`${label}: nominations ${nominationsOn} are not before the winners ${winnersOn}`);
      }
      const done = winnerOnly || (winnersOn !== null && winnersOn <= today);

      const lists: NomineeList[] = winnerOnly ? [] : [...readNomineeLists(page.html), ...readLabelledCells(page.html)];
      const found: Array<{ category: string; list: NomineeList }> = [];
      const missing: string[] = [];
      for (const [category, pattern] of Object.entries(spec.categories)) {
        const span = spec.span?.[category];
        if (span && (year < span[0] || year > span[1])) continue;
        if (winnerOnly) {
          const heading = `Winners in ${year + 1}`;
          const manual = sources.manualWinners[`${spec.slug}/${year}/${category}`];
          const film = manual
            ? { article: manual.article, text: manual.text }
            : readHeadingWinner(page.html, heading, /^Outstanding (Achievement in )?Non-?[Ff]iction Feature/);
          if (manual) manualUrls.push(manual.url);
          if (film) found.push({ category, list: { category, nominees: [{ film, winner: true, line: film.text }] } });
          else {
            missing.push(category);
            local.push(`${label}: no ${category} winner under "${heading}" in ${spec.winnerOnlyUntil!.article}`);
          }
          continue;
        }
        const article = spec.articles?.[category];
        if (article) {
          const nominees = (await articleYears(article)).get(year) ?? [];
          if (nominees.length > 0) found.push({ category, list: { category, nominees } });
          else {
            missing.push(category);
            local.push(`${label}: ${category} has no rows for ${year} in ${article}`);
          }
          continue;
        }
        const hits = lists.filter((l) => pattern.test(flat(l.category)) && l.nominees.length > 0);
        if (hits.length === 1) found.push({ category, list: hits[0] });
        else {
          missing.push(category);
          local.push(`${label}: ${category} matches ${hits.length} lists${hits.length > 1 ? ` (${hits.map((h) => h.category).join(" | ")})` : ""}`);
        }
      }

      if (found.length === 0 && (winnerOnly || !done)) {
        const edition: EditionFile = {
          award: spec.slug,
          year,
          ordinal: spec.ordinal(year),
          status: "no_data",
          sourceUrls: [],
          note: winnerOnly
            ? `Wikipedia's Cinema Eye Honors article has no winners for the ${spec.ordinal(year)} honors (${year + 1}), and the ceremony has no page of its own.`
            : `The ceremony for ${year} films has not taken place yet (early ${year + 1}).`,
          results: [],
          screenings: [],
        };
        writeEdition(DATA_DIR, edition);
        console.log(`${label}: no_data (${winnerOnly ? "no winner listed" : "nothing on the page yet"})`);
        continue;
      }
      problems.push(...local);

      const entries = found.flatMap(({ category, list }) =>
        list.nominees.map((n) => ({
          category,
          link: fixLink(n.film ?? { article: null, text: n.line }, sources),
          outcome: (n.winner && done ? "won" : "nominated") as ResultEntry["outcome"],
        })),
      );
      const leftOut = (e: { link: FilmLink }) => sources.leaveOut[`${spec.slug} ${year} ${e.link.text}`];
      const kept = entries.filter((e) => {
        const out = leftOut(e);
        if (out) problems.push(`${label}: left out ${e.link.text} (${out.why})`);
        return !out;
      });

      const films = await researchFilms(fetcher, kept.map((e) => e.link), tmdb);
      // Films the pages don't lead anywhere, found on TMDB by director, country and title.
      const viaTmdb = new Map<string, ResearchedFilm>();
      for (const e of kept) {
        const search = sources.tmdbSearch[`${spec.slug} ${year} ${e.link.text}`];
        const known = researched(films, e.link);
        if (!search || known.ok || viaTmdb.has(e.link.text)) continue;
        const hit = tmdb ? await findOnTmdb(tmdb, { title: e.link.text, year, country: search.country, directors: search.directors }) : null;
        if (hit?.ok) viaTmdb.set(e.link.text, { ok: true, link: e.link, imdb: hit.imdb, facts: hit.facts });
        else problems.push(`${label}: ${e.link.text} wasn't found on TMDB (${hit ? hit.reason : "no TMDB token"})`);
      }
      const filmOf = (link: FilmLink): ResearchedFilm => viaTmdb.get(link.text) ?? researched(films, link);
      for (const f of [...films.values(), ...viaTmdb.values()]) {
        const title = f.ok && f.imdb ? sources.titles[f.imdb] : undefined;
        if (f.ok && title) f.facts.title = title;
      }

      // One row per film per category: its furthest stage.
      const rank = { nominated: 1, won: 2 } as Record<string, number>;
      const rows = new Map<string, ResultEntry>();
      for (const e of kept) {
        const film = filmOf(e.link);
        const id = `${e.category}\u0000${film.ok ? movieKey(film) : `title:${e.link.text}`}`;
        const before = rows.get(id);
        if (!before || rank[e.outcome] > rank[before.outcome]) rows.set(id, { category: e.category, ...filmRef(film), outcome: e.outcome });
      }

      // Each category has one winner (or the tie the sources list) once the ceremony is done.
      for (const { category } of found) {
        const inCategory = [...rows.values()].filter((r) => r.category === category);
        const winners = inCategory.filter((r) => r.outcome === "won").length;
        const expected = sources.ties[`${spec.slug}/${year}/${category}`] ?? 1;
        if (done && winners !== expected) problems.push(`${label}: ${category} has ${winners} winners, expected ${expected}`);
        if (!winnerOnly && inCategory.length < 3) problems.push(`${label}: ${category} has only ${inCategory.length} films`);
      }
      const movies = addMovies(DATA_DIR, year, newFilms(new Map([...films, ...[...viaTmdb].map(([k, v]): [string, ResearchedFilm] => [`tmdb:${k}`, v])])));
      for (const f of [...films.values(), ...viaTmdb.values()]) {
        if (f.ok && !f.imdb) problems.push(`${label}: check ${f.link.text} → ${f.wd} has no IMDb ID`);
        // Only for films new to the data: the ones already filed keep their (hand-fixed) title.
        const isNew = f.ok && movies.added.includes(movieKey(f));
        if (isNew && f.ok && loose(f.facts.title) !== loose(f.link.text) && loose(f.facts.title) !== loose(plainTitle(f.link.article ?? ""))) {
          titles.push(`${label}: ${f.imdb ?? f.wd} is titled "${f.facts.title}", the page says "${f.link.text}"`);
        }
      }
      for (const line of unresolvedReport(new Map([...films].filter(([, f]) => !viaTmdb.has(f.link.text))))) problems.push(`${label}: unresolved ${line}`);

      const complete = !winnerOnly && done && missing.length === 0 && Boolean(nominationsOn) && Boolean(winnersOn);
      const note = complete
        ? undefined
        : winnerOnly
          ? `Only the winner is listed on Wikipedia for this year (no page for the ${spec.ordinal(year)} ${spec.slug === "cinema-eye" ? "Cinema Eye Honors" : "ceremony"}); the nominees and dates are not loaded.`
          : missing.length > 0
            ? `Not found on the source page: ${missing.map((c) => c).join(", ")}.`
            : "The ceremony has not taken place yet.";
      const edition: EditionFile = {
        award: spec.slug,
        year,
        ordinal: spec.ordinal(year),
        status: complete ? "loaded" : "partial",
        ...(nominationsOn ? { nominationsOn } : {}),
        ...(winnersOn ? { winnersOn } : {}),
        sourceUrls: [page.url, ...(spec.articles ? Object.values(spec.articles).map(pageUrl) : []), ...manualUrls],
        ...(note ? { note } : {}),
        results: [...rows.values()],
        screenings: [],
      };
      writeEdition(DATA_DIR, edition);
      const counts = found
        .map(({ category }) => `${category} ${[...rows.values()].filter((r) => r.category === category).length}`)
        .join(", ");
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
if (process.argv[1] && /majors\.ts$/.test(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
