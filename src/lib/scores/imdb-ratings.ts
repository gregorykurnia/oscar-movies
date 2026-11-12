// IMDb ratings from IMDb's own daily file (PRODUCT_PLAN.md: "IMDb's non-commercial datasets",
// `title.ratings`, free for personal non-commercial use). OMDb's IMDb ratings lag by weeks for new
// films (2026-11-12: 9 of 25 films from 2026 off by 0.3 or more, one 7.9 against IMDb's 9.0), so
// the batch takes the IMDb rating from here and keeps OMDb for Rotten Tomatoes and Metacritic.
import type { ImdbRatingsResult } from "./batch";

export const IMDB_RATINGS_URL = "https://datasets.imdbws.com/title.ratings.tsv.gz";
/**
 * About 9 MB gzipped, 1.6 million lines: a few seconds to fetch and scan. Short enough to leave a
 * run most of its 250 seconds when the download is slow (the run then keeps OMDb's ratings).
 */
const TIMEOUT_MS = 45_000;

type Fetch = typeof fetch;

/**
 * Reads the file's lines (`tconst<TAB>averageRating<TAB>numVotes`) and keeps the ratings of the
 * wanted IDs only, so memory stays small. Exported for the unit tests.
 */
export async function readRatings(lines: AsyncIterable<string>, wanted: Set<string>): Promise<Map<string, number>> {
  const ratings = new Map<string, number>();
  let rest = "";
  const take = (line: string) => {
    const tab = line.indexOf("\t");
    if (tab < 0) return;
    const id = line.slice(0, tab);
    if (!wanted.has(id)) return;
    const end = line.indexOf("\t", tab + 1);
    const rating = Number.parseFloat(line.slice(tab + 1, end < 0 ? undefined : end));
    if (Number.isFinite(rating) && rating >= 1 && rating <= 10) ratings.set(id, rating);
  };
  for await (const chunk of lines) {
    const parts = (rest + chunk).split("\n");
    rest = parts.pop() ?? "";
    for (const line of parts) take(line);
    if (ratings.size === wanted.size) return ratings;
  }
  take(rest);
  return ratings;
}

/** A stream's chunks as an async iterable (the DOM typings don't declare it iterable). */
async function* chunksOf(stream: ReadableStream<string>): AsyncGenerator<string> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    // Stopping early (every wanted ID found) cancels the rest of the download.
    await reader.cancel().catch(() => {});
  }
}

/** The IMDb ratings of these IMDb IDs; a film missing from the file (too few votes) is left out. */
export async function fetchImdbRatings(ids: string[], fetchImpl: Fetch = fetch): Promise<ImdbRatingsResult> {
  const wanted = new Set(ids);
  if (wanted.size === 0) return { kind: "ok", value: new Map() };
  try {
    const response = await fetchImpl(IMDB_RATINGS_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok || !response.body) return { kind: "failed", reason: `IMDb ratings file: HTTP ${response.status}` };
    // fetch already unzips a body sent with `Content-Encoding: gzip`; unzipping again would fail.
    const zipped = !/gzip/i.test(response.headers.get("content-encoding") ?? "");
    const body = zipped ? response.body.pipeThrough(new DecompressionStream("gzip")) : response.body;
    const text = body.pipeThrough(new TextDecoderStream());
    return { kind: "ok", value: await readRatings(chunksOf(text), wanted) };
  } catch (error) {
    return { kind: "failed", reason: `IMDb ratings file: ${error instanceof Error ? error.message : String(error)}` };
  }
}
