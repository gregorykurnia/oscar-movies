// `npx tsx scripts/research/oscars.ts [--years 2012-2026] [--refresh] [--offline]`
// (IMPLEMENTATION_PLAN.md §3.4, task 1.3): the Oscars' Picture, Documentary and Animated
// results for each film year, into `data/editions/oscars/<year>.json`, and the facts of every
// film into `data/movies/<year>.json`.
// - Nominees and winners: the "Nth Academy Awards" page.
// - Animated eligible list: "List of submissions for the Academy Award for Best Animated
//   Feature" (the Academy's list of eligible films, one table per year); every film on it that
//   wasn't nominated is `eligible`.
// - Documentary shortlist and every date: `scripts/research/sources/oscars.json`, transcribed
//   from the Academy's announcements (oscars.org can't be fetched by a script), with the
//   Wikipedia article (or QID) of each shortlisted film.
// International Feature is task 1.4's: its rows in an edition file are kept as they are.
// Prints what it couldn't resolve and every disagreement between the sources; it never
// invents a result.
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { EditionFile, ResultEntry } from "../../src/lib/data-files";
import { checkArgs, readEnvFile } from "../lib/target";
import { createFetcher } from "./lib/fetcher";
import { filmRef, newFilms, researched, researchFilms, unresolvedReport, type ResearchedFilm } from "./lib/films";
import { column, nomineeList, readNomineeLists, readWikitables, type FilmLink } from "./lib/tables";
import { plainTitle } from "./lib/facts";
import { fetchPage } from "./lib/wikipedia";
import { addMovies, movieKey, readEdition, writeEdition } from "./lib/writer";

