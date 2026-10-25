// `npx tsx scripts/research/primary-country.ts [--offline]` (IMPLEMENTATION_PLAN.md task 7.2): makes
// `countries[0]` the country Wikipedia's article lists first, for every film in `data/movies/*.json`
// with a Wikidata item (the app shows one flag per film, Phase 7). Single-country films are read
// too: their one country can miss the first one Wikipedia lists (No Other Land: Norway only, where
// the article says Palestine, Norway).
// - Wikidata gives each film's English Wikipedia title (sitelinks, 50 items to a request); the
//   MediaWiki API gives the wikitext of 50 titles to a request; both go through the toolkit's
//   fetcher, so a rerun reads `.cache/wiki/` and `--offline` never reaches the network.
// - The infobox's "Country"/"Countries" line (`lib/infobox.ts`) gives the first name, which
//   `lib/countries.ts` maps to its ISO code. The code moves to the front of `countries`, or is added
//   there (and so listed) if the film didn't have it. The rest of the order stays.
// - A film with no Wikipedia article, no infobox country or a first name the tables don't know
//   keeps its order; the unknown names are printed so `lib/countries.ts` can be extended.
// - `docs/phase-checks/primary-country.md` lists every film changed. Rows from earlier runs stay
//   (a film changed once no longer differs on the next run), and the file is left alone when a
//   run changes nothing, so a second run writes nothing at all.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { moviesFileSchema, type MoviesFile } from "../../src/lib/data-files";
import { checkArgs } from "../lib/target";
import { findCountryCode } from "./lib/countries";
import { createFetcher, type Fetcher } from "./lib/fetcher";
import { primaryCountryName } from "./lib/infobox";
import { WIKIDATA_API } from "./lib/wikidata";
import { apiUrl, WIKI_CACHE_DIR } from "./lib/wikipedia";
import { formatMoviesFile, moviesPath, readMoviesFiles } from "./lib/writer";

const DATA_DIR = "data";
export const REPORT = "docs/phase-checks/primary-country.md";
const BATCH = 50;

/** `countries` with `code` first; the others keep their order, and a code that wasn't there is added. */
export function withPrimary(countries: string[], code: string): string[] {
  return [code, ...countries.filter((c) => c !== code)];
}

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += BATCH) out.push(items.slice(i, i + BATCH));
  return out;
}

/** English Wikipedia title by QID (a film with no article is left out of the map). */
export async function sitelinkTitles(fetcher: Fetcher, qids: string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  for (const batch of chunks([...new Set(qids)].sort())) {
    const search = new URLSearchParams({ format: "json", action: "wbgetentities", ids: batch.join("|"), props: "sitelinks", sitefilter: "enwiki" });
    const body = await fetcher.getJson<{ entities?: Record<string, { sitelinks?: Record<string, { title: string }> }> }>(
      `${WIKIDATA_API}?${search.toString()}`,
      { label: `wd-sitelinks-${batch[0]}` },
    );
    for (const [id, entity] of Object.entries(body.entities ?? {})) {
      const title = entity.sitelinks?.enwiki?.title;
      if (title) titles.set(id, title);
    }
  }
  return titles;
}

type QueryBody = {
  continue?: Record<string, string>;
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
    pages?: Array<{ title: string; missing?: boolean; revisions?: Array<{ slots?: { main?: { content?: string } } }> }>;
  };
};

/** The wikitext of each title (as asked, whatever it redirects to); a missing page is left out. */
export async function fetchWikitexts(fetcher: Fetcher, titles: string[]): Promise<Map<string, string>> {
  const texts = new Map<string, string>();
  for (const batch of chunks([...new Set(titles)].sort())) {
    const params: Record<string, string> = {
      action: "query",
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      redirects: "1",
      titles: batch.join("|"),
    };
    const byTitle = new Map<string, string>();
    const moved = new Map<string, string>();
    let more: Record<string, string> = {};
    for (let page = 0; ; page++) {
      const body = await fetcher.getJson<QueryBody>(apiUrl({ ...params, ...more }), { label: `wikitext-${batch[0]}-${page}` });
      for (const m of [...(body.query?.normalized ?? []), ...(body.query?.redirects ?? [])]) moved.set(m.from, m.to);
      for (const p of body.query?.pages ?? []) {
        const text = p.revisions?.[0]?.slots?.main?.content;
        if (!p.missing && text !== undefined) byTitle.set(p.title, text);
      }
      if (!body.continue) break;
      more = body.continue;
    }
    for (const title of batch) {
      let at = title;
      for (let hops = 0; hops < 5 && moved.has(at); hops++) at = moved.get(at) as string;
      const text = byTitle.get(at);
      if (text !== undefined) texts.set(title, text);
    }
  }
  return texts;
}

export type Change = { key: string; year: number; title: string; old: string; next: string };
export type Summary = {
  examined: number;
  noArticle: number;
  noInfoboxCountry: number;
  /** First names the tables don't know, with the films that have them. */
  unmapped: Map<string, string[]>;
  alreadyFirst: number;
  changes: Change[];
};

