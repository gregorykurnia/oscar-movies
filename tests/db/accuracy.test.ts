// The accuracy page's rows (task 2.8) against the seeded `test` data: every award that maps to
// Best Picture with its stored figures, the finished seasons, and the dashes.
import { randomUUID } from "node:crypto";
import { and, eq, TransactionRollbackError } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createScriptDb } from "../../src/db";
import { queryAccuracy } from "../../src/data/accuracy";
import { awardCategories, awards, editions, movies, results } from "../../src/db/schema";
import { queryBacktest } from "../../src/data/backtest";
import { queryPatternSeasons } from "../../src/data/patterns";
import { queryPrecursorAwardCount } from "../../src/data/predictions";

const { db, close } = createScriptDb();
afterAll(() => close());

describe("queryAccuracy", () => {
  it("counts the finished Best Picture seasons: 2012 to 2025 on the day after the 2025 ceremony", async () => {
    const { seasons } = await queryAccuracy(db, "picture", "2026-03-16");
    expect(seasons[0]).toBe(2012);
    expect(seasons.at(-1)).toBe(2025);
    expect(seasons).toHaveLength(14);
  });

  it("leaves a season out until its ceremony has passed", async () => {
    const { seasons } = await queryAccuracy(db, "picture", "2026-03-14");
    expect(seasons.at(-1)).toBe(2024);
  });

  it("has a row per award category that maps to Best Picture, with the Oscars left out", async () => {
    const { rows } = await queryAccuracy(db, "picture", "2026-03-16");
    const bafta = rows.find((r) => r.key === "bafta/film")!;
    expect(bafta).toMatchObject({ award: "BAFTA", kind: "major", note: "Best Film", years: 14 });
    expect(bafta.win!.count).toBe(14);
    expect(bafta.nominees!.count).toBeGreaterThan(14);
    // Every Best Picture nominee of 14 seasons (8 to 10 a year), read back from its own columns.
    expect(bafta.caught!.count).toBeGreaterThan(100);
    expect(bafta.caught!.hits).toBeLessThanOrEqual(bafta.caught!.count);
    expect(rows.some((r) => r.key.startsWith("oscars/"))).toBe(false);
    expect(new Set(rows.map((r) => r.kind))).toEqual(new Set(["major", "festival", "critics"]));
  });

  it("marks a winners-only award with no nominee figure and a list with no winner count", async () => {
    const { rows } = await queryAccuracy(db, "picture", "2026-03-16");
    const cannes = rows.find((r) => r.award === "Cannes")!;
    expect(cannes.nominees).toBeNull();
    expect(cannes.caught).toBeNull();
    expect(cannes.note).toContain("winners only");
    const afi = rows.find((r) => r.award === "AFI")!;
    expect(afi.win!.count).toBe(0);
    expect(afi.note).toContain("a list, no winner");
    expect(afi.nominees!.count).toBeGreaterThan(0);
  });

  it("only counts years a category has results in: Cinema Eye's documentary has fewer than the finished seasons", async () => {
    const { rows, seasons } = await queryAccuracy(db, "documentary", "2026-03-16");
    const cinemaEye = rows.find((r) => r.award.startsWith("Cinema Eye"))!;
    expect(cinemaEye.years).toBeLessThanOrEqual(seasons.length);
    expect(cinemaEye.years).toBe(cinemaEye.win!.count);
  });
});

describe("the shortlist rule (task 8.1)", () => {
  // Every result of one award category, with its edition's year and status.
  const resultsOf = (award: string, category: string) =>
    db
      .select({ year: editions.year, status: editions.status, movieId: results.movieId, outcome: results.outcome })
      .from(results)
      .innerJoin(editions, eq(editions.id, results.editionId))
      .innerJoin(awardCategories, eq(awardCategories.id, results.categoryId))
      .innerJoin(awards, eq(awards.id, awardCategories.awardId))
      .where(and(eq(awards.slug, award), eq(awardCategories.slug, category)));

  it("counts only the European Film Awards Documentary winners that made that season's shortlist", async () => {
    const { rows, seasons } = await queryAccuracy(db, "documentary", "2026-03-16");
    const efa = rows.find((r) => r.key === "european-film-awards/documentary")!;
    const oscars = await resultsOf("oscars", "documentary");
    const shortlisted = (movie: number, year: number) =>
      oscars.some((o) => o.movieId === movie && o.year === year && ["shortlisted", "runner_up", "nominated", "won"].includes(o.outcome));
    const nominated = (movie: number) => oscars.some((o) => o.movieId === movie && (o.outcome === "nominated" || o.outcome === "won"));

    const winners = (await resultsOf("european-film-awards", "documentary")).filter(
      (r) => r.outcome === "won" && r.status !== "no_data" && seasons.includes(r.year),
    );
    // One winner a year; the European Film Awards is not a festival, so only that season's shortlist counts.
    const counted = winners.filter((w) => shortlisted(w.movieId, w.year));
    expect(new Set(winners.map((w) => w.year)).size).toBe(winners.length);
    expect(counted.length).toBeGreaterThan(0);
    expect(counted.length).toBeLessThan(winners.length);
    expect(efa.nomination).toEqual({ hits: counted.filter((w) => nominated(w.movieId)).length, count: counted.length });
    // The years still count every season with results.
    expect(efa.years).toBe(winners.length);
  });
});

