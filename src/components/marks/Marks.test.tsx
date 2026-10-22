// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LabelledMark, Mark, Marks } from "./Marks";

describe("Mark", () => {
  it("off: surface, line border, subtle icon, hover and press", () => {
    render(<Mark kind="watched" on={false} />);
    const mark = screen.getByRole("button", { name: "Mark as watched" });
    expect(mark.getAttribute("aria-pressed")).toBe("false");
    for (const cls of [
      "bg-surface",
      "border-line",
      "text-ink-subtle",
      "enabled:hover:border-line-strong",
      "enabled:hover:text-ink",
      "enabled:active:scale-[0.92]",
      "focus-visible:shadow-focus",
      "size-10",
      "md:size-9",
    ])
      expect(mark.className).toContain(cls);
  });

  it("on: gold wash, no border, gold-ink icon; the bookmark fills", () => {
    render(
      <>
        <Mark kind="watched" on />
        <Mark kind="want" on />
      </>,
    );
    const watched = screen.getByRole("button", { name: "Watched" });
    expect(watched.getAttribute("aria-pressed")).toBe("true");
    expect(watched.className).toContain("bg-gold-wash");
    expect(watched.className).toContain("border-transparent");
    expect(watched.className).toContain("text-gold-ink");
    expect(watched.querySelector("svg")!.getAttribute("fill")).toBe("none");
    const want = screen.getByRole("button", { name: "Want to watch" });
    expect(want.querySelector("svg")!.getAttribute("fill")).toBe("currentColor");
  });

  it("names the action when off", () => {
    render(<Mark kind="want" on={false} />);
    expect(screen.getByRole("button", { name: "Add to want to watch" })).toBeTruthy();
  });

  it("saving: busy, with the turning gold ring", () => {
    render(<Mark kind="watched" on status="saving" />);
    const mark = screen.getByRole("button");
    expect(mark.getAttribute("aria-busy")).toBe("true");
    expect(mark.dataset.status).toBe("saving");
    expect(mark.className).toContain("after:border-t-gold");
    expect(mark.className).toContain("after:animate-[spin_0.9s_linear_infinite]");
  });

  it("failed: error ring and icon on surface", () => {
    render(<Mark kind="watched" on={false} status="failed" />);
    const mark = screen.getByRole("button");
    expect(mark.dataset.status).toBe("failed");
    expect(mark.className).toContain("border-error");
    expect(mark.className).toContain("text-error");
    expect(mark.className).not.toContain("bg-gold-wash");
  });

  it("small is 30px with a wider hit area", () => {
    render(<Mark kind="watched" on={false} size="sm" />);
    const mark = screen.getByRole("button");
    expect(mark.className).toContain("size-[30px]");
    expect(mark.className).toContain("before:-inset-[7px]");
  });
});

describe("Marks", () => {
  it("renders watched then want, and reports taps", () => {
    const onToggle = vi.fn();
    render(<Marks watched want={false} onToggle={onToggle} />);
    const [watched, want] = screen.getAllByRole("button");
    expect(watched.getAttribute("aria-label")).toBe("Watched");
    expect(want.getAttribute("aria-label")).toBe("Add to want to watch");
    fireEvent.click(want);
    expect(onToggle).toHaveBeenCalledWith("want");
  });

  it("offline: both disabled", () => {
    render(<Marks watched={false} want={false} disabled />);
    for (const b of screen.getAllByRole("button")) expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it("passes each mark its own status", () => {
    render(<Marks watched={false} want status={{ watched: "failed" }} />);
    const [watched, want] = screen.getAllByRole("button");
    expect(watched.dataset.status).toBe("failed");
    expect(want.dataset.status).toBeUndefined();
  });
});

describe("LabelledMark", () => {
  it("is a 40px pill with icon and label, gold wash when on", () => {
    render(
      <>
        <LabelledMark kind="watched" on />
        <LabelledMark kind="want" on={false} />
      </>,
    );
    const watched = screen.getByRole("button", { name: "Watched" });
    expect(watched.getAttribute("aria-pressed")).toBe("true");
    expect(watched.className).toContain("h-10");
    expect(watched.className).toContain("rounded-pill");
    expect(watched.className).toContain("bg-gold-wash");
    const want = screen.getByRole("button", { name: "Want to watch" });
    expect(want.getAttribute("aria-pressed")).toBe("false");
    expect(want.className).toContain("border-line");
  });

  it("saving swaps the icon for the ring; failed turns error", () => {
    render(
      <>
        <LabelledMark kind="watched" on status="saving" />
        <LabelledMark kind="want" on={false} status="failed" />
      </>,
    );
    const [saving, failed] = screen.getAllByRole("button");
    expect(saving.getAttribute("aria-busy")).toBe("true");
    expect(saving.querySelector("svg")).toBeNull();
    expect(failed.className).toContain("border-error");
  });
});
