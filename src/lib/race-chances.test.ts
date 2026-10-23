import { describe, expect, it } from "vitest";
import type { Why } from "@/lib/predict/types";
import {
  chanceColumns,
  formatChance,
  leaderOf,
  leadersOf,
  MIN_SHOWN,
  raceRows,
  raceSnapshot,
  showAllText,
  splitRows,
  stagePillsBefore,
  type Chance,
} from "./race-chances";
import type { Outcome } from "./stage";

const WHY: Why = { top: [], similar: null };
const film = (id: number) => ({ id, title: `Film ${id}` });
const chance = (rank: number, pWin: number, pNominate: number | null = null): Chance => ({ rank, pWin, pNominate, why: WHY });
const entry = (id: number, outcome: Outcome) => ({ film: film(id), outcome });

describe("raceSnapshot and formatChance", () => {
  it("shows the eve of the ceremony once the season is over, the live chances before", () => {
    expect(raceSnapshot("finished")).toBe("eve_ceremony");
    expect(raceSnapshot("nominations")).toBe("live");
    expect(raceSnapshot("shortlist")).toBe("live");
    expect(raceSnapshot("before")).toBe("live");
  });

  it("writes whole numbers, and <1 for a chance that rounds to nothing", () => {
    expect(formatChance(0.4149)).toBe("41");
    expect(formatChance(0.995)).toBe("100");
    expect(formatChance(0.004)).toBe("<1");
    expect(formatChance(0)).toBe("0");
  });
});

describe("raceRows", () => {
  it("before any list, shows the prediction's contenders by rank, with their Oscar entry where there is one", () => {
    const rows = raceRows({
      state: "before",
      entries: [entry(2, "submitted")],
      predictions: [
        { film: film(1), ...chance(1, 0.6) },
        { film: film(2), ...chance(2, 0.4) },
      ],
    });
    expect(rows.map((r) => r.film.id)).toEqual([1, 2]);
    expect(rows[0].entry).toBeNull();
    expect(rows[1].entry?.outcome).toBe("submitted");
  });

  it("from the nominations on, shows the nominees in the order of their chances, any without one last", () => {
    const rows = raceRows({
      state: "finished",
      entries: [entry(1, "won"), entry(2, "nominated"), entry(3, "nominated"), entry(4, "shortlisted")],
      predictions: [
        { film: film(2), ...chance(1, 0.5) },
        { film: film(1), ...chance(2, 0.3) },
        { film: film(9), ...chance(3, 0.2) },
      ],
    });
    expect(rows.map((r) => r.film.id)).toEqual([2, 1, 3]);
    expect(rows[2].chance).toBeNull();
  });
});

describe("splitRows and showAllText", () => {
  const many = (n: number, at: (i: number) => Chance) => Array.from({ length: n }, (_, i) => ({ film: film(i), chance: at(i) }));

  it("keeps back rows under 3% to win and under 50% to be nominated", () => {
    const rows = many(10, (i) => chance(i + 1, i < 6 ? 0.15 : 0.01, i === 7 ? 0.6 : 0.1));
    const { shown, more } = splitRows(rows, "before");
    // Row 8 (index 7) has 60% to be nominated, so the cut falls after it.
    expect(shown).toHaveLength(8);
    expect(more).toHaveLength(2);
  });

  it("keeps five rows in view and never hides a single row", () => {
    const low = many(7, (i) => chance(i + 1, 0.01, 0.05));
    expect(splitRows(low, "before").shown).toHaveLength(MIN_SHOWN);
    const six = many(6, (i) => chance(i + 1, 0.01, 0.05));
    expect(splitRows(six, "before").more).toHaveLength(0);
  });

  it("shows every nominee from the nominations on", () => {
    const rows = many(10, (i) => chance(i + 1, 0.01));
    expect(splitRows(rows, "nominations").more).toHaveLength(0);
    expect(splitRows(rows, "finished").more).toHaveLength(0);
  });

  it("names three of the rest and counts the others", () => {
    expect(showAllText(38, [{ title: "Bugonia" }, { title: "Train Dreams" }, { title: "The Secret Agent" }, ...Array(33).fill({ title: "x" })])).toEqual({
      label: "Show all 38 contenders",
      rest: "Bugonia, Train Dreams, The Secret Agent and 33 more under 3%",
    });
    expect(showAllText(7, [{ title: "A" }, { title: "B", noChance: true }]).rest).toBe("A and B");
    expect(showAllText(7, [{ title: "A" }, { title: "B" }]).rest).toBe("A and B under 3%");
  });
});

describe("chanceColumns, leaderOf and stagePillsBefore", () => {
  it("labels the columns by what the rows carry", () => {
    expect(chanceColumns("live", [{ chance: chance(1, 1, 0.99) }])).toEqual({ nominate: true, win: "To win" });
    expect(chanceColumns("live", [{ chance: chance(1, 1) }])).toEqual({ nominate: false, win: "To win" });
    expect(chanceColumns("eve_ceremony", [{ chance: chance(1, 1) }])).toEqual({ nominate: false, win: "Final prediction" });
    expect(chanceColumns("live", [{ chance: null }])).toBeNull();
  });

  it("leads with the first row that has a chance", () => {
    expect(leaderOf([{ chance: null }])).toBeNull();
    expect(leaderOf([{ chance: chance(2, 0.3) }, { chance: chance(3, 0.2) }])?.chance?.rank).toBe(2);
  });

  it("marks every row whose % reads the same as the favourite's", () => {
    const rows = [{ chance: chance(1, 0.221) }, { chance: chance(2, 0.219) }, { chance: chance(3, 0.2) }, { chance: null }];
    expect([...leadersOf(rows)]).toEqual([rows[0], rows[1]]);
    expect(leadersOf([{ chance: null }]).size).toBe(0);
    expect(leadersOf([{ chance: chance(1, 0.5) }, { chance: chance(2, 0.5) }]).size).toBe(0);
    expect(leadersOf([{ chance: chance(1, 1) }]).size).toBe(1);
  });

  it("shows pills before the shortlist only when the stages differ", () => {
    expect(stagePillsBefore(["submitted", "submitted"])).toBe(false);
    expect(stagePillsBefore([null, null])).toBe(false);
    expect(stagePillsBefore(["eligible", null])).toBe(true);
  });
});
