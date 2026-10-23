// `npx tsx scripts/research/lineups.ts [--award cannes,venice,berlin] [--years 2025] [--refresh] [--offline]`
// (IMPLEMENTATION_PLAN.md §3.1 `screenings`, task 5.1): each festival year's lineup by section, with the
// prizes the films won, into the `screenings` of `data/editions/<festival>/<year>.json` (the edition
// `festivals.ts` wrote; run that first), and the facts of every new film into `data/movies/<year>.json`.
// - Source: the festival year's Wikipedia page (the tables under "Official Selection" and the parallel or
//   independent sections). A film is a row; its link leads to the film's article, which resolves to Wikidata
//   and the IMDb ID like every other import. A row with no usable article is searched on TMDB with the
//   row's own director and countries (`findOnTmdb`: it must agree on the director, or on country and title).
// - Sections: the table's heading, cleaned ("In Competition (Venezia 82)" → "In Competition"), in the page's
//   order. A table's sub-headings ("Midnight Screenings", "Panorama Dokumente") stay inside their section.
//   What isn't a feature-length film of that year stays out: short film programmes, student films, immersive
//   (VR) works, series, classics and restored prints, retrospectives and tributes (`SKIP_SECTION`), and any
//   film Wikidata or TMDB gives as a short (type short film, or a running time under 40 minutes).
// - Prizes: the page's "Official Awards" lines (and the festival's own independent awards named in `LINEUPS`)
//   that name a film in the lineup; a film's prizes are joined with "; ". The main prizes are also results
//   of the edition (`festivals.ts`); the screening carries them for the lineup page.
// - Checks: the section counts are compared with the numbers the festival published (`sources/lineups.json`
//   `published`), and a film that can't be found is listed and the script exits with an error; it never
//   guesses. A film left out on purpose is in `leaveOut` with its reason, and the edition's note says so.
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { EditionFile, ScreeningEntry } from "../../src/lib/data-files";
import { checkArgs, readEnvFile } from "../lib/target";
import { createFetcher } from "./lib/fetcher";
import { filmRef, newFilms, researched, researchFilms, unresolvedReport, type ResearchedFilm } from "./lib/films";
import { countryCode } from "./lib/countries";
import { readLineupTables, readPrizeSections, readPrizeTable, SELECTION_H2, type LineupRow, type PrizeEntry } from "./lib/lineup-pages";
import type { FilmLink } from "./lib/tables";
import { findOnTmdb } from "./lib/tmdb-search";
import { fetchPage } from "./lib/wikipedia";
import { plainTitle } from "./lib/facts";
import { addMovies, movieKey, readEdition, reviseMovies, writeEdition } from "./lib/writer";
import { FESTIVALS } from "./festivals";
import { loose } from "./majors";

const DATA_DIR = "data";
export const SOURCES = "scripts/research/sources/lineups.json";

