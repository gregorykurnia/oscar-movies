// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineNotice } from "@/components/notice/OfflineNotice";
import { FilmLabelledMarks, FilmMarks, HydrateMarks, MarksProvider } from "./MarksProvider";
import type { MarkFailure, SaveMark } from "./marks-store";

// The wiring: one tap updates every place the film shows, a failure toasts and flips back,
// and offline (or before the marks are read) the marks are disabled.

function renderMarks(save: SaveMark, onFailure: (f: MarkFailure) => void = () => {}) {
  return render(
    <MarksProvider save={save} onFailure={onFailure}>
      <OfflineNotice />
      <div data-testid="row">
        <FilmMarks movieId={7} title="Hamnet" />
      </div>
      <div data-testid="page">
        <FilmLabelledMarks movieId={7} title="Hamnet" />
      </div>
      <HydrateMarks marks={[{ movieId: 7, watched: false, want: true }]} />
    </MarksProvider>,
  );
}

const row = () => within(screen.getByTestId("row"));
const page = () => within(screen.getByTestId("page"));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MarksProvider", () => {
  it("one tap updates every place the film shows, and watched clears want", async () => {
    const save = vi.fn<SaveMark>(() => Promise.resolve({ ok: true }));
    renderMarks(save);
    expect(row().getByRole("button", { name: "Want to watch" }).getAttribute("aria-pressed")).toBe("true");

    await act(async () => fireEvent.click(row().getByRole("button", { name: "Mark as watched" })));
    expect(save).toHaveBeenCalledWith({ movieId: 7, watched: true, want: false });
    expect(row().getByRole("button", { name: "Watched" }).getAttribute("aria-pressed")).toBe("true");
    expect(row().getByRole("button", { name: "Add to want to watch" }).getAttribute("aria-pressed")).toBe("false");
    expect(page().getByRole("button", { name: "Watched" }).getAttribute("aria-pressed")).toBe("true");
    expect(page().getByRole("button", { name: "Want to watch" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("a failed save flips the mark back, rings red and reports it", async () => {
    const failures: MarkFailure[] = [];
    renderMarks(
      () => Promise.resolve({ ok: false }),
      (f) => failures.push(f),
    );
    await act(async () => fireEvent.click(page().getByRole("button", { name: "Watched" })));
    const watched = row().getByRole("button", { name: "Mark as watched" });
    expect(watched.getAttribute("aria-pressed")).toBe("false");
    expect(watched.getAttribute("data-status")).toBe("failed");
    expect(row().getByRole("button", { name: "Want to watch" }).getAttribute("aria-pressed")).toBe("true");
    expect(failures.map((f) => f.title)).toEqual(["Hamnet"]);
  });

  it("offline: the marks are disabled and the notice shows", async () => {
    const save = vi.fn<SaveMark>(() => Promise.resolve({ ok: true }));
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderMarks(save);
    expect(screen.getByRole("status").textContent).toContain("You're offline.");
    const mark = row().getByRole("button", { name: "Mark as watched" }) as HTMLButtonElement;
    expect(mark.disabled).toBe(true);

    onLine.mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event("online")));
    expect(screen.queryByRole("status")).toBeNull();
    expect(mark.disabled).toBe(false);
  });

  it("disabled until the marks are read", () => {
    render(
      <MarksProvider save={() => Promise.resolve({ ok: true })}>
        <FilmMarks movieId={1} title="Flow" />
      </MarksProvider>,
    );
    expect((screen.getByRole("button", { name: "Mark as watched" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
