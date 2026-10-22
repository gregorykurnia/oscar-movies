// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Notice } from "./Notice";

describe("Notice", () => {
  it("gold: the season's state, bold first sentence then muted", () => {
    const { container } = render(
      <Notice tone="gold" title="Early: few results yet.">
        Chances will move a lot until the Golden Globe and Critics Choice nominations in December.
      </Notice>,
    );
    const panel = container.firstChild as HTMLElement;
    expect(panel.className).toContain("bg-gold-wash");
    expect(panel.querySelector("svg")!.getAttribute("class")).toContain("text-gold-ink");
    expect(screen.getByText("Early: few results yet.").tagName).toBe("STRONG");
    expect(screen.getByText(/Chances will move/).className).toContain("text-ink-muted");
  });

  it("neutral: coverage note on track", () => {
    const { container } = render(<Notice>Festival lineups are tracked from 2025 on.</Notice>);
    expect((container.firstChild as HTMLElement).className).toContain("bg-track");
    expect(container.querySelector("strong")).toBeNull();
  });

  it("error: offline, error title and icon", () => {
    render(
      <Notice tone="error" title="You're offline." role="status">
        {"Showing the page as last loaded. Marks can't be saved until you're back."}
      </Notice>,
    );
    const panel = screen.getByRole("status");
    expect(panel.className).toContain("bg-error-wash");
    expect(panel.querySelector("svg")!.getAttribute("class")).toContain("text-error");
    expect(screen.getByText("You're offline.").className).toContain("text-error");
  });
});
