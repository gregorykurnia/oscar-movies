// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/button/Button";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("draws the dashed box, gold-wash circle, title and sentence", () => {
    const { container } = render(
      <EmptyState title="No contenders yet">
        The first precursor results arrive in December, starting with the Annie Award nominations.
      </EmptyState>,
    );
    const box = container.firstChild as HTMLElement;
    expect(box.className).toContain("border-dashed");
    expect(box.className).toContain("border-line-strong");
    expect(box.className).toContain("rounded-lg");
    expect(box.querySelector(".bg-gold-wash svg")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "No contenders yet" })).toBeTruthy();
    expect(screen.getByText(/first precursor results/).className).toContain("text-ink-muted");
  });

  it("takes actions and a heading level", () => {
    render(
      <EmptyState title="Nothing to watch" headingLevel={3} actions={<Button>Go to the race</Button>} />,
    );
    expect(screen.getByRole("heading", { level: 3 })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go to the race" })).toBeTruthy();
  });
});
