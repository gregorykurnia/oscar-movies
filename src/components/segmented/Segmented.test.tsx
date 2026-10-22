// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Segmented } from "./Segmented";

const items = [
  { label: "Picture", href: "/accuracy/picture", current: true },
  { label: "Documentary", href: "/accuracy/documentary" },
  { label: "International", href: "/accuracy/international" },
  { label: "Animated", href: "/accuracy/animated" },
];

describe("Segmented", () => {
  it("is a named group of links on a track that scrolls sideways", () => {
    render(<Segmented items={items} label="Category" />);
    const nav = screen.getByRole("navigation", { name: "Category" });
    expect(nav.className).toContain("bg-track");
    expect(nav.className).toContain("overflow-x-auto");
    expect(screen.getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(items.map((i) => i.href));
  });

  it("marks the selected item: surface, ink 500, hairline", () => {
    render(<Segmented items={items} label="Category" />);
    const picture = screen.getByRole("link", { name: "Picture" });
    expect(picture.getAttribute("aria-current")).toBe("page");
    for (const cls of ["bg-surface", "text-ink", "font-medium", "shadow-hairline"]) expect(picture.className).toContain(cls);
    const doc = screen.getByRole("link", { name: "Documentary" });
    expect(doc.getAttribute("aria-current")).toBeNull();
    expect(doc.className).toContain("text-ink-muted");
    expect(doc.className).toContain("hover:text-ink");
    expect(doc.className).toContain("focus-visible:shadow-focus");
  });
});
