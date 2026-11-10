import { and, eq, or, sql } from "drizzle-orm";
import type { FilmTransaction } from "@/db";
import { movies } from "@/db/schema";
import { addFilmSlug, type AddFilmInput, type FilmSaveResult, type SavedFilm } from "@/lib/add-film";
import type { CatalogueDetails } from "@/lib/movie-catalogue/contract";
import { writeWantAtTop } from "./marks";

export type FilmDraft = { input: AddFilmInput; details?: CatalogueDetails };
const summary = ({ id, slug, title, year }: SavedFilm): SavedFilm => ({ id, slug, title, year });

function uniqueConflict(error: unknown): boolean {
  for (let i = 0; i < 4 && error && typeof error === "object"; i++) {
    if ("code" in error && error.code === "23505") return true;
    error = "cause" in error ? error.cause : null;
  }
  return false;
}

/** Caller holds the shared lock. Savepoints let a unique-conflict re-read use a fresh snapshot. */
export async function saveFilm(tx: FilmTransaction, draft: FilmDraft): Promise<FilmSaveResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await tx.transaction((savepoint) => resolveAndSave(savepoint, draft));
    } catch (error) {
      if (!uniqueConflict(error)) throw error;
      if (attempt === 1) return { ok: false, reason: "identity-conflict" };
    }
  }
  throw new Error("Unreachable film save");
}

async function resolveAndSave(tx: FilmTransaction, { input, details }: FilmDraft): Promise<FilmSaveResult> {
  if (input.kind === "catalogue" && (!details || details.tmdbId !== input.tmdbId)) {
    return { ok: false, reason: "invalid-response" };
  }
  const title = input.kind === "manual" ? input.title : details!.title;
  const year = input.kind === "manual" ? input.year : details!.year ?? input.year;
  if (year === undefined) return { ok: false, reason: "missing-year" };
  const external = input.kind === "catalogue" ? details : undefined;
  const found = await tx.select().from(movies).where(or(
    eq(movies.localId, input.localId),
    external ? eq(movies.tmdbId, external.tmdbId) : undefined,
    external?.imdbId ? eq(movies.imdbId, external.imdbId) : undefined,
    external?.wikidataId ? eq(movies.wikidataId, external.wikidataId) : undefined,
  ));
  if (found.length > 1) return { ok: false, reason: "identity-conflict" };
  let film = found[0];
  if (film?.localId === input.localId) {
    const same = input.kind === "manual"
      ? film.tmdbId === null && film.title === title && film.year === year
        && (input.duplicate?.kind !== "use" || input.duplicate.movieId === film.id)
      : film.tmdbId === input.tmdbId && film.year === year;
    if (!same) return { ok: false, reason: "draft-changed" };
  }
  if (film && external && (
    film.tmdbId !== null && film.tmdbId !== external.tmdbId
    || film.imdbId !== null && external.imdbId !== null && film.imdbId !== external.imdbId
    || film.wikidataId !== null && external.wikidataId !== null && film.wikidataId !== external.wikidataId
  )) return { ok: false, reason: "identity-conflict" };

  if (!film && input.kind === "manual" && input.duplicate?.kind !== "different") {
    const matches = await tx.select().from(movies).where(and(
      eq(movies.year, year), sql`f_unaccent(lower(${movies.title})) = f_unaccent(lower(${title}))`,
    )).orderBy(movies.id).limit(20);
    if (input.duplicate?.kind === "use") {
      const selectedId = input.duplicate.movieId;
      film = matches.find((m) => m.id === selectedId)!;
      if (!film) return { ok: false, reason: "identity-conflict" };
    } else if (matches.length) {
      return { ok: false, reason: "duplicate", matches: matches.map(summary) };
    }
  }
  const created = !film;
  if (!film) {
    [film] = await tx.insert(movies).values({
      localId: input.localId, title, year,
      slug: addFilmSlug(title, year, external ? `tmdb-${external.tmdbId}` : input.localId),
      countries: external?.countries ?? [], language: external?.language ?? null,
      originalTitle: external?.originalTitle ?? null, originalLang: external?.language ?? null,
      tmdbId: external?.tmdbId ?? null, imdbId: external?.imdbId ?? null, wikidataId: external?.wikidataId ?? null,
      tmdbScore: external?.tmdbScore ?? null, tmdbAt: external?.tmdbScore == null ? null : new Date(),
    }).returning();
  }
  if (!await writeWantAtTop(tx, film.id)) throw new Error("Film disappeared before its wanted mark was saved");
  return { ok: true, film: summary(film), created };
}
