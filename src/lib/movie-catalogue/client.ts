import "server-only";
import { z } from "zod";
import { parseTmdb } from "@/lib/scores/clients";
import {
  catalogueIdSchema, catalogueQuerySchema,
  type CatalogueDetails, type CatalogueFilm, type CataloguePage, type CatalogueResult, type MovieCatalogue,
} from "./contract";

const TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 256 * 1024;
const title = z.string().trim().min(1).max(300);
const filmSchema = z.object({
  id: catalogueIdSchema,
  title,
  original_title: title.nullish(),
  release_date: z.union([z.literal(""), z.iso.date().refine((date) => Number(date.slice(0, 4)) >= 1800)]).nullish(),
  overview: z.string().max(10_000).nullish(),
  adult: z.boolean(),
});
const searchSchema = z.object({
  page: z.number().int().min(1).max(500),
  total_pages: z.number().int().nonnegative(),
  total_results: z.number().int().nonnegative(),
  results: z.array(filmSchema).max(20),
});
const country = z.string().regex(/^[A-Z]{2}$/);
const detailsSchema = filmSchema.extend({
  imdb_id: z.string().max(32).regex(/^tt\d+$/).or(z.literal("")).nullish(),
  original_language: z.string().regex(/^[a-z]{2,3}$/).nullish(),
  origin_country: z.array(country).max(100).optional(),
  production_countries: z.array(z.object({ iso_3166_1: country })).max(100).optional(),
  external_ids: z.object({
    imdb_id: z.string().max(32).regex(/^tt\d+$/).or(z.literal("")).nullish(),
    wikidata_id: z.string().max(32).regex(/^Q\d+$/).or(z.literal("")).nullish(),
  }),
  vote_average: z.number().min(0).max(10),
  vote_count: z.number().int().nonnegative(),
});

function filmValue(film: z.infer<typeof filmSchema>): CatalogueFilm {
  return {
    tmdbId: film.id,
    title: film.title,
    originalTitle: film.original_title ?? null,
    year: film.release_date ? Number(film.release_date.slice(0, 4)) : null,
    overview: (film.overview ?? "").slice(0, 500),
  };
}

/** Bound the body as well as the request. Never forward provider text, headers or errors. */
async function readJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Missing body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new Error("Oversized body");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    // Also close an oversized/broken stream; don't wait for the rest of its body.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** One fixed-host request per operation, no retries or per-result detail requests. */
export function createTmdbCatalogue(token: string | undefined, fetchImpl: typeof fetch = fetch): MovieCatalogue {
  async function request<T>(path: string, parse: (body: unknown) => T | null): Promise<CatalogueResult<T>> {
    if (!token?.trim()) return { ok: false, error: "unavailable" };
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<CatalogueResult<T>>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve({ ok: false, error: "timeout" });
      }, TIMEOUT_MS);
    });
    const operation = async (): Promise<CatalogueResult<T>> => {
      let response: Response;
      try {
        response = await fetchImpl(`https://api.themoviedb.org/3/${path}`, {
          headers: { authorization: `Bearer ${token}`, accept: "application/json" },
          cache: "no-store", redirect: "error", signal: controller.signal,
        });
      } catch (error) {
        return { ok: false, error: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network" };
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        if (response.status === 401 || response.status === 403) return { ok: false, error: "refused" };
        if (response.status === 404) return { ok: false, error: "not-found" };
        if (response.status === 429) return { ok: false, error: "rate-limited" };
        return { ok: false, error: "provider-error" };
      }
      try {
        const value = parse(await readJson(response));
        return value === null ? { ok: false, error: "invalid-response" } : { ok: true, value };
      } catch {
        return { ok: false, error: "invalid-response" };
      }
    };
    try {
      return await Promise.race([operation(), timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  return {
    async search(query, page = 1): Promise<CatalogueResult<CataloguePage>> {
      const input = catalogueQuerySchema.safeParse({ query, page });
      if (!input.success) return { ok: false, error: "invalid-input" };
      const params = new URLSearchParams({ query: input.data.query, page: String(page), include_adult: "false" });
      return request(`search/movie?${params}`, (body) => {
        const parsed = searchSchema.safeParse(body);
        if (!parsed.success || parsed.data.page !== page) return null;
        const data = parsed.data;
        return {
          films: data.results.filter((film) => !film.adult).map(filmValue),
          page,
          nextPage: page < Math.min(data.total_pages, 500) ? page + 1 : null,
        };
      });
    },
    async details(id): Promise<CatalogueResult<CatalogueDetails>> {
      if (!catalogueIdSchema.safeParse(id).success) return { ok: false, error: "invalid-input" };
      return request(`movie/${id}?append_to_response=external_ids`, (body) => {
        const parsed = detailsSchema.safeParse(body);
        if (!parsed.success || parsed.data.id !== id) return null;
        const data = parsed.data;
        if (data.adult) return null;
        if (data.imdb_id && data.external_ids.imdb_id && data.imdb_id !== data.external_ids.imdb_id) return null;
        const score = parseTmdb(data);
        return {
          ...filmValue(data),
          imdbId: data.imdb_id || data.external_ids.imdb_id || null,
          wikidataId: data.external_ids.wikidata_id || null,
          language: !data.original_language || data.original_language === "xx" ? null : data.original_language === "cn" ? "yue" : data.original_language,
          countries: [...new Set([...(data.origin_country ?? []), ...(data.production_countries ?? []).map((c) => c.iso_3166_1)])],
          tmdbScore: score.kind === "ok" ? score.value.tmdbScore : null,
        };
      });
    },
  };
}
