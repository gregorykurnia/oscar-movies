// `npx tsx scripts/research/majors-check.ts [--write] [--refresh] [--offline]`
// (IMPLEMENTATION_PLAN.md tasks 2.2 and 2.3's Done when: each award's winners match Wikipedia's for
// every year): reads the winners from a second place on Wikipedia, the award's own category article
// ("BAFTA Award for Best Film" and so on, one row per nominee with the winner in bold), and
// compares them with the winners `majors.ts` read off each ceremony's page, by IMDb ID.
// `--write` saves what the category articles say to `sources/major-winners.json`, which
// `major-winners.test.ts` holds the data files to. Exits 1 on any disagreement.
import { readFileSync, writeFileSync } from "node:fs";
import { checkArgs } from "../lib/target";
import { readDataSet } from "../lib/data-check";
import { createFetcher } from "./lib/fetcher";
import { fixLink, ordinal, SOURCES, sourcesSchema } from "./majors";
import { resolveArticles, resolveItems } from "./lib/resolve";
import { readWikitables } from "./lib/tables";
import { fetchPage } from "./lib/wikipedia";

export const WINNERS_FILE = "scripts/research/sources/major-winners.json";

type Article = {
  award: string;
  category: string;
  article: string;
  /** Film year = the article's row year + `offset` (the Spirit's International Film lists the ceremony's year). */
  offset?: number;
  /** Only the tables in sections whose heading matches (the Satellite picture article splits by period). */
  section?: RegExp;
  /** The film years the category was given in (default 2012–2025). */
  years?: [number, number];
};

/** The category article that lists every year's nominees and winner. */
export const ARTICLES: Article[] = [
  { award: "golden-globes", category: "drama", article: "Golden Globe Award for Best Motion Picture – Drama" },
  { award: "golden-globes", category: "musical-comedy", article: "Golden Globe Award for Best Motion Picture – Musical or Comedy" },
  { award: "golden-globes", category: "non-english", article: "Golden Globe Award for Best Motion Picture – Non-English Language" },
  { award: "golden-globes", category: "animated", article: "Golden Globe Award for Best Animated Feature Film" },
  { award: "bafta", category: "film", article: "BAFTA Award for Best Film" },
  { award: "bafta", category: "non-english", article: "BAFTA Award for Best Film Not in the English Language" },
  { award: "bafta", category: "documentary", article: "BAFTA Award for Best Documentary" },
  { award: "bafta", category: "animated", article: "BAFTA Award for Best Animated Film" },
  { award: "actor-awards", category: "cast", article: "Screen Actors Guild Award for Outstanding Performance by a Cast in a Motion Picture" },
  { award: "pga", category: "theatrical", article: "Producers Guild of America Award for Best Theatrical Motion Picture" },
  { award: "pga", category: "documentary", article: "Producers Guild of America Award for Best Documentary Motion Picture" },
  { award: "pga", category: "animated", article: "Producers Guild of America Award for Best Animated Motion Picture" },
  { award: "dga", category: "feature", article: "Directors Guild of America Award for Outstanding Directing – Feature Film" },
  { award: "dga", category: "documentary", article: "Directors Guild of America Award for Outstanding Directing – Documentaries" },
  // Task 2.3. (Satellite's Drama and Comedy or Musical lists stop at 2024: the article has no 2025 row yet.) (The European Film Awards and Cinema Eye have no second article of this kind: see `EFA_SECTIONS`.)
  { award: "annie", category: "feature", article: "Annie Award for Best Animated Feature" },
  { award: "annie", category: "indie-feature", article: "Annie Award for Best Animated Feature – Independent", years: [2015, 2025] },
  { award: "spirit-awards", category: "feature", article: "Independent Spirit Award for Best Feature" },
  { award: "spirit-awards", category: "international", article: "Independent Spirit Award for Best International Film", offset: -1 },
  { award: "spirit-awards", category: "documentary", article: "Independent Spirit Award for Best Documentary Feature" },
  { award: "satellite", category: "picture", article: "Satellite Award for Best Motion Picture", section: /^Motion Picture/, years: [2012, 2017] },
  { award: "satellite", category: "drama", article: "Satellite Award for Best Motion Picture", section: /^Drama/, years: [2018, 2024] },
  { award: "satellite", category: "comedy-musical", article: "Satellite Award for Best Motion Picture", section: /^Comedy or Musical/, years: [2018, 2024] },
  { award: "satellite", category: "international", article: "Satellite Award for Best Foreign Language Film" },
  { award: "satellite", category: "documentary", article: "Satellite Award for Best Documentary Film" },
  { award: "satellite", category: "animated", article: "Satellite Award for Best Animated or Mixed Media Feature" },
];

