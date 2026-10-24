// IMDb's award records (the source for critics groups Wikipedia doesn't cover, task 6.2): its
// GraphQL API, which answers POSTs from a browser user agent only (docs/imdb-import.md). An
// event's nominees are found in two steps: the titles nominated there (advanced title search by
// event), then each title's nominations, kept where `event` matches. IMDb files an edition under its
// ceremony's calendar year, so `editionSeasons` works out which film year each edition honours.
// Films are matched by IMDb ID.
import type { Fetcher } from "./fetcher";
import { getEntities, P, firstString, WIKIDATA_API, type Entity } from "./wikidata";

export const IMDB_GRAPHQL = "https://caching.graphql.imdb.com/";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  "x-imdb-client-name": "imdb-web-next",
};

export type ImdbTitle = { id: string; title: string; year?: number; type: string };
export type ImdbNomination = {
  id: string;
  titleId: string;
  edition: { id: string; year: number; instance: number };
  /** The category (`Best Documentary`), when IMDb gives one apart from the award's name. */
  category: string | null;
  /** The award's name (`AFCC Award`, `Heterodox Award`). */
  award: string;
  won: boolean;
};

type GqlResponse<T> = { data?: T; errors?: Array<{ message: string }> };

async function gql<T>(fetcher: Fetcher, query: string, variables: Record<string, unknown>, label: string): Promise<T> {
  const body = await fetcher.postJson<GqlResponse<T>>(IMDB_GRAPHQL, { query, variables }, { headers: HEADERS, label });
  if (body.errors?.length || !body.data) throw new Error(`IMDb ${label}: ${body.errors?.map((e) => e.message).join("; ") ?? "no data"}`);
  return body.data;
}

const SEARCH = `query($ev: ID!, $after: String) { advancedTitleSearch(first: 250, after: $after, constraints: {
  awardConstraint: { allEventNominations: [{ eventId: $ev }] }, releaseDateConstraint: { releaseDateRange: { start: "2010-01-01" } } }) {
  pageInfo { hasNextPage endCursor } edges { node { title { id titleText { text } releaseYear { year } titleType { id } } } } } }`;

type SearchData = {
  advancedTitleSearch: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ node: { title: { id: string; titleText: { text: string }; releaseYear: { year: number } | null; titleType: { id: string } } } }>;
  };
};

/** Every title released from 2010 with a nomination at the event. */
export async function eventTitles(fetcher: Fetcher, event: string): Promise<ImdbTitle[]> {
  const out: ImdbTitle[] = [];
  let after: string | null = null;
  for (let page = 1; ; page++) {
    const data: SearchData = await gql<SearchData>(fetcher, SEARCH, { ev: event, after }, `imdb-event-${event}-p${page}`);
    const search: SearchData["advancedTitleSearch"] = data.advancedTitleSearch;
    for (const { node } of search.edges) {
      out.push({ id: node.title.id, title: node.title.titleText.text, year: node.title.releaseYear?.year, type: node.title.titleType.id });
    }
    if (!search.pageInfo.hasNextPage) return out;
    after = search.pageInfo.endCursor;
  }
}

const NOMINATIONS = `query($id: ID!, $after: ID) { title(id: $id) { awardNominations(first: 250, after: $after) {
  pageInfo { hasNextPage endCursor } edges { node { id isWinner category { text } award { text eventEdition { id year instanceWithinYear event { id } } } } } } } }`;

type NominationsData = {
  title: {
    awardNominations: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      edges: Array<{ node: { id: string; isWinner: boolean; category: { text: string } | null; award: { text: string; eventEdition: { id: string; year: number; instanceWithinYear: number; event: { id: string } } } } }>;
    };
  } | null;
};

/** A title's nominations (at every event; one cached answer per title). */
export async function titleNominations(fetcher: Fetcher, titleId: string): Promise<Array<ImdbNomination & { event: string }>> {
  const out: Array<ImdbNomination & { event: string }> = [];
  let after: string | null = null;
  for (let page = 1; ; page++) {
    const data: NominationsData = await gql<NominationsData>(fetcher, NOMINATIONS, { id: titleId, after }, `imdb-noms-${titleId}-p${page}`);
    const list = data.title?.awardNominations;
    if (!list) return out;
    for (const { node } of list.edges) {
      const e = node.award.eventEdition;
      out.push({ id: node.id, titleId, event: e.event.id, edition: { id: e.id, year: e.year, instance: e.instanceWithinYear }, category: node.category?.text ?? null, award: node.award.text, won: node.isWinner });
    }
    if (!list.pageInfo.hasNextPage) return out;
    after = list.pageInfo.endCursor;
  }
}

/** The label a category mapping reads: the category, else the award's name. */
export const labelOf = (n: Pick<ImdbNomination, "category" | "award">) => n.category ?? n.award;

/**
 * The film year each IMDb edition honours. An edition in calendar year Y honours films of Y
 * (a December vote) or of Y − 1 (a January or later ceremony): the film year most of its
 * nominees have, among those two. A tie goes to the event's usual lag (the most common one
 * among its clear editions), else Y − 1. `filmYear` gives a nominee's year (the app's own film
 * year for a known film, else IMDb's release year).
 */
