// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Flag, Flags, countryName } from "./Flag";

describe("Flag", () => {
  it("draws the 3:2 artwork with the country as its name", () => {
    render(<Flag code="br" />);
    const flag = screen.getByRole("img", { name: "Brazil" });
    expect(flag.querySelector("svg")).not.toBeNull();
    expect(flag.className).toContain("w-[21px]");
    expect(flag.className).toContain("after:shadow-flag-edge");
  });

  it("has small, row and large sizes", () => {
    render(
      <>
        <Flag code="US" size="sm" />
        <Flag code="FR" size="lg" />
      </>,
    );
    expect(screen.getByRole("img", { name: "United States" }).className).toContain("w-[15px]");
    const large = screen.getByRole("img", { name: "France" });
    expect(large.className).toContain("w-[30px]");
    expect(large.className).toContain("rounded-[3px]");
  });

  it("keeps an unknown code as a named blank", () => {
    render(<Flag code="ZZ" label="Unknown country" />);
    expect(screen.getByRole("img", { name: "Unknown country" }).querySelector("svg")).toBeNull();
  });

  it("names countries in English", () => {
    expect(countryName("gb")).toBe("United Kingdom");
  });
});

describe("Flags", () => {
  it("shows up to three, then +N naming the rest", () => {
    render(<Flags codes={["NO", "FR", "DK", "SE", "DE"]} />);
    expect(screen.getAllByRole("img").map((f) => f.getAttribute("aria-label"))).toEqual([
      "Norway",
      "France",
      "Denmark",
    ]);
    const more = screen.getByText("+2");
    expect(more.getAttribute("aria-label")).toBe("and Sweden, Germany");
    expect(more.className).toContain("text-ink-muted");
  });

  it("stacks in race rows and names the submitting country", () => {
    const { container } = render(
      <Flags codes={["BR", "FR"]} stacked firstLabel="Brazil, submitting country" />,
    );
    expect((container.firstChild as HTMLElement).className).toContain("flex-col");
    expect(screen.getByRole("img", { name: "Brazil, submitting country" })).toBeTruthy();
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it("renders nothing without countries", () => {
    const { container } = render(<Flags codes={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
