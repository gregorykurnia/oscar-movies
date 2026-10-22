// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, buttonClasses } from "./Button";

describe("Button", () => {
  it("renders primary, secondary and ghost in their tokens", () => {
    render(
      <>
        <Button variant="primary">Try again</Button>
        <Button>Go to the race</Button>
        <Button variant="ghost">Clear search</Button>
      </>,
    );
    const primary = screen.getByRole("button", { name: "Try again" });
    expect(primary.className).toContain("bg-gold-ink");
    expect(primary.className).toContain("text-on-gold");
    expect(primary.className).toContain("hover:bg-gold-ink-hover");
    expect(primary.getAttribute("type")).toBe("button");

    const secondary = screen.getByRole("button", { name: "Go to the race" });
    expect(secondary.className).toContain("border-line");
    expect(secondary.className).toContain("bg-surface");
    expect(secondary.className).toContain("hover:border-line-strong");

    const ghost = screen.getByRole("button", { name: "Clear search" });
    expect(ghost.className).toContain("hover:bg-track");
    expect(ghost.className).not.toContain("bg-surface");
  });

  it("has a focus ring and the small size", () => {
    render(<Button size="sm">Show all 21</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("focus-visible:shadow-focus");
    expect(button.className).toContain("h-8");
    expect(button.className).toContain("text-caption");
  });

  it("loading keeps the name, spins, and ignores clicks", () => {
    const onClick = vi.fn();
    render(
      <Button variant="primary" loading onClick={onClick}>
        Try again
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Try again" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.className).toContain("!text-transparent");
    expect(button.className).toContain("after:animate-spin");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("disabled turns track with faint text and no hover", () => {
    render(
      <Button variant="primary" disabled>
        Try again
      </Button>,
    );
    const button = screen.getByRole("button") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.className).toContain("disabled:bg-track");
    expect(button.className).toContain("disabled:text-ink-faint");
    expect(button.className).toContain("enabled:hover:");
  });

  it("gives links the same look", () => {
    expect(buttonClasses({ variant: "primary" })).toContain("bg-gold-ink");
  });
});
