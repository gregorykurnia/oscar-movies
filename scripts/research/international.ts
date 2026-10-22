// `npx tsx scripts/research/international.ts [--years 2012-2026] [--refresh] [--offline]`
// (IMPLEMENTATION_PLAN.md §3.4, task 1.4): every submission for Best International Feature
// Film (Best Foreign Language Film before the 92nd Academy Awards) in each film year, into the
// International rows of `data/editions/oscars/<year>.json`, and the facts of each new film into
// `data/movies/<year>.json`. The other Oscar categories are task 1.3's (`oscars.ts`): rerun
// `oscars.ts --offline` afterwards, so an edition with all four categories becomes `loaded`.
// - Source: "List of submissions to the Nth Academy Awards for Best … Film", one row per
//   submitting country. Its Result column gives the furthest stage: Won / Nominated / Made
//   shortlist / Not nominated (screened, so `eligible`) / Withdrawn, Disqualified, Not on the
//   final list or TBD (never screened, so `submitted`). Every row is kept, so the count of
//   results is the count of rows and the count the page's own text states.
// - Cross-check: the nominees and winner on the "Nth Academy Awards" page.
// - Films the list doesn't link, or links to an article with no Wikidata item, are looked up
//   by a Wikidata search (`lib/wikidata-search.ts`); what it can't settle is reported, and
//   `scripts/research/sources/international.json` holds the hand fixes and left-out films.
// Prints what it couldn't resolve and every disagreement between the sources; it never
// invents a result.
import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import { z } from "zod";
import type { EditionFile, ResultEntry } from "../../src/lib/data-files";
import { checkArgs, readEnvFile } from "../lib/target";
import { countryCode } from "./lib/countries";
import { plainTitle } from "./lib/facts";
import { createFetcher } from "./lib/fetcher";
import { filmRef, newFilms, researched, researchFilms, type ResearchedFilm } from "./lib/films";
import { column, nomineeList, readNomineeLists, readWikitables, type FilmLink, type Table } from "./lib/tables";
import { findOnTmdb } from "./lib/tmdb-search";
import { findFilm, labelsOf, releaseYears, splitNames } from "./lib/wikidata-search";
import { entityIds, getClaimString, getEntities, P } from "./lib/wikidata";
import { fetchPage } from "./lib/wikipedia";
import { addMovies, movieKey, readEdition, writeEdition } from "./lib/writer";

const DATA_DIR = "data";
const SOURCES = "scripts/research/sources/international.json";
const NOMINEES = /^Best (International Feature|Foreign Language) Film/i;

const sourcesSchema = z
  .object({
    /** By "<year> <submitting country>": a film the list links wrongly or not at all. */
    linkFixes: z.record(
      z.string().regex(/^\d{4} .+/),
      // `article: null` drops the list's link and searches by title, year and director instead.
      z.object({ article: z.string().nullable().optional(), wd: z.string().regex(/^Q\d+$/).optional(), why: z.string() }).strict(),
    ),
    /** By "<year> <submitting country>": films with no IMDb ID and no Wikidata item (§11). */
    leaveOut: z.record(z.string().regex(/^\d{4} .+/), z.object({ why: z.string() }).strict()),
    /** English titles that read better than Wikidata's, by IMDb ID. */
    titles: z.record(z.string().regex(/^tt\d+$/), z.string().min(1)),
  })
  .strict();

type Outcome = ResultEntry["outcome"];

/** The furthest stage a list's Result column says. */
export function outcomeOf(result: string): Outcome {
  if (/^Won\b/i.test(result)) return "won";
  if (/^Nominated$/i.test(result)) return "nominated";
  if (/^Made shortlist$/i.test(result)) return "shortlisted";
  if (/^Not nominated$/i.test(result)) return "eligible";
  if (/^(Withdrawn|Disqualified|Not on the final list|TBD)$/i.test(result)) return "submitted";
  throw new Error(`Unknown result "${result}" on a submission list.`);
}

/** Films on the International shortlist (the nominees and the winner were on it too). */
export function shortlistSize(year: number): number {
  if (year <= 2018) return 9;
  return year === 2019 ? 10 : 15;
}