export const sourcesLineupSchema = z
  .object({
    /** By the article the page links (or, unlinked, the text): a link the page gets wrong or leaves out. */
    linkFixes: z.record(z.string(), z.object({ article: z.string().optional(), wd: z.string().regex(/^Q\d+$/).optional(), why: z.string() }).strict()),
    /** A film the automatic TMDB search (title, the row's directors and countries) can't settle, by "<festival> <year> <text on the page>". */
    tmdbSearch: z.record(
      z.string(),
      z.object({ directors: z.array(z.string()).min(1), country: z.string().regex(/^[A-Z]{2}$/), title: z.string().min(1).optional(), why: z.string() }).strict(),
    ),
    /** Films with no IMDb ID and no Wikidata item, or not a feature, left out, by "<festival> <year> <text on the page>". */
    leaveOut: z.record(
      z.string(),
      z.object({ why: z.string(), /** The festival's own count doesn't include it (a series, a short). */ notCounted: z.literal(true).optional() }).strict(),
    ),
    /** Films the official programme lists and the Wikipedia table lacks, by "<festival> <year>". */
    additions: z.record(
      z.string(),
      z.array(
        z
          .object({
            section: z.string().min(1),
            title: z.string().min(1),
            originalTitle: z.string().optional(),
            directors: z.string().min(1),
            countries: z.array(z.string()),
            why: z.string(),
          })
          .strict(),
      ),
    ),
    /** English titles that read better than Wikidata's (a working title, an old one), by IMDb ID or, for a film with none, QID. */
    titles: z.record(z.string().regex(/^(?:tt|Q)\d+$/), z.string().min(1)),
    /** The page's heading → the section's name, where the festival calls it something else. */
    sectionNames: z.record(z.string(), z.string().min(1)),
    /** "<festival>/<year>/<section>" → the film count the festival published, and where. */
    published: z.record(z.string(), z
        .object({
          films: z.number().int().positive(),
          source: z.url(),
          /** How many of the published films this section's screenings leave out for being no feature of the year (a series, a short, a restoration), with `note` saying which. */
          apart: z.number().int().positive().optional(),
          note: z.string().optional(),
        })
        .strict()),
  })
  .strict();
export type LineupSources = z.infer<typeof sourcesLineupSchema>;

export type LineupSpec = {
  slug: string;
  /** The "Independent Awards" headings that are the festival's own sections' prizes (the main ones are all under "Official Awards"). */
  ownAwards?: RegExp;
  /** The page's top-level headings that hold the lineup tables (Sundance: "Films"; Toronto: "Program"). */
  selection?: RegExp;
  /** The page's prize lines read "Label – Film by Director" (Sundance). */
  dash?: boolean;
  /** The prizes are a table (Award, Film, Director) rather than lines (Toronto). */
  prizeTable?: boolean;
  /** Every prize line counts, whatever its heading (Sundance and Toronto have no "Official Awards"). */
  allPrizes?: boolean;
};

