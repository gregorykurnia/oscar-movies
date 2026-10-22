// Wikipedia pages through the MediaWiki API (`action=parse`): the parsed HTML of the whole
// page, with redirects followed. Pages are cached by the fetcher in `.cache/wiki/`.
import type { Fetcher } from "./fetcher";

export const WIKI_API = "https://en.wikipedia.org/w/api.php";
export const WIKI_CACHE_DIR = ".cache/wiki";

export type WikiPage = { title: string; revid: number; html: string; url: string };

/** `/wiki/I%27m_Still_Here_(2024_film)` → `I'm Still Here (2024 film)`. */
export function titleFromHref(href: string): string | null {
  const match = href.match(/^(?:https?:\/\/en\.wikipedia\.org)?\/wiki\/([^?#]+)/);
  if (!match) return null;
  const title = decodeURIComponent(match[1]).replace(/_/g, " ");
  // Files, categories, help pages and the like are never films.
  if (/^(File|Category|Help|Template|Wikipedia|Special|Portal|Talk):/.test(title)) return null;
  return title;
}

export function pageUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_")).replace(/%2F/g, "/")}`;
}

export function apiUrl(params: Record<string, string>): string {
  const search = new URLSearchParams({ format: "json", formatversion: "2", ...params });
  return `${WIKI_API}?${search.toString()}`;
}

export async function fetchPage(fetcher: Fetcher, title: string): Promise<WikiPage> {
  const url = apiUrl({
    action: "parse",
    page: title,
    prop: "text|revid",
    redirects: "1",
    disableeditsection: "1",
    disabletoc: "1",
  });
  const body = await fetcher.getJson<{
    parse?: { title: string; revid: number; text: string };
    error?: { code: string; info: string };
  }>(url, { label: `parse-${title}` });
  if (!body.parse) throw new Error(`Wikipedia page "${title}": ${body.error?.info ?? "no content"}`);
  return { title: body.parse.title, revid: body.parse.revid, html: body.parse.text, url: pageUrl(body.parse.title) };
}
