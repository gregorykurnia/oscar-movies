// Zod schemas for the data files (IMPLEMENTATION_PLAN.md §3.3). Every script that reads a
// file in `data/` validates it here first. Task 1.1 adds the awards, editions and movies files.
import { z } from "zod";

export const IMDB_ID = /^tt\d+$/;
export const WIKIDATA_ID = /^Q\d+$/;

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
