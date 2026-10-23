// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MovieAwardRow } from "@/lib/movie-awards";
import { AwardsSection, CRITICS_CAP } from "./AwardsSection";

const row = (more: Partial<MovieAwardRow>): MovieAwardRow => ({
  awardSlug: "bafta",
  awardName: "BAFTA",
  kind: "major",
  calendarOrder: 680,
  isSelection: false,
  year: 2024,
  category: "Best Film",
  oscarCategory: "picture",
  result: "won",
  since: null,
  ...more,
});

describe("AwardsSection", () => {
  it("shows each result, with not nominated muted and the awards linked to their year", () => {
    render(
      <AwardsSection
        today="2025-03-01"
        rows={[
          row({}),
          row({ awardSlug: "pga", awardName: "PGA", result: "not_nominated", since: "2025-01-16" }),
          row({ awardSlug: "afi", awardName: "AFI", isSelection: true, result: "nominated" }),
        ]}
      />,
    );
    const major = screen.getByRole("group", { name: "Major awards" });
    const items = within(major).getAllByRole("listitem");
    expect(items.map((i) => i.getAttribute("data-result"))).toEqual(["won", "nominated", "not_nominated"]);
    expect(within(items[0]).getByRole("link", { name: "BAFTA" }).getAttribute("href")).toBe("/awards/bafta/2024");
    expect(within(items[1]).getByText("Selected")).toBeTruthy();
    expect(within(items[2]).getByText("Not nominated")).toBeTruthy();
  });

  it("says nothing about not nominated before the nominations are out", () => {
    render(<AwardsSection today="2025-01-01" rows={[row({ result: "not_nominated", since: "2025-01-16" })]} />);
    expect(screen.getByText("No award results for this film yet.")).toBeTruthy();
  });

  it("summarises the critics groups and keeps a few rows, the rest behind Show all", () => {
    const critics = Array.from({ length: CRITICS_CAP + 3 }, (_, i) =>
      row({ kind: "critics", awardSlug: `c${i}`, awardName: `Group ${i}`, result: i < 2 ? "won" : "not_nominated", since: "2025-01-01" }),
    );
    render(<AwardsSection today="2025-03-01" rows={critics} />);
    const group = screen.getByRole("group", { name: "Critics groups" });
    expect(within(group).getByText("2 won · 7 not nominated")).toBeTruthy();
    const summary = within(group).getByText(`Show all ${CRITICS_CAP + 3} critics groups`);
    expect(summary.closest("details")?.hasAttribute("open")).toBe(false);
    expect(within(group).getAllByRole("listitem")).toHaveLength(CRITICS_CAP + 3);
  });

  it("names the year in the meta line, and says when no followed festival gave the film a prize", () => {
    render(<AwardsSection today="2025-03-01" rows={[row({})]} />);
    expect(screen.getByText("Every followed award that gave these categories in 2024")).toBeTruthy();
    const festivals = screen.getByRole("group", { name: "Festivals" });
    expect(within(festivals).getByText("No followed festival prize.")).toBeTruthy();
  });
});
