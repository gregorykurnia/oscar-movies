// Facts fetcher (IMPLEMENTATION_PLAN.md §3.4): the `data/movies/<year>.json` entry of a
// resolved film, from Wikidata (CC0) first and TMDB where Wikidata has no answer. The title
// (P1476) is the film's own when it is in English ("Wallace & Gromit", not the label's
// "Wallace and Gromit"); otherwise the English label is the title and P1476 is kept as the
// original title when it differs. Countries (P495)
// become ISO 3166-1 codes through each country's P297, main country first; the language
// (P364) becomes its ISO 639-1 code (639-3 when there is none).
import type { MovieEntry } from "../../../src/lib/data-files";
import type { Fetcher } from "./fetcher";
import type { ResolvedFilm } from "./resolve";
import { entityIds, firstMonolingual, getClaimString, P, type Entity } from "./wikidata";

export type Facts = Omit<MovieEntry, "slug">;

export type TmdbOptions = { fetcher: Fetcher; token: string };

/** Strips a Wikipedia disambiguator: `Flow (2024 film)` → `Flow`. */
export function plainTitle(title: string): string {
  return title.replace(/\s+\((?:\d{4} )?(?:[\w' -]+ )?film\)$/i, "").trim();
}

function englishTitle(entity: Entity, fallback: string): string {
  return entity.labels?.en?.value ?? plainTitle(entity.sitelinks?.enwiki?.title ?? fallback);
}

/** Wikidata writes `pt-br`; BCP 47's usual form is `pt-BR` (a region subtag in capitals). */
export function bcp47(tag: string): string {
  return tag
    .split("-")
    .map((part, i) => (i > 0 && /^[a-z]{2}$/i.test(part) ? part.toUpperCase() : part.toLowerCase()))
    .join("-");
}

async function countryCodes(fetcher: Fetcher, entity: Entity): Promise<string[]> {
  const codes: string[] = [];
  for (const id of entityIds(entity, P.country)) {
    const code = await getClaimString(fetcher, id, P.iso3166alpha2);
    // Countries that no longer exist (Yugoslavia) have no current code; they're skipped.
    if (code && /^[A-Z]{2}$/.test(code) && !codes.includes(code)) codes.push(code);
  }
  return codes;
}

async function languageCode(fetcher: Fetcher, entity: Entity): Promise<string | undefined> {
  const [id] = entityIds(entity, P.language);
  if (!id) return undefined;
  return (await getClaimString(fetcher, id, P.iso639_1)) ?? (await getClaimString(fetcher, id, P.iso639_3));
}

type TmdbFind = { movie_results?: Array<{ id: number; original_language?: string }> };
type TmdbMovie = { origin_country?: string[]; production_countries?: Array<{ iso_3166_1: string }>; original_language?: string };

/** TMDB's answer for the facts Wikidata lacks: its ID, countries and language. */
async function fromTmdb(tmdb: TmdbOptions, imdb: string | undefined, knownId: number | undefined): Promise<{ tmdb?: number; countries?: string[]; language?: string }> {
  const headers = { Authorization: `Bearer ${tmdb.token}` };
  let id = knownId;
  let language: string | undefined;
  const find = async () => {
    if (!imdb) return undefined;
    const found = await tmdb.fetcher.getJson<TmdbFind>(
      `https://api.themoviedb.org/3/find/${imdb}?external_source=imdb_id`,
      { headers, label: `tmdb-find-${imdb}` },
    );
    return found.movie_results?.[0];
  };
  if (id === undefined) {
    const first = await find();
    if (!first) return {};
    id = first.id;
    language = first.original_language;
  }
  const load = (movieId: number) => tmdb.fetcher.getJson<TmdbMovie>(`https://api.themoviedb.org/3/movie/${movieId}`, { headers, label: `tmdb-movie-${movieId}` });
  let movie: TmdbMovie;
  try {
    movie = await load(id);
  } catch (error) {
    // Wikidata's TMDB ID can be stale (a record merged or deleted): ask by IMDb ID, else go without.
    if (!(error instanceof Error && /\b404\b/.test(error.message)) || knownId === undefined) throw error;
    const first = await find();
    if (!first) return {};
    id = first.id;
    language = first.original_language;
    movie = await load(id);
  }
  const countries = [...(movie.origin_country ?? []), ...(movie.production_countries ?? []).map((c) => c.iso_3166_1)]
    .filter((c, i, all) => /^[A-Z]{2}$/.test(c) && all.indexOf(c) === i);
  return { tmdb: id, countries, language: movie.original_language ?? language };
}

/**
 * Facts for one resolved film. TMDB is asked only when a token is given and Wikidata is
 * missing the TMDB ID, the countries or the language.
 */
export async function fetchFacts(
  fetcher: Fetcher,
  film: ResolvedFilm,
  fallbackTitle: string,
  tmdb?: TmdbOptions,
): Promise<Facts> {
  const original = firstMonolingual(film.entity, P.title);
  const originalIsEnglish = original !== undefined && /^en(-|$)/i.test(original.language);
  const title = originalIsEnglish ? original.text : englishTitle(film.entity, fallbackTitle);
  let countries = await countryCodes(fetcher, film.entity);
  let language = await languageCode(fetcher, film.entity);
  let tmdbId = film.tmdb;

  if (tmdb && (tmdbId === undefined || countries.length === 0 || language === undefined)) {
    const extra = await fromTmdb(tmdb, film.imdb, tmdbId);
    tmdbId ??= extra.tmdb;
    if (countries.length === 0) countries = extra.countries ?? [];
    language ??= extra.language;
  }

  const facts: Facts = { title, countries };
  if (original && !originalIsEnglish && original.text !== title) {
    facts.originalTitle = original.text;
    facts.originalLang = bcp47(original.language);
  }
  if (language) facts.language = language;
  facts.wd = film.wd;
  if (tmdbId !== undefined) facts.tmdb = tmdbId;
  return facts;
}
