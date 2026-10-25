// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NominationPanel } from "@/lib/patterns/movie";
import { NominationPatterns } from "./NominationPatterns";

const panel = (more: Partial<NominationPanel> = {}): NominationPanel => ({
  year: 2025,
  category: "documentary",
  categoryName: "Best Documentary Feature",
  pattern: { label: "1 strong award, US-only", record: "5 of 12 nominated" },
  pick: { rank: 2, of: 15 },
  stage: "not-nominated",
  flag: null,
  href: "/patterns/2025",
  ...more,
});

describe("NominationPatterns", () => {
  it("a flagged miss: pattern, pick, Not nominated, the Snub risk notice with its reasons and the link", () => {
    render(
      <NominationPatterns
        panel={panel({
          flag: { result: "missed", signs: ["A critics' sweep with no filmmakers' group: 1 of 4 got in (few films)."] },
        })}
      />,
    );
    const region = screen.getByRole("region", { name: "Nomination patterns" });
    expect(within(region).getByText("2025 · Best Documentary Feature")).toBeTruthy();
    expect(within(region).getByText("1 strong award, US-only")).toBeTruthy();
    expect(within(region).getByText(/5 of 12 nominated/)).toBeTruthy();
    expect(within(region).getByText("Pick #2 of 15")).toBeTruthy();
    expect(within(region).getByText("Not nominated")).toBeTruthy();
    expect(within(region).getByText("Snub risk · Flagged, and missed")).toBeTruthy();
    expect(within(region).getByText(/1 of 4 got in \(few films\)/)).toBeTruthy();
    expect(within(region).getByRole("link", { name: "All of 2025’s nomination patterns" }).getAttribute("href")).toBe("/patterns/2025");
  });

  it("a flagged nominee says it got in anyway", () => {
    render(<NominationPatterns panel={panel({ stage: "nominated", flag: { result: "got-in", signs: ["A sign."] } })} />);
    expect(screen.getByText("Snub risk · Flagged, and got in anyway")).toBeTruthy();
    expect(screen.getByText("Nominated")).toBeTruthy();
  });

  it("an unflagged nominee has no Snub risk notice", () => {
    render(<NominationPatterns panel={panel({ stage: "nominated" })} />);
    expect(screen.queryByText(/Snub risk/)).toBeNull();
    expect(document.querySelector("[data-risk-reason]")).toBeNull();
  });

  it("a film shortlisted before 2015 has no pick row", () => {
    render(<NominationPatterns panel={panel({ year: 2014, pick: null })} />);
    expect(screen.queryByText("The patterns' pick")).toBeNull();
    expect(screen.getByText("Pattern")).toBeTruthy();
    expect(screen.getByText("Oscar result")).toBeTruthy();
  });
});
