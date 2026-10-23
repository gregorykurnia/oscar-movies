import { describe, expect, it } from "vitest";
import {
  awardRowCaption,
  awardsSections,
  movieAwardRows,
  precursorLine,
  resultLabel,
  resultSummary,
  type AwardCandidate,
  type AwardResult,
  type MovieAwardRow,
  type PrecursorResult,
} from "./movie-awards";

const base = { kind: "major", calendarOrder: 600, isSelection: false, year: 2024, oscarCategory: "picture" } as const;
const result = (awardSlug: string, categoryName: string, outcome: AwardResult["outcome"], more: Partial<AwardResult> = {}): AwardResult => ({
  ...base,
  awardSlug,
  awardName: awardSlug.toUpperCase(),
  categoryName,
  outcome,
  ...more,
});
const candidate = (awardSlug: string, categoryName: string, since: string | null, more: Partial<AwardCandidate> = {}): AwardCandidate => ({
  ...base,
  awardSlug,
  awardName: awardSlug.toUpperCase(),
  categoryName,
  since,
  ...more,
});

describe("movieAwardRows", () => {
  it("keeps wins, nominations and runner-up places, and adds not nominated for awards that passed the film over", () => {
    const rows = movieAwardRows(
      [result("bafta", "Best Film", "won"), result("pga", "Best Picture", "nominated"), result("tiff", "People's Choice", "runner_up", { kind: "festival" })],
      [candidate("bafta", "Best Film", "2025-01-07"), candidate("spirit", "Best Feature", "2024-12-04")],
    );
    expect(rows.map((r) => [r.awardSlug, r.result])).toEqual([
      ["bafta", "won"],
      ["pga", "nominated"],
      ["tiff", "runner_up"],
      ["spirit", "not_nominated"],
    ]);
  });

  it("ignores outcomes that aren't a result at the award (submitted, shortlisted, eligible)", () => {
    const rows = movieAwardRows([result("x", "Y", "shortlisted")], []);
    expect(rows).toEqual([]);
  });

  it("gives one not nominated for an award with several categories, and none if the film is in any of them", () => {
    const globes = [candidate("golden-globes", "Drama", "2024-12-09"), candidate("golden-globes", "Musical or Comedy", "2024-12-09")];
    const passed = movieAwardRows([], globes);
    expect(passed).toHaveLength(1);
    expect(passed[0]).toMatchObject({ category: "Drama / Musical or Comedy", result: "not_nominated" });
    expect(movieAwardRows([result("golden-globes", "Drama", "nominated")], globes).map((r) => r.result)).toEqual(["nominated"]);
  });

  it("keeps Oscar categories apart: a Picture nomination doesn't answer for International", () => {
    const rows = movieAwardRows(
      [result("bafta", "Best Film", "nominated")],
      [candidate("bafta", "Best Film", "2025-01-07"), candidate("bafta", "Not in English", "2025-01-07", { oscarCategory: "international" })],
    );
    expect(rows.map((r) => [r.category, r.result])).toEqual([
      ["Best Film", "nominated"],
      ["Not in English", "not_nominated"],
    ]);
  });
});

describe("awardsSections", () => {
  const row = (result: MovieAwardRow["result"], more: Partial<MovieAwardRow> = {}): MovieAwardRow => ({
    ...base,
    awardSlug: "a",
    awardName: "A",
    category: "C",
    result,
    since: null,
    ...more,
  });

  it("orders sections major, festivals, critics and rows won, nominated, not nominated", () => {
    const sections = awardsSections(
      [
        row("not_nominated", { awardName: "N", since: "2025-01-01" }),
        row("nominated", { awardName: "M" }),
        row("won", { awardName: "W", calendarOrder: 700 }),
        row("won", { awardName: "P", kind: "critics" }),
        row("won", { awardName: "F", kind: "festival" }),
      ],
      "2025-03-01",
    );
    expect(sections.map((s) => s.title)).toEqual(["Major awards", "Festivals", "Critics groups"]);
    expect(sections[0].rows.map((r) => r.awardName)).toEqual(["W", "M", "N"]);
  });

  it("says not nominated only once the nominations are out", () => {
    const rows = [row("not_nominated", { since: "2025-01-07" })];
    expect(awardsSections(rows, "2025-01-06")).toEqual([]);
    expect(awardsSections(rows, "2025-01-07")[0].rows).toHaveLength(1);
    expect(awardsSections([row("not_nominated", { since: null })], "2025-01-06")[0].rows).toHaveLength(1);
  });
});

describe("words", () => {
  it("summarises the critics groups' results", () => {
    expect(resultSummary([{ result: "won" }, { result: "nominated" }, { result: "runner_up" }, { result: "not_nominated" }])).toBe(
      "1 won · 2 nominated · 1 not nominated",
    );
    expect(resultSummary([{ result: "not_nominated" }])).toBe("1 not nominated");
  });

  it("says Selected for a list like AFI's", () => {
    expect(resultLabel({ result: "nominated", isSelection: true })).toBe("Selected");
    expect(resultLabel({ result: "not_nominated", isSelection: true })).toBe("Not selected");
    expect(resultLabel({ result: "won", isSelection: false })).toBeNull();
  });

  it("adds the year and the Oscar category to the caption only when asked", () => {
    const r = { category: "Best Film", year: 2024 } as MovieAwardRow;
    expect(awardRowCaption(r, { showYear: false, oscarName: null })).toBe("Best Film");
    expect(awardRowCaption(r, { showYear: true, oscarName: "Best Picture" })).toBe("Best Film · counts towards Best Picture · 2024");
  });
});

describe("precursorLine", () => {
  const p = (shortName: string, outcome: PrecursorResult["outcome"], more: Partial<PrecursorResult> = {}): PrecursorResult => ({
    shortName,
    kind: "major",
    calendarOrder: 600,
    isSelection: false,
    outcome,
    ...more,
  });

  it("lists wins and nominations, the most telling first, at most four awards", () => {
    const line = precursorLine([
      p("Globes", "nominated", { calendarOrder: 620 }),
      p("PGA", "won", { calendarOrder: 690 }),
      p("BAFTA", "nominated", { calendarOrder: 680 }),
      p("Cannes", "won", { kind: "festival", calendarOrder: 30 }),
      p("Satellite", "nominated", { calendarOrder: 640 }),
      p("Spirit", "nominated", { calendarOrder: 660 }),
    ]);
    expect(line).toEqual({ won: ["PGA", "Cannes"], nominated: ["BAFTA", "Spirit"] });
  });

  it("counts an award once, as a win, when the film won one category and was nominated in another", () => {
    expect(precursorLine([p("Globes", "nominated"), p("Globes", "won")])).toEqual({ won: ["Globes"], nominated: [] });
  });

  it("leaves out AFI's selection and festival runner-up places", () => {
    expect(precursorLine([p("AFI", "nominated", { isSelection: true }), p("TIFF", "runner_up", { kind: "festival" })])).toEqual({
      won: [],
      nominated: [],
    });
  });
});