/** The sections of a European Film Awards ceremony page that hold each category's nominees (winner first, in bold from 2023). */
export const EFA_SECTIONS: Record<string, RegExp> = {
  film: /^(Best Film|European Film)$/,
  documentary: /^(Best Documentary|Documentary|European Documentary)$/,
  animated: /^(Best Animated Feature Film|Animated Feature|European Animated Feature Film( \d{4})?)$/,
};

/** award → category → film year → the winners' IMDb IDs (or QIDs), as the category articles give them. */
export type WinnersFile = Record<string, Record<string, Record<string, string[]>>>;

const FIRST = 2012;
const LAST = 2025;

/** Disagreements that are the article's link, not the data: "<award> <year> <category>" → why. */
const ACCEPTED: Record<string, string> = {
  "satellite 2019 documentary": "the article links the Up series (Q2716721); the film is 63 Up (tt8929142)",
};

async function main() {
  const argv = process.argv.slice(2);
  checkArgs(argv, { flags: ["--write", "--refresh", "--offline"] });
  const fetcher = createFetcher({ cacheDir: ".cache/wiki", refresh: argv.includes("--refresh"), offline: argv.includes("--offline") });
  const { data, errors } = readDataSet("data");
  if (errors.length > 0) throw new Error(`The data files fail the checks:\n- ${errors.join("\n- ")}`);
  const editions = new Map(data.editions.map((e) => [`${e.edition.award}/${e.edition.year}`, e.edition]));

  const sources = sourcesSchema.parse(JSON.parse(readFileSync(SOURCES, "utf8")));
  const fromArticles: WinnersFile = {};
  const problems: string[] = [];
  let compared = 0;

  for (const { award, category, article, offset = 0, section, years: span = [FIRST, LAST] } of ARTICLES) {
    const page = await fetchPage(fetcher, article);
    // Rows by year: the film cell of each row, bold for the winner.
    const winners = new Map<number, Array<{ article: string | null; wd?: string; text: string }>>();
    const years = new Set<number>();
    for (const table of readWikitables(page.html)) {
      if (section && !section.test(table.section)) continue;
      const named = table.headers.findIndex((h) => /^(Film|English title)/i.test(h));
      const film = named >= 0 ? named : table.headers.findIndex((h) => /^Winner/i.test(h));
      if (film < 0) continue;
      for (const row of table.rows) {
        const rowYear = Number(row[0]?.text.match(/^(\d{4})/)?.[1]);
        const year = rowYear + offset;
        if (!(year >= span[0] && year <= span[1])) continue;
        years.add(year);
        const cell = row[film];
        if (!cell?.bold) continue;
        const link = fixLink(cell.film ?? cell.links[0] ?? { article: null, text: cell.text }, sources);
        winners.set(year, [...(winners.get(year) ?? []), { article: link.article, wd: link.wd, text: cell.text.replace(/\s*[†‡*]+$/, "") }]);
      }
    }
    const articles = [...winners.values()].flatMap((w) => w.flatMap((x) => (x.article && !x.wd ? [x.article] : [])));
    const resolved = await resolveArticles(fetcher, articles);
    const items = await resolveItems(fetcher, [...winners.values()].flatMap((w) => w.flatMap((x) => (x.wd ? [x.wd] : []))));

    for (let year = span[0]; year <= span[1]; year++) {
      const label = `${award} ${year} ${category}`;
      const edition = editions.get(`${award}/${year}`);
      const theirs = (winners.get(year) ?? []).map((w) => {
        const r = w.wd ? items.get(w.wd) : w.article ? resolved.get(w.article) : undefined;
        return { text: w.text, key: r?.ok ? (r.film.imdb ?? r.film.wd) : undefined };
      });
      if (!years.has(year)) {
        problems.push(`${label}: not in ${article}`);
        continue;
      }
      if (theirs.length === 0 || theirs.some((t) => t.key === undefined)) {
        problems.push(`${label}: the article's winner doesn't resolve (${theirs.map((t) => t.text).join(", ") || "none in bold"})`);
        continue;
      }
      (fromArticles[award] ??= {})[category] ??= {};
      fromArticles[award][category][String(year)] = theirs.map((t) => t.key as string);
      const ours = (edition?.results ?? [])
        .filter((r) => r.category === category && r.outcome === "won")
        .map((r) => r.imdb ?? r.wd)
        .sort();
      compared++;
      const expected = theirs.map((t) => t.key as string).sort();
      if (ACCEPTED[label]) fromArticles[award][category][String(year)] = ours as string[];
      if (JSON.stringify(ours) !== JSON.stringify(expected) && !ACCEPTED[label]) {
        problems.push(`${label}: the ceremony page gives ${ours.join(", ") || "no winner"}, ${article} gives ${expected.join(", ")} (${theirs.map((t) => t.text).join(", ")})`);
      }
    }
  }

  // The European Film Awards: the nominees came from the category articles, so the second source is
  // the ceremony page, where the winner's row is shaded gold (2020–2022), bold (2023 on) or just the first row (the older pages).
  const loose = (t: string) => t.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
  const unchecked: string[] = [];
  for (const [category, pattern] of Object.entries(EFA_SECTIONS)) {
    for (let year = FIRST; year <= LAST; year++) {
      const label = `european-film-awards ${year} ${category}`;
      const ours = (editions.get(`european-film-awards/${year}`)?.results ?? []).filter((r) => r.category === category && r.outcome === "won");
      if (ours.length !== 1) {
        problems.push(`${label}: ${ours.length} winners in the data`);
        continue;
      }
      const page = await fetchPage(fetcher, `${ordinal(year - 1987)} European Film Awards`);
      const table = readWikitables(page.html).find((t) => pattern.test(t.section) || pattern.test(t.caption));
      const rows = (table?.rows ?? []).filter((r) => r[0]?.text);
      if (!table || rows.length === 0) {
        unchecked.push(`${label}: not on the ceremony page (the category article is the only source)`);
      } else {
        const cell = (rows.find((r) => r[0].shaded) ?? rows.find((r) => r[0].bold) ?? rows[0])[0];
        const text = cell.text.replace(/\s*[†‡*]+$/, "");
        const resolved = cell.film?.article ? (await resolveArticles(fetcher, [cell.film.article])).get(cell.film.article) : undefined;
        const byId = resolved?.ok ? [resolved.film.imdb, resolved.film.wd].includes(ours[0].imdb ?? ours[0].wd) : false;
        const title = loose(ours[0].title);
        const byTitle = loose(text).length > 0 && (title.includes(loose(text)) || loose(text).includes(title));
        compared++;
        if (!byId && !byTitle) problems.push(`${label}: the ceremony page's first row is "${text}", the data has ${ours[0].title}`);
      }
      (fromArticles["european-film-awards"] ??= {})[category] ??= {};
      fromArticles["european-film-awards"][category][String(year)] = [(ours[0].imdb ?? ours[0].wd) as string];
    }
  }
  for (const u of unchecked) console.log(`  note: ${u}`);

  if (argv.includes("--write") && problems.length === 0) {
    const lines = Object.entries(fromArticles).map(
      ([award, cats]) =>
        `  ${JSON.stringify(award)}: {\n${Object.entries(cats)
          .map(([c, years]) => `    ${JSON.stringify(c)}: { ${Object.entries(years).map(([y, ids]) => `"${y}": ${JSON.stringify(ids)}`).join(", ")} }`)
          .join(",\n")}\n  }`,
    );
    writeFileSync(WINNERS_FILE, `{\n${lines.join(",\n")}\n}\n`);
    console.log(`Wrote ${WINNERS_FILE}.`);
  }
  for (const p of problems) console.log(`- ${p}`);
  console.log(`${compared} award categories and years compared; ${problems.length} problem(s). ${fetcher.requests} requests.`);
  if (problems.length > 0) process.exit(1);
}

if (process.argv[1] && /majors-check\.ts$/.test(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

export const readWinnersFile = (): WinnersFile => JSON.parse(readFileSync(WINNERS_FILE, "utf8")) as WinnersFile;
