// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorPage } from "./ErrorPage";
import { NotFoundPage } from "./NotFoundPage";
import { usefulLinks } from "./StatusPage";

describe("NotFoundPage (guide §8.11)", () => {
  it("has the eyebrow, the one h1, a primary and a secondary action, and three links", () => {
    render(<NotFoundPage season={2026} toWatch={4} />);
    expect(screen.getByText("Error 404")).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "This page isn't here" })).toBeTruthy();
    const go = screen.getByRole("link", { name: "Go to the race" });
    expect(go.getAttribute("href")).toBe("/");
    expect(go.className).toContain("bg-gold-ink");
    expect(screen.getByRole("button", { name: "Search" })).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Useful pages" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "The 2026 raceLive season",
      "Awards 2025Every award and festival",
      "Watch list4 to watch",
    ]);
  });

  it("leaves the year and the count out until the data layer knows them", () => {
    expect(usefulLinks().map((l) => l.label)).toEqual(["The race", "Awards", "Watch list"]);
  });
});

describe("ErrorPage (guide §8.11)", () => {
  it("has the eyebrow, title, a primary retry, a secondary link and the reference line", () => {
    const retry = vi.fn();
    render(<ErrorPage onRetry={retry} reference="7f3a9c" time="22 Oct 2026, 08:14" />);
    expect(screen.getByText("Something went wrong")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "This page didn't load" })).toBeTruthy();
    expect(screen.getByText("Reference: 7f3a9c · 22 Oct 2026, 08:14")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the race" }).getAttribute("href")).toBe("/");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("shows only what it has: no digest, no time yet", () => {
    const { rerender } = render(<ErrorPage time="22 Oct 2026, 08:14" />);
    expect(screen.getByText("22 Oct 2026, 08:14")).toBeTruthy();
    rerender(<ErrorPage />);
    expect(screen.queryByText(/Reference/)).toBeNull();
  });
});
