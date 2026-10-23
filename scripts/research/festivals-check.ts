// `npx tsx scripts/research/festivals-check.ts [--write] [--refresh] [--offline]`
// (IMPLEMENTATION_PLAN.md task 2.4's Done when: each festival's winners match Wikipedia's for every
// year): reads the winners (and Toronto's runners-up) from a second place on Wikipedia and compares
// them with what `festivals.ts` loaded, by IMDb ID (or by title where the second source doesn't link the film).
// - Cannes, Venice, Berlin: the year page's prize lines ("Palme d'Or: Anora by Sean Baker"); the import read
//   the prizes' own articles.
// - Sundance: "List of Sundance Film Festival award winners"; the import read each year's page (the list
//   fills in 2019's Audience Awards, which the page lacks, so those have one source only).
// - Toronto: the "People's Choice Award" article's table (the film prize and its runners-up); the documentary
//   and international prizes have no second source.
// `--write` saves what the second source says to `sources/festival-winners.json`, which
// `festival-winners.test.ts` holds the data files to. Exits 1 on any disagreement.
import { readFileSync, writeFileSync } from "node:fs";
import { readDataSet } from "../lib/data-check";
import { checkArgs } from "../lib/target";
import { FESTIVALS, PAGE_LABELS, SOURCES, SUNDANCE_LIST, sourcesFestivalSchema } from "./festivals";
import { readPrizeLines, readSundanceListYear, sundanceCategory } from "./lib/festival-pages";
import { createFetcher } from "./lib/fetcher";
import { resolveArticles } from "./lib/resolve";
import { readWikitables, type FilmLink } from "./lib/tables";
import { fetchPage } from "./lib/wikipedia";
import { fixLink, loose } from "./majors";

export const WINNERS_FILE = "scripts/research/sources/festival-winners.json";
/** award → category → film year → the IMDb IDs (or QIDs) the second source gives; Toronto's runners-up are under "<category>:runner_up". */
export type FestivalWinnersFile = Record<string, Record<string, Record<string, string[]>>>;

export const TIFF_ARTICLE = "Toronto International Film Festival People's Choice Award";
const FIRST = 2012;
const LAST = 2026;

/** Headings of the year page's other sections, whose prizes share a name with the main ones ("Jury Prize" in Un Certain Regard). */
const SIDE_SECTIONS = /certain regard|short|cinéfondation|orizzonti|critics|caméra|perspectives|generation|forum|panorama|independent|parallel|immersive/i;

type Theirs = { link: FilmLink; text: string };

