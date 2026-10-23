import { describe, expect, it } from "vitest";
import { accuracyStats, oscarCell, oscarName } from "./award-page";

describe("accuracyStats", () => {
  it("shows each figure with its count and a meter", () => {
    const stats = accuracyStats({
      win: { hits: 11, count: 14 },
      nomination: { hits: 13, count: 14 },
      nominees: { hits: 20, count: 80 },
    });
    expect(stats.map((s) => [s.value, s.of, s.meter])).toEqual([
      ["79%", "11 of 14", (11 / 14) * 100],
      ["93%", "13 of 14", (13 / 14) * 100],
      ["25%", "20 of 80", 25],
    ]);
  });

  it("reads – for a winners-only award's nominee figure and for nothing counted", () => {
    const stats = accuracyStats({ win: { hits: 2, count: 4 }, nomination: { hits: 3, count: 4 }, nominees: null });
    expect(stats[2]).toEqual({ value: "–", label: "Nominees were nominated" });
    expect(accuracyStats(null).map((s) => s.value)).toEqual(["–", "–", "–"]);
  });
});

describe("oscarCell", () => {
  it("shows the stage a film reached, with International's country", () => {
    expect(oscarCell({ outcome: "won", country: null }, "finished", "picture")).toEqual({ stage: "won", country: null });
    expect(oscarCell({ outcome: "nominated", country: "BR" }, "finished", "international")).toEqual({
      stage: "nominated",
      country: "BR",
    });
  });

  it("reads Not nominated for a film off the list once the nominees are out", () => {
    expect(oscarCell(null, "nominations", "picture")?.stage).toBe("not-nominated");
    expect(oscarCell(null, "finished", "picture")?.stage).toBe("not-nominated");
  });

  it("says nothing before the nominations", () => {
    expect(oscarCell(null, "before", "picture")).toBeNull();
    expect(oscarCell(null, "shortlist", "international")).toBeNull();
  });

  it("reads an International film that went to the vote and missed as Not nominated", () => {
    expect(oscarCell({ outcome: "eligible", country: "FR" }, "finished", "international")?.stage).toBe("not-nominated");
  });
});

describe("oscarName", () => {
  it("names the Oscar category", () => {
    expect(oscarName("picture")).toBe("Best Picture");
    expect(oscarName("international")).toBe("Best International Feature");
  });
});
