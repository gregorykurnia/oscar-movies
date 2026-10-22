import { describe, expect, it } from "vitest";
import {
  noResultsNote,
  parseCategory,
  raceEntries,
  raceHref,
  seasonDate,
  seasonState,
  showsStagePills,
  stageLine,
  tabLead,
} from "./race";
import type { Outcome } from "./stage";

const DATES_2024 = { shortlistOn: "2024-12-17", nominationsOn: "2025-01-23", winnersOn: "2025-03-02" };
const DATES_2026 = { shortlistOn: "2026-12-15", nominationsOn: "2027-01-21", winnersOn: "2027-03-14" };

const entry = (title: string, outcome: Outcome, flags = ["US"]) => ({ title, outcome, flags });

describe("parseCategory and raceHref", () => {
  it("reads the four categories and falls back to Picture", () => {
    expect(parseCategory("animated")).toBe("animated");
    expect(parseCategory(["international", "animated"])).toBe("international");
    expect(parseCategory("nonsense")).toBe("picture");
    expect(parseCategory(null)).toBe("picture");
  });

  it("sends the live season to / and leaves Picture out of the address", () => {
    expect(raceHref(2026, "picture", 2026)).toBe("/");
    expect(raceHref(2026, "animated", 2026)).toBe("/?category=animated");
    expect(raceHref(2024, "picture", 2026)).toBe("/race/2024");
    expect(raceHref(2024, "documentary", 2026)).toBe("/race/2024?category=documentary");
  });
});

describe("seasonState and raceEntries", () => {
  it("follows the furthest outcome loaded", () => {
    expect(seasonState([])).toBe("before");
    expect(seasonState(["submitted", "eligible"])).toBe("before");
    expect(seasonState(["eligible", "shortlisted"])).toBe("shortlist");
    expect(seasonState(["shortlisted", "nominated"])).toBe("nominations");
    expect(seasonState(["runner_up"])).toBe("nominations");
    expect(seasonState(["nominated", "won"])).toBe("finished");
  });

  it("shows the shortlist, then the nominees only", () => {
    const all = [entry("W", "won"), entry("N", "nominated"), entry("S", "shortlisted"), entry("E", "eligible"), entry("X", "submitted")];
    expect(raceEntries(all, "finished").map((e) => e.title)).toEqual(["W", "N"]);
    expect(raceEntries(all, "nominations").map((e) => e.title)).toEqual(["W", "N"]);
    expect(raceEntries(all, "shortlist").map((e) => e.title)).toEqual(["W", "N", "S"]);
    expect(raceEntries(all, "before")).toEqual([]);
  });

  it("puts pills on the shortlist and after the ceremony, not on a list of nominees", () => {
    expect(showsStagePills("shortlist")).toBe(true);
    expect(showsStagePills("finished")).toBe(true);
    expect(showsStagePills("nominations")).toBe(false);
    expect(showsStagePills("before")).toBe(false);
  });
});

describe("seasonDate", () => {
  it("leaves the year out when the date is near or in this year", () => {
    expect(seasonDate("2026-12-15", "2026-10-22")).toBe("15 Dec");
    expect(seasonDate("2026-01-22", "2025-12-20")).toBe("22 Jan");
    expect(seasonDate("2026-03-15", "2025-12-20")).toBe("15 Mar");
  });

  it("adds it for another year more than 90 days off, or when asked", () => {
    expect(seasonDate("2027-01-21", "2026-10-22")).toBe("21 Jan 2027");
    expect(seasonDate("2025-03-02", "2026-10-22")).toBe("2 Mar 2025");
    expect(seasonDate("2026-03-15", "2026-03-16", true)).toBe("15 Mar 2026");
  });
});

