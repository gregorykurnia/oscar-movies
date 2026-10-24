// The step every award script shares: film links read from a page → resolved IDs → facts.
// The award script then turns each film into a result or screening with `filmRef`, and adds
// the new films to `data/movies/` with `addMovies`.
import type { ResultEntry } from "../../../src/lib/data-files";
import { fetchFacts, type Facts, type TmdbOptions } from "./facts";
import type { Fetcher } from "./fetcher";
import { itemsByImdb } from "./imdb";
import { filmOf, resolveArticles, resolveItems } from "./resolve";
import { findOnTmdbByImdb } from "./tmdb-search";
import { isSeries, isShort, releaseYears } from "./wikidata-search";
import type { FilmLink } from "./tables";
import type { NewFilm } from "./writer";

export type ResearchedFilm =
  | { ok: true; link: FilmLink; imdb?: string; wd?: string; facts: Facts; short?: boolean; series?: boolean; /** The median of the release years the source gives (one wrong date doesn't move it). */ released?: number }
  | { ok: false; link: FilmLink; reason: string };

function medianYear(years: number[]): number | undefined {
  if (years.length === 0) return undefined;
  const sorted = [...years].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const linkId = (link: FilmLink) => (link.wd ? `wd:${link.wd}` : (link.article ?? `text:${link.text}`));

/**
 * Researches each distinct film link once. The map is keyed by the link's article (or its
 * text, for a link that leads nowhere); use `researched(map, link)` to look one up.
 */
export async function researchFilms(
  fetcher: Fetcher,
  links: FilmLink[],
  tmdb?: TmdbOptions,
): Promise<Map<string, ResearchedFilm>> {
  const articles = [...new Set(links.flatMap((l) => (l.article && !l.wd ? [l.article] : [])))];
  const resolutions = await resolveArticles(fetcher, articles);
  const items = await resolveItems(fetcher, links.flatMap((l) => (l.wd ? [l.wd] : [])));
  const out = new Map<string, ResearchedFilm>();
  for (const link of links) {
    const id = linkId(link);
    if (out.has(id)) continue;
    const resolution = link.wd ? items.get(link.wd) : link.article ? resolutions.get(link.article) : undefined;
    if (!resolution) {
      out.set(id, { ok: false, link, reason: "no Wikipedia article (red link or plain text)" });
    } else if (!resolution.ok) {
      out.set(id, { ok: false, link, reason: resolution.reason });
    } else {
      const { film } = resolution;
      const facts = await fetchFacts(fetcher, film, link.text, tmdb);
      out.set(id, { ok: true, link, imdb: film.imdb, wd: film.wd, facts, short: isShort(film.entity), series: isSeries(film.entity), released: medianYear(releaseYears(film.entity)) });
    }
  }
  return out;
}

export function researched(map: Map<string, ResearchedFilm>, link: FilmLink): ResearchedFilm {
  const found = map.get(linkId(link));
  if (!found) throw new Error(`"${link.text}" was not researched.`);
  return found;
}

/**
 * How a result or screening names the film: its IMDb ID (or QID when it has none), else its
 * title as the page shows it with `unresolved: true`.
 */
export function filmRef(film: ResearchedFilm): Pick<ResultEntry, "imdb" | "wd" | "title" | "unresolved"> {
  if (!film.ok) return { title: film.link.text, unresolved: true };
  if (film.imdb) return { imdb: film.imdb, title: film.facts.title };
  if (!film.wd) throw new Error(`${film.facts.title} has neither an IMDb ID nor a Wikidata item.`);
  return { wd: film.wd, title: film.facts.title };
}

/** The resolved films, ready for `addMovies`. */
export function newFilms(map: Map<string, ResearchedFilm>): NewFilm[] {
  return [...map.values()].flatMap((f) => (f.ok ? [{ imdb: f.imdb, wd: f.wd, facts: f.facts }] : []));
}

/** One line per unresolved film, for the script's report. */
export function unresolvedReport(map: Map<string, ResearchedFilm>): string[] {
  return [...map.values()].flatMap((f) => (f.ok ? [] : [`${f.link.text}: ${f.reason}`]));
}

/**
 * Facts for films named by IMDb ID (an IMDb award list, DOC NYC matched on IMDb): the Wikidata
 * item with that P345 first, else TMDB's record of the ID. `titles` holds the name the source
 * gives, used when neither has one. A film neither knows comes back not ok, with the reason.
 */
export async function researchImdbFilms(
  fetcher: Fetcher,
  titles: Map<string, string>,
  tmdb?: TmdbOptions,
): Promise<Map<string, ResearchedFilm>> {
  const items = await itemsByImdb(fetcher, [...titles.keys()]);
  const out = new Map<string, ResearchedFilm>();
  for (const [imdb, text] of titles) {
    const link = { article: null, text };
    const entity = items.get(imdb);
    if (entity) {
      const film = { ...filmOf(entity.sitelinks?.enwiki?.title ?? entity.id, entity.sitelinks?.enwiki?.title ?? entity.id, entity), imdb };
      const facts = await fetchFacts(fetcher, film, text, tmdb);
      out.set(imdb, { ok: true, link, imdb, wd: film.wd, facts, short: isShort(entity), series: isSeries(entity), released: medianYear(releaseYears(entity)) });
      continue;
    }
    const hit = tmdb ? await findOnTmdbByImdb(tmdb, imdb, text) : null;
    if (hit?.ok) out.set(imdb, { ok: true, link, imdb, facts: hit.facts, short: hit.short, released: hit.released });
    else out.set(imdb, { ok: false, link, reason: hit ? hit.reason : "no Wikidata item and no TMDB token" });
  }
  return out;
}
