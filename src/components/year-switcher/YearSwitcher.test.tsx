// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { yearRange } from "@/lib/years";
import { YearSwitcher } from "./YearSwitcher";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const years = yearRange(2026, 2012);

function renderSwitcher(year = 2025) {
  render(
    <>
      <YearSwitcher year={year} years={years} liveYear={2026} href="/race/{year}?category=picture" />
      <button type="button">Elsewhere</button>
    </>,
  );
  const button = screen.getByRole("button", { name: `Year: ${year}` });
  return { button };
}

function open(year = 2025) {
  const { button } = renderSwitcher(year);
  fireEvent.click(button);
  return { button, dialog: screen.getByRole("dialog", { name: "Choose a year" }) };
}

const focusedYear = () => document.activeElement?.textContent?.slice(0, 4);

beforeEach(() => router.push.mockReset());

describe("yearRange", () => {
  it("runs newest first, inclusive", () => {
    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(2012);
    expect(years).toHaveLength(15);
  });
});

describe("YearSwitcher", () => {
  it("closed: a button with the year and a chevron", () => {
    const { button } = renderSwitcher();
    expect(button.textContent).toBe("2025");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.className).toContain("border-line");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("open: caption, every year newest first with addresses, the page's year in gold, the live dot", () => {
    const { button, dialog } = open();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.className).toContain("border-ink");
    expect(within(dialog).getByText("Film year (Oscars the following March)")).toBeTruthy();
    const links = within(dialog).getAllByRole("link");
    expect(links.map((l) => l.textContent?.slice(0, 4))).toEqual(years.map(String));
    expect(links[1].getAttribute("href")).toBe("/race/2025?category=picture");
    expect(links[1].getAttribute("aria-current")).toBe("page");
    expect(links[1].className).toContain("bg-gold-wash");
    expect(links[1].className).toContain("text-gold-ink");
    expect(links[0].textContent).toBe("2026, live season");
    expect(links[0].querySelector('[title="Live season"]')?.className).toContain("bg-gold");
  });

  it("opening focuses the page's year; it is the only tab stop in the grid", () => {
    const { dialog } = open(2024);
    expect(focusedYear()).toBe("2024");
    const stops = within(dialog).getAllByRole("link").filter((l) => l.tabIndex === 0);
    expect(stops.map((l) => l.textContent)).toEqual(["2024"]);
  });

  it("arrow keys move across the 3-column grid and stop at its edges; Home and End jump", () => {
    const { dialog } = open(2025); // 2026 2025 2024 / 2023 2022 2021 / ...
    const key = (k: string) => fireEvent.keyDown(document.activeElement ?? dialog, { key: k });
    key("ArrowRight");
    expect(focusedYear()).toBe("2024");
    key("ArrowDown");
    expect(focusedYear()).toBe("2021");
    key("ArrowLeft");
    expect(focusedYear()).toBe("2022");
    key("ArrowUp");
    expect(focusedYear()).toBe("2025");
    key("ArrowUp");
    expect(focusedYear()).toBe("2025"); // nothing above the first row: stays
    key("Home");
    expect(focusedYear()).toBe("2026");
    key("ArrowLeft");
    expect(focusedYear()).toBe("2026");
    key("End");
    expect(focusedYear()).toBe("2012");
    key("ArrowDown");
    expect(focusedYear()).toBe("2012");
    expect(within(dialog).getAllByRole("link").filter((l) => l.tabIndex === 0)).toHaveLength(1);
  });

  it("Enter picks the focused year: closes, returns focus and changes the year in the address", () => {
    const { button } = open(2025);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" }); // 2022
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(router.push).toHaveBeenCalledWith("/race/2022?category=picture");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("Enter on the page's own year just closes", () => {
    open(2025);
    fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Esc closes it and returns focus to the button", () => {
    const { button } = open();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("reopening starts again at the page's year", () => {
    const { button } = open(2025);
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    fireEvent.click(button);
    expect(focusedYear()).toBe("2025");
  });

  it("a press outside or tabbing out closes it; the button toggles it", () => {
    const { button } = open();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.blur(document.activeElement!, { relatedTarget: screen.getByRole("button", { name: "Elsewhere" }) });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clicking a year closes it (the link changes the address)", () => {
    const { dialog } = open();
    const y2019 = within(dialog).getByRole("link", { name: "2019" });
    expect(y2019.getAttribute("href")).toBe("/race/2019?category=picture");
    fireEvent.click(y2019);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
