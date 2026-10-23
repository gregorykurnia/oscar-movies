// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { AccuracyRow } from "@/lib/accuracy-page";
import { AccuracyTable } from "./AccuracyTable";

const rows: AccuracyRow[] = [
  { key: "pga", award: "PGA", kind: "major", note: "Theatrical Motion Picture", win: { hits: 11, count: 14 }, nomination: { hits: 14, count: 14 }, nominees: { hits: 104, count: 138 }, years: 14 },
  { key: "bafta", award: "BAFTA", kind: "major", note: "Best Film", win: { hits: 8, count: 14 }, nomination: { hits: 13, count: 14 }, nominees: { hits: 60, count: 70 }, years: 14 },
  { key: "afi", award: "AFI Top 10", kind: "major", note: "Top 10 · a list, no winner", win: { hits: 0, count: 0 }, nomination: { hits: 0, count: 0 }, nominees: { hits: 75, count: 140 }, years: 12 },
  { key: "cannes", award: "Cannes", kind: "festival", note: "Palme d'Or · winners only", win: { hits: 2, count: 14 }, nomination: { hits: 5, count: 14 }, nominees: null, years: 14 },
];

const order = () =>
  screen
    .getAllByRole("row")
    .map((r) => r.querySelector("td")?.firstElementChild?.firstChild?.textContent)
    .filter(Boolean);

afterEach(() => window.history.replaceState(null, "", "/"));

describe("AccuracyTable", () => {
  it("starts sorted by winner-won, highest first, in groups, with aria-sort on that head only", () => {
    render(<AccuracyTable rows={rows} caption="Accuracy" />);
    expect(order()).toEqual(["PGA", "BAFTA", "AFI Top 10", "Cannes"]);
    expect(screen.getByRole("columnheader", { name: "Winner won the Oscar" }).getAttribute("aria-sort")).toBe("descending");
    for (const name of ["Award", "Winner nominated", "Nominees nominated", "Years"]) {
      expect(screen.getByRole("columnheader", { name }).getAttribute("aria-sort")).toBeNull();
    }
    expect(screen.getByRole("columnheader", { name: "Major awards" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Festivals" })).toBeTruthy();
  });

  // The heads are real buttons, so Enter and Space click them (checked in a browser by
  // tests/e2e/accuracy.spec.ts); here a click stands for either key.
  it("every sortable head is a button: the first press sorts highest first, the next flips, aria-sort follows", () => {
    render(<AccuracyTable rows={rows} caption="Accuracy" />);
    const head = (name: string) => screen.getByRole("columnheader", { name });
    for (const [name, majors] of [
      ["Winner nominated", ["PGA", "BAFTA", "AFI Top 10"]],
      ["Nominees nominated", ["BAFTA", "PGA", "AFI Top 10"]],
      ["Years", ["BAFTA", "PGA", "AFI Top 10"]],
    ] as const) {
      const button = within(head(name)).getByRole("button");
      fireEvent.click(button);
      expect(head(name).getAttribute("aria-sort")).toBe("descending");
      expect(order().slice(0, 3)).toEqual(majors);
      fireEvent.click(button);
      expect(head(name).getAttribute("aria-sort")).toBe("ascending");
      expect(document.querySelectorAll("[aria-sort]")).toHaveLength(1);
    }
  });

  it("sorting by a figure keeps the dashes last, and ascending by Award reads A to Z", () => {
    render(<AccuracyTable rows={rows} caption="Accuracy" />);
    const win = within(screen.getByRole("columnheader", { name: "Winner won the Oscar" })).getByRole("button");
    fireEvent.click(win);
    expect(sortOf("Winner won the Oscar")).toBe("ascending");
    expect(order()).toEqual(["BAFTA", "PGA", "AFI Top 10", "Cannes"]);

    fireEvent.click(within(screen.getByRole("columnheader", { name: "Award" })).getByRole("button"));
    expect(order()).toEqual(["AFI Top 10", "BAFTA", "PGA", "Cannes"]);
  });

  it("keeps the sort in the address without a navigation", () => {
    render(<AccuracyTable rows={rows} caption="Accuracy" />);
    fireEvent.click(within(screen.getByRole("columnheader", { name: "Nominees nominated" })).getByRole("button"));
    expect(window.location.search).toBe("?sort=nominees&dir=desc");
    // Back to the default sort: the address is plain again.
    fireEvent.click(within(screen.getByRole("columnheader", { name: "Winner won the Oscar" })).getByRole("button"));
    expect(window.location.search).toBe("");
  });

  it("starts from the sort it is given, and a dash says why", () => {
    render(<AccuracyTable rows={rows} caption="Accuracy" initialSort={{ key: "award", direction: "ascending" }} />);
    expect(order()).toEqual(["AFI Top 10", "BAFTA", "PGA", "Cannes"]);
    expect(screen.getByRole("columnheader", { name: "Award" }).getAttribute("aria-sort")).toBe("ascending");
    expect(screen.getAllByTitle("Not counted: the award announces winners only")).toHaveLength(1);
    expect(screen.getAllByTitle("Not counted: the award names no winner")).toHaveLength(2);
  });
});

function sortOf(name: string) {
  return screen.getByRole("columnheader", { name }).getAttribute("aria-sort");
}