it("agrees on International eligibility across year coverage, precursor counts and pattern seasons", async () => {
  const year = 2023;
  const today = "2024-03-11";
  await expect(db.transaction(async (tx) => {
    const before = await queryPrecursorAwardCount(tx, year, "international");
    const [oscar] = await tx
      .select({ editionId: editions.id, categoryId: awardCategories.id })
      .from(editions)
      .innerJoin(awards, eq(awards.id, editions.awardId))
      .innerJoin(awardCategories, eq(awardCategories.awardId, awards.id))
      .where(and(eq(awards.slug, "oscars"), eq(editions.year, year), eq(awardCategories.oscarCategory, "international")));

    const slug = "test-english-international";
    const [award] = await tx.insert(awards).values({
      slug, name: "Language rule test festival", shortName: "Language test", kind: "festival", calendarOrder: 99,
    }).returning();
    const [category] = await tx.insert(awardCategories).values({
      awardId: award.id, slug: "prize", name: "Prize", oscarCategory: "international",
    }).returning();
    const [edition] = await tx.insert(editions).values({ awardId: award.id, year, status: "loaded" }).returning();
    const [movie] = await tx.insert(movies).values({
      slug, title: "Language rule test film", year, language: " EN-GB ", countries: ["GB"], localId: randomUUID(),
    }).returning();
    await tx.insert(results).values({ editionId: edition.id, categoryId: category.id, movieId: movie.id, outcome: "won" });
    const [submission] = await tx.insert(results).values({
      ...oscar, movieId: movie.id, outcome: "submitted", country: "GB",
    }).returning();

    const check = async (included: boolean) => {
      const { rows } = await queryAccuracy(tx, "international", today);
      expect(rows.find((r) => r.key === `${slug}/prize`)?.years).toBe(Number(included));
      expect(await queryPrecursorAwardCount(tx, year, "international")).toBe(before + Number(included));
      const { seasons } = await queryPatternSeasons(tx, "international", today);
      expect(seasons.find((s) => s.year === year)!.films.some((f) => f.movie === movie.id)).toBe(included);
    };
    await check(false);
    await tx.update(results).set({ outcome: "eligible" }).where(eq(results.id, submission.id));
    await check(true);
    tx.rollback();
  })).rejects.toBeInstanceOf(TransactionRollbackError);
});

describe("queryBacktest", () => {
  it("lists every finished Best Picture season with its favourite and result", async () => {
    const { seasons } = await queryAccuracy(db, "picture", "2026-03-16");
    const backtest = await queryBacktest(db, "picture", seasons);
    expect(backtest.rows.map((r) => r.year)).toEqual([...seasons].sort((a, b) => b - a));
    // The seeded history has both eves for every finished season.
    for (const row of backtest.rows) {
      expect(row.favourite, String(row.year)).not.toBeNull();
      expect(row.result, String(row.year)).not.toBeNull();
      expect(row.topSlots, String(row.year)).not.toBeNull();
    }
    expect(backtest.favouriteWon.count).toBe(seasons.length);
    const hits = backtest.rows.filter((r) => r.result?.kind === "won").length;
    expect(backtest.favouriteWon.hits).toBe(hits);
    const lost = backtest.rows.find((r) => r.result?.kind === "lost");
    if (lost?.result?.kind === "lost") expect(lost.result.to.length).toBeGreaterThan(0);
    // 2021 on has ten Picture slots.
    expect(backtest.rows.find((r) => r.year === 2024)!.topSlots!.slots).toBe(10);
  });

  it("is empty for no seasons", async () => {
    expect((await queryBacktest(db, "picture", [])).rows).toEqual([]);
  });
});
