// The accuracy page's rows (task 2.8) against the seeded `test` data: every award that maps to
// Best Picture with its stored figures, the finished seasons, and the dashes.
import { afterAll, describe, expect, it } from "vitest";
import { createScriptDb } from "../../src/db";
import { queryAccuracy } from "../../src/data/accuracy";

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
    expect(rows.some((r) => r.key.startsWith("oscars/"))).toBe(false);
    expect(new Set(rows.map((r) => r.kind))).toEqual(new Set(["major", "festival"]));
  });

  it("marks a winners-only award with no nominee figure and a list with no winner count", async () => {
    const { rows } = await queryAccuracy(db, "picture", "2026-03-16");
    const cannes = rows.find((r) => r.award === "Cannes")!;
    expect(cannes.nominees).toBeNull();
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
