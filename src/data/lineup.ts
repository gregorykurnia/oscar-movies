// One festival's lineup in one film year (plan §3.1 `screenings`, guide §8.3): its films by section,
// each with its flags, scores and the prizes it won there. Cached under `awards` and `scores`; see
// `films.ts` for the query/cached pairing.
import { and, asc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { awards, editions, movies, screenings } from "@/db/schema";
import { queryAwardEdition, type AwardEdition } from "./awards";
import { filmColumns, toFilmRow, type FilmRowData, type ReadDb } from "./films";

/** A film in a section, with the prizes it won there ("; " between them, or null). */
export type LineupFilm = FilmRowData & { prize: string | null };

export type LineupSection = {
  name: string;
  /** The section's place in the festival's programme, from 1. */
  order: number;
  films: LineupFilm[];
};

export type Lineup = {
  /** Null when the festival has no edition in that year. */
  edition: AwardEdition | null;
  /** In programme order. */
  sections: LineupSection[];
};

/** A festival's lineup for a film year: the edition, then its sections with their films by title. */
export async function queryLineup(db: ReadDb, awardSlug: string, year: number): Promise<Lineup> {
  const [edition, rows] = await Promise.all([
    queryAwardEdition(db, awardSlug, year),
    db
      .select({
        ...filmColumns,
        section: screenings.section,
        sectionOrder: screenings.sectionOrder,
        prize: screenings.prize,
      })
      .from(screenings)
      .innerJoin(editions, eq(editions.id, screenings.editionId))
      .innerJoin(awards, eq(awards.id, editions.awardId))
      .innerJoin(movies, eq(movies.id, screenings.movieId))
      .where(and(eq(awards.slug, awardSlug), eq(editions.year, year)))
      .orderBy(asc(screenings.sectionOrder), asc(movies.title)),
  ]);
  const sections = new Map<number, LineupSection>();
  for (const row of rows) {
    const section = sections.get(row.sectionOrder) ?? { name: row.section, order: row.sectionOrder, films: [] };
    section.films.push({ ...toFilmRow(row), prize: row.prize });
    sections.set(row.sectionOrder, section);
  }
  return { edition, sections: [...sections.values()] };
}

/** The festival's lineup for a film year (`/festivals/[festival]/[year]`). */
export async function getLineup(awardSlug: string, year: number): Promise<Lineup> {
  "use cache";
  cacheTag("awards", "scores");
  cacheLife("max");
  return queryLineup(getDb(), awardSlug, year);
}
