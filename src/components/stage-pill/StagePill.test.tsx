// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { STAGE_LABELS, StagePill, type Stage } from "./StagePill";

const expected: Record<Stage, string[]> = {
  won: ["bg-gold-wash", "text-gold-ink", "before:bg-gold"],
  nominated: ["bg-track", "text-ink"],
  shortlisted: ["text-ink-muted", "var(--line-strong)"],
  eligible: ["text-ink-muted", "var(--line-strong)"],
  submitted: ["text-ink-muted", "var(--line)]"],
  "not-nominated": ["text-ink-muted", "!pl-0"],
  "not-submitted": ["text-ink-muted", "!pl-0"],
  "runner-up": ["bg-track", "text-ink-muted"],
  "no-data": ["!font-normal", "var(--line)]"],
  "partly-loaded": ["!font-normal", "var(--line)]"],
  live: ["bg-gold-wash", "text-gold-ink"],
};

describe("StagePill", () => {
  it.each(Object.keys(expected) as Stage[])("renders %s with its label and tokens", (stage) => {
    render(<StagePill stage={stage} />);
    const pill = screen.getByText(STAGE_LABELS[stage]);
    expect(pill.dataset.stage).toBe(stage);
    for (const cls of expected[stage]) expect(pill.className).toContain(cls);
    expect(pill.className).toContain("text-micro");
  });

  it("only Won and Live are gold, and only Won has the dot", () => {
    for (const stage of Object.keys(expected) as Stage[]) {
      const { container, unmount } = render(<StagePill stage={stage} />);
      const cls = (container.firstChild as HTMLElement).className;
      expect(cls.includes("gold"), stage).toBe(stage === "won" || stage === "live");
      expect(cls.includes("before:content"), stage).toBe(stage === "won");
      unmount();
    }
  });

  it("takes a custom label", () => {
    render(<StagePill stage="won">Golden Lion</StagePill>);
    expect(screen.getByText("Golden Lion")).toBeTruthy();
  });

  // A prize name too long for a phone column breaks over lines when asked to (task 5.3).
  it("keeps a label on one line unless it wraps", () => {
    const name = "Louis Roederer Foundation Rising Star Award";
    const { unmount } = render(<StagePill stage="won">{name}</StagePill>);
    expect(screen.getByText(name).className).toContain("whitespace-nowrap");
    unmount();
    render(<StagePill stage="won" wrap>{name}</StagePill>);
    const pill = screen.getByText(name);
    expect(pill.className).not.toContain("whitespace-nowrap");
    expect(pill.className).toContain("max-w-full");
  });
});
