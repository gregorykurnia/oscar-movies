// `npx tsx scripts/research/imdb.ts --award atlanta-critics,cinema-eye [--years 2012-2026] [--survey] [--dry-run] [--refresh] [--offline]`
// (task 6.1, docs/imdb-import.md): fills the gaps Wikipedia leaves in an award's editions from IMDb's
// award records. Wikipedia stays wherever it has data (§3): a category with results keeps them (IMDb's
// nominees are added only under the same winners), an empty category is filled from IMDb, a `no_data`
// edition becomes `partial` (IMDb gives no announcement date), and where both list a category the
// differences are reported as the group's agreement, never written.
// - `--survey` prints each award's IMDb labels (category text, else the award's name) with counts,
//   the category each maps to in `sources/imdb.json` `labels`, and how each IMDb edition is matched
//   to a film year; it writes nothing.
// - `--dry-run` does the research and prints what would change, writing nothing (agreement checks).
// - The note of an edition IMDb added to ends with a sentence starting "From IMDb's award records";
//   a rerun reads it back to tell IMDb's rows from Wikipedia's, so running this twice changes nothing.
//   Rerunning a Wikipedia script (`majors.ts`, `critics.ts`) drops IMDb's rows: rerun this after it.
import { readFileSync } from "node:fs";
import { z } from "zod";
import { awardsFileSchema, refKey, type AwardEntry, type EditionFile, type ResultEntry } from "../../src/lib/data-files";
import { checkArgs, readEnvFile } from "../lib/target";
import { createFetcher, type Fetcher } from "./lib/fetcher";
import { researchImdbFilms, type ResearchedFilm } from "./lib/films";
import { editionSeasons, eventTitles, FEATURE_TYPES, labelOf, titleNominations, type ImdbNomination, type ImdbTitle } from "./lib/imdb";
import { addMovies, readEdition, readMoviesFiles, writeEdition } from "./lib/writer";

const DATA_DIR = "data";
export const SOURCES = "scripts/research/sources/imdb.json";
const CRITICS_SOURCES = "scripts/research/sources/critics.json";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const sourcesSchema = z
  .object({
    /** IMDb events per award slug (docs/imdb-import.md §4). */
    events: z.record(z.string().regex(SLUG), z.array(z.string().regex(/^ev\d{7}$/)).min(1)),
    /** Per award: IMDb label → category slug. Labels not listed are not read (acting, writing, crafts…). */
    labels: z.record(z.string().regex(SLUG), z.record(z.string().min(1), z.string().regex(SLUG))),
    /** "<award>/<category>" → why every film IMDb names there is a winner (an honoree list): no tie, no missing nominees. */
    honorees: z.record(z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/), z.string().min(1)),
    /** "<event>/<year>/<instance>" → the film year it honours, where `editionSeasons` gets it wrong. */
    seasons: z.record(z.string().regex(/^ev\d{7}\/\d{4}\/\d+$/), z.object({ year: z.number().int(), why: z.string().min(1) }).strict()),
    /** "<award> <film year> <IMDb ID>" → why IMDb's entry is left out (and, optionally, the reason the note gives). */
    leaveOut: z.record(z.string().regex(/^[a-z0-9-]+ \d{4} tt\d+$/), z.object({ why: z.string().min(1), note: z.string().optional() }).strict()),
  })
  .strict();
export type Sources = z.infer<typeof sourcesSchema>;

type EventNomination = ImdbNomination & { event: string };

/** One IMDb result, mapped to a category and a film year. */
export type ImdbRow = { category: string; imdb: string; title: string; won: boolean; edition: string };

export const editionKey = (event: string, e: ImdbNomination["edition"]) => `${event}/${e.year}/${e.instance}`;
export const eventUrl = (key: string) => `https://www.imdb.com/event/${key}/`;

/**
 * The rows the label map keeps, each with the film year its edition honours (`seasons`, by
 * edition key). One row per film per category per film year: a win beats a nomination.
 */