async function main() {
  const argv = process.argv.slice(2);
  checkArgs(argv, { flags: ["--write", "--refresh", "--offline"] });
  const fetcher = createFetcher({ cacheDir: ".cache/wiki", refresh: argv.includes("--refresh"), offline: argv.includes("--offline") });
  const { data, errors } = readDataSet("data");
  if (errors.length > 0) throw new Error(`The data files fail the checks:\n- ${errors.join("\n- ")}`);
  const editions = new Map(data.editions.map((e) => [`${e.edition.award}/${e.edition.year}`, e.edition]));
  const sources = sourcesFestivalSchema.parse(JSON.parse(readFileSync(SOURCES, "utf8")));
  const problems: string[] = [];
  const notes: string[] = [];
  const out: FestivalWinnersFile = {};
  let compared = 0;

  // Every second-source film, by (award, category-or-category:runner_up, year).
  const theirs = new Map<string, Theirs[]>();
  const add = (award: string, category: string, year: number, link: FilmLink, text: string) => {
    const key = `${award}\u0000${category}\u0000${year}`;
    theirs.set(key, [...(theirs.get(key) ?? []), { link: fixLink(link, sources), text }]);
  };

  for (const f of FESTIVALS.filter((x) => x.lists)) {
    for (let year = FIRST; year <= LAST; year++) {
      if (sources.notHeld[`${f.slug}/${year}`]) continue;
      const lines = readPrizeLines((await fetchPage(fetcher, f.page(year))).html);
      for (const [category, label] of Object.entries(PAGE_LABELS[f.slug])) {
        for (const l of lines.filter((x) => label.test(x.label) && x.film && !SIDE_SECTIONS.test(x.heading))) add(f.slug, category, year, l.film as FilmLink, l.text);
      }
    }
  }
  const list = await fetchPage(fetcher, SUNDANCE_LIST);
  for (let year = FIRST; year <= LAST; year++) {
    for (const l of readSundanceListYear(list.html, year)) {
      const category = sundanceCategory(l.heading, l.label);
      if (category && l.film) add("sundance", category, year, l.film, l.text);
    }
  }
  const tiff = await fetchPage(fetcher, TIFF_ARTICLE);
  for (const table of readWikitables(tiff.html)) {
    if (!/^Year$/i.test(table.headers[0] ?? "")) continue;
    const film = table.headers.findIndex((h) => /^Film$/i.test(h));
    let last = 0;
    for (const row of table.rows) {
      const year = Number(row[0]?.text.match(/^(\d{4})/)?.[1]);
      const cell = row[film];
      if (!year || !cell?.text || year < FIRST || year > LAST) continue;
      const first = year !== last;
      last = year;
      // A year's first row is the winner (bold), the next two the first and second runners-up.
      add("tiff", first ? "peoples-choice" : "peoples-choice:runner_up", year, cell.film ?? cell.links[0] ?? { article: null, text: cell.text }, cell.text);
    }
  }

  const articles = [...theirs.values()].flatMap((l) => l.flatMap((t) => (t.link.article && !t.link.wd ? [t.link.article] : [])));
  const resolved = await resolveArticles(fetcher, articles);

  const pairs = FESTIVALS.flatMap((f) => (data.awards.find((a) => a.slug === f.slug)?.categories ?? []).map((c) => [f.slug, c.slug] as const));
  for (const [award, category] of pairs) {
    for (let year = FIRST; year <= LAST; year++) {
      const edition = editions.get(`${award}/${year}`);
      if (!edition || edition.status === "no_data") continue;
      for (const kind of category === "peoples-choice" ? ["", ":runner_up"] : [""]) {
        const label = `${award} ${year} ${category}${kind}`;
        const outcome = kind ? "runner_up" : "won";
        const ours = edition.results.filter((r) => r.category === category && r.outcome === outcome);
        const second = theirs.get(`${award}\u0000${category}${kind}\u0000${year}`);
        if (!second) {
          if (ours.length > 0) notes.push(`${label}: one source only`);
          continue;
        }
        const ids: string[] = [];
        let agree = ours.length === second.length;
        for (const t of second) {
          const r = t.link.wd ? undefined : t.link.article ? resolved.get(t.link.article) : undefined;
          const id = r?.ok ? (r.film.imdb ?? r.film.wd) : undefined;
          const byId = id !== undefined && ours.some((o) => o.imdb === id || o.wd === id);
          const byTitle = ours.some((o) => {
            const a = loose(o.title);
            const b = loose(t.link.text);
            return b.length > 0 && (a.includes(b) || b.includes(a));
          });
          if (!byId && !byTitle) agree = false;
          const match = ours.find((o) => o.imdb === id || o.wd === id) ?? ours.find((o) => loose(o.title).includes(loose(t.link.text)) || loose(t.link.text).includes(loose(o.title)));
          if (match) ids.push((match.imdb ?? match.wd) as string);
        }
        compared++;
        if (!agree) problems.push(`${label}: the second source gives ${second.map((t) => t.link.text).join(", ")}, the data has ${ours.map((o) => o.title).join(", ") || "none"}`);
        else {
          out[award] ??= {};
          out[award][`${category}${kind}`] ??= {};
          out[award][`${category}${kind}`][String(year)] = ids;
        }
      }
    }
  }

  if (argv.includes("--write") && problems.length === 0) {
    const lines = Object.entries(out).map(
      ([award, cats]) =>
        `  ${JSON.stringify(award)}: {\n${Object.entries(cats)
          .map(([c, years]) => `    ${JSON.stringify(c)}: { ${Object.entries(years).map(([y, ids]) => `"${y}": ${JSON.stringify(ids)}`).join(", ")} }`)
          .join(",\n")}\n  }`,
    );
    writeFileSync(WINNERS_FILE, `{\n${lines.join(",\n")}\n}\n`);
    console.log(`Wrote ${WINNERS_FILE}.`);
  }
  for (const n of notes) console.log(`  note: ${n}`);
  for (const p of problems) console.log(`- ${p}`);
  console.log(`${compared} festival categories and years compared; ${problems.length} problem(s). ${fetcher.requests} requests.`);
  if (problems.length > 0) process.exit(1);
}

if (process.argv[1] && /festivals-check\.ts$/.test(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

export const readFestivalWinners = (): FestivalWinnersFile => JSON.parse(readFileSync(WINNERS_FILE, "utf8")) as FestivalWinnersFile;