/** Cannes, Venice and Berlin (5.1); Sundance and Toronto (5.2). */
export const LINEUPS: LineupSpec[] = [
  { slug: "cannes", ownAwards: /^(?:Critics' Week|Directors' Fortnight)$/ },
  { slug: "venice", ownAwards: /^(?:Venice International Critics' Week|Giornate degli Autori)$/ },
  { slug: "berlin", ownAwards: /^(?:Panorama Audience Award.*|Teddy Award)$/ },
  { slug: "sundance", selection: /^films$/i, dash: true, allPrizes: true },
  { slug: "tiff", selection: /^program$/i, prizeTable: true, allPrizes: true },
];

/** A heading (the table's, or one of its sub-headings) that isn't feature-length films of the year. */
export const SKIP_SECTION =
  /short|cin[ée]fondation|immersive|classics|restored|retrospective|series|homage|world cinema project|miu miu|juniors|écrans|final cut|forum expanded|episodic|from the collection|primetime|festival street/i;
/** A prize for something other than a lineup film. */
const SKIP_PRIZE = /short|immersive|honorary|lifetime|restored|documentary on cinema|best documentary on cinema/i;
/** A film first released this many years before the festival is a restoration or a tribute, not part of the year's lineup. */
const OLD_AFTER = 3;
const SKIP_PRIZE_HEADING = /short|cin[ée]fondation|immersive|classics|honorary|lifetime|glory/i;

/** "In Competition (Venezia 82)" → "In Competition"; "22nd Giornate degli Autori" → "Giornate degli Autori". */
export function sectionName(heading: string, names: Record<string, string> = {}): string {
  const plain = heading
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/^\d+(?:st|nd|rd|th)?\.?\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return names[plain] ?? plain;
}

/** A row that is a programme of shorts, not a film ("Redefined: Short Film Showcase" at Toronto). */
const SKIP_TITLE = /short films?\b/i;

export type LineupFilm = { row: LineupRow; section: string };

/** The rows that count: not skipped by any of their headings, one per film and section. */
export function lineupFilms(rows: LineupRow[], names: Record<string, string> = {}, year?: number): LineupFilm[] {
  const seen = new Set<string>();
  const out: LineupFilm[] = [];
  for (const row of rows) {
    if ([row.h3, row.h4, row.sub].some((h) => SKIP_SECTION.test(h)) || SKIP_TITLE.test(row.film.text)) continue;
    // A title with its year ("The Lie (1987)") is a restoration or a tribute.
    const titleYear = Number(row.film.text.match(/\((\d{4})\)\s*$/)?.[1]);
    if (titleYear && year !== undefined && titleYear <= year - OLD_AFTER) continue;
    // A Venice Immersive table sits under an h4 "In Competition"; the h3 above it is what names the section.
    const section = sectionName(row.h3, names);
    const id = `${section}\u0000${row.film.article ?? row.film.text}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ row, section });
  }
  return out;
}

/** The prize's text on the lineup page: the label, with the section it belongs to when the label alone is unclear. */
export function prizeText(entry: PrizeEntry, names: Record<string, string> = {}): string {
  const heading = sectionName(entry.heading, names);
  if (/^(?:in|main) competition$/i.test(heading)) return entry.label;
  if (loose(entry.label).includes(loose(heading)) || loose(heading).includes(loose(entry.label))) return entry.label;
  return `${entry.label} (${heading})`;
}

/**
 * A "Label – Film" line's prize (Sundance): a label that names a prize is the prize ("Directing Award",
 * not "Directing Award (Directing, Screenwriting and Editing)"); a label that only names the competition
 * takes the heading's prize ("U.S. Dramatic" under "Grand Jury Prizes" is the section's "Grand Jury Prize").
 */
export function dashPrizeText(entry: PrizeEntry): string {
  if (/\b(?:award|prize)\b/i.test(entry.label)) return entry.label;
  if (/\b(?:awards?|prizes?)\b/i.test(entry.heading)) return entry.heading.replace(/\b(Award|Prize)s\b/gi, "$1");
  return `${entry.label} (${entry.heading})`;
}

export type PrizeLine = { entry: PrizeEntry; text: string };

/** The prize lines that count: the official awards, and the festival's own independent ones. */
export function prizeLines(html: string, spec: LineupSpec, names: Record<string, string> = {}): PrizeLine[] {
  const out: PrizeLine[] = [];
  if (spec.prizeTable) {
    for (const entry of readPrizeTable(html)) if (!SKIP_PRIZE.test(entry.label)) out.push({ entry, text: entry.label });
    return out;
  }
  for (const s of readPrizeSections(html, { dash: spec.dash })) {
    const official = spec.allPrizes || /^official awards$/i.test(s.h2);
    if (!official && !(spec.ownAwards && /^independent awards$/i.test(s.h2) && spec.ownAwards.test(s.h3))) continue;
    if (SKIP_PRIZE_HEADING.test(s.h3)) continue;
    for (const entry of s.entries) {
      if (SKIP_PRIZE.test(entry.label)) continue;
      // An italic name inside the prize's own name ("French Touch Prize of the Jury") isn't a film.
      if (loose(entry.label).includes(loose(entry.film.text))) continue;
      out.push({ entry, text: spec.dash ? dashPrizeText(entry) : prizeText(entry, names) });
    }
  }
  return out;
}

/** The lineup rows a prize line names: by article when it has one, else by the film's title as the page shows it. */
export function rowsOfPrize(films: LineupFilm[], entry: PrizeEntry): LineupFilm[] {
  const byArticle = entry.film.article ? films.filter((f) => f.row.film.article === entry.film.article) : [];
  if (byArticle.length > 0) return byArticle;
  const t = loose(entry.film.text);
  return films.filter((f) => loose(f.row.film.text) === t || loose(f.row.originalTitle) === t);
}

function parseYears(argv: string[]): number[] {
  const i = argv.indexOf("--years");
  const spec = i >= 0 ? argv[i + 1] : "2025";
  const m = spec.match(/^(\d{4})(?:-(\d{4}))?$/);
  if (!m) throw new Error(`--years takes 2025-2026 or 2025, not "${spec}"`);
  const [from, to] = [Number(m[1]), Number(m[2] ?? m[1])];
  return Array.from({ length: to - from + 1 }, (_, k) => from + k);
}

/** A row's production countries as ISO codes, main country first (names countries.ts doesn't know are left out). */
function countryCodes(names: string[]): string[] {
  const codes: string[] = [];
  for (const n of names) {
    try {
      const code = countryCode(n);
      if (!codes.includes(code)) codes.push(code);
    } catch {
      continue;
    }
  }
  return codes;
}

/** The first ISO code among a row's production countries ("" when none is a name countries.ts knows). */
function firstCountry(names: string[]): string {
  for (const n of names) {
    try {
      return countryCode(n);
    } catch {
      continue;
    }
  }
  return "";
}

const LINEUP_NOTE = /\s*Lineup:[^]*$/;

async function main() {
  const argv = process.argv.slice(2);
  checkArgs(argv, { flags: ["--refresh", "--offline"], values: ["--years", "--award"] });
  const years = parseYears(argv);
  const wantedIndex = argv.indexOf("--award");
  const wanted = wantedIndex >= 0 ? argv[wantedIndex + 1].split(",") : undefined;
  const specs = LINEUPS.filter((f) => !wanted || wanted.includes(f.slug));
  if (wanted) for (const w of wanted) if (!LINEUPS.some((f) => f.slug === w)) throw new Error(`No lineup import for "${w}" (${LINEUPS.map((f) => f.slug).join(", ")}).`);
  const sources = sourcesLineupSchema.parse(JSON.parse(readFileSync(SOURCES, "utf8")));
  const fetcher = createFetcher({ cacheDir: ".cache/wiki", refresh: argv.includes("--refresh"), offline: argv.includes("--offline") });
  const token = readEnvFile(".env.test").TMDB_READ_TOKEN;
  const tmdb = token ? { fetcher: createFetcher({ cacheDir: ".cache/tmdb", offline: argv.includes("--offline") }), token } : undefined;
  const problems: string[] = [];
  const titles: string[] = [];
  const strays: string[] = [];
  const unverified: string[] = [];
  const checks: string[] = [];

  for (const spec of specs) {
    const festival = FESTIVALS.find((f) => f.slug === spec.slug);
    if (!festival) throw new Error(`${spec.slug} is not in festivals.ts.`);
    for (const year of years) {
      const label = `${spec.slug} ${year}`;
      const existing = readEdition(DATA_DIR, spec.slug, year);
      if (!existing) throw new Error(`${label}: no edition file; run festivals.ts first.`);
      if (existing.status === "no_data") {
        console.log(`${label}: no_data, no lineup`);
        continue;
      }
      const page = await fetchPage(fetcher, festival.page(year));
      const added: LineupRow[] = (sources.additions[`${spec.slug} ${year}`] ?? []).map((a) => ({
        h2: "Official Sections",
        h3: a.section,
        h4: "",
        sub: "",
        film: { article: null, text: a.title },
        originalTitle: a.originalTitle ?? "",
        directors: a.directors,
        countries: a.countries,
      }));
      const films = lineupFilms([...readLineupTables(page.html, spec.selection ?? SELECTION_H2), ...added], sources.sectionNames, year);
      const fix = (link: FilmLink): FilmLink => {
        const f = sources.linkFixes[link.article ?? link.text];
        return f ? { text: link.text, article: f.article ?? link.article, ...(f.wd ? { wd: f.wd } : {}) } : link;
      };
      const leftOut = new Map<string, string>();
      const leftOutIn = new Map<string, number>();
      const kept = films.filter(({ row, section }) => {
        const out = sources.leaveOut[`${label} ${row.film.text}`];
        if (out) {
          leftOut.set(row.film.text, out.why);
          if (!out.notCounted) leftOutIn.set(section, (leftOutIn.get(section) ?? 0) + 1);
        }
        return !out;
      });
      const linkOf = (f: LineupFilm) => fix(f.row.film);

      // Wikipedia's links first; then TMDB for the rows with no usable article, and for a film whose
      // Wikidata item has no IMDb ID (scores are looked up by it), with the row's own director.
      const linked = await researchFilms(fetcher, kept.filter((f) => linkOf(f).article || linkOf(f).wd).map(linkOf), tmdb);
      const viaTmdb = new Map<string, ResearchedFilm>();
      for (const f of kept) {
        const link = linkOf(f);
        const known = link.article || link.wd ? researched(linked, link) : undefined;
        if ((known?.ok && known.imdb) || viaTmdb.has(link.text)) continue;
        const wdOnly = known?.ok && known.wd ? known : undefined;
        const search = sources.tmdbSearch[`${label} ${link.text}`];
        const hit = tmdb
          ? await findOnTmdb(tmdb, {
              title: search?.title ?? link.text,
              originalTitle: f.row.originalTitle && f.row.originalTitle !== link.text ? f.row.originalTitle : undefined,
              year,
              country: search?.country ?? firstCountry(f.row.countries),
              directors: search?.directors ?? [f.row.directors],
            })
          : null;
        if (hit?.ok && wdOnly) {
          // Wikidata's facts and item stay; TMDB adds the IMDb ID and what Wikidata lacks.
          const defined = Object.fromEntries(Object.entries(wdOnly.facts).filter(([, v]) => v !== undefined));
          const facts = { ...hit.facts, ...defined, countries: wdOnly.facts.countries.length > 0 ? wdOnly.facts.countries : hit.facts.countries };
          if (!wdOnly.facts.originalTitle) [facts.originalTitle, facts.originalLang] = [hit.facts.originalTitle, hit.facts.originalLang];
          viaTmdb.set(link.text, { ...wdOnly, imdb: hit.imdb, facts, short: wdOnly.short || hit.short });
        } else if (hit?.ok) viaTmdb.set(link.text, { ok: true, link, imdb: hit.imdb, facts: hit.facts, short: hit.short, released: hit.released });
        else if (!wdOnly) problems.push(`${label}: ${link.text} (${f.section}; ${f.row.directors}) wasn't found on TMDB (${hit ? hit.reason : "no TMDB token"})`);
      }
      const filmOf = (f: LineupFilm): ResearchedFilm | undefined => {
        const link = linkOf(f);
        const known = link.article || link.wd ? researched(linked, link) : undefined;
        if (known?.ok && known.imdb) return known;
        return viaTmdb.get(link.text) ?? known;
      };
      for (const f of [...linked.values(), ...viaTmdb.values()]) {
        if (!f.ok) continue;
        const title = (f.imdb ? sources.titles[f.imdb] : undefined) ?? (f.wd ? sources.titles[f.wd] : undefined);
        f.facts.title = title ?? plainTitle(f.facts.title);
      }

      // Features of the year only: a film that Wikidata or TMDB gives as a short, or released long before, is dropped.
      const shorts: string[] = [];
      const older: string[] = [];
      const series: string[] = [];
      const features = kept.filter((f) => {
        const film = filmOf(f);
        if (film?.ok && film.short) {
          shorts.push(`${f.row.film.text} (${f.section})`);
          return false;
        }
        if (film?.ok && film.series) {
          series.push(`${f.row.film.text} (${f.section})`);
          return false;
        }
        if (film?.ok && film.released !== undefined && film.released <= year - OLD_AFTER) {
          older.push(`${f.row.film.text} ${film.released} (${f.section})`);
          return false;
        }
        return true;
      });

      // One screening per film per section, with its prizes.
      const order = [...new Set(features.map((f) => f.section))];
      const prizes = new Map<string, string[]>();
      for (const line of prizeLines(page.html, spec, sources.sectionNames)) {
        const hits = rowsOfPrize(features, line.entry);
        if (hits.length === 0) {
          if (!SKIP_PRIZE.test(line.text)) strays.push(`${label}: "${line.text}" went to ${line.entry.film.text}, who isn't in the lineup (a short, or a film left out)`);
          continue;
        }
        for (const h of hits) {
          const key = `${h.section}\u0000${h.row.film.article ?? h.row.film.text}`;
          const list = prizes.get(key) ?? [];
          if (!list.includes(line.text)) list.push(line.text);
          prizes.set(key, list);
        }
      }
      const screenings: ScreeningEntry[] = [];
      const unresolved = new Map<string, ResearchedFilm>();
      const used = new Map<string, ResearchedFilm>();
      // The row's production countries, for a film no source gives one.
      const rowCountries = new Map<string, string[]>();
      for (const f of features) {
        const film = filmOf(f);
        if (!film || !film.ok) {
          if (film) unresolved.set(f.row.film.text, film);
          continue;
        }
        used.set(movieKey(film), film);
        if (!rowCountries.has(movieKey(film))) rowCountries.set(movieKey(film), countryCodes(f.row.countries));
        const list = prizes.get(`${f.section}\u0000${f.row.film.article ?? f.row.film.text}`);
        screenings.push({ ...filmRef(film), section: f.section, sectionOrder: order.indexOf(f.section) + 1, ...(list ? { prize: list.join("; ") } : {}) });
      }
      for (const line of unresolvedReport(unresolved)) problems.push(`${label}: unresolved ${line}`);

      // The same film twice in a section (two rows leading to one article) is one screening.
      const seen = new Set<string>();
      const unique = screenings.filter((s) => {
        const id = `${s.section}\u0000${s.imdb ?? s.wd ?? s.title}`;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      // The festival's own numbers.
      const counts = new Map<string, number>();
      for (const s of unique) counts.set(s.section, (counts.get(s.section) ?? 0) + 1);
      for (const [key, p] of Object.entries(sources.published)) {
        if (!key.startsWith(`${spec.slug}/${year}/`)) continue;
        const section = key.slice(`${spec.slug}/${year}/`.length);
        // A film left out on purpose still counts: the festival published it.
        const got = (counts.get(section) ?? 0) + (leftOutIn.get(section) ?? 0) + (p.apart ?? 0);
        if (got !== p.films) problems.push(`${label}: ${section} has ${got} films, the festival published ${p.films} (${p.source})`);
      }
      for (const section of counts.keys()) {
        if (!sources.published[`${spec.slug}/${year}/${section}`]) unverified.push(`${label}: ${section} (${counts.get(section)} films)`);
      }

      for (const f of used.values()) if (f.ok && f.facts.countries.length === 0) f.facts.countries = rowCountries.get(movieKey(f)) ?? [];
      const movies = addMovies(DATA_DIR, year, newFilms(used));
      // Films filed by an earlier run: moved to the IMDb ID TMDB found, with the title and countries fixed.
      const byQid = new Map([...used.values()].flatMap((f) => (f.ok && f.imdb && f.wd ? [[f.wd, f] as const] : [])));
      const usedKeys = new Set([...used.values()].flatMap((f) => (f.ok ? [movieKey(f), ...(f.wd ? [f.wd] : [])] : [])));
      for (const line of reviseMovies(DATA_DIR, (key, entry) => {
        if (!usedKeys.has(key)) return undefined;
        const found = byQid.get(key);
        const next = { ...entry };
        if (found?.ok && found.imdb) {
          next.wd = key;
          if (next.originalTitle === undefined && found.facts.originalTitle && found.facts.originalLang) {
            next.originalTitle = found.facts.originalTitle;
            next.originalLang = found.facts.originalLang;
          }
          next.language ??= found.facts.language;
          next.tmdb ??= found.facts.tmdb;
          if (next.countries.length === 0) next.countries = found.facts.countries;
        }
        if (next.countries.length === 0) next.countries = rowCountries.get(key) ?? rowCountries.get(found?.ok && found.imdb ? found.imdb : key) ?? [];
        const title = sources.titles[key] ?? (found?.ok && found.imdb ? sources.titles[found.imdb] : undefined) ?? plainTitle(entry.title);
        const newKey = found?.ok && found.imdb ? found.imdb : key;
        const retitled = title !== entry.title;
        if (retitled) next.title = title;
        for (const k of Object.keys(next) as (keyof typeof next)[]) if (next[k] === undefined) delete next[k];
        return newKey === key && !retitled && JSON.stringify(next) === JSON.stringify(entry) ? undefined : { key: newKey, entry: next, retitled };
      })) {
        console.log(`${label}: ${line}`);
      }
      for (const f of used.values()) {
        if (f.ok && !f.imdb) checks.push(`${label}: ${f.link.text} → ${f.wd} has no IMDb ID (filed under its QID)`);
        if (f.ok && movies.added.includes(movieKey(f)) && loose(f.facts.title) !== loose(f.link.text) && loose(f.facts.title) !== loose(f.link.article ?? "")) {
          titles.push(`${label}: ${f.imdb ?? f.wd} is titled "${f.facts.title}", the page says "${f.link.text}"`);
        }
      }

      const lineupNote = leftOut.size > 0 ? `Lineup: ${[...leftOut].map(([t, why]) => `${t} left out (${why})`).join("; ")}.` : undefined;
      const base = existing.note?.replace(LINEUP_NOTE, "").trim();
      const note = [base, lineupNote].filter(Boolean).join(" ");
      const edition: EditionFile = {
        ...existing,
        sourceUrls: existing.sourceUrls.includes(page.url) ? existing.sourceUrls : [...existing.sourceUrls, page.url],
        ...(note ? { note } : {}),
        screenings: unique,
      };
      if (!note) delete edition.note;
      writeEdition(DATA_DIR, edition);
      if (series.length > 0) console.log(`${label}: series left out: ${series.join("; ")}`);
      if (older.length > 0) console.log(`${label}: older films left out: ${older.join("; ")}`);
      if (shorts.length > 0) console.log(`${label}: shorts left out: ${shorts.join("; ")}`);
      console.log(`${label}: ${unique.length} films in ${counts.size} sections (${[...counts].map(([s, n]) => `${s} ${n}`).join(", ")}); ${shorts.length} shorts left out; ${movies.added.length} new films`);
    }
  }

  if (problems.length > 0) {
    console.log(`\n${problems.length} to look at:`);
    for (const p of problems) console.log(`- ${p}`);
    process.exitCode = 1;
  }
  if (checks.length > 0) {
    console.log(`\n${checks.length} films to check by hand:`);
    for (const t of checks) console.log(`- ${t}`);
  }
  if (unverified.length > 0) {
    console.log(`\n${unverified.length} sections with no published count to check against (Wikipedia's table is the only source):`);
    for (const t of unverified) console.log(`- ${t}`);
  }
  if (strays.length > 0) {
    console.log(`\n${strays.length} prizes for films that aren't in the lineup (shorts, or films left out; nothing to fix unless a feature is listed):`);
    for (const t of strays) console.log(`- ${t}`);
  }
  if (titles.length > 0) {
    console.log(`\n${titles.length} new films whose title differs from the page (Wikidata's title is kept; fix by hand if wrong):`);
    for (const t of titles) console.log(`- ${t}`);
  }
  console.log(`${fetcher.requests} Wikipedia/Wikidata requests.`);
}

// Tests import the helpers; running the file does the research.
if (process.argv[1] && /lineups\.ts$/.test(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
