// Zod schemas for the data files (IMPLEMENTATION_PLAN.md §3.3). Every script that reads a
// file in `data/` validates it here first. The cross-file rules (counts, winners, every film
// resolving to one movie) live in `scripts/lib/data-check.ts` (`npm run data:check`).
import { z } from "zod";
import { awardKind, editionStatus, oscarCategory, outcome } from "../db/schema";

export const IMDB_ID = /^tt\d+$/;
export const WIKIDATA_ID = /^Q\d+$/;
/** ISO 3166-1 alpha-2. */
export const COUNTRY_CODE = /^[A-Z]{2}$/;
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = z.iso.date();

/** A film is named by IMDb ID, or by Wikidata QID when it has none. */
export const filmKey = z.union([z.string().regex(IMDB_ID), z.string().regex(WIKIDATA_ID)]);

// ---------------------------------------------------------------------------------------------
// data/awards.json: awards and their categories, with the Oscar mapping.

export const awardCategoryEntrySchema = z
  .object({
    slug: z.string().regex(SLUG),
    name: z.string().min(1),
    oscarCategory: z.enum(oscarCategory.enumValues),
    loose: z.boolean().optional(),
    mappingNote: z.string().min(1).optional(),
    sortOrder: z.number().int(),
  })
  .strict();

export const awardEntrySchema = z
  .object({
    slug: z.string().regex(SLUG),
    name: z.string().min(1),
    shortName: z.string().min(1),
    kind: z.enum(awardKind.enumValues),
    calendarOrder: z.number().int(),
    winnersOnly: z.boolean(),
    isSelection: z.boolean(),
    url: z.url().optional(),
    categories: z.array(awardCategoryEntrySchema).min(1),
  })
  .strict()
  .superRefine((a, ctx) => {
    const seen = new Set<string>();
    a.categories.forEach((c, i) => {
      if (seen.has(c.slug)) ctx.addIssue({ code: "custom", path: ["categories", i], message: `category ${c.slug} appears twice` });
      seen.add(c.slug);
    });
  });

export const awardsFileSchema = z.array(awardEntrySchema).superRefine((list, ctx) => {
  const seen = new Set<string>();
  list.forEach((a, i) => {
    if (seen.has(a.slug)) ctx.addIssue({ code: "custom", path: [i], message: `award ${a.slug} appears twice` });
    seen.add(a.slug);
  });
});

export type AwardEntry = z.infer<typeof awardEntrySchema>;
export type AwardsFile = z.infer<typeof awardsFileSchema>;

// ---------------------------------------------------------------------------------------------
// data/movies/<year>.json: facts per film, keyed by IMDb ID (or QID when it has none).

export const movieEntrySchema = z
  .object({
    slug: z.string().regex(SLUG),
    title: z.string().min(1),
    originalTitle: z.string().min(1).optional(),
    // BCP 47 tag of the original title, for `lang=`.
    originalLang: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/).optional(),
    // Main country first. Empty only when no source names one (data:check warns).
    countries: z.array(z.string().regex(COUNTRY_CODE)),
    language: z.string().min(2).optional(),
    wd: z.string().regex(WIKIDATA_ID).optional(),
    tmdb: z.number().int().positive().optional(),
  })
  .strict()
  .refine((m) => (m.originalTitle === undefined) === (m.originalLang === undefined), {
    message: "originalTitle and originalLang come together",
  });

export const moviesFileSchema = z.record(filmKey, movieEntrySchema).superRefine((file, ctx) => {
  for (const [key, m] of Object.entries(file)) {
    if (WIKIDATA_ID.test(key) && m.wd !== undefined && m.wd !== key) {
      ctx.addIssue({ code: "custom", path: [key, "wd"], message: `keyed by ${key} but wd is ${m.wd}` });
    }
  }
});

export type MovieEntry = z.infer<typeof movieEntrySchema>;
export type MoviesFile = z.infer<typeof moviesFileSchema>;

