// Link resolver (IMPLEMENTATION_PLAN.md §3.4): Wikipedia article title → Wikidata QID (the
// page's `wikibase_item`, redirects followed) → IMDb ID (P345) and TMDB ID (P4947). Films are
// matched by these IDs, never by title. A link that leads nowhere (red link, no Wikidata item,
// no IMDb ID and no QID) comes back unresolved, with the reason, for the task to settle.
import type { Fetcher } from "./fetcher";
import { apiUrl } from "./wikipedia";
import { firstString, getEntities, P, type Entity } from "./wikidata";

export type ResolvedFilm = {
  article: string;
  /** The article the link ends up at after redirects. */
  page: string;
  wd: string;
  imdb?: string;
  tmdb?: number;
  entity: Entity;
};

export type Resolution = { ok: true; film: ResolvedFilm } | { ok: false; article: string; reason: string };

const BATCH = 50;

type PagepropsResponse = {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
    pages?: Array<{ title: string; missing?: boolean; invalid?: boolean; pageprops?: { wikibase_item?: string } }>;
  };
};

/** Article title → the page it lands on and that page's QID (when it has one). */
async function pageItems(fetcher: Fetcher, articles: string[]): Promise<Map<string, { page: string; wd?: string }>> {
  const result = new Map<string, { page: string; wd?: string }>();
  const unique = [...new Set(articles)].sort();
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const body = await fetcher.getJson<PagepropsResponse>(
      apiUrl({ action: "query", prop: "pageprops", ppprop: "wikibase_item", redirects: "1", titles: batch.join("|") }),
      { label: `pageprops-${batch[0]}` },
    );
    const q = body.query ?? {};
    const normalized = new Map((q.normalized ?? []).map((n) => [n.from, n.to]));
    const redirects = new Map((q.redirects ?? []).map((r) => [r.from, r.to]));
    const pages = new Map((q.pages ?? []).map((p) => [p.title, p]));
    for (const article of batch) {
      let title = normalized.get(article) ?? article;
      // A redirect can point at another redirect; Wikipedia lists each hop.
      for (let hops = 0; redirects.has(title) && hops < 5; hops++) title = redirects.get(title) as string;
      const page = pages.get(title.replace(/#.*$/, ""));
      if (!page || page.missing || page.invalid) continue;
      result.set(article, { page: page.title, wd: page.pageprops?.wikibase_item });
    }
  }
  return result;
}

/** Resolves every article title given; the map has an entry for each, resolved or not. */
export async function resolveArticles(fetcher: Fetcher, articles: string[]): Promise<Map<string, Resolution>> {
  const items = await pageItems(fetcher, articles);
  const entities = await getEntities(
    fetcher,
    [...items.values()].flatMap((i) => (i.wd ? [i.wd] : [])),
  );
  const out = new Map<string, Resolution>();
  for (const article of new Set(articles)) {
    const item = items.get(article);
    if (!item) {
      out.set(article, { ok: false, article, reason: "no such Wikipedia article" });
      continue;
    }
    const entity = item.wd ? entities.get(item.wd) : undefined;
    if (!item.wd || !entity) {
      out.set(article, { ok: false, article, reason: `"${item.page}" has no Wikidata item` });
      continue;
    }
    const imdb = firstString(entity, P.imdb);
    const tmdb = Number(firstString(entity, P.tmdbMovie));
    out.set(article, {
      ok: true,
      film: {
        article,
        page: item.page,
        wd: item.wd,
        // P345 also holds people (nm…) and series episodes; only a title ID names a film.
        imdb: imdb && /^tt\d+$/.test(imdb) ? imdb : undefined,
        tmdb: Number.isInteger(tmdb) && tmdb > 0 ? tmdb : undefined,
        entity,
      },
    });
  }
  return out;
}