const DATA_DIR = "data";
const SOURCES = "scripts/research/sources/oscars.json";
const ANIMATED_LIST = "List of submissions for the Academy Award for Best Animated Feature";
const OWNED = new Set(["picture", "documentary", "animated"]);
const HEADERS = {
  picture: /^Best Picture$/i,
  documentary: /^Best Documentary\W*\(?Feature/i,
  animated: /^Best Animated Feature/i,
} as const;
type Category = keyof typeof HEADERS;

const date = z.iso.date();
const filmSource = z
  .object({ title: z.string().min(1), article: z.string().min(1).optional(), wd: z.string().regex(/^Q\d+$/).optional() })
  .strict();
const sourcesSchema = z
  .object({
    years: z.record(
      z.string().regex(/^\d{4}$/),
      z
        .object({
          /** When every Oscar shortlist is out (the later of Documentary and International). */
          shortlistOn: date.optional(),
          documentaryShortlistOn: date.optional(),
          nominationsOn: date,
          winnersOn: date,
          sourceUrls: z.array(z.url()),
          /** Shown with the edition (a partial one's "what is missing"). */
          note: z.string().optional(),
          /** For the person checking the research; not written to the edition. */
          researchNote: z.string().optional(),
          documentaryShortlist: z.array(filmSource).optional(),
        })
        .strict(),
    ),
    /** Links the pages get wrong or leave out, keyed by the article they point to or, unlinked, the text. */
    linkFixes: z.record(z.string(), z.object({ article: z.string().optional(), wd: z.string().regex(/^Q\d+$/).optional(), why: z.string() }).strict()),
    /** Films with no IMDb ID and no Wikidata item, left out (§11), by the text the page shows. */
    /** English titles that read better than Wikidata's, by IMDb ID (the US release title, as the page has it). */
    titles: z.record(z.string().regex(/^tt\d+$/), z.string().min(1)),
    leaveOut: z.record(z.string(), z.object({ year: z.number().int(), why: z.string() }).strict()),
  })
  .strict();
type Sources = z.infer<typeof sourcesSchema>;

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** The ceremony that honours films of `year`: 2012 → 85th. */
export const ceremony = (year: number) => ordinal(year - 1927);

function parseYears(argv: string[]): number[] {
  const i = argv.indexOf("--years");
  const spec = i >= 0 ? argv[i + 1] : "2012-2026";
  const m = spec?.match(/^(\d{4})(?:-(\d{4}))?$/);
  if (!m) throw new Error(`--years takes 2012-2026 or 2024, not "${spec}"`);
  const [from, to] = [Number(m[1]), Number(m[2] ?? m[1])];
  return Array.from({ length: to - from + 1 }, (_, k) => from + k);
}

function fixLink(link: FilmLink, sources: Sources): FilmLink {
  const fix = sources.linkFixes[link.article ?? link.text];
  if (!fix) return link;
  return { text: link.text, article: fix.article ?? link.article, ...(fix.wd ? { wd: fix.wd } : {}) };
}

const loose = (t: string) => t.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

/** A resolved item with no IMDb title ID is most likely not the film (a manga, a book). */
function suspicious(film: ResearchedFilm): string | null {
  if (!film.ok || film.imdb) return null;
  return `${film.link.text} → ${film.wd} has no IMDb ID`;
}

async function main() {
  const argv = process.argv.slice(2);
  checkArgs(argv, { flags: ["--refresh", "--offline"], values: ["--years"] });
  const years = parseYears(argv);
  const sources = sourcesSchema.parse(JSON.parse(readFileSync(SOURCES, "utf8")));
  const fetcher = createFetcher({
    cacheDir: ".cache/wiki",
    refresh: argv.includes("--refresh"),
    offline: argv.includes("--offline"),
  });
  const token = readEnvFile(".env.test").TMDB_READ_TOKEN;
  const tmdb = token ? { fetcher: createFetcher({ cacheDir: ".cache/tmdb", offline: argv.includes("--offline") }), token } : undefined;

  const animatedPage = await fetchPage(fetcher, ANIMATED_LIST);
  const animatedTables = readWikitables(animatedPage.html);
  const problems: string[] = [];
  const titles: string[] = [];

  for (const year of years) {
    const source = sources.years[String(year)];
    if (!source) throw new Error(`${SOURCES} has no dates for ${year}.`);
    const label = `${year} (${ceremony(year)})`;
    const page = await fetchPage(fetcher, `${ceremony(year)} Academy Awards`);
    const ceremonyDone = source.winnersOn <= new Date().toISOString().slice(0, 10);
    const lists = readNomineeLists(page.html);
    const entries: Array<{ category: Category; link: FilmLink; outcome: ResultEntry["outcome"] }> = [];

    const nominationsOut = source.nominationsOn <= new Date().toISOString().slice(0, 10);
    if (nominationsOut) {
      for (const category of Object.keys(HEADERS) as Category[]) {
        for (const n of nomineeList(lists, HEADERS[category]).nominees) {
          const link = fixLink(n.film ?? { article: null, text: n.line }, sources);
          entries.push({ category, link, outcome: n.winner && ceremonyDone ? "won" : "nominated" });
        }
      }
    }

    const sourceUrls = [page.url];
    const animated = animatedTables.find((t) => t.section === String(year));
    const listed: Array<{ link: FilmLink; result: string }> = [];
    if (animated) {
      const result = column(animated, /^Result/);
      for (const row of animated.rows) {
        const link = fixLink(row[0].film ?? { article: null, text: row[0].text }, sources);
        listed.push({ link, result: row[result]?.text ?? "" });
      }
      sourceUrls.push(animatedPage.url);
    }
    for (const s of source.documentaryShortlist ?? []) {
      entries.push({ category: "documentary", link: fixLink({ article: s.article ?? null, text: s.title, ...(s.wd ? { wd: s.wd } : {}) }, sources), outcome: "shortlisted" });
    }
    for (const l of listed) {
      if (/withdrawn|disqualified/i.test(l.result)) continue;
      if (sources.leaveOut[l.link.text]?.year === year) {
        problems.push(`${label}: left out ${l.link.text} (${sources.leaveOut[l.link.text].why})`);
        continue;
      }
      entries.push({ category: "animated", link: l.link, outcome: "eligible" });
    }

    const films = await researchFilms(fetcher, entries.map((e) => e.link), tmdb);
    for (const f of films.values()) {
      const title = f.ok && f.imdb ? sources.titles[f.imdb] : undefined;
      if (f.ok && title) f.facts.title = title;
    }

    // One row per film per category: its furthest stage.
    const rank = { eligible: 1, shortlisted: 1, nominated: 2, won: 3 } as Record<string, number>;
    const rows = new Map<string, ResultEntry>();
    for (const e of entries) {
      const film = researched(films, e.link);
      const ref = filmRef(film);
      const id = `${e.category}\u0000${film.ok ? movieKey(film) : `title:${e.link.text}`}`;
      const before = rows.get(id);
      if (!before || rank[e.outcome] > rank[before.outcome]) rows.set(id, { category: e.category, ...ref, outcome: e.outcome });
    }

    // Cross-checks between the sources.
    const keyOf = (link: FilmLink) => {
      const f = researched(films, link);
      return f.ok ? movieKey(f) : `title:${link.text}`;
    };
    const nominees = (category: Category) =>
      new Set(entries.filter((e) => e.category === category && e.outcome !== "eligible" && e.outcome !== "shortlisted").map((e) => keyOf(e.link)));
    if (animated && nominationsOut) {
      const listNominees = new Set(listed.filter((l) => /nominated$|won/i.test(l.result) && !/not nominated/i.test(l.result)).map((l) => keyOf(l.link)));
      const pageNominees = nominees("animated");
      for (const k of pageNominees) if (!listNominees.has(k)) problems.push(`${label}: animated nominee ${k} isn't marked nominated on the eligible list`);
      for (const k of listNominees) if (!pageNominees.has(k)) problems.push(`${label}: eligible list marks ${k} nominated, the ceremony page doesn't`);
    }
    if (source.documentaryShortlist && nominationsOut) {
      const shortlist = new Set(source.documentaryShortlist.map((s) => keyOf(fixLink({ article: s.article ?? null, text: s.title, ...(s.wd ? { wd: s.wd } : {}) }, sources))));
      for (const k of nominees("documentary")) if (!shortlist.has(k)) problems.push(`${label}: documentary nominee ${k} isn't on the shortlist`);
    }
    for (const f of films.values()) {
      const why = suspicious(f);
      if (why) problems.push(`${label}: check ${why}`);
    }
    for (const f of films.values()) {
      if (f.ok && loose(f.facts.title) !== loose(f.link.text) && loose(f.facts.title) !== loose(plainTitle(f.link.article ?? ""))) {
        titles.push(`${label}: ${f.imdb ?? f.wd} is titled "${f.facts.title}", the page says "${f.link.text}"`);
      }
    }
    for (const line of unresolvedReport(films)) problems.push(`${label}: unresolved ${line}`);

    const old = readEdition(DATA_DIR, "oscars", year);
    const kept = (old?.results ?? []).filter((r) => !OWNED.has(r.category));
    // Loaded only when all four categories are in: International comes from task 1.4's
    // research, so an edition without its rows stays partial (and data:check's counts wait).
    const hasInternational = kept.some((r) => r.category === "international");
    const complete = ceremonyDone && Boolean(source.documentaryShortlist) && Boolean(animated) && hasInternational;
    const note = complete
      ? source.note
      : (source.note ?? (hasInternational ? undefined : "Best International Feature Film isn't loaded yet."));
    const edition: EditionFile = {
      award: "oscars",
      year,
      ordinal: ceremony(year),
      status: complete ? "loaded" : "partial",
      ...(source.shortlistOn ? { shortlistOn: source.shortlistOn } : {}),
      nominationsOn: source.nominationsOn,
      winnersOn: source.winnersOn,
      sourceUrls: [...new Set([...sourceUrls, ...source.sourceUrls])],
      ...(note ? { note } : {}),
      results: [...rows.values(), ...kept],
      screenings: [],
    };
    const movies = addMovies(DATA_DIR, year, newFilms(films));
    writeEdition(DATA_DIR, edition);
    const counts = Object.entries(
      [...rows.values()].reduce<Record<string, number>>((acc, r) => ({ ...acc, [`${r.category} ${r.outcome}`]: (acc[`${r.category} ${r.outcome}`] ?? 0) + 1 }), {}),
    )
      .map(([k, n]) => `${k} ${n}`)
      .join(", ");
    console.log(`${label}: ${edition.status}; ${counts}; ${movies.added.length} new films`);
  }

  if (problems.length > 0) {
    console.log(`\n${problems.length} to look at:`);
    for (const p of problems) console.log(`- ${p}`);
  }
  if (titles.length > 0) {
    console.log(`\n${titles.length} titles that differ from the page (Wikidata's title is kept; fix by hand if wrong):`);
    for (const t of titles) console.log(`- ${t}`);
  }
  console.log(`${fetcher.requests} Wikipedia/Wikidata requests.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
