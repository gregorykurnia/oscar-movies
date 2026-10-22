// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RaceFrame, parseCategory } from "./RaceFrame";

describe("parseCategory", () => {
  it("reads the four categories and falls back to Picture", () => {
    expect(parseCategory("animated")).toBe("animated");
    expect(parseCategory(["international", "animated"])).toBe("international");
    expect(parseCategory("nonsense")).toBe("picture");
    expect(parseCategory(undefined)).toBe("picture");
  });
});

describe("RaceFrame", () => {
  it("shows the tabs, marks the current one and says no contenders yet", () => {
    render(<RaceFrame category="animated" filmCount={5} />);
    const tabs = within(screen.getByRole("navigation", { name: "Category" })).getAllByRole("link");
    expect(tabs.map((t) => t.getAttribute("href"))).toEqual([
      "/",
      "/?category=documentary",
      "/?category=international",
      "/?category=animated",
    ]);
    expect(tabs.filter((t) => t.getAttribute("aria-current") === "page").map((t) => t.textContent)).toEqual([
      "AnimatedNo contenders yet",
    ]);
    expect(screen.getByRole("heading", { level: 2, name: "No contenders yet" })).toBeTruthy();
  });

  it("counts the films from the database", () => {
    const { rerender } = render(<RaceFrame category="picture" filmCount={1204} />);
    expect(screen.getByText("1,204 films are loaded so far.")).toBeTruthy();
    rerender(<RaceFrame category="picture" filmCount={1} />);
    expect(screen.getByText("1 film is loaded so far.")).toBeTruthy();
    rerender(<RaceFrame category="picture" filmCount={0} />);
    expect(screen.getByText("0 films are loaded so far.")).toBeTruthy();
  });
});
