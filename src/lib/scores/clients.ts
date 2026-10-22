// OMDb and TMDB clients (plan §1, §5.4). Each call answers with what the batch should do next:
// `ok` (a value, or null for "N/A"), `failed` (this film only; stored scores stay), `stop`
// (the run can't go on: a bad key or OMDb's daily limit) or `rate-limited` (wait, then retry).

export type ClientResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "failed"; reason: string }
  | { kind: "stop"; reason: string }
  | { kind: "rate-limited"; retryAfterMs: number | null };

export type OmdbScores = { imdbRating: number | null; rtScore: number | null; mcScore: number | null };
export type TmdbScores = { tmdbScore: number | null };

type Fetch = typeof fetch;
const TIMEOUT_MS = 10_000;

/** A number in range, or null for "N/A", blanks and anything that doesn't parse. */
function inRange(value: number, max: number): number | null {
  return Number.isFinite(value) && value >= 0 && value <= max ? value : null;
}

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

function retryAfter(response: Response): number | null {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

function networkReason(error: unknown): string {
  if (error instanceof Error) return error.cause instanceof Error ? error.cause.message : error.message;
  return String(error);
}

type OmdbBody = {
  Response?: string;
  Error?: string;
  imdbRating?: string;
  Metascore?: string;
  Ratings?: { Source?: string; Value?: string }[];
};

/** Reads OMDb's answer for one film. Exported for the unit tests. */
export function parseOmdb(body: OmdbBody): ClientResult<OmdbScores> {
  if (body.Response !== "True") {
    const error = body.Error ?? "no answer";
    // OMDb answers both with HTTP 401: neither gets better by trying the next film.
    if (/limit reached/i.test(error)) return { kind: "stop", reason: `OMDb: ${error}` };
    if (/api key/i.test(error)) return { kind: "stop", reason: `OMDb: ${error}` };
    return { kind: "failed", reason: `OMDb: ${error}` };
  }
  const rt = body.Ratings?.find((r) => r.Source === "Rotten Tomatoes")?.Value;
  return {
    kind: "ok",
    value: {
      imdbRating: inRange(oneDecimal(Number.parseFloat(body.imdbRating ?? "")), 10),
      rtScore: rt?.endsWith("%") ? inRange(Number.parseInt(rt, 10), 100) : null,
      mcScore: inRange(Number.parseInt(body.Metascore ?? "", 10), 100),
    },
  };
}

/** IMDb rating, Tomatometer and Metascore in one call, by IMDb ID. */
export async function fetchOmdb(imdbId: string, apiKey: string, fetchImpl: Fetch = fetch): Promise<ClientResult<OmdbScores>> {
  const url = new URL("https://www.omdbapi.com/");
  url.search = new URLSearchParams({ i: imdbId, apikey: apiKey }).toString();
  let response: Response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    return { kind: "failed", reason: `OMDb: ${networkReason(error)}` };
  }
  if (response.status === 429) return { kind: "rate-limited", retryAfterMs: retryAfter(response) };
  if (response.status >= 500) return { kind: "failed", reason: `OMDb: HTTP ${response.status}` };
  try {
    return parseOmdb((await response.json()) as OmdbBody);
  } catch {
    return { kind: "failed", reason: `OMDb: HTTP ${response.status}, not JSON` };
  }
}

type TmdbBody = { vote_average?: number; vote_count?: number };

/**
 * Reads TMDB's answer. A film nobody has voted on has no user score yet (null, not 0); so does
 * one TMDB rates 0.0 (votes without a rating: its lowest real rating is 0.5).
 */
export function parseTmdb(body: TmdbBody): ClientResult<TmdbScores> {
  if (typeof body.vote_average !== "number" || typeof body.vote_count !== "number") {
    return { kind: "failed", reason: "TMDB: no vote_average in the answer" };
  }
  const tmdbScore = body.vote_count > 0 && body.vote_average > 0 ? inRange(oneDecimal(body.vote_average), 10) : null;
  return { kind: "ok", value: { tmdbScore } };
}

/** TMDB's user score (0–10), by TMDB ID, with the read access token. */
export async function fetchTmdb(tmdbId: number, token: string, fetchImpl: Fetch = fetch): Promise<ClientResult<TmdbScores>> {
  let response: Response;
  try {
    response = await fetchImpl(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    return { kind: "failed", reason: `TMDB: ${networkReason(error)}` };
  }
  if (response.status === 429) return { kind: "rate-limited", retryAfterMs: retryAfter(response) };
  if (response.status === 401) return { kind: "stop", reason: "TMDB: the read token was refused (HTTP 401)" };
  if (!response.ok) return { kind: "failed", reason: `TMDB: HTTP ${response.status}` };
  try {
    return parseTmdb((await response.json()) as TmdbBody);
  } catch {
    return { kind: "failed", reason: "TMDB: the answer isn't JSON" };
  }
}
