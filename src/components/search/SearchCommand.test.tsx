// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResponse } from "@/lib/search";
import { OPEN_SEARCH_EVENT } from "./open-search";
import { SearchCommand } from "./SearchCommand";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const stillHere = {
  id: 1,
  slug: "im-still-here",
  title: "I'm Still Here",
  originalTitle: "Ainda Estou Aqui",
  originalLang: "pt-BR",
  year: 2024,
  flag: "BR",
  categories: ["Best Picture", "International"],
  stage: "nominated" as const,
  href: "/movies/im-still-here",
};
const anora = {
  id: 2,
  slug: "anora",
  title: "Anora",
  originalTitle: null,
  originalLang: null,
  year: 2024,
  flag: "US",
  categories: ["Best Picture"],
  stage: "won" as const,
  href: "/movies/anora",
};
const annie = { slug: "annie", name: "Annie Awards", shortName: "Annie", kindLabel: "Major award", href: "/awards/annie/2025" };

function answer(body: SearchResponse | number) {
  return typeof body === "number"
    ? new Response("", { status: body })
    : new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();

function Harness({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <>
      <button>Elsewhere</button>
      <input aria-label="Some field" />
      <SearchCommand open={open} onOpenChange={setOpen} />
    </>
  );
}

const box = () => screen.getByRole("combobox", { name: "Search films and awards" });
const type = (text: string) => fireEvent.change(box(), { target: { value: text } });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  push.mockReset();
  document.documentElement.style.overflow = "";
});
afterEach(() => vi.unstubAllGlobals());

