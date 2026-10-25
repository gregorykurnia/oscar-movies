// The accuracy page's rows (plan §5.2, guide §8.5): every award category that maps to one Oscar
// category, with its stored figures and the finished seasons it covers. Cached under `awards`;
// `today` is an argument so the cache turns over when a ceremony passes. See `films.ts` for the
// query/cached pairing.
import { and, asc, eq, ne } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { accuracy, awardCategories, awards, editions, results } from "@/db/schema";
import { finishedYears } from "@/lib/accuracy";
import { rowNote, type AccuracyRow } from "@/lib/accuracy-page";
import type { AwardKind } from "@/lib/awards";
import type { ReadDb } from "./films";
import type { OscarCategory } from "./oscars";

export type AccuracyData = {
  /** The Oscar category's finished seasons, oldest first. */
  seasons: number[];
  rows: AccuracyRow[];
};

/**
 * The Oscar category's finished seasons, and a row per award category that maps to it. A row's
 * years are the finished seasons in which the award has results in the category (as the figures
 * count them); a category the figures haven't been computed for shows dashes.
 */
export async function queryAccuracy(db: ReadDb, category: OscarCategory, today: string): Promise<AccuracyData> {
  const oscarRows = await db
    .select({ year: editions.year, status: editions.status, winnersOn: editions.winnersOn, outcome: results.outcome })
    .from(editions)
    .innerJoin(awards, eq(awards.id, editions.awardId))
    .innerJoin(awardCategories, eq(awardCategories.awardId, awards.id))
    .leftJoin(results, and(eq(results.editionId, editions.id), eq(results.categoryId, awardCategories.id)))
    .where(and(eq(awards.kind, "oscars"), eq(awardCategories.oscarCategory, category)));
  const byYear = new Map<number, { status: "loaded" | "partial" | "no_data"; winnersOn: string | null; outcomes: string[] }>();
  for (const r of oscarRows) {
    const entry = byYear.get(r.year) ?? { status: r.status, winnersOn: r.winnersOn, outcomes: [] };
    if (r.outcome) entry.outcomes.push(r.outcome);
    byYear.set(r.year, entry);
  }
  const finished = finishedYears(
    [...byYear].map(([year, e]) => ({
      year,
      status: e.status,
      winnersOn: e.winnersOn,
      results: e.outcomes.map((outcome) => ({ movie: 0, outcome: outcome as "won" })),
    })),
    today,
  );

  const categoryRows = await db
    .select({
      id: awardCategories.id,
      awardSlug: awards.slug,
      awardName: awards.shortName,
      kind: awards.kind,
      winnersOnly: awards.winnersOnly,
      isSelection: awards.isSelection,
      name: awardCategories.name,
      slug: awardCategories.slug,
      loose: awardCategories.loose,
      winHits: accuracy.winHits,
      winCount: accuracy.winCount,
      nomHits: accuracy.nomHits,
      nomCount: accuracy.nomCount,
      nomineesHits: accuracy.nomineesHits,
      nomineesCount: accuracy.nomineesCount,
      caughtHits: accuracy.caughtHits,
      caughtCount: accuracy.caughtCount,
    })
    .from(awardCategories)
    .innerJoin(awards, eq(awards.id, awardCategories.awardId))
    .leftJoin(accuracy, eq(accuracy.categoryId, awardCategories.id))
    .where(and(eq(awardCategories.oscarCategory, category), ne(awards.kind, "oscars")))
    .orderBy(asc(awards.calendarOrder), asc(awardCategories.sortOrder), asc(awardCategories.id));

  const yearRows = await db
    .select({ categoryId: results.categoryId, year: editions.year, status: editions.status })
    .from(results)
    .innerJoin(editions, eq(editions.id, results.editionId))
    .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
    .where(eq(awardCategories.oscarCategory, category))
    .groupBy(results.categoryId, editions.year, editions.status);
  const yearsOf = (categoryId: number) =>
    yearRows.filter((r) => r.categoryId === categoryId && r.status !== "no_data" && finished.has(r.year)).length;

  const figure = (hits: number | null, count: number | null) => (hits === null || count === null ? null : { hits, count });
  const rows = categoryRows.map(
    (c): AccuracyRow => ({
      key: `${c.awardSlug}/${c.slug}`,
      award: c.awardName,
      kind: c.kind as AwardKind,
      note: rowNote(c),
      win: figure(c.winHits, c.winCount),
      nomination: figure(c.nomHits, c.nomCount),
      nominees: figure(c.nomineesHits, c.nomineesCount),
      caught: figure(c.caughtHits, c.caughtCount),
      years: yearsOf(c.id),
    }),
  );
  return { seasons: [...finished].sort((a, b) => a - b), rows };
}

/** Cached `queryAccuracy`. */
export async function getAccuracy(category: OscarCategory, today: string): Promise<AccuracyData> {
  "use cache";
  cacheTag("awards");
  cacheLife("max");
  return queryAccuracy(getDb(), category, today);
}