export function editionSeasons(
  nominations: Array<Pick<ImdbNomination, "edition" | "titleId">>,
  filmYear: (titleId: string) => number | undefined,
): Map<string, number> {
  const byEdition = new Map<string, { year: number; votes: Map<number, number> }>();
  for (const n of nominations) {
    const e = byEdition.get(n.edition.id) ?? { year: n.edition.year, votes: new Map<number, number>() };
    byEdition.set(n.edition.id, e);
    const y = filmYear(n.titleId);
    if (y === n.edition.year || y === n.edition.year - 1) e.votes.set(y, (e.votes.get(y) ?? 0) + 1);
  }
  const clear = new Map<string, number>();
  const lags = new Map<number, number>();
  for (const [id, e] of byEdition) {
    const same = e.votes.get(e.year) ?? 0;
    const before = e.votes.get(e.year - 1) ?? 0;
    if (same === before) continue;
    const lag = same > before ? 0 : 1;
    clear.set(id, e.year - lag);
    lags.set(lag, (lags.get(lag) ?? 0) + 1);
  }
  const usualLag = (lags.get(0) ?? 0) > (lags.get(1) ?? 0) ? 0 : 1;
  const out = new Map<string, number>();
  for (const [id, e] of byEdition) out.set(id, clear.get(id) ?? e.year - usualLag);
  return out;
}

/** Wikidata items by IMDb ID (P345), 25 IDs to a search; an ID with no item is missing from the map. */
export async function itemsByImdb(fetcher: Fetcher, imdbIds: string[]): Promise<Map<string, Entity>> {
  const out = new Map<string, Entity>();
  const unique = [...new Set(imdbIds)].sort();
  for (let i = 0; i < unique.length; i += 25) {
    const batch = unique.slice(i, i + 25);
    const params = new URLSearchParams({ format: "json", action: "query", list: "search", srlimit: "50", srsearch: `haswbstatement:${batch.map((id) => `P345=${id}`).join("|")}` });
    const found = await fetcher.getJson<{ query?: { search?: Array<{ title: string }> } }>(`${WIKIDATA_API}?${params}`, { label: `wd-imdb-${batch[0]}` });
    const qids = (found.query?.search ?? []).map((r) => r.title).filter((t) => /^Q\d+$/.test(t));
    const entities = await getEntities(fetcher, qids);
    for (const entity of entities.values()) {
      const imdb = firstString(entity, P.imdb);
      if (imdb && batch.includes(imdb) && !out.has(imdb)) out.set(imdb, entity);
    }
  }
  return out;
}

const SEARCH_TITLES = `query($text: String!) { mainSearch(first: 8, options: { searchTerm: $text, type: [TITLE] }) { edges { node { entity {
  ... on Title { id titleText { text } releaseYear { year } titleType { id } credits(first: 6, filter: { categories: ["director"] }) { edges { node { name { nameText { text } } } } } } } } } } }`;

type SearchTitlesData = {
  mainSearch: {
    edges: Array<{ node: { entity: { id?: string; titleText?: { text: string }; releaseYear?: { year: number } | null; titleType?: { id: string }; credits?: { edges: Array<{ node: { name: { nameText: { text: string } } } }> } } } }>;
  };
};

export type ImdbCandidate = ImdbTitle & { directors: string[] };

/** IMDb's title search, with each hit's directors. */
export async function searchTitles(fetcher: Fetcher, text: string): Promise<ImdbCandidate[]> {
  const data = await gql<SearchTitlesData>(fetcher, SEARCH_TITLES, { text }, `imdb-search-${text}`);
  return data.mainSearch.edges.flatMap(({ node: { entity: e } }) =>
    e.id && e.titleText && e.titleType
      ? [{ id: e.id, title: e.titleText.text, year: e.releaseYear?.year, type: e.titleType.id, directors: (e.credits?.edges ?? []).map((c) => c.node.name.nameText.text) }]
      : [],
  );
}

/** Title types that can be a feature in the app: no shorts, series, episodes or games. */
export const FEATURE_TYPES = new Set(["movie", "tvMovie", "tvSpecial", "video"]);

const person = (name: string) => name.normalize("NFKD").replace(/[^\p{L}\s]/gu, "").toLowerCase().split(/\s+/).filter(Boolean);

/** Two credits name the same person: the same family name and the same first initial. */
export function samePerson(a: string, b: string): boolean {
  const x = person(a);
  const y = person(b);
  if (x.length === 0 || y.length === 0) return false;
  return x[x.length - 1] === y[y.length - 1] && x[0][0] === y[0][0];
}

/**
 * The one search hit that is a feature within two years of `year` and shares a director with
 * the list; none (with the reason) when no hit or more than one hit qualifies.
 */
export function chooseTitle(candidates: ImdbCandidate[], year: number, directors: string[]): { ok: true; id: string } | { ok: false; reason: string } {
  const fits = candidates.filter(
    (c) => FEATURE_TYPES.has(c.type) && c.year !== undefined && Math.abs(c.year - year) <= 2 && c.directors.some((d) => directors.some((e) => samePerson(d, e))),
  );
  const ids = [...new Set(fits.map((c) => c.id))];
  if (ids.length === 1) return { ok: true, id: ids[0] };
  return { ok: false, reason: ids.length === 0 ? "no IMDb title within two years shares a director" : `${ids.length} IMDb titles fit (${ids.join(", ")})` };
}
