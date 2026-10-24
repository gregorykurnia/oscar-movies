// The second place to look for a film Wikidata has no item for (IMPLEMENTATION_PLAN.md §3.4):
// TMDB's search by title, then each candidate's details and credits, judged by the same rule as
// the Wikidata search (`choose`: a film within a year of the film year that agrees on the
// director, or on country and title). A match gives the IMDb ID, which is the film's key in
// `data/`; a film TMDB lists without an IMDb ID is not taken.
import type { Facts, TmdbOptions } from "./facts";
import { bcp47 } from "./facts";
import { choose, type Candidate, type FilmQuery } from "./wikidata-search";

type Search = { results?: Array<{ id: number; release_date?: string }> };
type Details = {
  id: number;
  imdb_id?: string | null;
  title?: string;
  original_title?: string;
  original_language?: string;
  runtime?: number | null;
  release_date?: string;
  origin_country?: string[];
  production_countries?: Array<{ iso_3166_1: string }>;
  credits?: { crew?: Array<{ job?: string; name?: string }> };
};

/** `short`: TMDB gives a running time under 40 minutes. */
export type TmdbFound = { ok: true; imdb: string; tmdb: number; why: string; facts: Facts; short: boolean; released?: number } | { ok: false; reason: string };

/** TMDB's own language codes that aren't ISO 639-1: `cn` is Cantonese, `xx` means none. */
function languageOf(code: string | undefined): string | undefined {
  if (!code || code === "xx") return undefined;
  return code === "cn" ? "yue" : code;
}

const codes = (d: Details) =>
  [...(d.origin_country ?? []), ...(d.production_countries ?? []).map((c) => c.iso_3166_1)].filter(
    (c, i, all) => /^[A-Z]{2}$/.test(c) && all.indexOf(c) === i,
  );

export async function findOnTmdb(tmdb: TmdbOptions, query: FilmQuery): Promise<TmdbFound> {
  const headers = { Authorization: `Bearer ${tmdb.token}` };
  const texts = [...new Set([query.title, query.originalTitle].filter((t): t is string => !!t))];
  const ids = new Set<number>();
  for (const text of texts) {
    // Two pages: a common title ("Motherland") has more than a page of films in other years.
    for (const page of [1, 2]) {
      const found = await tmdb.fetcher.getJson<Search>(
        `https://api.themoviedb.org/3/search/movie?${new URLSearchParams({ query: text, include_adult: "false", ...(page > 1 ? { page: String(page) } : {}) })}`,
        { headers, label: page > 1 ? `tmdb-search-${text}-p${page}` : `tmdb-search-${text}` },
      );
      for (const r of found.results ?? []) {
        const y = Number(r.release_date?.slice(0, 4));
        if (y >= query.year - 1 && y <= query.year + 1) ids.add(r.id);
      }
      if ((found.results ?? []).length < 20) break;
    }
  }
  if (ids.size === 0) return { ok: false, reason: "TMDB search found nothing in those years" };
  const details = new Map<string, Details>();
  for (const id of [...ids].slice(0, 16)) {
    try {
      const d = await tmdb.fetcher.getJson<Details>(`https://api.themoviedb.org/3/movie/${id}?append_to_response=credits`, {
        headers,
        label: `tmdb-movie-credits-${id}`,
      });
      details.set(String(id), d);
    } catch (error) {
      // A search result whose record was merged or deleted since (404) is no candidate.
      if (!(error instanceof Error && /\b404\b/.test(error.message))) throw error;
    }
  }
  const candidates: Candidate[] = [...details.values()].map((d) => ({
    id: String(d.id),
    isFilm: typeof d.imdb_id === "string" && /^tt\d+$/.test(d.imdb_id),
    years: d.release_date ? [Number(d.release_date.slice(0, 4))] : [],
    directors: (d.credits?.crew ?? []).flatMap((c) => (c.job === "Director" && c.name ? [c.name] : [])),
    countries: codes(d),
    titles: [d.title, d.original_title].filter((t): t is string => !!t),
  }));
  const hit = choose(query, candidates);
  if (!hit.ok) return hit;
  return found(details.get(hit.id) as Details, hit.why, query.title);
}

function found(d: Details, why: string, fallbackTitle: string): TmdbFound & { ok: true } {
  const language = languageOf(d.original_language);
  const original = d.original_title && d.original_title !== d.title ? d.original_title : undefined;
  const facts: Facts = { title: d.title ?? fallbackTitle, countries: codes(d) };
  if (original && language && language !== "en") {
    facts.originalTitle = original;
    facts.originalLang = bcp47(language);
  }
  if (language) facts.language = language;
  facts.tmdb = d.id;
  return { ok: true, imdb: d.imdb_id as string, tmdb: d.id, why, facts, short: typeof d.runtime === "number" && d.runtime > 0 && d.runtime < 40, released: d.release_date ? Number(d.release_date.slice(0, 4)) : undefined };
}

/** A film named by its IMDb ID (an IMDb award list) with no Wikidata item: TMDB's record of that ID. */
export async function findOnTmdbByImdb(tmdb: TmdbOptions, imdb: string, fallbackTitle: string): Promise<TmdbFound> {
  const headers = { Authorization: `Bearer ${tmdb.token}` };
  const hit = await tmdb.fetcher.getJson<{ movie_results?: Array<{ id: number }> }>(
    `https://api.themoviedb.org/3/find/${imdb}?external_source=imdb_id`,
    { headers, label: `tmdb-find-${imdb}` },
  );
  const id = hit.movie_results?.[0]?.id;
  if (id === undefined) return { ok: false, reason: `TMDB has no film with IMDb ID ${imdb}` };
  const d = await tmdb.fetcher.getJson<Details>(`https://api.themoviedb.org/3/movie/${id}?append_to_response=credits`, {
    headers,
    label: `tmdb-movie-credits-${id}`,
  });
  return found({ ...d, imdb_id: imdb }, `TMDB ${id} by IMDb ID`, fallbackTitle);
}
