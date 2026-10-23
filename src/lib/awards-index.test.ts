// The awards index's words, dates and order (task 2.7, guide §8.7). Pure; no database.
import { describe, expect, it } from "vitest";
import { AWARDS } from "@/lib/awards";
import { awardsOfKind, editionState, givesLabel, oscarsLine, rowDate } from "@/lib/awards-index";
import { DASH } from "@/lib/format";

const award = (slug: string) => AWARDS.find((a) => a.slug === slug)!;

describe("givesLabel", () => {
  it("names the Oscar categories in the race's order, or all four", () => {
    expect(givesLabel(award("bafta"))).toBe("All four categories");
    expect(givesLabel(award("golden-globes"))).toBe("Picture, International, Animated");
    expect(givesLabel(award("sundance"))).toBe("Picture, Documentary, International");
    expect(givesLabel(award("cannes"))).toBe("Picture");
  });
});

describe("rowDate", () => {
  it("gives a major's winners' day, a festival's month, and a dash when unknown", () => {
    expect(rowDate("major", "2026-01-11")).toBe("11 Jan 2026");
    expect(rowDate("festival", "2026-05-23")).toBe("May 2026");
    expect(rowDate("major", null)).toBe(DASH);
  });
});

describe("editionState", () => {
  it("reads a missing or no-data edition as no data, and a partial one as partial", () => {
    const edition = (status: "loaded" | "partial" | "no_data") => ({
      year: 2026,
      ordinal: null,
      status,
      note: null,
      winnersOn: null,
    });
    expect(editionState(undefined)).toBe("no-data");
    expect(editionState(edition("no_data"))).toBe("no-data");
    expect(editionState(edition("partial"))).toBe("partial");
    expect(editionState(edition("loaded"))).toBe("loaded");
  });
});

describe("awardsOfKind", () => {
  it("lists each section in calendar order", () => {
    expect(awardsOfKind("festival").map((a) => a.slug)).toEqual(["sundance", "berlin", "cannes", "venice", "tiff"]);
    expect(awardsOfKind("major").map((a) => a.slug)).toEqual([
      "afi",
      "cinema-eye",
      "golden-globes",
      "european-film-awards",
      "satellite",
      "dga",
      "spirit-awards",
      "annie",
      "bafta",
      "pga",
      "actor-awards",
    ]);
    const critics = awardsOfKind("critics").map((a) => a.slug);
    expect(critics.slice(0, 2)).toEqual(["critics-choice-documentary", "gotham"]);
    expect(critics.at(-1)).toBe("peabody");
  });

  it("follows the year's own dates where it has them, and keeps an undated award in its place", () => {
    const dates = new Map<string, string | null>([
      ["golden-globes", "2026-01-11"],
      ["satellite", "2026-03-08"],
      ["bafta", "2026-02-22"],
      ["afi", null],
    ]);
    const order = awardsOfKind("major", dates).map((a) => a.slug);
    expect(order.indexOf("bafta")).toBeLessThan(order.indexOf("satellite"));
    expect(order.indexOf("golden-globes")).toBeLessThan(order.indexOf("bafta"));
    expect(order.indexOf("afi")).toBe(awardsOfKind("major").map((a) => a.slug).indexOf("afi"));
    expect(new Set(order)).toEqual(new Set(awardsOfKind("major").map((a) => a.slug)));
  });
});

describe("oscarsLine", () => {
  it("gives the ceremony's day, then the Best Picture winner once known", () => {
    expect(oscarsLine("2027-03-14", null)).toBe("14 Mar 2027");
    expect(oscarsLine("2026-03-15", "One Battle After Another")).toBe(
      "15 Mar 2026 · One Battle After Another won Best Picture",
    );
    expect(oscarsLine(null, null)).toBe("");
  });
});
