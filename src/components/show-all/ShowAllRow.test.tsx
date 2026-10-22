// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShowAllRow } from "./ShowAllRow";

describe("ShowAllRow", () => {
  it("is one link with the bold part first and the rest after a dot", () => {
    render(<ShowAllRow href="/watch-list?all=1" label="Show all 100 films" rest="sorted by Oscar stage" />);
    const link = screen.getByRole("link", { name: "Show all 100 films · sorted by Oscar stage" });
    expect(link.getAttribute("href")).toBe("/watch-list?all=1");
    expect(link.querySelector("strong")?.textContent).toBe("Show all 100 films");
  });

  it("has no dot without a rest", () => {
    render(<ShowAllRow href="/x" label="Show all 21" />);
    expect(screen.getByRole("link").textContent).toBe("Show all 21");
  });
});