// ---------------------------------------------------------------------------------------------
// data/editions/<award>/<year>.json: one award in one film year.

/**
 * A film in an edition, matched by IMDb ID (or QID), never by title. A film the research
 * scripts couldn't resolve is written with its Wikipedia title and `unresolved: true`;
 * data:check lists it and refuses to pass until it is resolved or left out (§3.4).
 */
const filmRef = {
  imdb: z.string().regex(IMDB_ID).optional(),
  wd: z.string().regex(WIKIDATA_ID).optional(),
  title: z.string().min(1),
  unresolved: z.literal(true).optional(),
};

const hasFilmId = (r: { imdb?: string; wd?: string; unresolved?: true }) =>
  r.unresolved === true ? r.imdb === undefined && r.wd === undefined : r.imdb !== undefined || r.wd !== undefined;
const filmIdMessage = { message: "needs imdb or wd, or `unresolved: true` with neither" };

export const resultEntrySchema = z
  .object({
    category: z.string().regex(SLUG),
    ...filmRef,
    outcome: z.enum(outcome.enumValues),
    // Submitting country, International only.
    country: z.string().regex(COUNTRY_CODE).optional(),
  })
  .strict()
  .refine(hasFilmId, filmIdMessage);

export const screeningEntrySchema = z
  .object({
    ...filmRef,
    section: z.string().min(1),
    sectionOrder: z.number().int().optional(),
    prize: z.string().min(1).optional(),
  })
  .strict()
  .refine(hasFilmId, filmIdMessage);

export const editionFileSchema = z
  .object({
    award: z.string().regex(SLUG),
    year: z.number().int().min(2012),
    ordinal: z.string().min(1).optional(),
    status: z.enum(editionStatus.enumValues),
    shortlistOn: DATE.optional(),
    nominationsOn: DATE.optional(),
    winnersOn: DATE.optional(),
    sourceUrls: z.array(z.url()),
    note: z.string().min(1).optional(),
    results: z.array(resultEntrySchema),
    screenings: z.array(screeningEntrySchema),
  })
  .strict();

export type ResultEntry = z.infer<typeof resultEntrySchema>;
export type ScreeningEntry = z.infer<typeof screeningEntrySchema>;
export type EditionFile = z.infer<typeof editionFileSchema>;

/** The key a result or screening names its film by (`undefined` when unresolved). */
export const refKey = (r: { imdb?: string; wd?: string }) => r.imdb ?? r.wd;

// ---------------------------------------------------------------------------------------------
// data/marks.json

/**
 * One film's marks in `data/marks.json` (the marks export, §3.5). Films are named by IMDb ID
 * or Wikidata QID, never by database id, so the file survives any reload. `title` and `year`
 * are there for a person reading the file; restore ignores them.
 */
export const markEntrySchema = z
  .object({
    imdb: z.string().regex(IMDB_ID).optional(),
    wd: z.string().regex(WIKIDATA_ID).optional(),
    title: z.string().min(1).optional(),
    year: z.number().int().optional(),
    watched: z.boolean(),
    want: z.boolean(),
    updatedAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((m) => m.imdb !== undefined || m.wd !== undefined, {
    message: "needs an IMDb ID (imdb) or a Wikidata QID (wd)",
  })
  .refine((m) => !(m.watched && m.want), { message: "can't be both watched and want" });

export type MarkEntry = z.infer<typeof markEntrySchema>;

/** Each film at most once, by IMDb ID and by QID. */
export const marksFileSchema = z.array(markEntrySchema).superRefine((entries, ctx) => {
  const seen = new Set<string>();
  entries.forEach((m, i) => {
    for (const id of [m.imdb, m.wd]) {
      if (id === undefined) continue;
      if (seen.has(id)) ctx.addIssue({ code: "custom", path: [i], message: `${id} appears twice` });
      seen.add(id);
    }
  });
});

export type MarksFile = z.infer<typeof marksFileSchema>;
