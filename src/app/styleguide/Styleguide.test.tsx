// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { BOARDS } from "./components";
import { Styleguide } from "./Styleguide";
import { parseTokens, styleguideOpen } from "./tokens";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/styleguide",
  useSearchParams: () => new URLSearchParams(),
}));

const tokens = parseTokens(readFileSync("src/styles/tokens.css", "utf8"));

// Every component under src/components that the page should show, by its exported name.
const BUILT = [
  "Button", "TextLink", "StagePill", "Flag", "Flags", "ScoreLine", "ScoreTiles", "Mark", "Marks", "LabelledMark",
  "Segmented", "Chip", "Notice", "EmptyState", "Skeleton", "Toast", "AppShell", "PageHeader", "YearSwitcher",
  "FilmList", "FilmRow", "StatsStrip", "DataTable", "CategoryTabs", "StageLine", "ContenderRow", "ShowAllRow", "SearchCommand",
];

describe("/styleguide", () => {
  it("lists every component built so far, each with a board", () => {
    const { container } = render(<Styleguide stress={false} tokens={tokens} />);
    const listed = BOARDS.flatMap((b) => b.components) as string[];
    for (const name of BUILT) expect(listed, name).toContain(name);
    for (const board of BOARDS) {
      expect(container.querySelector(`section#${board.id}`), board.id).not.toBeNull();
      expect(container.querySelector(`nav a[href="#${board.id}"]`), board.id).not.toBeNull();
    }
  });

  it("draws every stage pill, the three score lines and the swatches with their real values", () => {
    render(<Styleguide stress={false} tokens={tokens} />);
    for (const label of ["Won", "Nominated", "Shortlisted", "Submitted", "Not nominated", "Runner-up", "No data", "Partly loaded", "Live"]) {
      expect(screen.getAllByText(label).length, label).toBeGreaterThan(0);
    }
    expect(screen.getAllByText("No scores yet").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/86 · 4 of 4/).length).toBeGreaterThan(0);
    expect(screen.getByText(/#FCFBF9/)).toBeTruthy();
    expect(screen.getByText(/#8A6418 · 5.2:1/)).toBeTruthy();
  });

  it("draws the race tabs, the contender rows with pills and every search state", () => {
    render(<Styleguide stress={false} tokens={tokens} />);
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getAllByText("Season over").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Show all 38 contenders/ })).toBeTruthy();
    expect(screen.getAllByRole("listbox", { name: "Search results" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Search isn't available right now.")).toBeTruthy();
    expect(screen.getByText(/No movie or award matches “zzzz”/)).toBeTruthy();
  });

  it("has one h1 and the stress switch reflects the address", () => {
    const { container, rerender } = render(<Styleguide stress={false} tokens={tokens} />);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Normal" }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByText(/Rindfleisch/)).toBeNull();
    rerender(<Styleguide stress tokens={tokens} />);
    expect(screen.getByRole("link", { name: "Stress" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getAllByText(/Rindfleisch/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/1,204/).length).toBeGreaterThan(0);
  });
});

describe("styleguide gate", () => {
  it("is closed on the live site only", () => {
    expect(styleguideOpen("production")).toBe(false);
    expect(styleguideOpen("preview")).toBe(true);
    expect(styleguideOpen("development")).toBe(true);
    expect(styleguideOpen(undefined)).toBe(true);
  });
});

describe("parseTokens", () => {
  it("reads custom properties from the CSS", () => {
    expect(parseTokens(":root { --paper: #FCFBF9; /* c */ --line: #ECE8E2; }")).toEqual({ "--paper": "#FCFBF9", "--line": "#ECE8E2" });
  });
});