export function mapNominations(
  nominations: EventNomination[],
  labels: Record<string, string>,
  seasons: Map<string, number>,
  titleOf: (imdb: string) => string,
): Map<number, ImdbRow[]> {
  const out = new Map<number, Map<string, ImdbRow>>();
  for (const n of nominations) {
    const category = labels[labelOf(n)];
    if (!category) continue;
    const edition = editionKey(n.event, n.edition);
    const year = seasons.get(edition);
    if (year === undefined) continue;
    const rows = out.get(year) ?? new Map<string, ImdbRow>();
    out.set(year, rows);
    const id = `${category}\u0000${n.titleId}`;
    const before = rows.get(id);
    if (!before || (n.won && !before.won)) rows.set(id, { category, imdb: n.titleId, title: titleOf(n.titleId), won: n.won, edition });
  }
  return new Map([...out].map(([y, rows]) => [y, [...rows.values()]]));
}

export const MARKER = "From IMDb's award records";

/** Splits a note into what the Wikipedia script wrote and the sentence this script added. */
export function splitNote(note: string | undefined): { base?: string; imdb?: string } {
  if (!note) return {};
  const i = note.indexOf(MARKER);
  if (i < 0) return { base: note };
  const base = note.slice(0, i).trim();
  return { ...(base ? { base } : {}), imdb: note.slice(i) };
}

const NOMINEES = "nominees for ";
const listOf = (names: string[]) => names.join("; ");
const namesIn = (text: string | undefined) => (text ? text.split("; ").map((s) => s.trim()).filter(Boolean) : []);

