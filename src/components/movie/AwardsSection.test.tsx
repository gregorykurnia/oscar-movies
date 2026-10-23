// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MovieScreening } from "@/lib/lineup";
import type { MovieAwardRow } from "@/lib/movie-awards";
import { AwardsSection, CRITICS_CAP } from "./AwardsSection";

const screening = (more: Partial<MovieScreening>): MovieScreening => ({
  awardSlug: "cannes",
  awardName: "Cannes Film Festival",
  calendarOrder: 30,
  year: 2025,
  section: "In Competition",
  sectionOrder: 1,
  prize: null,
  ...more,
});

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
    const button = within(group).getByRole("button", { name: `Show all ${CRITICS_CAP + 3} critics groups` });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(within(group).getAllByRole("listitem")).toHaveLength(CRITICS_CAP);
    // One list, and only the Show all row's top rule under it (triage 2-9).
    expect(within(group).getAllByRole("list")).toHaveLength(1);
    expect(within(group).getByRole("list").className).not.toContain("border-b");
    fireEvent.click(button);
    expect(within(group).getAllByRole("listitem")).toHaveLength(CRITICS_CAP + 3);
    expect(within(group).getAllByRole("list")).toHaveLength(1);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.textContent).toBe("Show fewer");
  });

  // Rows are award × category, so one group with two categories counts once.
  it("counts groups, not rows, in Show all", () => {
    const critics = Array.from({ length: CRITICS_CAP + 2 }, (_, i) =>
      row({ kind: "critics", awardSlug: `c${i % 4}`, awardName: `Group ${i % 4}`, category: `Cat ${i}`, result: "won", since: "2025-01-01" }),
    );
    render(<AwardsSection today="2025-03-01" rows={critics} />);
    expect(screen.getByRole("button", { name: "Show all 4 critics groups" })).toBeTruthy();
  });

  it("names the year in the meta line, and says when no followed festival gave the film a prize", () => {
    render(<AwardsSection today="2025-03-01" rows={[row({})]} />);
    expect(screen.getByText("Every followed award that gave these categories in 2024")).toBeTruthy();
    const festivals = screen.getByRole("group", { name: "Festivals" });
    expect(within(festivals).getByText("No followed festival prize.")).toBeTruthy();
  });

  // Task 5.3: the screenings sit under the prizes, with the section and prizes, each linked to its lineup.
  it("lists the film's screenings with their section and prizes, each linked to its lineup, as Selected", () => {
    render(
      <AwardsSection
        today="2025-06-01"
        year={2025}
        rows={[]}
        screenings={[
          screening({ prize: "Palme d'Or; Best Director" }),
          screening({ awardSlug: "venice", awardName: "Venice Film Festival", calendarOrder: 40, section: "Out of Competition", sectionOrder: 3 }),
        ]}
      />,
    );
    const festivals = screen.getByRole("group", { name: "Festivals" });
    const items = within(festivals).getAllByRole("listitem");
    expect(items.map((i) => i.getAttribute("data-result"))).toEqual(["selected", "selected"]);
    expect(within(items[0]).getByRole("link", { name: "Cannes Film Festival" }).getAttribute("href")).toBe("/festivals/cannes/2025");
    expect(within(items[0]).getByText("In Competition · Palme d'Or; Best Director")).toBeTruthy();
    expect(within(items[0]).getByText("Selected")).toBeTruthy();
    expect(within(items[1]).getByRole("link", { name: "Venice Film Festival" }).getAttribute("href")).toBe("/festivals/venice/2025");
    expect(within(festivals).queryByText(/tracked from 2025/)).toBeNull();
  });

  it("doesn't repeat in the screening a prize the festival's own row shows as won", () => {
    const palme = row({ kind: "festival", awardSlug: "cannes", awardName: "Cannes Film Festival", year: 2025, category: "Palme d'Or", result: "won" });
    render(<AwardsSection today="2025-06-01" year={2025} rows={[palme]} screenings={[screening({ prize: "Palme d'Or; Best Director" })]} />);
    const items = within(screen.getByRole("group", { name: "Festivals" })).getAllByRole("listitem");
    expect(items.map((i) => i.getAttribute("data-result"))).toEqual(["won", "selected"]);
    expect(within(items[1]).getByText("In Competition · Best Director")).toBeTruthy();
  });

  it("says a film from before the lineups with no award result at all that lineups are tracked from 2025 on", () => {
    render(<AwardsSection today="2025-03-01" year={2024} rows={[]} />);
    expect(screen.getByText("No award results for this film yet. Festival lineups are tracked from 2025 on.")).toBeTruthy();
  });

  it("says a film from before the lineups, with no screening, that lineups are tracked from 2025 on", () => {
    render(<AwardsSection today="2025-03-01" year={2024} rows={[row({})]} />);
    const festivals = screen.getByRole("group", { name: "Festivals" });
    expect(within(festivals).getByText("No followed festival prize. Festival lineups are tracked from 2025 on.")).toBeTruthy();
  });

  it("adds the coverage line under a festival prize that a film from before the lineups has", () => {
    const prize = row({ kind: "festival", awardSlug: "cannes", awardName: "Cannes Film Festival", category: "Palme d'Or", result: "won" });
    render(<AwardsSection today="2025-03-01" year={2024} rows={[prize]} />);
    const festivals = screen.getByRole("group", { name: "Festivals" });
    expect(within(festivals).getByRole("link", { name: "Cannes Film Festival" })).toBeTruthy();
    expect(within(festivals).getByText("Festival lineups are tracked from 2025 on.")).toBeTruthy();
  });
});