export const ceremony = (year: number) => {
  const n = year - 1927;
  const tens = n % 100;
  return `${n}${tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
};

/** The page's own count: "89 countries submitted films" (2026: "A record 101 countries submitted"). */
export function statedCount(html: string): number | null {
  const $ = cheerio.load(html);
  $("sup.reference, style").remove();
  const text = $("p").text().replace(/\s+/g, " ");
  const m = text.match(/\b(\d+) countries submitted films/);
  return m ? Number(m[1]) : null;
}

const listTitle = (year: number) =>
  `List of submissions to the ${ceremony(year)} Academy Awards for Best ${year >= 2019 ? "International Feature Film" : "Foreign Language Film"}`;

function parseYears(argv: string[]): number[] {
  const i = argv.indexOf("--years");
  const spec = i >= 0 ? argv[i + 1] : "2012-2026";
  const m = spec?.match(/^(\d{4})(?:-(\d{4}))?$/);
  if (!m) throw new Error(`--years takes 2012-2026 or 2024, not "${spec}"`);
  const [from, to] = [Number(m[1]), Number(m[2] ?? m[1])];
  return Array.from({ length: to - from + 1 }, (_, k) => from + k);
}

const loose = (t: string) => t.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

type Row = {
  key: string;
  country: string;
  code: string;
  title: string;
  originalTitle: string;
  directors: string;
  result: string;
  link: FilmLink;
};

function readRows(table: Table, year: number): Row[] {
  const [c, film, original, director, result] = [/^Submitting country/i, /^Film title/i, /^Original title/i, /^Director/i, /^Result/i].map((h) =>
    column(table, h),
  );
  return table.rows.map((r) => {
    const country = r[c].text;
    return {
      key: `${year} ${country}`,
      country,
      code: countryCode(country),
      title: r[film].text,
      originalTitle: r[original]?.text ?? "",
      directors: r[director]?.text ?? "",
      result: r[result].text,
      link: r[film].film ?? { article: null, text: r[film].text },
    };
  });
}

async function main() {
  const argv = process.argv.slice(2);
  checkArgs(argv, { flags: ["--refresh", "--offline"], values: ["--years"] });
  const years = parseYears(argv);
  const sources = sourcesSchema.parse(JSON.parse(readFileSync(SOURCES, "utf8")));
  const offline = argv.includes("--offline");
  const fetcher = createFetcher({ cacheDir: ".cache/wiki", refresh: argv.includes("--refresh"), offline });
  const token = readEnvFile(".env.test").TMDB_READ_TOKEN;
  const tmdb = token ? { fetcher: createFetcher({ cacheDir: ".cache/tmdb", offline }), token } : undefined;
  const countryCache = new Map<string, string | undefined>();
  const countryOf = async (qid: string) => {
    if (!countryCache.has(qid)) countryCache.set(qid, await getClaimString(fetcher, qid, P.iso3166alpha2));
    return countryCache.get(qid);
  };
  const usedFixes = new Set<string>();
  const problems: string[] = [];
  const titles: string[] = [];
  const found: string[] = [];

  for (const year of years) {
    const label = `${year} (${ceremony(year)})`;
    const old = readEdition(DATA_DIR, "oscars", year);
    if (!old) throw new Error(`data/editions/oscars/${year}.json doesn't exist: run oscars.ts (task 1.3) first.`);
    const page = await fetchPage(fetcher, listTitle(year));
    const table = readWikitables(page.html).find((t) => t.section === "Submissions");
    if (!table) throw new Error(`${label}: no "Submissions" table on ${page.url}.`);
    const rows = readRows(table, year);
    const stated = statedCount(page.html);
    if (stated !== rows.length) problems.push(`${label}: the page says ${stated} submissions, its table has ${rows.length} rows`);

    // Hand fixes, and films left out.
    const kept: Row[] = [];
    for (const row of rows) {
      const fix = sources.linkFixes[row.key];
      if (fix) {
        usedFixes.add(row.key);
        row.link = { text: row.link.text, article: fix.article !== undefined ? fix.article : fix.wd ? null : row.link.article, ...(fix.wd ? { wd: fix.wd } : {}) };
      }
      if (sources.leaveOut[row.key]) {
        usedFixes.add(row.key);
        problems.push(`${label}: left out ${row.title} (${row.country}): ${sources.leaveOut[row.key].why}`);
        continue;
      }
      kept.push(row);
    }

    // The ceremony page's nominees, as a check on the list's Result column.
    const ceremonyPage = await fetchPage(fetcher, `${ceremony(year)} Academy Awards`);
    const nominationsOut = old.nominationsOn !== undefined && old.nominationsOn <= new Date().toISOString().slice(0, 10);
    const pageNominees = nominationsOut ? nomineeList(readNomineeLists(ceremonyPage.html), NOMINEES).nominees : [];
    const pageLinks = pageNominees.map((n) => n.film ?? { article: null, text: n.line });

    let films = await researchFilms(fetcher, [...kept.map((r) => r.link), ...pageLinks], tmdb);
    // What the list's links didn't settle: search Wikidata by title, year, director and country.
    const searched: Row[] = [];
    const viaTmdb = new Map<string, ResearchedFilm>();
    for (const row of kept) {
      if (researched(films, row.link).ok) continue;
      const query = { title: row.title, originalTitle: row.originalTitle || undefined, year, country: row.code, directors: [row.directors] };
      const hit = await findFilm(fetcher, query, countryOf);
      if (hit.ok) {
        row.link = { article: null, text: row.link.text, wd: hit.id };
        searched.push(row);
        found.push(`${label}: ${row.title} (${row.country}) → ${hit.id} on Wikidata by ${hit.why}`);
        continue;
      }
      const onTmdb = tmdb ? await findOnTmdb(tmdb, query) : hit;
      if (onTmdb.ok && "imdb" in onTmdb) {
        viaTmdb.set(row.key, { ok: true, link: row.link, imdb: onTmdb.imdb, facts: onTmdb.facts });
        found.push(`${label}: ${row.title} (${row.country}) → ${onTmdb.imdb} on TMDB by ${onTmdb.why}`);
      } else {
        const reason = onTmdb.ok ? hit.reason : onTmdb.reason;
        problems.push(`${label}: unresolved ${row.title} / ${row.originalTitle} (${row.country}, ${row.directors}): ${hit.ok ? "" : hit.reason}; ${reason}`);
      }
    }
    const filmOf = (row: Row) => viaTmdb.get(row.key) ?? researched(films, row.link);
    films = new Map([...films, ...(await researchFilms(fetcher, searched.map((r) => r.link), tmdb))]);
    for (const f of [...films.values(), ...viaTmdb.values()]) {
      const title = f.ok && f.imdb ? sources.titles[f.imdb] : undefined;
      if (f.ok && title) f.facts.title = title;
    }

    // One row per film. A film the list names twice is a mistake to look at.
    const results = new Map<string, ResultEntry>();
    const keyOf = (link: FilmLink) => {
      const f = researched(films, link);
      return f.ok ? movieKey(f) : `title:${link.text}`;
    };
    const keyOfRow = (row: Row) => {
      const f = filmOf(row);
      return f.ok ? movieKey(f) : `title:${row.link.text}`;
    };
    const countryByKey = new Map<string, string>();
    for (const row of kept) {
      const film = filmOf(row);
      const k = keyOfRow(row);
      if (results.has(k)) problems.push(`${label}: ${row.title} (${row.country}) is on the list twice`);
      countryByKey.set(k, row.code);
      results.set(k, { category: "international", ...filmRef(film), outcome: outcomeOf(row.result), country: row.code });
    }

    // Cross-checks.
    const count = (...o: Outcome[]) => [...results.values()].filter((r) => o.includes(r.outcome)).length;
    if (stated !== null && kept.length + Object.keys(sources.leaveOut).filter((k) => k.startsWith(`${year} `)).length !== stated) {
      problems.push(`${label}: ${kept.length} kept rows don't add up to the page's ${stated}`);
    }
    if (old.winnersOn && old.winnersOn <= new Date().toISOString().slice(0, 10)) {
      if (count("won") !== 1) problems.push(`${label}: ${count("won")} winners on the list`);
    }
    if (nominationsOut) {
      if (count("nominated", "won") !== 5) problems.push(`${label}: ${count("nominated", "won")} nominees on the list, expected 5`);
      if (count("shortlisted", "nominated", "won") !== shortlistSize(year)) {
        problems.push(`${label}: ${count("shortlisted", "nominated", "won")} on the shortlist, expected ${shortlistSize(year)}`);
      }
      const onPage = new Map(pageNominees.map((n, i) => [keyOf(pageLinks[i]), n.winner]));
      for (const [k, r] of results) {
        const nominee = r.outcome === "nominated" || r.outcome === "won";
        if (nominee && !onPage.has(k)) problems.push(`${label}: ${r.title} is a nominee on the list, not on the ceremony page`);
        if (onPage.has(k) && !nominee) problems.push(`${label}: ${r.title} is a nominee on the ceremony page, not on the list`);
        if (nominee && onPage.has(k) && onPage.get(k) !== (r.outcome === "won")) problems.push(`${label}: ${r.title}: winner differs between the list and the ceremony page`);
      }
      for (const k of onPage.keys()) if (!results.has(k)) problems.push(`${label}: ceremony page nominee ${k} isn't on the list`);
    }
    const entities = await getEntities(fetcher, [...films.values()].flatMap((f) => (f.ok && f.wd ? [f.wd] : [])));
    const directorLabels = await labelsOf(fetcher, [...entities.values()].flatMap((e) => entityIds(e, "P57")));
    for (const row of kept) {
      const f = filmOf(row);
      if (!f.ok) continue;
      const entity = f.wd ? entities.get(f.wd) : undefined;
      // A link on the list can point at another film of the same name (2023's "Traces").
      const names = entity ? entityIds(entity, "P57").flatMap((id) => directorLabels.get(id) ?? []) : [];
      const words = (text: string) => text.split(/[\s,]+/).map(loose).filter((w) => w.length >= 3);
      const listed = new Set(splitNames(row.directors).flatMap(words));
      if (names.length > 0 && listed.size > 0 && !names.some((n) => words(n).some((w) => listed.has(w)))) {
        problems.push(`${label}: check ${row.title} (${row.country}) → ${f.wd}: Wikidata's directors (${names.join(", ")}) aren't the list's (${row.directors})`);
      }
      const years = entity ? releaseYears(entity) : [];
      if (years.length > 0 && !years.some((y) => y >= year - 2 && y <= year + 1)) {
        problems.push(`${label}: check ${row.title} (${row.country}) → ${f.wd}${f.imdb ? ` ${f.imdb}` : ""}: released ${years.join("/")}`);
      }
      if (!f.imdb) problems.push(`${label}: check ${row.title} (${row.country}) → ${f.wd} has no IMDb ID`);
      if (f.facts.countries.length > 0 && !f.facts.countries.includes(row.code)) {
        problems.push(`info ${label}: ${row.title} was submitted by ${row.code}, Wikidata's countries are ${f.facts.countries.join("/")}`);
      }
      if (loose(f.facts.title) !== loose(row.title) && loose(f.facts.title) !== loose(plainTitle(row.link.article ?? ""))) {
        titles.push(`${label}: ${f.imdb ?? f.wd} is titled "${f.facts.title}", the list says "${row.title}"`);
      }
    }

    // New films get the submitting country when no source names one.
    const newOnes = [...newFilms(films), ...newFilms(viaTmdb)].map((f) => {
      const country = countryByKey.get(movieKey(f));
      return country && f.facts.countries.length === 0 ? { ...f, facts: { ...f.facts, countries: [country] } } : f;
    });
    const movies = addMovies(DATA_DIR, year, newOnes);

    const listUrl = page.url;
    const edition: EditionFile = {
      ...old,
      sourceUrls: [...new Set([...old.sourceUrls, listUrl])],
      results: [...old.results.filter((r) => r.category !== "international"), ...results.values()],
    };
    writeEdition(DATA_DIR, edition);
    const byOutcome = [...results.values()].reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.outcome]: (acc[r.outcome] ?? 0) + 1 }), {});
    console.log(
      `${label}: ${kept.length} submissions (page: ${stated}); ${Object.entries(byOutcome).map(([k, n]) => `${k} ${n}`).join(", ")}; ${movies.added.length} new films`,
    );
  }

  for (const key of Object.keys({ ...sources.linkFixes, ...sources.leaveOut })) {
    if (!usedFixes.has(key) && years.includes(Number(key.slice(0, 4)))) problems.push(`${key} is in ${SOURCES} but matched no row`);
  }
  if (found.length > 0) {
    console.log(`\n${found.length} films found by a Wikidata search (check these):`);
    for (const f of found) console.log(`- ${f}`);
  }
  if (problems.length > 0) {
    console.log(`\n${problems.length} to look at:`);
    for (const p of problems) console.log(`- ${p}`);
  }
  if (titles.length > 0) {
    console.log(`\n${titles.length} titles that differ from the list (Wikidata's title is kept; fix by hand if wrong):`);
    for (const t of titles) console.log(`- ${t}`);
  }
  console.log(`${fetcher.requests} Wikipedia/Wikidata requests.`);
}

if (process.argv[1]?.endsWith("international.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
