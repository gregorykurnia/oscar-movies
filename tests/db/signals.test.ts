// Strong signals (task 7.5) against the seeded `test` data: 2025 Documentary, the day after the
// 2025 ceremony, so the figures cover 2012–2025 as the accuracy page shows them.
import { afterAll, describe, expect, it } from "vitest";
import { createScriptDb } from "../../src/db";
import { querySignals } from "../../src/data/signals";

const { db, close } = createScriptDb();
afterAll(() => close());

const fig = (f: { hits: number; count: number }) => `${f.hits}/${f.count}`;

describe("querySignals, 2025 Documentary", () => {
  it("lists Cinema Eye's strong categories with their figures", async () => {
    const { byAward } = await querySignals(db, "documentary", 2025, "2026-03-16");
    const cinemaEye = byAward
      .filter((a) => a.row.key.startsWith("cinema-eye/"))
      .map((a) => ({ key: a.row.key, years: a.row.years, kinds: a.kinds.map((k) => `${k.kind} ${fig(k.figure)}`) }));
    expect(cinemaEye).toEqual([
      { key: "cinema-eye/feature", years: 14, kinds: ["caught 39/70", "winner 12/14"] },
      { key: "cinema-eye/audience", years: 14, kinds: ["caught 40/70"] },
      { key: "cinema-eye/unforgettables", years: 13, kinds: ["caught 37/65"] },
    ]);
  });

  it("lists Cinema Eye's winner first with its Oscar outcome, and its nominees", async () => {
    const { byAward } = await querySignals(db, "documentary", 2025, "2026-03-16");
    const feature = byAward.find((a) => a.row.key === "cinema-eye/feature")!;
    expect(feature.films![0]).toMatchObject({ film: { title: "Come See Me in the Good Light" }, outcome: "won", oscar: "nominated" });
    expect(feature.films!.map((f) => f.film.title)).toContain("The Perfect Neighbor");
    expect(feature.films!.every((f) => f.film.flag === null || /^[A-Z]{2}$/.test(f.film.flag))).toBe(true);
  });

  it("counts each film's strong awards in the by-film view", async () => {
    const { byFilm } = await querySignals(db, "documentary", 2025, "2026-03-16");
    const neighbor = byFilm.find((f) => f.film.title === "The Perfect Neighbor")!;
    expect(neighbor.oscar).toBe("nominated");
    expect(neighbor.picks.map((p) => p.row.key)).toContain("cinema-eye/feature");
    expect(byFilm[0].picks.length).toBeGreaterThanOrEqual(byFilm.at(-1)!.picks.length);
  });
});