describe("stageLine", () => {
  const today = "2026-10-22";

  it("names the winner in ink once the ceremony is over", () => {
    const entries = [entry("Anora", "won"), entry("Conclave", "nominated")];
    expect(stageLine({ category: "picture", state: "finished", dates: DATES_2024, entries, today })).toEqual({
      done: true,
      lead: "Ceremony 2 Mar 2025",
      rest: "Anora won Best Picture",
    });
    const tie = [entry("A", "won"), entry("B", "won")];
    expect(stageLine({ category: "documentary", state: "finished", dates: DATES_2024, entries: tie, today }).rest).toBe(
      "A and B won Best Documentary Feature",
    );
  });

  it("counts the nominees until the ceremony", () => {
    const entries = Array.from({ length: 10 }, (_, i) => entry(`F${i}`, "nominated"));
    const dates = { shortlistOn: "2025-12-16", nominationsOn: "2026-01-22", winnersOn: "2026-03-15" };
    expect(stageLine({ category: "picture", state: "nominations", dates, entries, today: "2026-02-01" })).toEqual({
      done: false,
      lead: "Ceremony 15 Mar",
      rest: "10 nominees, announced 22 Jan",
    });
  });

  it("says when the shortlist came out and when the nominations are due", () => {
    const dates = { shortlistOn: "2025-12-16", nominationsOn: "2026-01-22", winnersOn: "2026-03-15" };
    expect(stageLine({ category: "international", state: "shortlist", dates, entries: [], today: "2025-12-20" })).toEqual({
      done: false,
      lead: "Shortlist out 16 Dec",
      rest: "Nominations 22 Jan",
    });
  });

  it("waits for the shortlist where there is one, else the nominations", () => {
    expect(stageLine({ category: "international", state: "before", dates: DATES_2026, entries: [], today })).toEqual({
      done: false,
      lead: "Shortlist 15 Dec",
      rest: "Nominations 21 Jan 2027",
    });
    expect(stageLine({ category: "animated", state: "before", dates: DATES_2026, entries: [], today })).toEqual({
      done: false,
      lead: "Nominations 21 Jan 2027",
      rest: "Ceremony 14 Mar 2027",
    });
  });

  it("drops a date that isn't known", () => {
    const dates = { shortlistOn: null, nominationsOn: null, winnersOn: null };
    expect(stageLine({ category: "picture", state: "before", dates, entries: [], today })).toEqual({
      done: false,
      lead: "Nominations",
      rest: "Ceremony",
    });
  });
});

describe("tabLead", () => {
  it("shows the winner with its first flag, or a count", () => {
    expect(tabLead({ state: "finished", entries: [entry("I'm Still Here", "won", ["BR", "FR"]), entry("Flow", "nominated")], submissions: 0 })).toEqual({
      kind: "winner",
      title: "I'm Still Here",
      flag: "BR",
    });
    expect(tabLead({ state: "nominations", entries: [entry("A", "nominated")], submissions: 0 })).toEqual({ kind: "text", text: "1 nominee" });
    expect(tabLead({ state: "shortlist", entries: [entry("A", "shortlisted"), entry("B", "shortlisted")], submissions: 90 })).toEqual({
      kind: "text",
      text: "2 shortlisted",
    });
    expect(tabLead({ state: "before", entries: [], submissions: 100 })).toEqual({ kind: "text", text: "100 submissions" });
    expect(tabLead({ state: "before", entries: [], submissions: 0 })).toEqual({ kind: "text", text: "No contenders yet" });
  });
});

describe("noResultsNote", () => {
  const dates = { shortlistOn: "2026-12-15", nominationsOn: "2027-01-21" };
  it("Documentary and International wait for the shortlist", () => {
    expect(noResultsNote("international", dates)).toBe("The shortlist comes out 15 Dec 2026.");
    expect(noResultsNote("documentary", dates)).toBe("The shortlist comes out 15 Dec 2026.");
  });
  it("Picture and Animated wait for the nominations", () => {
    expect(noResultsNote("picture", dates)).toBe("Nominations are announced 21 Jan 2027.");
    expect(noResultsNote("animated", dates)).toBe("Nominations are announced 21 Jan 2027.");
  });
  it("says nothing is loaded when no date is known", () => {
    expect(noResultsNote("picture", { shortlistOn: "2026-12-15", nominationsOn: null })).toBe("Nothing is loaded for this category yet.");
  });
});
