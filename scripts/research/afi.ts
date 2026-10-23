// `npx tsx scripts/research/afi.ts [--years 2012-2026] [--refresh] [--offline]`
// (IMPLEMENTATION_PLAN.md §3.4, task 2.3): the AFI Awards Top 10 films for each year, into
// `data/editions/afi/<year>.json`, and the facts of every new film into `data/movies/<year>.json`.
// - The AFI Top 10 is a selection, not a prize (product plan §3.1): each film on the list is a
//   `nominated` row in the `top-10` category, and there is no winner. The AFI Special Award (a
//   film outside the list, or a television series) is left out.
// - Source: Wikipedia's "American Film Institute Awards" article, one section per year with a
//   "Top 10 Films" list (11 films in 2014). 2012-2018 and 2023 name no date on the page.
// - Dates: the day the list was announced, when the page names it (typed in `sources/majors.json`
//   and checked against that year's section) or the AFI's own press release (listed under
//   `externalDates`). A year with no date known has none; the AFI isn't a prize, so its
//   editions need no `winnersOn` and `data:check` does not require `nominationsOn`.
// - A year whose list isn't on the page yet is `no_data`.
import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import type { EditionFile, ResultEntry } from "../../src/lib/data-files";
import { checkArgs, readEnvFile } from "../lib/target";
import { createFetcher } from "./lib/fetcher";
import { filmRef, newFilms, researched, researchFilms, unresolvedReport } from "./lib/films";
import type { FilmLink } from "./lib/tables";
import { fetchPage, titleFromHref } from "./lib/wikipedia";
import { addMovies, movieKey, writeEdition } from "./lib/writer";
import { fixLink, SOURCES, sourcesSchema } from "./majors";

const DATA_DIR = "data";
const ARTICLE = "American Film Institute Awards";

export type AfiYear = { films: FilmLink[]; text: string };

/** The year's section of the article: the films on its "Top 10 Films" list and the section's text. */
export function readAfiYear(html: string, year: number): AfiYear | null {
  const $ = cheerio.load(html);
  const heading = $(".mw-heading2")
    .toArray()
    .find((el) => $(el).find("h2").text().trim() === String(year));
  if (!heading) return null;
  const section = $("<div></div>").append($(heading).nextUntil(".mw-heading2").clone());
  section.find("sup.reference, style").remove();
  const list = section
    .find("h3")
    .toArray()
    .find((h) => /^Top \d+ Films$/.test($(h).text().trim()));
  if (!list) return null;
  const films = $(list)
    .closest(".mw-heading")
    .next("ul")
    .children("li")
    .toArray()
    .map((li): FilmLink => {
      const a = $(li).find("i a").first();
      const href = a.attr("href") ?? "";
      const red = a.hasClass("new") || href.includes("redlink=1");
      const text = (a.length > 0 ? a.text() : $(li).find("i").first().text() || $(li).text()).replace(/\s+/g, " ").trim();
      return { article: a.length > 0 && !red ? titleFromHref(href) : null, text };
    });
  return { films, text: section.text().replace(/\s+/g, " ") };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Whether the section's text names this day ("December 4, 2019"). */
export function sectionMentions(text: string, day: string): boolean {
  const [y, m, d] = day.split("-").map(Number);
  return text.includes(`${MONTHS[m - 1]} ${d}, ${y}`);
}

async function main() {
  const argv = process.argv.slice(2);
  checkArgs(argv, { flags: ["--refresh", "--offline"], values: ["--years"] });
  const spec = argv[argv.indexOf("--years") + 1] ?? "2012-2026";
  const m = argv.includes("--years") ? spec.match(/^(\d{4})(?:-(\d{4}))?$/) : ["", "2012", "2026"];
  if (!m) throw new Error(`--years takes 2012-2026 or 2024, not "${spec}"`);
  const [from, to] = [Number(m[1]), Number(m[2] ?? m[1])];
  const sources = sourcesSchema.parse(JSON.parse(readFileSync(SOURCES, "utf8")));
  const fetcher = createFetcher({ cacheDir: ".cache/wiki", refresh: argv.includes("--refresh"), offline: argv.includes("--offline") });
  const token = readEnvFile(".env.test").TMDB_READ_TOKEN;
  const tmdb = token ? { fetcher: createFetcher({ cacheDir: ".cache/tmdb", offline: argv.includes("--offline") }), token } : undefined;
  const page = await fetchPage(fetcher, ARTICLE);
  const problems: string[] = [];

  for (let year = from; year <= to; year++) {
    const label = `afi ${year}`;
    const found = readAfiYear(page.html, year);
    if (!found) {
      const edition: EditionFile = {
        award: "afi",
        year,
        status: "no_data",
        sourceUrls: [],
        note: `The AFI Awards for ${year} have not been announced yet (early December ${year}).`,
        results: [],
        screenings: [],
      };
      if (year <= new Date().getFullYear() - 1) problems.push(`${label}: no section on the page, written as no_data`);
      writeEdition(DATA_DIR, edition);
      console.log(`${label}: no_data`);
      continue;
    }
    const nominationsOn = sources.nominationsOn.afi?.[String(year)];
    if (!nominationsOn) problems.push(`${label}: no announcement date in ${SOURCES} (none on the page, none found)`);
    else if (!sources.externalDates[`afi/${year}`] && !sectionMentions(found.text, nominationsOn)) {
      problems.push(`${label}: the page doesn't mention ${nominationsOn}`);
    }
    if (found.films.length < 10 || found.films.length > 11) problems.push(`${label}: ${found.films.length} films listed, expected 10 (11 in 2014)`);

    const links = found.films.map((l) => fixLink(l, sources));
    const films = await researchFilms(fetcher, links, tmdb);
    const rows = new Map<string, ResultEntry>();
    for (const link of links) {
      const film = researched(films, link);
      rows.set(film.ok ? movieKey(film) : `title:${link.text}`, { category: "top-10", ...filmRef(film), outcome: "nominated" });
    }
    const movies = addMovies(DATA_DIR, year, newFilms(films));
    for (const f of films.values()) if (f.ok && !f.imdb) problems.push(`${label}: check ${f.link.text} → ${f.wd} has no IMDb ID`);
    for (const line of unresolvedReport(films)) problems.push(`${label}: unresolved ${line}`);

    const edition: EditionFile = {
      award: "afi",
      year,
      status: "loaded",
      ...(nominationsOn ? { nominationsOn } : {}),
      sourceUrls: [page.url],
      ...(nominationsOn ? {} : { note: "The announcement date is not on Wikipedia and has not been found." }),
      results: [...rows.values()],
      screenings: [],
    };
    writeEdition(DATA_DIR, edition);
    console.log(`${label}: loaded; ${rows.size} films; ${movies.added.length} new films${nominationsOn ? "" : "; no date"}`);
  }

  if (problems.length > 0) {
    console.log(`\n${problems.length} to look at:`);
    for (const p of problems) console.log(`- ${p}`);
  }
  console.log(`${fetcher.requests} Wikipedia/Wikidata requests.`);
}

if (process.argv[1] && /afi\.ts$/.test(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
