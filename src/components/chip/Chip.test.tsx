// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Chip } from "./Chip";

describe("Chip", () => {
  it("off: outlined, no check, hover border", () => {
    const onClick = vi.fn();
    render(
      <Chip pressed={false} onClick={onClick}>
        Unwatched
      </Chip>,
    );
    const chip = screen.getByRole("button", { name: "Unwatched" });
    expect(chip.getAttribute("aria-pressed")).toBe("false");
    expect(chip.className).toContain("border-line");
    expect(chip.className).toContain("hover:border-line-strong");
    expect(chip.className).toContain("focus-visible:shadow-focus");
    expect(chip.querySelector("svg")).toBeNull();
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("on: gold wash, gold-ink 500, with a check", () => {
    render(<Chip pressed>Shortlisted</Chip>);
    const chip = screen.getByRole("button", { name: "Shortlisted" });
    expect(chip.getAttribute("aria-pressed")).toBe("true");
    for (const cls of ["bg-gold-wash", "text-gold-ink", "font-medium"]) expect(chip.className).toContain(cls);
    expect(chip.querySelector("svg")).not.toBeNull();
  });
});
