// `npx tsx scripts/research/festivals.ts [--award cannes,venice] [--years 2012-2026] [--refresh] [--offline]`
// (IMPLEMENTATION_PLAN.md §3.4, task 2.4): the major prizes of Cannes, Venice, Berlin, Sundance and
// Toronto for each year, into `data/editions/<festival>/<year>.json`, and the facts of every new film
// into `data/movies/<year>.json`.
// - The year is the festival's own calendar year (Berlin and Sundance in the winter, Cannes in May,
//   Venice and Toronto in September), which is the film year of the Oscars that follow.
// - Cannes, Venice and Berlin: each prize's own Wikipedia article ("Palme d'Or"), one row per year,
//   a year with two rows is a tie (listed in `sources/festivals.json`). `festivals-check.ts` reads the
//   year pages' prize lines as the second source.
// - Sundance: the year page's prize lines, classified by label and heading (`lib/festival-pages.ts`);
//   what the year page lacks (2019's Audience Awards) comes from "List of Sundance Film Festival award
//   winners".
// - Toronto: the year page's "Awards" table, the People's Choice Award for a film, a documentary
//   and (from 2025) an international film. The winner is `won`; the first and second runners-up are
//   `runner_up` (the plan counts them as nominations). Documentary runners-up are listed for 2012–2019 only.
// - Dates: `winnersOn` is the day the prizes were given: the festival's last day (the infobox), less a day
//   for Berlin and Sundance, whose awards come the day before the closing day; `sources/festivals.json`
//   overrides it where the page says otherwise, and every date must be named on the page or in
//   `externalDates`. Toronto announces its runners-up with the winners, so `nominationsOn` is the same day;
//   the other four are `winners_only`.
// - A festival that wasn't held (Cannes 2020) is `no_data` with a note.
// Prints what it couldn't resolve and every disagreement between the sources; it never invents a result.
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { EditionFile, ResultEntry } from "../../src/lib/data-files";
import { checkArgs, readEnvFile } from "../lib/target";
import { plainTitle } from "./lib/facts";
import { createFetcher } from "./lib/fetcher";
import { addDays, festivalLastDay, readListArticle, readPrizeLines, readSundanceListYear, readTiffYear, sundanceCategory, SUNDANCE_CATEGORIES, type PrizeLine } from "./lib/festival-pages";
import { filmRef, newFilms, researched, researchFilms, unresolvedReport, type ResearchedFilm } from "./lib/films";
import type { FilmLink } from "./lib/tables";
import { findOnTmdb } from "./lib/tmdb-search";
import { fetchPage, pageUrl, type WikiPage } from "./lib/wikipedia";
import { addMovies, movieKey, readEdition, writeEdition } from "./lib/writer";
import { fixLink, loose, ordinal, pageMentions, sourcesSchema } from "./majors";

const DATA_DIR = "data";
export const SOURCES = "scripts/research/sources/festivals.json";

export const sourcesFestivalSchema = sourcesSchema.extend({
  /** "<festival>/<year>" → why no prizes were given. */
  notHeld: z.record(z.string(), z.string().min(1)),
  /** As the base schema's, plus the film's full title when the page shortens it ("This Is Home: A Refugee Story"). */
  tmdbSearch: z.record(
    z.string(),
    z.object({ directors: z.array(z.string()).min(1), country: z.string().regex(/^[A-Z]{2}$/), title: z.string().min(1).optional(), why: z.string() }).strict(),
  ),
});
export type FestivalSources = z.infer<typeof sourcesFestivalSchema>;

export type Festival = {
  slug: string;
  name: string;
  /** The year's Wikipedia page. */
  page: (year: number) => string;
  /** Days from the festival's last day to the day the prizes were given. */
  offset: number;
  /** Category slug → the prize's own article (Cannes, Venice, Berlin). */
  lists?: Record<string, string>;
};

