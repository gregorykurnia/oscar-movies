// The research scripts' only way out to the network (IMPLEMENTATION_PLAN.md §3.4): one request
// at a time, a polite user agent, a short pause between requests, and every response cached
// in `.cache/` so a rerun reads the disk. Tests point `cacheDir` at saved responses and set
// `offline`, so a missing response fails instead of reaching the network.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const USER_AGENT =
  "oscar-movies-research/1.0 (https://github.com/gregorykurnia/oscar-movies; one request at a time)";

export type FetcherOptions = {
  /** Where responses are cached; `null` turns the cache off. */
  cacheDir: string | null;
  /** Never touch the network: a response missing from the cache is an error. */
  offline?: boolean;
  /** Fetch again and overwrite the cache (a season page that has changed). */
  refresh?: boolean;
  /** Pause between network requests. */
  minIntervalMs?: number;
  fetchImpl?: typeof fetch;
  /** Waits between retries; tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
};

export type GetOptions = {
  headers?: Record<string, string>;
  /** Readable prefix for the cache file name, such as the page title. */
  label?: string;
};

export type Fetcher = {
  getJson<T = unknown>(url: string, options?: GetOptions): Promise<T>;
  /** A web page's HTML (a site with no API, such as DOC NYC's film pages), cached like JSON. */
  getText(url: string, options?: GetOptions): Promise<string>;
  /** A JSON POST (IMDb's GraphQL API, which refuses GET), cached by URL and body. */
  postJson<T = unknown>(url: string, body: unknown, options?: GetOptions): Promise<T>;
  /** Network requests made so far (cache hits don't count). */
  readonly requests: number;
};

const RETRIES = 3;

export function cacheFileName(url: string, label = "response"): string {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 16);
  const safe = label.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60);
  return `${safe}-${hash}.json`;
}

export function createFetcher(options: FetcherOptions): Fetcher {
  const {
    cacheDir,
    offline = false,
    refresh = false,
    minIntervalMs = 200,
    fetchImpl = fetch,
    sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  } = options;
  let queue: Promise<unknown> = Promise.resolve();
  let lastRequestAt = 0;
  let requests = 0;

  async function fromNetwork(url: string, headers: Record<string, string>, body?: string, text = false): Promise<unknown> {
    for (let attempt = 1; ; attempt++) {
      const wait = lastRequestAt + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      lastRequestAt = Date.now();
      requests++;
      const response = await fetchImpl(url, {
        headers: {
          "User-Agent": USER_AGENT,
          "Api-User-Agent": USER_AGENT,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        ...(body === undefined ? {} : { method: "POST", body }),
      });
      if (response.ok) return text ? { text: await response.text() } : response.json();
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= RETRIES) {
        throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
      }
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
    }
  }

  async function get(url: string, { headers = {}, label }: GetOptions, body?: string, text = false): Promise<unknown> {
    const key = body !== undefined ? `${url}\u0000${body}` : text ? `text\u0000${url}` : url;
    const file = cacheDir === null ? null : join(cacheDir, cacheFileName(key, label));
    if (file !== null && !refresh) {
      try {
        return JSON.parse(readFileSync(file, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    if (offline) throw new Error(`Offline and not cached: ${url}${body === undefined ? "" : ` (POST ${label ?? ""})`}`);
    const json = await fromNetwork(url, headers, body, text);
    if (file !== null && cacheDir !== null) {
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(file, JSON.stringify(json));
    }
    return json;
  }

  return {
    // Chained on one promise, so requests never overlap even when callers don't await.
    getJson<T>(url: string, getOptions: GetOptions = {}) {
      const next = queue.then(() => get(url, getOptions));
      queue = next.catch(() => undefined);
      return next as Promise<T>;
    },
    getText(url: string, getOptions: GetOptions = {}) {
      const next = queue.then(() => get(url, getOptions, undefined, true)).then((page) => (page as { text: string }).text);
      queue = next.catch(() => undefined);
      return next;
    },
    postJson<T>(url: string, body: unknown, getOptions: GetOptions = {}) {
      const next = queue.then(() => get(url, getOptions, JSON.stringify(body)));
      queue = next.catch(() => undefined);
      return next as Promise<T>;
    },
    get requests() {
      return requests;
    },
  };
}
