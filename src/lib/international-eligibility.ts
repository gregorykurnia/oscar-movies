import type { SeasonTables } from "./predict/tables";

export const ENGLISH_LANGUAGE_TAG = /^\s*(?:en|eng)(?:\s*$|-)/i;

/**
 * The film language field can record English for multilingual films. A confirmed Academy entry
 * takes precedence, including when a festival picked it a year earlier. Submission alone is provisional.
 */
export function internationalExclusions(tables: SeasonTables): Set<number> {
  const excluded = new Set(tables.movieRows?.filter((m) => ENGLISH_LANGUAGE_TAG.test(m.language ?? "")).map((m) => m.id));
  if (excluded.size === 0) return excluded;

  const oscars = tables.awardRows.find((a) => a.kind === "oscars");
  const international = tables.categoryRows.find((c) => c.awardId === oscars?.id && c.oscarCategory === "international");
  for (const result of tables.resultRows) {
    if (result.categoryId === international?.id && result.outcome !== "submitted") excluded.delete(result.movieId);
  }
  return excluded;
}
