import { describe, expect, it } from "vitest";
import { OUTCOMES, compareOutcome, flagsFor, isNomination, isShortlisted, outcomeStage, type Outcome } from "./stage";

describe("compareOutcome", () => {
  it("orders submitted < eligible = shortlisted < runner_up = nominated < won", () => {
    const sorted = [...OUTCOMES].reverse().sort(compareOutcome);
    expect(sorted[0]).toBe("submitted");
    expect(sorted.at(-1)).toBe("won");
    expect(compareOutcome("eligible", "shortlisted")).toBe(0);
    expect(compareOutcome("runner_up", "nominated")).toBe(0);
    expect(compareOutcome("shortlisted", "nominated")).toBeLessThan(0);
  });
});

describe("isNomination", () => {
  it("counts runner-up, nominated and won", () => {
    const noms = OUTCOMES.filter((o: Outcome) => isNomination(o));
    expect(noms).toEqual(["runner_up", "nominated", "won"]);
  });
});

describe("isShortlisted", () => {
  it("counts the shortlist and everything past it, not eligible or submitted", () => {
    const listed = OUTCOMES.filter((o: Outcome) => isShortlisted(o));
    expect(listed).toEqual(["shortlisted", "runner_up", "nominated", "won"]);
  });
});

describe("outcomeStage", () => {
  it("maps outcomes to stage pills", () => {
    expect(outcomeStage("runner_up")).toBe("runner-up");
    expect(outcomeStage("won")).toBe("won");
    expect(outcomeStage("submitted")).toBe("submitted");
  });
});

describe("flagsFor", () => {
  it("puts the submitting country first, once", () => {
    expect(flagsFor(["FR", "BR"], "BR")).toEqual(["BR", "FR"]);
    expect(flagsFor(["FR"], "BE")).toEqual(["BE", "FR"]);
    expect(flagsFor(["US", "GB"])).toEqual(["US", "GB"]);
    expect(flagsFor(["US"], null)).toEqual(["US"]);
  });
});
