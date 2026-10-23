// `npx tsx scripts/research/majors-check.ts [--write] [--refresh] [--offline]`
// (IMPLEMENTATION_PLAN.md task 2.2's Done when: each award's winners match Wikipedia's for every
// year): reads the winners from a second place on Wikipedia, the award's own category article
// ("BAFTA Award for Best Film" and so on, one row per nominee with the winner in bold), and
// compares them with the winners `majors.ts` read off each ceremony's page, by IMDb ID.
// `--write` saves what the category articles say to `sources/major-winners.json`, which
// `major-winners.test.ts` holds the data files to. Exits 1 on any disagreement.
import { readFileSync, writeFileSync } from "node:fs";
import { checkArgs } from "../lib/target";
import { readDataSet } from "../lib/data-check";
import { createFetcher } from "./lib/fetcher";
import { resolveArticles } from "./lib/resolve";
import { readWikitables } from "./lib/tables";
import { fetchPage } from "./lib/wikipedia";

export const WINNERS_FILE = "scripts/research/sources/major-winners.json";

/** The category article that lists every year's nominees and winner. */
export const ARTICLES: Array<{ award: string; category: string; article: string }> = [
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
];

/** award → category → film year → the winners' IMDb IDs (or QIDs), as the category articles give them. */
export type WinnersFile = Record<string, Record<string, Record<string, string[]>>>;

const FIRST = 2012;
const LAST = 2025;

async function main() {
  const argv = process.argv.slice(2);
  checkArgs(argv, { flags: ["--write", "--refresh", "--offline"] });
  const fetcher = createFetcher({ cacheDir: ".cache/wiki", refresh: argv.includes("--refresh"), offline: argv.includes("--offline") });
  const { data, errors } = readDataSet("data");
  if (errors.length > 0) throw new Error(`The data files fail the checks:\n- ${errors.join("\n- ")}`);
  const editions = new Map(data.editions.map((e) => [`${e.edition.award}/${e.edition.year}`, e.edition]));

  const fromArticles: WinnersFile = {};
  const problems: string[] = [];
  let compared = 0;

  for (const { award, category, article } of ARTICLES) {
    const page = await fetchPage(fetcher, article);
    // Rows by year: the film cell of each row, bold for the winner.
    const winners = new Map<number, Array<{ article: string | null; text: string }>>();
    const years = new Set<number>();
    for (const table of readWikitables(page.html)) {
      const film = table.headers.findIndex((h) => /^(Film|English title)/i.test(h));
      if (film < 0) continue;
      for (const row of table.rows) {
        const year = Number(row[0]?.text.match(/^(\d{4})/)?.[1]);
        if (!(year >= FIRST && year <= LAST)) continue;
        years.add(year);
        const cell = row[film];
        if (!cell?.bold) continue;
        winners.set(year, [...(winners.get(year) ?? []), { article: cell.film?.article ?? cell.links[0]?.article ?? null, text: cell.text.replace(/\s*[†‡*]+$/, "") }]);
      }
    }
    const articles = [...winners.values()].flatMap((w) => w.flatMap((x) => (x.article ? [x.article] : [])));
    const resolved = await resolveArticles(fetcher, articles);

    for (let year = FIRST; year <= LAST; year++) {
      const label = `${award} ${year} ${category}`;
      const edition = editions.get(`${award}/${year}`);
      const theirs = (winners.get(year) ?? []).map((w) => {
        const r = w.article ? resolved.get(w.article) : undefined;
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
      if (JSON.stringify(ours) !== JSON.stringify(expected)) {
        problems.push(`${label}: the ceremony page gives ${ours.join(", ") || "no winner"}, ${article} gives ${expected.join(", ")} (${theirs.map((t) => t.text).join(", ")})`);
      }
    }
  }

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
