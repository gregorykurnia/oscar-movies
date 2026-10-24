// `npx tsx scripts/research/docnyc.ts [--years 2012-2026] [--dry-run] [--refresh] [--offline]`
// (task 6.4, docs/imdb-import.md §5): DOC NYC's Short List: Features (2012–2026) and Winner's Circle
// (2019–2026) from docnyc.net's WordPress API, each film matched on IMDb by title and director.
// Both lists are selections: every film is `nominated` and the edition year is the festival year.
// - A film IMDb can't match goes in `sources/docnyc.json` `ids` (matched by hand, with why) or
//   `leaveOut` (with why); the script lists every film that is neither and writes nothing for it.
// - `years` fixes a film the site tags with the wrong festival year (or none).
// - `--dry-run` researches and prints, writing nothing.
import { readFileSync } from "node:fs";
import { z } from "zod";
import { awardsFileSchema, type EditionFile, type ResultEntry } from "../../src/lib/data-files";
import { checkArgs, readEnvFile } from "../lib/target";
import { createFetcher, type Fetcher } from "./lib/fetcher";
import { researchImdbFilms, type ResearchedFilm } from "./lib/films";
import { chooseTitle, searchTitles, type ImdbCandidate } from "./lib/imdb";
import { addMovies, readEdition, readMoviesFiles, writeEdition } from "./lib/writer";

const DATA_DIR = "data";
export const SOURCES = "scripts/research/sources/docnyc.json";
const API = "https://www.docnyc.net/wp-json/wp/v2";
export const AWARD = "doc-nyc";

/** WordPress ids of DOC NYC's two sections, and the category each fills. */
export const SECTIONS = [
  { id: 642, category: "short-list", name: "Short List: Features", from: 2012 },
  { id: 1129, category: "winners-circle", name: "Winner's Circle", from: 2019 },
] as const;

/** `event-year` taxonomy ids → festival year (docs/imdb-import.md §5). */
export const EVENT_YEARS: Record<number, number> = {
  696: 2012, 701: 2013, 7: 2014, 706: 2015, 760: 2016, 788: 2017, 869: 2018, 1097: 2019, 1165: 2020, 1253: 2021, 1356: 2022, 1389: 2023, 1441: 2024, 1483: 2025, 1545: 2026,
};