describe("SearchCommand", () => {
  it("finds I'm Still Here by its original title, and underlines what matched", async () => {
    fetchMock.mockResolvedValue(answer({ films: [stillHere], awards: [] }));
    render(<Harness initiallyOpen />);
    type("ainda estou");
    const option = await screen.findByRole("option", { name: /I'm Still Here/ });
    expect(fetchMock).toHaveBeenCalledWith("/api/search?q=ainda%20estou", expect.anything());
    expect(option.getAttribute("href")).toBe("/movies/im-still-here");
    expect(within(option).getByText("Ainda Estou")).toBeTruthy();
    expect(within(option).getByText("Ainda Estou").tagName).toBe("MARK");
    expect(option.textContent).toContain("2024 · Best Picture, International");
    expect(option.textContent).toContain("Nominated");
  });

  it("finds it by the English title too, and shows no original title then", async () => {
    fetchMock.mockResolvedValue(answer({ films: [stillHere], awards: [] }));
    render(<Harness initiallyOpen />);
    type("I'm Still");
    const option = await screen.findByRole("option", { name: /I'm Still Here/ });
    expect(within(option).getByText("I'm Still").tagName).toBe("MARK");
    expect(option.textContent).not.toContain("Ainda");
  });

  it("groups films and awards, with the first row highlighted", async () => {
    fetchMock.mockResolvedValue(answer({ films: [anora], awards: [annie] }));
    render(<Harness initiallyOpen />);
    type("an");
    await screen.findByRole("option", { name: /Anora/ });
    const list = screen.getByRole("listbox", { name: "Search results" });
    expect(within(list).getByRole("group", { name: "Films" })).toBeTruthy();
    expect(within(list).getByRole("group", { name: "Awards and festivals" })).toBeTruthy();
    const [first, second] = within(list).getAllByRole("option");
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(second.getAttribute("aria-selected")).toBe("false");
    expect(box().getAttribute("aria-activedescendant")).toBe(first.id);
    expect(screen.getByRole("status").textContent).toBe("2 results");
  });

  it("arrows move the highlighted row (and wrap), Enter opens it and closes search", async () => {
    fetchMock.mockResolvedValue(answer({ films: [anora, stillHere], awards: [annie] }));
    render(<Harness initiallyOpen />);
    type("an");
    await screen.findByRole("option", { name: /Anora/ });
    const selected = () => screen.getAllByRole("option").findIndex((o) => o.getAttribute("aria-selected") === "true");
    expect(selected()).toBe(0);
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    expect(selected()).toBe(2);
    expect(box().getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[2].id);
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    expect(selected()).toBe(0);
    fireEvent.keyDown(box(), { key: "ArrowUp" });
    expect(selected()).toBe(2);
    fireEvent.keyDown(box(), { key: "ArrowUp" });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/movies/im-still-here");
    expect(screen.queryByRole("dialog", { name: "Search" })).toBeNull();
  });

  it("an emptied box or a failed search leaves no hidden result for Enter or the arrows", async () => {
    fetchMock.mockResolvedValueOnce(answer({ films: [anora], awards: [] }));
    render(<Harness initiallyOpen />);
    type("anora");
    await screen.findByRole("option", { name: /Anora/ });
    type("");
    expect(screen.queryByRole("option")).toBeNull();
    expect(box().getAttribute("aria-activedescendant")).toBeNull();
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(push).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(answer(500));
    type("anor");
    await screen.findByText("Search isn't available right now.", { selector: "strong" });
    expect(box().getAttribute("aria-activedescendant")).toBeNull();
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(push).not.toHaveBeenCalled();
  });

  it("Esc closes and clears, and focus goes back to the button that opened it", async () => {
    fetchMock.mockResolvedValue(answer({ films: [anora], awards: [] }));
    render(<Harness />);
    const button = screen.getByRole("button", { name: "Search" });
    fireEvent.click(button);
    expect(document.activeElement).toBe(box());
    type("an");
    await screen.findByRole("option", { name: /Anora/ });
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect((box() as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("/ opens it from anywhere but not while typing in a field; the 404's event opens it too", () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByLabelText("Some field"), { key: "/" });
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.keyDown(document.body, { key: "/", ctrlKey: true });
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.keyDown(screen.getByRole("button", { name: "Elsewhere" }), { key: "/" });
    expect(document.activeElement).toBe(box());
    fireEvent.keyDown(box(), { key: "Escape" });
    act(() => {
      window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
    });
    expect(document.activeElement).toBe(box());
  });

  it("says nothing matches, with a hint, when there are no results", async () => {
    fetchMock.mockResolvedValue(answer({ films: [], awards: [] }));
    render(<Harness initiallyOpen />);
    type("parasyte");
    expect(await screen.findByText("No movie or award matches “parasyte”.")).toBeTruthy();
    expect(screen.getByText("Check the spelling, or try the original title.")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("No results");
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(push).not.toHaveBeenCalled();
  });

  it("waits 120ms after the last keystroke and drops an answer that arrives late", async () => {
    let resolveFirst: (response: Response) => void = () => {};
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(answer({ films: [anora], awards: [] }));
    render(<Harness initiallyOpen />);
    type("a");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    type("an");
    type("ano");
    await screen.findByRole("option", { name: /Anora/ });
    expect(fetchMock).toHaveBeenCalledTimes(2); // "an" never left: "ano" replaced it within 120ms
    expect(fetchMock.mock.calls[1][0]).toBe("/api/search?q=ano");
    await act(async () => resolveFirst(answer({ films: [stillHere], awards: [] })));
    expect(screen.queryByRole("option", { name: /I'm Still Here/ })).toBeNull();
    expect(screen.getByRole("option", { name: /Anora/ })).toBeTruthy();
  });

  it("explains a failed search instead of an empty list", async () => {
    fetchMock.mockResolvedValue(answer(500));
    render(<Harness initiallyOpen />);
    type("anora");
    expect(await screen.findByText("Search isn't available right now.", { selector: "strong" })).toBeTruthy();
  });

  it("the search box button opens it; Cancel closes the sheet", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Search films and awards" }));
    const dialog = screen.getByRole("dialog", { name: "Search" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on a click outside", () => {
    render(<Harness initiallyOpen />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("on a wide screen the box itself becomes the input and the results drop under it", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("min-width: 1101px"),
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    fetchMock.mockResolvedValue(answer({ films: [anora], awards: [] }));
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Search films and awards" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(box());
    type("anora");
    await screen.findByRole("option", { name: /Anora/ });
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Search films and awards" }));
  });
});