/** The categories an earlier run filled, and those it added nominees to, read back from its sentence. */
export function readImdbPart(part: string | undefined): { filled: string[]; nomineesAdded: string[] } {
  const segment = part?.match(/^From IMDb's award records: (.*?)\.(?= IMDb gives | Not on IMDb: | Left out: |$)/)?.[1];
  if (!segment) return { filled: [], nomineesAdded: [] };
  const [fills, added] = segment.startsWith(NOMINEES) ? ["", segment.slice(NOMINEES.length)] : segment.split(`; ${NOMINEES}`);
  return {
    filled: namesIn(fills).map((n) => n.replace(/ \(winners only\)$/, "")),
    nomineesAdded: namesIn(added),
  };
}

/**
 * The edition as the Wikipedia script left it: an earlier run's rows, URLs and sentence taken out.
 * `null` when it had nothing (an edition IMDb alone filled, or one still `no_data`).
 */
export function wikipediaPart(edition: EditionFile, award: Pick<AwardEntry, "categories">): EditionFile | null {
  const { base, imdb } = splitNote(edition.note);
  const { filled, nomineesAdded } = readImdbPart(imdb);
  const slugOf = (name: string) => award.categories.find((c) => c.name === name)?.slug;
  const filledSlugs = new Set(filled.map(slugOf));
  const addedSlugs = new Set(nomineesAdded.map(slugOf));
  const results = edition.results.filter((r) => !filledSlugs.has(r.category) && !(addedSlugs.has(r.category) && r.outcome === "nominated"));
  const sourceUrls = edition.sourceUrls.filter((u) => !u.startsWith("https://www.imdb.com/"));
  if (edition.status === "no_data" || (results.length === 0 && sourceUrls.length === 0)) return null;
  const { note: _note, ...rest } = edition;
  void _note;
  return { ...rest, results, sourceUrls, ...(base ? { note: base } : {}) };
}

export type Comparison = { category: string; winnersAgree: boolean; nomineesAgree: boolean | null; detail?: string };

export type MergeInput = {
  award: Pick<AwardEntry, "slug" | "shortName" | "winnersOnly" | "categories">;
  year: number;
  existing: EditionFile | undefined;
  /** IMDb's rows for this film year, after leave-outs (each film with a record in `data/movies/`). */
  rows: ImdbRow[];
  /** Category slugs the group gave no prize for that year (`critics.json` `absent`). */
  absent: Set<string>;
  /** Category slugs that are honoree lists (`honorees`): several winners and no nominees are expected. */
  honorees?: Set<string>;
  /** Films left out, with the reason for the note. */
  leftOut: Array<{ title: string; reason: string }>;
};

export type MergeOutput = { edition: EditionFile; compared: Comparison[]; problems: string[]; changed: string[] };

const winnersOf = (rows: Array<{ imdb?: string; wd?: string; outcome?: string; won?: boolean }>) =>
  new Set(rows.filter((r) => r.won ?? r.outcome === "won").map((r) => refKey(r) ?? ""));
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/** The merge of docs/imdb-import.md §3 for one award and film year. */
export function mergeImdb({ award, year, existing, rows, absent, honorees = new Set(), leftOut }: MergeInput): MergeOutput {
  const base = existing ? wikipediaPart(existing, award) : null;
  const results: ResultEntry[] = [...(base?.results ?? [])];
  const compared: Comparison[] = [];
  const problems: string[] = [];
  const filled: string[] = [];
  const winnersOnlyCats: string[] = [];
  const nomineesAdded: string[] = [];
  const notOnImdb: string[] = [];
  const label = `${award.slug} ${year}`;
  for (const c of award.categories) {
    const ours = results.filter((r) => r.category === c.slug);
    const theirs = rows.filter((r) => r.category === c.slug);
    if (absent.has(c.slug)) {
      if (theirs.length > 0) problems.push(`${label}: IMDb lists ${c.slug}, which critics.json says the group didn't give (kept out)`);
      continue;
    }
    if (theirs.length === 0) {
      if (ours.length === 0) notOnImdb.push(c.name);
      continue;
    }
    const theirWinners = winnersOf(theirs);
    if (theirWinners.size > 1 && !honorees.has(c.slug)) problems.push(`${label}: IMDb gives ${c.slug} ${theirWinners.size} winners (a tie?)`);
    if (ours.length > 0) {
      const ourWinners = winnersOf(ours);
      const winnersAgree = sameSet(ourWinners, theirWinners);
      const ourNominees = ours.some((r) => r.outcome !== "won");
      const theirNominees = theirs.some((r) => !r.won);
      const nomineesAgree = ourNominees && theirNominees ? sameSet(new Set(ours.map((r) => refKey(r) ?? "")), new Set(theirs.map((r) => r.imdb))) : null;
      const detail =
        winnersAgree && nomineesAgree !== false
          ? undefined
          : `Wikipedia ${ours.map((r) => `${r.title}${r.outcome === "won" ? "*" : ""}`).join(", ")} | IMDb ${theirs.map((r) => `${r.title}${r.won ? "*" : ""}`).join(", ")}`;
      compared.push({ category: c.slug, winnersAgree, nomineesAgree, ...(detail ? { detail } : {}) });
      if (!ourNominees && theirNominees && winnersAgree && !award.winnersOnly && ours.every((r) => refKey(r))) {
        for (const r of theirs) if (!r.won) results.push({ category: c.slug, imdb: r.imdb, title: r.title, outcome: "nominated" });
        nomineesAdded.push(c.name);
      }
      continue;
    }
    for (const r of [...theirs].sort((a, b) => Number(b.won) - Number(a.won))) {
      results.push({ category: c.slug, imdb: r.imdb, title: r.title, outcome: r.won ? "won" : "nominated" });
    }
    filled.push(c.name);
    if (!award.winnersOnly && !honorees.has(c.slug) && !theirs.some((r) => !r.won)) winnersOnlyCats.push(c.name);
  }

  const urls = [...new Set(rows.map((r) => eventUrl(r.edition)))].sort();
  const changed = [...filled, ...nomineesAdded.map((n) => `${n} nominees`)];
  if (changed.length === 0) {
    // IMDb adds nothing: the edition as Wikipedia (or the no-data note) left it.
    if (base) return { edition: { ...base, results: base.results }, compared, problems, changed };
    const untouched = existing && existing.status === "no_data" ? existing : undefined;
    const edition: EditionFile = untouched ?? {
      award: award.slug,
      year,
      status: "no_data",
      sourceUrls: [],
      note: `${award.shortName} has no data for ${year} films: Wikipedia has no page for these awards and IMDb's award records list none.`,
      results: [],
      screenings: [],
    };
    return { edition, compared, problems, changed };
  }

  const parts: string[] = [];
  const fills = filled.map((n) => (winnersOnlyCats.includes(n) ? `${n} (winners only)` : n));
  parts.push(`${MARKER}: ${listOf([...fills, ...(nomineesAdded.length > 0 ? [`${NOMINEES}${listOf(nomineesAdded)}`] : [])])}.`);
  if (!base || !base.winnersOn) parts.push("IMDb gives no announcement date.");
  if (notOnImdb.length > 0) parts.push(`Not on IMDb: ${listOf(notOnImdb)}.`);
  if (leftOut.length > 0) parts.push(`Left out: ${leftOut.map((f) => `"${f.title}" (${f.reason})`).join(", ")}.`);
  const status = base?.status === "loaded" && winnersOnlyCats.length === 0 && leftOut.length === 0 ? "loaded" : "partial";
  const note = [base?.note, ...parts].filter(Boolean).join(" ");
  const edition: EditionFile = {
    ...(base ?? { award: award.slug, year, screenings: [] }),
    status,
    sourceUrls: [...(base?.sourceUrls ?? []), ...urls],
    note,
    results,
  } as EditionFile;
  return { edition, compared, problems, changed };
}

/** Every nomination at the award's events, and the titles IMDb gives for them. */
async function collect(fetcher: Fetcher, events: string[]): Promise<{ titles: Map<string, ImdbTitle>; nominations: EventNomination[] }> {
  const titles = new Map<string, ImdbTitle>();
  const nominations: EventNomination[] = [];
  for (const event of events) {
    const found = await eventTitles(fetcher, event);
    for (const t of found) titles.set(t.id, t);
    for (const t of found) nominations.push(...(await titleNominations(fetcher, t.id)).filter((n) => n.event === event));
  }
  return { titles, nominations };
}

/** Film year per IMDb edition, event by event, with the `seasons` overrides. */
function seasonsOf(nominations: EventNomination[], filmYear: (imdb: string) => number | undefined, sources: Sources): Map<string, number> {
  const out = new Map<string, number>();
  for (const event of new Set(nominations.map((n) => n.event))) {
    const own = nominations.filter((n) => n.event === event).map((n) => ({ ...n, edition: { ...n.edition, id: editionKey(event, n.edition) } }));
    for (const [key, year] of editionSeasons(own, filmYear)) out.set(key, sources.seasons[key]?.year ?? year);
  }
  return out;
}

const titleIn = (films: ResearchedFilm[], imdb: string) => {
  const f = films.find((x) => x.ok && x.imdb === imdb);
  return f?.ok ? f.facts.title : undefined;
};

function parseYears(argv: string[]): number[] {
  const i = argv.indexOf("--years");
  const spec = i >= 0 ? argv[i + 1] : "2012-2026";
  const m = spec.match(/^(\d{4})(?:-(\d{4}))?$/);
  if (!m) throw new Error(`--years takes 2012-2026 or 2024, not "${spec}"`);
  const [from, to] = [Number(m[1]), Number(m[2] ?? m[1])];
  return Array.from({ length: to - from + 1 }, (_, k) => from + k);
}

async function main() {
  const argv = process.argv.slice(2);
  checkArgs(argv, { flags: ["--survey", "--dry-run", "--refresh", "--offline"], values: ["--award", "--years"] });
  const survey = argv.includes("--survey");
  const dryRun = argv.includes("--dry-run");
  const offline = argv.includes("--offline");
  const years = parseYears(argv);
  const sources = sourcesSchema.parse(JSON.parse(readFileSync(SOURCES, "utf8")));
  const absentKeys = (JSON.parse(readFileSync(CRITICS_SOURCES, "utf8")) as { absent: Record<string, string> }).absent;
  const registry = awardsFileSchema.parse(JSON.parse(readFileSync(`${DATA_DIR}/awards.json`, "utf8")));
  const i = argv.indexOf("--award");
  const wanted = i >= 0 ? argv[i + 1].split(",") : Object.keys(survey ? sources.events : sources.labels);
  for (const w of wanted) {
    if (!sources.events[w]) throw new Error(`No IMDb event for "${w}" in ${SOURCES}.`);
    if (!registry.some((a) => a.slug === w)) throw new Error(`No award "${w}" in data/awards.json.`);
    if (!survey && !sources.labels[w]) throw new Error(`No label map for "${w}" in ${SOURCES}: run --survey and add one.`);
  }
  const imdbFetcher = createFetcher({ cacheDir: ".cache/imdb", refresh: argv.includes("--refresh"), offline, minIntervalMs: 400 });
  const wiki = createFetcher({ cacheDir: ".cache/wiki", offline });
  const token = offline ? undefined : readEnvFile(".env.test").TMDB_READ_TOKEN;
  const tmdb = token ? { fetcher: createFetcher({ cacheDir: ".cache/tmdb", offline }), token } : undefined;

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
  const agreement: string[] = [];
  for (const slug of wanted) {
    const award = registry.find((a) => a.slug === slug)!;
    const { titles, nominations } = await collect(imdbFetcher, sources.events[slug]);
    const filmYear = (tt: string) => appYear.get(tt) ?? titles.get(tt)?.year;
    const seasons = seasonsOf(nominations, filmYear, sources);
    const labels = sources.labels[slug] ?? {};

    if (survey) {
      console.log(`\n${slug} (${sources.events[slug].join(", ")}): ${titles.size} titles, ${nominations.length} nominations`);
      const counts = new Map<string, { n: number; years: Set<number>; won: number }>();
      for (const n of nominations) {
        const c = counts.get(labelOf(n)) ?? { n: 0, years: new Set<number>(), won: 0 };
        counts.set(labelOf(n), c);
        c.n++;
        if (n.won) c.won++;
        c.years.add(n.edition.year);
      }
      for (const [l, c] of [...counts].sort((a, b) => b[1].n - a[1].n)) {
        const ys = [...c.years].sort();
        console.log(`  ${labels[l] ? `→ ${labels[l].padEnd(14)}` : "                "} ${JSON.stringify(l)}: ${c.n} (${c.won} won), ${ys[0]}–${ys[ys.length - 1]}`);
      }
      const editions = new Map<string, number>();
      for (const n of nominations) editions.set(editionKey(n.event, n.edition), (editions.get(editionKey(n.event, n.edition)) ?? 0) + 1);
      console.log(`  editions: ${[...editions.keys()].sort().map((k) => `${k}→${seasons.get(k)}${sources.seasons[k] ? "!" : ""}`).join(", ")}`);
      continue;
    }

    const titleOf = (tt: string) => appTitle.get(tt) ?? titles.get(tt)?.title ?? tt;
    const byYear = mapNominations(nominations, labels, seasons, titleOf);
    const perEdition = new Map<number, Set<string>>();
    for (const [y, rows] of byYear) perEdition.set(y, new Set(rows.map((r) => r.edition)));
    for (const [y, eds] of perEdition) {
      const byEvent = new Map<string, number>();
      for (const e of eds) byEvent.set(e.split("/")[0], (byEvent.get(e.split("/")[0]) ?? 0) + 1);
      if ([...byEvent.values()].some((n) => n > 1)) problems.push(`${slug} ${y}: two IMDb editions of one event honour ${y} films (${[...eds].join(", ")}): check \`seasons\``);
    }

    let compared = 0;
    let winnersAgree = 0;
    let nomineeLists = 0;
    let nomineesAgree = 0;
    const differences: string[] = [];
    for (const year of years) {
      const label = `${slug} ${year}`;
      const leftOut: Array<{ title: string; reason: string }> = [];
      let rows = byYear.get(year) ?? [];
      rows = rows.filter((r) => {
        const out = sources.leaveOut[`${slug} ${year} ${r.imdb}`];
        if (out) {
          leftOut.push({ title: r.title, reason: out.note ?? out.why });
          return false;
        }
        const type = titles.get(r.imdb)?.type;
        if (!appYear.has(r.imdb) && type && !FEATURE_TYPES.has(type)) {
          problems.push(`${label}: skipped ${r.title} (${r.imdb}, ${type}) in ${r.category}`);
          return false;
        }
        return true;
      });
      const unknown = new Map(rows.filter((r) => !appYear.has(r.imdb)).map((r) => [r.imdb, r.title]));
      if (unknown.size > 0) {
        const films = await researchImdbFilms(wiki, unknown, tmdb);
        const usable = [...films.values()].filter((f) => {
          if (!f.ok) {
            problems.push(`${label}: left out ${f.link.text} (${f.reason}); add to leaveOut`);
            return false;
          }
          if (f.short || f.series) {
            problems.push(`${label}: left out ${f.facts.title} (${f.imdb}): ${f.short ? "a short" : "a series"} on Wikidata/TMDB; add to leaveOut`);
            return false;
          }
          return true;
        });
        const usableIds = new Set(usable.map((f) => (f.ok ? f.imdb : "")));
        for (const r of rows) if (unknown.has(r.imdb) && !usableIds.has(r.imdb)) leftOut.push({ title: r.title, reason: "no film record could be matched" });
        rows = rows.filter((r) => !unknown.has(r.imdb) || usableIds.has(r.imdb));
        if (!dryRun) {
          const added = addMovies(DATA_DIR, year, usable.flatMap((f) => (f.ok ? [{ imdb: f.imdb, wd: f.wd, facts: f.facts }] : [])));
          if (added.added.length > 0) console.log(`${label}: ${added.added.length} new films`);
          refresh();
        }
        rows = rows.map((r) => ({ ...r, title: appTitle.get(r.imdb) ?? titleIn(usable, r.imdb) ?? r.title }));
      }
      const absent = new Set(Object.keys(absentKeys).filter((k) => k.startsWith(`${slug}/${year}/`)).map((k) => k.split("/")[2]));
      const existing = readEdition(DATA_DIR, slug, year);
      const honorees = new Set(Object.keys(sources.honorees).filter((k) => k.startsWith(`${slug}/`)).map((k) => k.split("/")[1]));
      const out = mergeImdb({ award, year, existing, rows, absent, honorees, leftOut });
      problems.push(...out.problems);
      for (const c of out.compared) {
        compared++;
        if (c.winnersAgree) winnersAgree++;
        if (c.nomineesAgree !== null) nomineeLists++;
        if (c.nomineesAgree) nomineesAgree++;
        if (c.detail) differences.push(`${label} ${c.category}: ${c.detail}`);
      }
      const before = existing ? JSON.stringify(existing) : "";
      if (!dryRun) writeEdition(DATA_DIR, out.edition);
      const after = JSON.stringify(readEdition(DATA_DIR, slug, year) ?? out.edition);
      const counts = award.categories.map((c) => `${c.slug} ${out.edition.results.filter((r) => r.category === c.slug).length}`).join(", ");
      console.log(`${label}: ${out.edition.status}; ${counts}${out.changed.length > 0 ? `; IMDb: ${out.changed.join(", ")}` : ""}${!dryRun && before !== after ? " (written)" : ""}`);
    }
    if (compared > 0) {
      agreement.push(`${slug}: winners agree in ${winnersAgree} of ${compared} categories; nominee lists agree in ${nomineesAgree} of ${nomineeLists}`);
      for (const d of differences) agreement.push(`  - ${d}`);
    }
  }

  if (agreement.length > 0) {
    console.log("\nAgreement with Wikipedia (categories both list):");
    for (const a of agreement) console.log(a);
  }
  if (problems.length > 0) {
    console.log(`\n${problems.length} to look at:`);
    for (const p of problems) console.log(`- ${p}`);
  }
  console.log(`${imdbFetcher.requests} IMDb requests, ${wiki.requests} Wikidata requests.`);
}

if (process.argv[1] && /research\/imdb\.ts$/.test(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
