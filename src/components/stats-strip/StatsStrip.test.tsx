// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatsStrip } from "./StatsStrip";

describe("StatsStrip", () => {
  it("three cells between line rules: Numeral L, of N, label, meter; a counting stat links to its list", () => {
    const { container } = render(
      <StatsStrip
        stats={[
          { value: "57%", of: "8 of 14", label: "Winner won Best Picture", meter: 57 },
          { value: "93%", of: "13 of 14", label: "Winner was nominated", meter: 93 },
          { value: "23", of: "of 61", label: "Watched", href: "/grid/2025?filter=watched" },
        ]}
      />,
    );
    const strip = container.firstElementChild as HTMLElement;
    for (const cls of ["border-y", "border-line", "md:grid-cols-3", "grid-cols-1"]) expect(strip.className).toContain(cls);
    const value = screen.getByText("57%");
    for (const cls of ["md:text-num-l", "font-light", "tracking-num"]) expect(value.className).toContain(cls);
    expect(screen.getByText("8 of 14").className).toContain("text-ink-muted");
    const meter = strip.querySelector('[aria-hidden="true"] > span') as HTMLElement;
    expect(meter.style.width).toBe("57%");
    expect(meter.className).toContain("bg-gold");
    const link = screen.getByRole("link", { name: /Watched/ });
    expect(link.getAttribute("href")).toBe("/grid/2025?filter=watched");
    expect(link.className).toContain("md:border-l");
    expect((strip.firstElementChild as HTMLElement).className).not.toContain("border-l");
  });
});