export const FESTIVALS: Festival[] = [
  {
    slug: "cannes",
    name: "Cannes",
    page: (y) => `${y} Cannes Film Festival`,
    offset: 0,
    lists: { "palme-dor": "Palme d'Or", "grand-prix": "Grand Prix (Cannes Film Festival)", "jury-prize": "Jury Prize (Cannes Film Festival)" },
  },
  {
    slug: "venice",
    name: "Venice",
    page: (y) => `${ordinal(y - 1943)} Venice International Film Festival`,
    offset: 0,
    lists: { "golden-lion": "Golden Lion", "grand-jury": "Grand Jury Prize (Venice Film Festival)" },
  },
  {
    slug: "berlin",
    name: "Berlin",
    page: (y) => `${y} Berlin International Film Festival`,
    offset: -1,
    lists: { "golden-bear": "Golden Bear", "grand-jury": "Silver Bear Grand Jury Prize" },
  },
  { slug: "sundance", name: "Sundance", page: (y) => `${y} Sundance Film Festival`, offset: -1 },
  { slug: "tiff", name: "Toronto", page: (y) => `${y} Toronto International Film Festival`, offset: 0 },
];

/** The label a year page gives each prize the list articles cover (the second source for them). */
export const PAGE_LABELS: Record<string, Record<string, RegExp>> = {
  cannes: { "palme-dor": /^Palme d'Or$/, "grand-prix": /^Grand Prix$/, "jury-prize": /^Jury Prize$/ },
  venice: { "golden-lion": /^Golden Lion$/, "grand-jury": /^Grand Jury Prize$/ },
  berlin: { "golden-bear": /^Golden Bear$/, "grand-jury": /^Silver Bear Grand Jury Prize$/ },
};

export const SUNDANCE_LIST = "List of Sundance Film Festival award winners";
/** The International People's Choice Award begins in 2025. */
export const TIFF_INTERNATIONAL_FROM = 2025;

function parseYears(argv: string[]): number[] {
  const i = argv.indexOf("--years");
  const spec = i >= 0 ? argv[i + 1] : "2012-2026";
  const m = spec.match(/^(\d{4})(?:-(\d{4}))?$/);
  if (!m) throw new Error(`--years takes 2012-2026 or 2024, not "${spec}"`);
  const [from, to] = [Number(m[1]), Number(m[2] ?? m[1])];
  return Array.from({ length: to - from + 1 }, (_, k) => from + k);
}

type Entry = { category: string; link: FilmLink; outcome: ResultEntry["outcome"] };

/** The winners a prize's own article gives, by year, with the prize's name for the problem report. */
async function listWinners(fetcher: ReturnType<typeof createFetcher>, titles: Record<string, string>) {
  const out = new Map<string, ReturnType<typeof readListArticle>>();
  for (const [category, title] of Object.entries(titles)) out.set(category, readListArticle((await fetchPage(fetcher, title)).html));
  return out;
}

/** Sundance's winners of a year: the year page's lines, then the list article for what it lacks. */
export function sundanceWinners(pageLines: PrizeLine[], listLines: PrizeLine[]) {
  const byCategory = new Map<string, { film: FilmLink; source: "page" | "list" }[]>();
  for (const [lines, source] of [[pageLines, "page"], [listLines, "list"]] as const) {
    const found = new Map<string, FilmLink[]>();
    for (const l of lines) {
      const category = sundanceCategory(l.heading, l.label);
      if (category && l.film) found.set(category, [...(found.get(category) ?? []), l.film]);
    }
    for (const [category, films] of found) if (!byCategory.has(category)) byCategory.set(category, films.map((film) => ({ film, source })));
  }
  return byCategory;
}

async function main() {
  const argv = process.argv.slice(2);
  checkArgs(argv, { flags: ["--refresh", "--offline"], values: ["--years", "--award"] });
  const years = parseYears(argv);
  const wantedIndex = argv.indexOf("--award");
  const wanted = wantedIndex >= 0 ? argv[wantedIndex + 1].split(",") : undefined;
  const specs = FESTIVALS.filter((f) => !wanted || wanted.includes(f.slug));
  if (wanted) for (const w of wanted) if (!FESTIVALS.some((f) => f.slug === w)) throw new Error(`No festival "${w}" here (${FESTIVALS.map((f) => f.slug).join(", ")}).`);
  const sources = sourcesFestivalSchema.parse(JSON.parse(readFileSync(SOURCES, "utf8")));
  const fetcher = createFetcher({ cacheDir: ".cache/wiki", refresh: argv.includes("--refresh"), offline: argv.includes("--offline") });
  const token = readEnvFile(".env.test").TMDB_READ_TOKEN;
  const tmdb = token ? { fetcher: createFetcher({ cacheDir: ".cache/tmdb", offline: argv.includes("--offline") }), token } : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const problems: string[] = [];
  const titles: string[] = [];
  const sundanceList = specs.some((s) => s.slug === "sundance") ? await fetchPage(fetcher, SUNDANCE_LIST) : undefined;

  for (const spec of specs) {
    const lists = spec.lists ? await listWinners(fetcher, spec.lists) : undefined;
    for (const year of years) {
      const label = `${spec.slug} ${year}`;
      const key = `${spec.slug}/${year}`;
      const local: string[] = [];
      const writeNoData = (note: string) => {
        const edition: EditionFile = { award: spec.slug, year, status: "no_data", sourceUrls: [], note, results: [], screenings: [] };
        writeEdition(DATA_DIR, edition);
        console.log(`${label}: no_data`);
      };
      if (sources.notHeld[key]) {
        writeNoData(sources.notHeld[key]);
        continue;
      }
      let page: WikiPage;
      try {
        page = await fetchPage(fetcher, spec.page(year));
      } catch (error) {
        if (!/doesn't exist/.test(String(error))) throw error;
        if (year <= new Date().getFullYear() - 1) problems.push(`${label}: no Wikipedia page, written as no_data`);
        writeNoData(`The ${spec.name} festival of ${year} has not taken place yet.`);
        continue;
      }

      // The day the prizes were given.
      const lastDay = festivalLastDay(page.html);
      const winnersOn = sources.winnersOn[spec.slug]?.[String(year)] ?? (lastDay ? addDays(lastDay, spec.offset) : null);
      if (!winnersOn) local.push(`${label}: no festival date in the infobox and none in ${SOURCES}`);
      else if (!sources.externalDates[key] && !pageMentions(page.html, winnersOn)) local.push(`${label}: the page doesn't mention the prize day ${winnersOn} (last day ${lastDay})`);
      if (!winnersOn || winnersOn > today) {
        writeNoData(`The ${spec.name} festival of ${year} has not taken place yet.`);
        continue;
      }

      // The winners (and Toronto's runners-up), by category.
      const entries: Entry[] = [];
      const found = new Set<string>();
      if (lists) {
        for (const [category, list] of lists) {
          const winners = list.winners.get(year) ?? [];
          if (winners.length === 0) local.push(`${label}: ${category} has no row for ${year} in ${spec.lists![category]}`);
          else found.add(category);
          for (const w of winners) entries.push({ category, link: fixLink(w.film, sources), outcome: "won" });
        }
      } else if (spec.slug === "sundance") {
        const byCategory = sundanceWinners(readPrizeLines(page.html), sundanceList ? readSundanceListYear(sundanceList.html, year) : []);
        for (const category of SUNDANCE_CATEGORIES) {
          const winners = byCategory.get(category) ?? [];
          if (winners.length === 0) local.push(`${label}: no ${category} winner on the page or in ${SUNDANCE_LIST}`);
          else found.add(category);
          for (const w of winners) entries.push({ category, link: fixLink(w.film, sources), outcome: "won" });
        }
      } else {
        const prizes = readTiffYear(page.html);
        for (const category of ["peoples-choice", "peoples-choice-documentary", ...(year >= TIFF_INTERNATIONAL_FROM ? ["peoples-choice-international"] : [])]) {
          const mine = prizes.filter((p) => p.category === category);
          if (!mine.some((p) => p.outcome === "won")) local.push(`${label}: no ${category} winner in the Awards table`);
          else found.add(category);
          if (category === "peoples-choice" && mine.filter((p) => p.outcome === "runner_up").length !== 2) local.push(`${label}: ${category} has ${mine.filter((p) => p.outcome === "runner_up").length} runners-up, expected 2`);
          for (const p of mine) entries.push({ category, link: fixLink(p.film, sources), outcome: p.outcome });
        }
        if (year < TIFF_INTERNATIONAL_FROM && prizes.some((p) => p.category === "peoples-choice-international")) local.push(`${label}: an international prize before ${TIFF_INTERNATIONAL_FROM}`);
      }
      problems.push(...local);

      const leftOut = (e: Entry) => sources.leaveOut[`${spec.slug} ${year} ${e.link.text}`];
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
        // Also a link that leads to a page with no IMDb ID (a book, a person), when the sources name the film by director.
        if (!search || (known.ok && known.imdb) || viaTmdb.has(e.link.text)) continue;
        const hit = tmdb ? await findOnTmdb(tmdb, { title: search.title ?? e.link.text, year, country: search.country, directors: search.directors }) : null;
        if (hit?.ok) viaTmdb.set(e.link.text, { ok: true, link: e.link, imdb: hit.imdb, facts: hit.facts });
        else problems.push(`${label}: ${e.link.text} wasn't found on TMDB (${hit ? hit.reason : "no TMDB token"})`);
      }
      const filmOf = (link: FilmLink): ResearchedFilm => viaTmdb.get(link.text) ?? researched(films, link);
      for (const f of [...films.values(), ...viaTmdb.values()]) {
        const title = f.ok && f.imdb ? sources.titles[f.imdb] : undefined;
        if (f.ok && title) f.facts.title = title;
      }

      // One row per film per category: its furthest stage.
      const rank = { nominated: 1, runner_up: 2, won: 3 } as Record<string, number>;
      const rows = new Map<string, ResultEntry>();
      for (const e of kept) {
        const film = filmOf(e.link);
        const id = `${e.category}\u0000${film.ok ? movieKey(film) : `title:${e.link.text}`}`;
        const before = rows.get(id);
        if (!before || rank[e.outcome] > rank[before.outcome]) rows.set(id, { category: e.category, ...filmRef(film), outcome: e.outcome });
      }

      // One winner a category, or the tie the sources list.
      for (const category of found) {
        const winners = [...rows.values()].filter((r) => r.category === category && r.outcome === "won").length;
        const expected = sources.ties[`${spec.slug}/${year}/${category}`] ?? 1;
        if (winners !== expected) problems.push(`${label}: ${category} has ${winners} winners, expected ${expected}`);
      }
      const viaWikipedia = new Map([...films].filter(([, f]) => !viaTmdb.has(f.link.text)));
      const movies = addMovies(DATA_DIR, year, newFilms(new Map([...viaWikipedia, ...[...viaTmdb].map(([k, v]): [string, ResearchedFilm] => [`tmdb:${k}`, v])])));
      for (const f of [...viaWikipedia.values(), ...viaTmdb.values()]) {
        if (f.ok && !f.imdb) problems.push(`${label}: check ${f.link.text} → ${f.wd} has no IMDb ID`);
        // Only for films new to the data: the ones already filed keep their (hand-fixed) title.
        const isNew = f.ok && movies.added.includes(movieKey(f));
        if (isNew && f.ok && loose(f.facts.title) !== loose(f.link.text) && loose(f.facts.title) !== loose(plainTitle(f.link.article ?? ""))) {
          titles.push(`${label}: ${f.imdb ?? f.wd} is titled "${f.facts.title}", the page says "${f.link.text}"`);
        }
      }
      for (const line of unresolvedReport(viaWikipedia)) problems.push(`${label}: unresolved ${line}`);

      const edition: EditionFile = {
        award: spec.slug,
        year,
        status: local.length === 0 ? "loaded" : "partial",
        ...(spec.slug === "tiff" ? { nominationsOn: winnersOn } : {}),
        winnersOn,
        sourceUrls: [
          page.url,
          ...(spec.lists ? Object.values(spec.lists).map(pageUrl) : []),
          ...(spec.slug === "sundance" ? [pageUrl(SUNDANCE_LIST)] : []),
        ],
        ...(local.length > 0 ? { note: `Not found on the source pages: ${local.map((l) => l.replace(`${label}: `, "")).join("; ")}.` } : {}),
        results: [...rows.values()],
        // The lineup (`lineups.ts`) is written to the same file: a new run of the prizes leaves it alone.
        screenings: readEdition(DATA_DIR, spec.slug, year)?.screenings ?? [],
      };
      writeEdition(DATA_DIR, edition);
      const counts = [...found].map((category) => `${category} ${[...rows.values()].filter((r) => r.category === category).length}`).join(", ");
      console.log(`${label}: ${edition.status}; ${winnersOn}; ${counts}; ${movies.added.length} new films`);
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
if (process.argv[1] && /festivals\.ts$/.test(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
