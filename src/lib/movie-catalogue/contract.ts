import { z } from "zod";

export const catalogueQuerySchema = z.object({
  query: z.string().trim().min(1).max(200),
  page: z.number().int().min(1).max(500).default(1),
});
export const catalogueIdSchema = z.number().int().positive().max(2_147_483_647);

export type CatalogueFilm = {
  tmdbId: number;
  title: string;
  originalTitle: string | null;
  year: number | null;
  overview: string;
};
export type CataloguePage = { films: CatalogueFilm[]; page: number; nextPage: number | null };
export type CatalogueDetails = CatalogueFilm & {
  imdbId: string | null;
  wikidataId: string | null;
  language: string | null;
  countries: string[];
  tmdbScore: number | null;
};
export const catalogueErrors = {
  "invalid-input": "Enter a film title of up to 200 characters and a page from 1 to 500.",
  unavailable: "Film search is unavailable. You can add the film manually.",
  refused: "The film provider refused access. You can add the film manually.",
  "not-found": "This film is no longer available from the provider. Try searching again or add it manually.",
  "rate-limited": "Too many film searches. Try again shortly or add the film manually.",
  timeout: "Film search took too long. Try again or add the film manually.",
  network: "Could not reach the film provider. Check your connection or add the film manually.",
  "invalid-response": "The film provider returned an unreadable answer. Try again or add the film manually.",
  "provider-error": "The film provider is having trouble. Try again or add the film manually.",
  "fixtures-refused": "Film search test configuration was refused.",
} as const;
export type CatalogueError = keyof typeof catalogueErrors;
export type CatalogueResult<T> = { ok: true; value: T } | { ok: false; error: CatalogueError };
export interface MovieCatalogue {
  search(query: string, page?: number): Promise<CatalogueResult<CataloguePage>>;
  details(id: number): Promise<CatalogueResult<CatalogueDetails>>;
}
