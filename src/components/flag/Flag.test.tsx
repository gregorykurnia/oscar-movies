// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Flag, Flags, countryName, submittingLabel } from "./Flag";

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
  it("draws the film's one flag, named for its country", () => {
    render(<Flags code="NO" />);
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img", { name: "Norway" })).toBeTruthy();
    expect(screen.queryByText(/^\+/)).toBeNull();
  });

  it("names the submitting country in an International row", () => {
    render(<Flags code="BR" label={submittingLabel("BR", "br")} />);
    expect(screen.getByRole("img", { name: "Brazil, submitting country" })).toBeTruthy();
  });

  it("renders nothing for a film without a country", () => {
    const { container } = render(<Flags code={null} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("submittingLabel", () => {
  it("claims the submission only when the flag is the submitting country", () => {
    expect(submittingLabel("BR", "BR")).toBe("Brazil, submitting country");
    expect(submittingLabel("FR", "BR")).toBeUndefined();
    expect(submittingLabel("BR", null)).toBeUndefined();
    expect(submittingLabel(null, "BR")).toBeUndefined();
  });
});