/** Reorders `files` in place (the film entries are replaced) and says what it did. */
export function applyPrimaryCountries(
  files: Map<number, MoviesFile>,
  titles: Map<string, string>,
  texts: Map<string, string>,
): Summary {
  const summary: Summary = { examined: 0, noArticle: 0, noInfoboxCountry: 0, unmapped: new Map(), alreadyFirst: 0, changes: [] };
  for (const [year, file] of files) {
    for (const [key, film] of Object.entries(file)) {
      if (!film.wd) continue;
      summary.examined++;
      const article = titles.get(film.wd);
      const text = article === undefined ? undefined : texts.get(article);
      if (text === undefined) {
        summary.noArticle++;
        continue;
      }
      const name = primaryCountryName(text);
      if (name === null) {
        summary.noInfoboxCountry++;
        continue;
      }
      const code = findCountryCode(name);
      if (code === undefined) {
        summary.unmapped.set(name, [...(summary.unmapped.get(name) ?? []), `${film.title} (${year})`]);
        continue;
      }
      if (film.countries[0] === code) {
        summary.alreadyFirst++;
        continue;
      }
      file[key] = { ...film, countries: withPrimary(film.countries, code) };
      summary.changes.push({ key, year, title: film.title, old: film.countries[0], next: code });
    }
  }
  return summary;
}

const ROW = /^\| (.+) \| (\d{4}) \| (\S+) \| ([A-Z]{2}) \| ([A-Z]{2}) \|$/;

/** The rows an earlier run wrote, by film key. */
export function readReport(text: string): Map<string, Change> {
  const rows = new Map<string, Change>();
  for (const line of text.split("\n")) {
    const m = line.match(ROW);
    if (m) rows.set(m[3], { title: m[1].replace(/\\\|/g, "|"), year: Number(m[2]), key: m[3], old: m[4], next: m[5] });
  }
  return rows;
}

/**
 * The report's text: earlier rows kept, this run's added. A film changed twice shows its first old
 * country and its last new one.
 */
export function formatReport(changes: Change[], earlier: Map<string, Change>): string {
  const rows = new Map(earlier);
  for (const c of changes) rows.set(c.key, { ...c, old: earlier.get(c.key)?.old ?? c.old });
  const sorted = [...rows.values()].sort((a, b) => a.year - b.year || a.title.localeCompare(b.title) || a.key.localeCompare(b.key));
  return [
    "# Primary country from Wikipedia",
    "",
    "Films whose first country changed to the one Wikipedia's infobox lists first (`scripts/research/primary-country.ts`, IMPLEMENTATION_PLAN.md task 7.2). Every film with a Wikidata item is read (until 2026-10-25 only films with two or more countries); the others, and films with no article or no infobox country, keep their order. A film changed in an earlier run stays listed.",
    "",
    `${sorted.length} films changed.`,
    "",
    "| Film | Year | ID | Old first | New first |",
    "|---|---|---|---|---|",
    ...sorted.map((r) => `| ${r.title.replace(/\|/g, "\\|")} | ${r.year} | ${r.key} | ${r.old} | ${r.next} |`),
    "",
  ].join("\n");
}

async function main() {
  const argv = process.argv.slice(2);
  checkArgs(argv, { flags: ["--offline"] });
  const offline = argv.includes("--offline");
  const fetcher = createFetcher({ cacheDir: WIKI_CACHE_DIR, offline });

  const files = readMoviesFiles(DATA_DIR);
  const qids = [...files.values()].flatMap((f) => Object.values(f)).filter((m) => m.wd).map((m) => m.wd as string);
  const titles = await sitelinkTitles(fetcher, qids);
  const texts = await fetchWikitexts(fetcher, [...titles.values()]);

  const summary = applyPrimaryCountries(files, titles, texts);
  for (const year of new Set(summary.changes.map((c) => c.year))) {
    const parsed = moviesFileSchema.safeParse(files.get(year));
    if (!parsed.success) throw new Error(`Refusing to write data/movies/${year}.json: ${parsed.error.message}`);
    writeFileSync(moviesPath(DATA_DIR, year), formatMoviesFile(parsed.data));
  }
  if (summary.changes.length > 0) {
    mkdirSync(dirname(REPORT), { recursive: true });
    const earlier = existsSync(REPORT) ? readReport(readFileSync(REPORT, "utf8")) : new Map<string, Change>();
    writeFileSync(REPORT, formatReport(summary.changes, earlier));
  }

  console.log(
    `${summary.examined} films with a Wikidata item: ${summary.changes.length} changed, ${summary.alreadyFirst} already first, ` +
      `${summary.noArticle} with no article, ${summary.noInfoboxCountry} with no infobox country, ${[...summary.unmapped.values()].flat().length} with a first name not in lib/countries.ts. ` +
      `${fetcher.requests} network requests.`,
  );
  for (const [name, films] of summary.unmapped) console.log(`  Unknown name "${name}": ${films.join(", ")}`);
}

if (process.argv[1]?.endsWith("primary-country.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
