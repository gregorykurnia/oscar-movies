import { z } from "zod";
import { catalogueIdSchema, type CatalogueError } from "./movie-catalogue/contract";

export const filmYearSchema = z.number().int().min(1800).max(9999);
const draft = { localId: z.uuid().transform((id) => id.toLowerCase()) };
export const addFilmInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("manual"), ...draft,
    title: z.string().trim().min(1).max(300), year: filmYearSchema,
    duplicate: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("use"), movieId: catalogueIdSchema }).strict(),
      z.object({ kind: z.literal("different") }).strict(),
    ]).optional(),
  }).strict(),
  z.object({ kind: z.literal("catalogue"), ...draft, tmdbId: catalogueIdSchema, year: filmYearSchema.optional() }).strict(),
]);
export type AddFilmInput = z.input<typeof addFilmInputSchema>;
export type SavedFilm = { id: number; slug: string; title: string; year: number };
export type AddFilmFailure =
  | { ok: false; reason: "duplicate"; matches: SavedFilm[] }
  | { ok: false; reason: "identity-conflict" | "draft-changed" | "missing-year" | "failed" | CatalogueError };
export type FilmSaveResult = { ok: true; film: SavedFilm; created: boolean } | AddFilmFailure;
export type AddFilmResult = { ok: true; film: SavedFilm; created: boolean; refreshRequired: boolean } | AddFilmFailure;

/** Stable links, including for non-Latin titles; the full identity suffix avoids collisions. */
export function addFilmSlug(title: string, year: number, identity: string): string {
  const name = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100).replace(/-$/, "");
  return `${name || "film"}-${year}-${identity}`;
}
