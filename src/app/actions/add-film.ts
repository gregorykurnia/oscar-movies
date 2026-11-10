"use server";

import { updateTag } from "next/cache";
import { withFilmTransaction } from "@/db";
import { saveFilm, type FilmDraft } from "@/data/add-film";
import { addFilmInputSchema, type AddFilmInput, type AddFilmResult } from "@/lib/add-film";
import { getMovieCatalogue } from "@/lib/movie-catalogue";

/** Fetch trusted provider details before opening the locked transaction; manual saves need no provider. */
export async function addFilm(raw: AddFilmInput): Promise<AddFilmResult> {
  const parsed = addFilmInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  const draft: FilmDraft = { input: parsed.data };
  try {
    if (draft.input.kind === "catalogue") {
      const details = await (await getMovieCatalogue()).details(draft.input.tmdbId);
      if (!details.ok) return { ok: false, reason: details.error };
      if (details.value.year === null && draft.input.year === undefined) return { ok: false, reason: "missing-year" };
      draft.details = details.value;
    }
    const result = await withFilmTransaction((tx) => saveFilm(tx, draft));
    if (!result.ok) return result;
    try {
      // Includes cached movie-page misses. updateTag expires immediately for read-your-own-writes.
      updateTag("awards");
      return { ...result, refreshRequired: false };
    } catch {
      // The commit succeeded: never tell the caller to treat this as a rolled-back save.
      return { ...result, refreshRequired: true };
    }
  } catch {
    return { ok: false, reason: "failed" };
  }
}