const TT = /^tt\d{7,}$/;
export const sourcesSchema = z
  .object({
    /** Announcement day of each year's Short List, from the festival's posts; years not listed have no dated post. */
    announced: z.record(z.string().regex(/^\d{4}$/), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    /** Film page slug → the festival year its page tags wrongly (or not at all). */
    years: z.record(z.string().min(1), z.object({ year: z.number().int(), why: z.string().min(1) }).strict()),
    /** "<year> <film page slug>" → the IMDb title matched by hand, where title and director don't find it. */
    ids: z.record(z.string().regex(/^\d{4} [a-z0-9-]+$/), z.object({ imdb: z.string().regex(TT), why: z.string().min(1) }).strict()),
    /** "<year> <film page slug>" → why the film isn't in the edition. */
    leaveOut: z.record(z.string().regex(/^\d{4} [a-z0-9-]+$/), z.object({ why: z.string().min(1) }).strict()),
  })
  .strict();
export type Sources = z.infer<typeof sourcesSchema>;

export type WpFilm = { id: number; link: string; title: { rendered: string }; "festival-section": number[]; "event-year": number[] };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…" };

/** Text with HTML entities decoded (WordPress titles come as `HUMAN FLOW&#8217;S &amp; MORE`). */
export function decodeHtml(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** The page's slug: `https://www.docnyc.net/film/wild-inside/` → `wild-inside`. */
export const slugOf = (link: string) => link.replace(/\/+$/, "").split("/").pop() ?? link;

/** The names in a credit line: "A, B", "A & B" or "A and B". */
export function splitNames(line: string): string[] {
  return decodeHtml(line)
    .split(/\s*(?:,|&|\band\b|\/)\s*/i)
    .map((n) => n.trim())
    .filter(Boolean);
}

export type FilmPage = { directors: string[]; year?: number };

/** Directors and year from a film page's `<div class='content-item'><b>Director:</b> Name<br></div>` items. */
export function readFilmPage(html: string): FilmPage {
  const items = new Map<string, string>();
  for (const m of html.matchAll(/<div class=['"]content-item['"]>\s*<b>([^<:]+):<\/b>\s*([\s\S]*?)<br\s*\/?>\s*<\/div>/g)) {
    const label = m[1].trim().toLowerCase();
    if (!items.has(label)) items.set(label, m[2].replace(/<[^>]+>/g, " "));
  }
  const director = items.get("director") ?? items.get("directors") ?? items.get("director/producer") ?? "";
  const year = Number(items.get("year")?.match(/\b(19|20)\d{2}\b/)?.[0]);
  return { directors: splitNames(director), ...(Number.isFinite(year) ? { year } : {}) };
}

/**
 * The festival years a film is listed in: its `event-year` tags (2011 and any other year the
 * app doesn't cover are ignored), with `years` overriding a wrong or missing tag.
 */
export function festivalYears(film: Pick<WpFilm, "link" | "event-year">, fixes: Sources["years"]): number[] {
  const fix = fixes[slugOf(film.link)];
  if (fix) return [fix.year];
  return [...new Set(film["event-year"].flatMap((id) => (EVENT_YEARS[id] ? [EVENT_YEARS[id]] : [])))].sort();
}

/**
 * The search texts to try for a title in capitals: the whole title, what comes before a colon or
 * dash, then the whole title with the year (IMDb's search ranks a short or common title, such
 * as JANE, far down without it).
 */
export function searchTexts(title: string, year: number): string[] {
  const full = decodeHtml(title);
  const short = full.split(/\s*[:–—]\s+/)[0];
  return [...new Set([full, short, `${full} ${year}`].filter((t) => t.length > 1))];
}

export type Match = { ok: true; imdb: string } | { ok: false; reason: string };

/** A film's IMDb title: the hand-matched ID, else the search hit that shares a director within two years. */
export async function matchFilm(
  search: (text: string) => Promise<ImdbCandidate[]>,
  /** `year` is the festival year (the key of `ids`, like `leaveOut`); `filmYear` the page's "Year:", when it gives one. */
  film: { title: string; slug: string; year: number; filmYear?: number; directors: string[] },
  sources: Pick<Sources, "ids">,
): Promise<Match> {
  const hand = sources.ids[`${film.year} ${film.slug}`];
  if (hand) return { ok: true, imdb: hand.imdb };
  const filmYear = film.filmYear ?? film.year;
  let last = "no search text";
  for (const text of searchTexts(film.title, filmYear)) {
    const chosen = chooseTitle(await search(text), filmYear, film.directors);
    if (chosen.ok) return { ok: true, imdb: chosen.id };
    last = chosen.reason;
  }
  return { ok: false, reason: last };
}

export type EditionInput = {
  year: number;
  /** Per category, the matched films (IMDb ID and the title to show). */
  lists: Array<{ category: string; films: Array<{ imdb: string; title: string }> }>;
  announced?: string;
  leftOut: Array<{ title: string; reason: string }>;
  sourceUrls: string[];
};

/** The edition file for one festival year: every film `nominated`, in title order. */
export function buildEdition({ year, lists, announced, leftOut, sourceUrls }: EditionInput): EditionFile {
  const seen = new Set<string>();
  const results: ResultEntry[] = [];
  for (const list of lists) {
    const films = [...list.films].sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" }));
    for (const f of films) {
      const id = `${list.category} ${f.imdb}`;
      if (seen.has(id)) continue;
      seen.add(id);
      results.push({ category: list.category, imdb: f.imdb, title: f.title, outcome: "nominated" });
    }
  }
  const notes = [
    "DOC NYC's Short List and Winner's Circle are selections: every film is listed as nominated.",
    ...(announced ? [] : ["DOC NYC's site has no dated post announcing this year's Short List."]),
    ...(leftOut.length > 0 ? [`Left out: ${leftOut.map((f) => `"${f.title}" (${f.reason})`).join(", ")}.`] : []),
  ];
  return {
    award: AWARD,
    year,
    status: leftOut.length > 0 ? "partial" : "loaded",
    ...(announced ? { nominationsOn: announced } : {}),
    sourceUrls,
    note: notes.join(" "),
    results,
    screenings: [],
  };
}

async function listFilms(fetcher: Fetcher, section: number): Promise<WpFilm[]> {
  const out: WpFilm[] = [];
  for (let page = 1; ; page++) {
    const url = `${API}/film?festival-section=${section}&per_page=100&page=${page}&_fields=id,link,title,festival-section,event-year`;
    const films = await fetcher.getJson<WpFilm[]>(url, { label: `docnyc-films-${section}-p${page}` });
    out.push(...films);
    if (films.length < 100) return out;
  }
}

function parseYears(argv: string[]): number[] {
  const i = argv.indexOf("--years");
  const spec = i >= 0 ? argv[i + 1] : "2012-2026";
  const m = spec.match(/^(\d{4})(?:-(\d{4}))?$/);
  if (!m) throw new Error(`--years takes 2012-2026 or 2024, not "${spec}"`);
  const [from, to] = [Number(m[1]), Number(m[2] ?? m[1])];
  return Array.from({ length: to - from + 1 }, (_, k) => from + k);
}

type Entry = { wp: WpFilm; section: (typeof SECTIONS)[number]; year: number; slug: string };

async function main() {
  const argv = process.argv.slice(2);
  checkArgs(argv, { flags: ["--dry-run", "--refresh", "--offline"], values: ["--years"] });
  const dryRun = argv.includes("--dry-run");
  const offline = argv.includes("--offline");
  const years = parseYears(argv);
  const sources = sourcesSchema.parse(JSON.parse(readFileSync(SOURCES, "utf8")));
  const registry = awardsFileSchema.parse(JSON.parse(readFileSync(`${DATA_DIR}/awards.json`, "utf8")));
  if (!registry.some((a) => a.slug === AWARD)) throw new Error(`No award "${AWARD}" in data/awards.json.`);

  const site = createFetcher({ cacheDir: ".cache/docnyc", refresh: argv.includes("--refresh"), offline });
  const imdb = createFetcher({ cacheDir: ".cache/imdb", offline, minIntervalMs: 400 });
  const wiki = createFetcher({ cacheDir: ".cache/wiki", offline });
  const token = offline ? undefined : readEnvFile(".env.test").TMDB_READ_TOKEN;
  const tmdb = token ? { fetcher: createFetcher({ cacheDir: ".cache/tmdb", offline }), token } : undefined;

  const entries: Entry[] = [];
  for (const section of SECTIONS) {
    for (const wp of await listFilms(site, section.id)) {
      for (const year of festivalYears(wp, sources.years)) {
        if (years.includes(year) && year >= section.from) entries.push({ wp, section, year, slug: slugOf(wp.link) });
      }
    }
  }

  const appYear = new Map<string, number>();
  const appTitle = new Map<string, string>();
  const refresh = () => {
    for (const [y, file] of readMoviesFiles(DATA_DIR)) for (const [key, m] of Object.entries(file)) {
      appYear.set(key, y);
      appTitle.set(key, m.title);
    }
  };
  refresh();

  const problems: string[] = [];
  const pages = new Map<string, FilmPage>();
  for (const e of entries) {
    if (!pages.has(e.wp.link)) pages.set(e.wp.link, readFilmPage(await site.getText(e.wp.link, { label: `docnyc-film-${e.slug}` })));
  }

  for (const year of years) {
    const here = entries.filter((e) => e.year === year);
    if (here.length === 0) continue;
    const leftOut: Array<{ title: string; reason: string }> = [];
    const matched: Array<Entry & { imdb: string; name: string }> = [];
    for (const e of here) {
      const name = decodeHtml(e.wp.title.rendered);
      const out = sources.leaveOut[`${year} ${e.slug}`];
      if (out) {
        leftOut.push({ title: name, reason: out.why });
        continue;
      }
      const page = pages.get(e.wp.link)!;
      const result = await matchFilm((text) => searchTitles(imdb, text), { title: name, slug: e.slug, year, filmYear: page.year, directors: page.directors }, sources);
      if (!result.ok) {
        problems.push(`${year} ${e.slug} (${name}; ${page.directors.join(", ") || "no director"}): ${result.reason}; add to ids or leaveOut`);
        // Never a full list with a film missing: the edition says so and stays partial.
        leftOut.push({ title: name, reason: "no IMDb match" });
        continue;
      }
      matched.push({ ...e, imdb: result.imdb, name });
    }

    // Facts for the films the app doesn't have yet.
    const unknown = new Map(matched.filter((m) => !appYear.has(m.imdb)).map((m) => [m.imdb, m.name]));
    let usable: ResearchedFilm[] = [];
    if (unknown.size > 0) {
      const films = await researchImdbFilms(wiki, unknown, tmdb);
      usable = [...films.values()].filter((f) => {
        if (!f.ok) {
          problems.push(`${year}: no film record for ${f.link.text} (${f.reason}); add to leaveOut`);
          return false;
        }
        if (f.short || f.series) {
          problems.push(`${year}: ${f.facts.title} (${f.imdb}) is ${f.short ? "a short" : "a series"} on Wikidata/TMDB; add to leaveOut`);
          return false;
        }
        return true;
      });
      const ok = new Set(usable.map((f) => (f.ok ? f.imdb : "")));
      for (const m of matched) if (unknown.has(m.imdb) && !ok.has(m.imdb)) leftOut.push({ title: m.name, reason: "no film record could be matched" });
      if (!dryRun) {
        const added = addMovies(DATA_DIR, year, usable.flatMap((f) => (f.ok ? [{ imdb: f.imdb, wd: f.wd, facts: f.facts }] : [])));
        if (added.added.length > 0) console.log(`${year}: ${added.added.length} new films`);
        refresh();
      }
    }
    const titleIn = (id: string, fallback: string) => appTitle.get(id) ?? (usable.find((f) => f.ok && f.imdb === id) as { facts?: { title: string } } | undefined)?.facts?.title ?? fallback;
    const removed = new Set(leftOut.map((l) => l.title));
    const lists = SECTIONS.map((s) => ({
      category: s.category,
      films: matched.filter((m) => m.section.id === s.id && !removed.has(m.name)).map((m) => ({ imdb: m.imdb, title: titleIn(m.imdb, m.name) })),
    })).filter((l) => l.films.length > 0);
    const sourceUrls = [...new Set(SECTIONS.filter((s) => lists.some((l) => l.category === s.category)).map((s) => `https://www.docnyc.net/festival-section/${s.category === "short-list" ? "short-list" : "winners-circle"}/`))];
    const edition = buildEdition({ year, lists, announced: sources.announced[String(year)], leftOut, sourceUrls });
    const before = JSON.stringify(readEdition(DATA_DIR, AWARD, year) ?? null);
    if (!dryRun) writeEdition(DATA_DIR, edition);
    const after = JSON.stringify(readEdition(DATA_DIR, AWARD, year) ?? edition);
    const counts = SECTIONS.map((s) => `${s.category} ${edition.results.filter((r) => r.category === s.category).length}`).join(", ");
    console.log(`${year}: ${edition.status}; ${counts}; ${leftOut.length} left out${!dryRun && before !== after ? " (written)" : ""}`);
  }

  if (problems.length > 0) {
    console.log(`\n${problems.length} to look at:`);
    for (const p of problems) console.log(`- ${p}`);
  }
  console.log(`${site.requests} DOC NYC requests, ${imdb.requests} IMDb requests, ${wiki.requests} Wikidata requests.`);
}

if (process.argv[1] && /research\/docnyc\.ts$/.test(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
