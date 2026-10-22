// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RaceRowsSkeleton, Skeleton } from "./Skeleton";

describe("Skeleton", () => {
  it("is a hidden track block that shimmers, and not with reduced motion", () => {
    const { container } = render(<Skeleton className="h-5 w-1/2" />);
    const block = container.firstChild as HTMLElement;
    expect(block.getAttribute("aria-hidden")).toBe("true");
    expect(block.className).toContain("var(--track)");
    expect(block.className).toContain("animate-shimmer");
    expect(block.className).toContain("motion-reduce:animate-none");
    expect(block.className).toContain("h-5");
  });

  it("race rows sit in a busy region that appears after 300ms", () => {
    render(<RaceRowsSkeleton rows={3} />);
    const region = screen.getByLabelText("Loading contenders");
    expect(region.getAttribute("aria-busy")).toBe("true");
    expect(region.className).toContain("opacity-0");
    expect(region.className).toContain("animate-appear");
    const rows = Array.from(region.children) as HTMLElement[];
    expect(rows).toHaveLength(3);
    expect(rows[0].className).toContain("border-ink");
    expect(rows[1].className).toContain("border-line");
  });
});
