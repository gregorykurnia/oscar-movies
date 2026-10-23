// Finds the Wikidata item of a film a page names without a usable link (IMPLEMENTATION_PLAN.md
// §3.4: "a Wikidata search by title plus year plus director"). Candidates come from Wikidata's
// title search and its full-text search (which also reads other languages' labels); a
// candidate is taken only when it is a film, was released within a year of the film year, and
// agrees on the director, or on both the submitting country and the title. Anything less is
// reported for a person to settle in `sources/<award>.json`; a wrong match would corrupt
// data silently, so the rule errs on the side of "not found".
import type { Fetcher } from "./fetcher";
import { claimValues, entityIds, getEntities, P, WIKIDATA_API, type Entity } from "./wikidata";

/** Film, animated film, documentary film, short film, silent film, anime film, television film. */
export const FILM_TYPES = new Set(["Q11424", "Q202866", "Q93204", "Q24862", "Q226730", "Q20650540", "Q1107", "Q506240"]);
const DIRECTOR = "P57";
const PUBLISHED = "P577";

export type FilmQuery = {
  title: string;
  originalTitle?: string;
  /** The film year (the Oscars' year, so releases from the year before to the year after fit). */
  year: number;
  /** ISO 3166-1 alpha-2 of the submitting country. */
  country: string;
  /** Director names as the list shows them. */
  directors: string[];
};

/** `id` is the matched item's: a QID from Wikidata, a TMDB ID from TMDB. */
export type Found = { ok: true; id: string; why: string } | { ok: false; reason: string };

const loose = (t: string) => t.normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

/** "A and B", "A, B", "A & B" → names. */
export function splitNames(text: string): string[] {
  return text
    .split(/\s*(?:,|&|\band\b|\bund\b|\bet\b|\by\b|\/)\s*/i)
    .map((n) => n.trim())
    .filter(Boolean);
}

export function releaseYears(entity: Entity): number[] {
  return claimValues(entity.claims?.[PUBLISHED]).flatMap((d) => {
    if (d.type !== "time") return [];
    const m = String((d.value as { time: string }).time).match(/^\+?(\d{4})/);
    return m ? [Number(m[1])] : [];
  });
}

const imdbTitleId = (entity: Entity) =>
  claimValues(entity.claims?.[P.imdb]).some((d) => d.type === "string" && /^tt\d+$/.test(String(d.value)));

export function isFilm(entity: Entity): boolean {
  return imdbTitleId(entity) || entityIds(entity, "P31").some((id) => FILM_TYPES.has(id));
}

/** A possible match from any source (Wikidata, TMDB), in the shape `choose` judges. */
export type Candidate = {
  id: string;
  /** A film, not a book or a person with the same name. */
  isFilm: boolean;
  /** Release years the source gives. */
  years: number[];
  /** Directors' names. */
  directors: string[];
  /** Codes of the countries of origin. */
  countries: string[];
  /** The item's title(s), for the title check. */
  titles: string[];
};

/** Decides among candidates; pure, so it is unit tested on small inputs. */
export function choose(query: FilmQuery, candidates: Candidate[]): Found {
  const wanted = new Set([query.title, query.originalTitle].filter((t): t is string => !!t).map(loose));
  const names = new Set(query.directors.flatMap(splitNames).map(loose));
  const accepted = candidates.flatMap((c) => {
    if (!c.isFilm) return [];
    if (!c.years.some((y) => y >= query.year - 1 && y <= query.year + 1)) return [];
    const director = c.directors.some((d) => names.has(loose(d)));
    const country = c.countries.includes(query.country);
    const title = c.titles.some((t) => wanted.has(loose(t)));
    if (!director && !(country && title)) return [];
    return [{ c, director, country, title }];
  });
  if (accepted.length === 0) return { ok: false, reason: "no film with that title, year and director/country" };
  const strong = accepted.filter((a) => a.director && a.title);
  const pool = strong.length > 0 ? strong : accepted;
  if (pool.length > 1) {
    return { ok: false, reason: `several candidates: ${pool.map((a) => a.c.id).join(", ")}` };
  }
  const [{ c, director, country, title }] = pool;
  return {
    ok: true,
    id: c.id,
    why: [director && "director", country && "country", title && "title"].filter(Boolean).join("+"),
  };
}

type SearchResponse = { search?: Array<{ id: string }>; query?: { search?: Array<{ title: string }> } };

const url = (params: Record<string, string>) => `${WIKIDATA_API}?${new URLSearchParams({ format: "json", ...params })}`;

async function candidateIds(fetcher: Fetcher, text: string): Promise<string[]> {
  const byLabel = await fetcher.getJson<SearchResponse>(
    url({ action: "wbsearchentities", search: text, language: "en", type: "item", limit: "10" }),
    { label: `wd-search-${text}` },
  );
  const fullText = await fetcher.getJson<SearchResponse>(
    url({ action: "query", list: "search", srsearch: text, srnamespace: "0", srlimit: "10" }),
    { label: `wd-fulltext-${text}` },
  );
  return [
    ...(byLabel.search ?? []).map((s) => s.id),
    ...(fullText.query?.search ?? []).map((s) => s.title).filter((t) => /^Q\d+$/.test(t)),
  ];
}

/** English labels of Wikidata items (a director's name). */
export async function labelsOf(fetcher: Fetcher, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids)].sort();
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const body = await fetcher.getJson<{ entities?: Record<string, Entity> }>(
      url({ action: "wbgetentities", ids: batch.join("|"), props: "labels", languages: "en" }),
      { label: `wd-labels-${batch[0]}` },
    );
    for (const e of Object.values(body.entities ?? {})) if (e.labels?.en) out.set(e.id, e.labels.en.value);
  }
  return out;
}

/** Searches Wikidata for the film and applies `choose`. */
export async function findFilm(
  fetcher: Fetcher,
  query: FilmQuery,
  countryOf: (qid: string) => Promise<string | undefined>,
): Promise<Found> {
  const texts = [...new Set([query.title, query.originalTitle].filter((t): t is string => !!t))];
  const ids = new Set<string>();
  for (const text of texts) for (const id of await candidateIds(fetcher, text)) ids.add(id);
  if (ids.size === 0) return { ok: false, reason: "Wikidata search found nothing" };
  const entities = await getEntities(fetcher, [...ids]);
  const directorIds = [...entities.values()].flatMap((e) => entityIds(e, DIRECTOR));
  const labels = await labelsOf(fetcher, directorIds);
  const candidates: Candidate[] = [];
  for (const e of entities.values()) {
    const countries: string[] = [];
    for (const id of entityIds(e, P.country)) {
      const code = await countryOf(id);
      if (code) countries.push(code);
    }
    const original = claimValues(e.claims?.[P.title]).flatMap((d) =>
      d.type === "monolingualtext" ? [(d.value as { text: string }).text] : [],
    );
    candidates.push({
      id: e.id,
      isFilm: isFilm(e),
      years: releaseYears(e),
      directors: entityIds(e, DIRECTOR).flatMap((id) => labels.get(id) ?? []),
      countries,
      titles: [...(e.labels?.en ? [e.labels.en.value] : []), ...original],
    });
  }
  return choose(query, candidates);
}
