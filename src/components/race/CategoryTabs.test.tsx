// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryTabs } from "./CategoryTabs";

const nav = vi.hoisted(() => ({ search: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/race/2024",
  useSearchParams: () => nav.search,
}));

const leads = { picture: "Anora", documentary: "No Other Land", international: "I'm Still Here", animated: "Flow" };
const panels = { picture: <p>Picture rows</p>, documentary: <p>Documentary rows</p>, international: <p>International rows</p>, animated: <p>Animated rows</p> };

function renderTabs(query = "") {
  nav.search = new URLSearchParams(query);
  render(<CategoryTabs leads={leads} panels={panels} />);
}

describe("CategoryTabs", () => {
  let replace: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    replace = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
  });

  it("selects the category in the address and shows only its panel", () => {
    renderTabs("category=animated");
    const tab = screen.getByRole("tab", { name: /^Animated/ });
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(tab.tabIndex).toBe(0);
    expect(screen.getByRole("tab", { name: /^Picture/ }).tabIndex).toBe(-1);
    expect(screen.getByRole("tabpanel").textContent).toBe("Animated rows");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(tab.id);
  });

  it("falls back to Picture and names each tab with its lead", () => {
    renderTabs("category=nonsense");
    expect(screen.getByRole("tab", { name: /^Picture, ?Anora$/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("keeps a click in the address, replacing the entry; Picture leaves it out", () => {
    renderTabs("category=animated&x=1");
    fireEvent.click(screen.getByRole("tab", { name: /^Documentary/ }));
    expect(replace).toHaveBeenLastCalledWith(null, "", "/race/2024?category=documentary&x=1");
    fireEvent.click(screen.getByRole("tab", { name: /^Picture/ }));
    expect(replace).toHaveBeenLastCalledWith(null, "", "/race/2024?x=1");
  });

  it("moves with the arrow keys, wrapping at the ends, and with Home and End", () => {
    renderTabs();
    const picture = screen.getByRole("tab", { name: /^Picture/ });
    fireEvent.keyDown(picture, { key: "ArrowLeft" });
    expect(replace).toHaveBeenLastCalledWith(null, "", "/race/2024?category=animated");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /^Animated/ }));
    fireEvent.keyDown(picture, { key: "ArrowRight" });
    expect(replace).toHaveBeenLastCalledWith(null, "", "/race/2024?category=documentary");
    fireEvent.keyDown(picture, { key: "End" });
    expect(replace).toHaveBeenLastCalledWith(null, "", "/race/2024?category=animated");
    fireEvent.keyDown(picture, { key: "Home" });
    expect(replace).toHaveBeenLastCalledWith(null, "", "/race/2024");
    replace.mockClear();
    fireEvent.keyDown(picture, { key: "a" });
    expect(replace).not.toHaveBeenCalled();
  });
});
