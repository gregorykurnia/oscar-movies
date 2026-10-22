// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { currentNav } from "./nav";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));

function renderShell(props: { season?: number; toWatch?: number } = {}) {
  return render(
    <AppShell {...props}>
      <p>Page body</p>
    </AppShell>,
  );
}

beforeEach(() => {
  nav.pathname = "/";
  document.documentElement.style.overflow = "";
});

describe("currentNav", () => {
  it("maps paths to their nav item", () => {
    expect(currentNav("/")).toBe("race");
    expect(currentNav("/race/2024")).toBe("race");
    expect(currentNav("/awards/bafta/2024")).toBe("awards");
    expect(currentNav("/grid/2025")).toBe("grid");
    expect(currentNav("/watch-list")).toBe("watch-list");
    expect(currentNav("/movies/anora")).toBeNull();
    expect(currentNav("/data")).toBeNull();
    expect(currentNav("/gridlock")).toBeNull();
  });
});

describe("AppShell", () => {
  it("frames the page: top bar, main, footer", () => {
    renderShell();
    expect(within(screen.getByRole("main")).getByText("Page body")).toBeTruthy();
    expect(screen.getByRole("banner")).toBeTruthy();
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("Oscar Movies, a personal project")).toBeTruthy();
    expect(within(footer).getByText("Scores from IMDb, Rotten Tomatoes, Metacritic and TMDB")).toBeTruthy();
    expect(within(footer).getByRole("link", { name: "Data coverage and sources" }).getAttribute("href")).toBe("/data");
  });

  it("the wordmark goes to the race, and the nav is in the guide's order with the current page marked", () => {
    nav.pathname = "/awards/oscars/2024";
    renderShell();
    expect(screen.getByRole("link", { name: "Oscar Movies" }).getAttribute("href")).toBe("/");
    const main = screen.getByRole("navigation", { name: "Main" });
    const links = within(main).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Race",
      "Awards",
      "Year grid",
      "Accuracy",
      "Submissions",
      "Festivals",
      "Watch list",
    ]);
    const awards = within(main).getByRole("link", { name: "Awards" });
    expect(awards.getAttribute("aria-current")).toBe("page");
    expect(awards.className).toContain("text-ink");
    expect(awards.className).toContain("font-medium");
    expect(within(main).getByRole("link", { name: "Race" }).getAttribute("aria-current")).toBeNull();
  });

  it("shows the search box with its / hint and a search button, both opening search", () => {
    renderShell();
    const box = screen.getByRole("button", { name: "Search films and awards" });
    expect(box.hasAttribute("disabled")).toBe(false);
    expect(box.textContent).toContain("Search films and awards");
    expect(box.querySelector("kbd")?.textContent).toBe("/");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByRole("dialog", { name: "Search" })).toBeTruthy();
  });
});

describe("Phone menu", () => {
  function openMenu(props: { season?: number; toWatch?: number } = {}) {
    renderShell(props);
    const button = screen.getByRole("button", { name: "Menu" });
    button.focus();
    fireEvent.click(button);
    return { button, dialog: screen.getByRole("dialog", { name: "Menu" }) };
  }

  it("opens as a modal sheet with focus on the close button, and locks the page's scroll", () => {
    const { button, dialog } = openMenu();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close menu" }));
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("Esc closes it and returns focus to the menu button", () => {
    const { button, dialog } = openMenu();
    fireEvent.keyDown(within(dialog).getByRole("link", { name: /Year grid/ }), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("the close button closes it and returns focus to the menu button", () => {
    const { button, dialog } = openMenu();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close menu" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("traps focus: Tab from the last item wraps to the first, Shift+Tab from the first to the last", () => {
    const { dialog } = openMenu();
    const close = within(dialog).getByRole("button", { name: "Close menu" });
    const last = within(dialog).getByRole("link", { name: "Data coverage and sources" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("Tab between items inside is left to the browser", () => {
    const { dialog } = openMenu();
    const close = within(dialog).getByRole("button", { name: "Close menu" });
    const event = fireEvent.keyDown(close, { key: "Tab" });
    expect(event).toBe(true); // not prevented
    expect(document.activeElement).toBe(close);
  });

  it("its search button closes the menu and opens the search sheet", () => {
    const { dialog } = openMenu();
    fireEvent.click(within(dialog).getByRole("button", { name: "Search" }));
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Search" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Search films and awards" }));
  });

  it("lists the nav with the current page's gold bar and the captions", () => {
    nav.pathname = "/race/2025";
    const { dialog } = openMenu({ season: 2026, toWatch: 4 });
    const race = within(dialog).getByRole("link", { name: /^Race/ });
    expect(race.getAttribute("aria-current")).toBe("page");
    expect(race.className).toContain("before:bg-gold");
    expect(race.textContent).toBe("Race2026 season");
    expect(within(dialog).getByRole("link", { name: /^Watch list/ }).textContent).toBe("Watch list4 to watch");
    expect(within(dialog).getByRole("link", { name: "Awards" }).className).toContain("text-ink-muted");
  });

  it("following a link closes it", () => {
    const { dialog } = openMenu();
    fireEvent.click(within(dialog).getByRole("link", { name: "Accuracy" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
