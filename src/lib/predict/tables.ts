// The engine's seasons from the database's rows (IMPLEMENTATION_PLAN.md §5.3). Pure: the scripts
// (`scripts/lib/compute.ts`) and the app (`src/data/patterns.ts`) read the rows and call this.
import { finishedYears } from "../accuracy";
import { isNomination, type Outcome } from "../stage";
import { nominationSlots } from "./season";
import type { OscarCategory, PrecursorResult, Season, SeasonFilm } from "./types";

/** The rows a season is built from: only the columns it reads. */
export type SeasonTables = {
  awardRows: ReadonlyArray<{ id: number; kind: string; slug: string }>;
  categoryRows: ReadonlyArray<{ id: number; awardId: number; slug: string; oscarCategory: string }>;
  editionRows: ReadonlyArray<{
    id: number;
    awardId: number;
    year: number;
    status: "loaded" | "partial" | "no_data";
    shortlistOn: string | null;
    nominationsOn: string | null;
    winnersOn: string | null;
  }>;
  resultRows: ReadonlyArray<{ editionId: number; categoryId: number; movieId: number; outcome: Outcome }>;
};

/**
 * Every season of one Oscar category, as the engine reads it: per Oscars edition, each film with
 * a result at an award category mapped to it that film year (with its edition's dates), and its
 * Oscar outcome. `today` decides which seasons are finished (history).
 */
export function buildSeasons(t: SeasonTables, category: OscarCategory, today: string): Season[] {
  const oscarsAward = t.awardRows.find((a) => a.kind === "oscars");
  if (!oscarsAward) throw new Error("No Oscars award in the database, so no predictions can be worked out.");
  const oscarCategory = t.categoryRows.find((c) => c.awardId === oscarsAward.id && c.oscarCategory === category);
  const awardSlug = new Map(t.awardRows.map((a) => [a.id, a.slug]));
  const mapped = new Map(
    t.categoryRows
      .filter((c) => c.awardId !== oscarsAward.id && c.oscarCategory === category)
      .map((c) => [c.id, `${awardSlug.get(c.awardId)}/${c.slug}`]),
  );
  const editionById = new Map(t.editionRows.map((e) => [e.id, e]));
  const oscarEditions = t.editionRows.filter((e) => e.awardId === oscarsAward.id);
  const finished = finishedYears(
    oscarEditions.map((e) => ({
      year: e.year,
      status: e.status,
      winnersOn: e.winnersOn,
      results: t.resultRows
        .filter((r) => r.editionId === e.id && r.categoryId === oscarCategory?.id)
        .map((r) => ({ movie: r.movieId, outcome: r.outcome })),
    })),
    today,
  );

  return oscarEditions
    .map((oscars) => {
      const films = new Map<number, { results: PrecursorResult[]; oscar: Outcome | null }>();
      const film = (movie: number) => {
        let f = films.get(movie);
        if (!f) films.set(movie, (f = { results: [], oscar: null }));
        return f;
      };
      for (const r of t.resultRows) {
        const edition = editionById.get(r.editionId);
        if (!edition || edition.year !== oscars.year) continue;
        if (edition.id === oscars.id) {
          if (r.categoryId === oscarCategory?.id) film(r.movieId).oscar = r.outcome;
          continue;
        }
        const key = mapped.get(r.categoryId);
        if (key === undefined) continue;
        film(r.movieId).results.push({
          award: awardSlug.get(edition.awardId)!,
          category: key,
          outcome: r.outcome,
          nominationsOn: edition.nominationsOn,
          winnersOn: edition.winnersOn,
        });
      }
      const seasonFilms: SeasonFilm[] = [...films].map(([movie, f]) => ({ movie, ...f }));
      const nominees = seasonFilms.filter((f) => f.oscar !== null && isNomination(f.oscar)).length;
      return {
        year: oscars.year,
        finished: finished.has(oscars.year),
        slots: nominationSlots(category, oscars.year, nominees),
        oscar: { shortlistOn: oscars.shortlistOn, nominationsOn: oscars.nominationsOn, winnersOn: oscars.winnersOn },
        films: seasonFilms,
      };
    })
    .sort((a, b) => a.year - b.year);
}
