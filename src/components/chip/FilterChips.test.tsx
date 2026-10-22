// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FilterChips } from "./FilterChips";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

const items = [
  { label: "Shortlisted", href: "/submissions/2024?filter=shortlisted", pressed: true },
  { label: "Unwatched", href: "/submissions/2024?filter=unwatched", pressed: false },
];

describe("FilterChips", () => {
  beforeEach(() => replace.mockClear());

  it("a labelled group of chips, each pressed when its filter is on", () => {
    render(<FilterChips label="Filter" items={items} />);
    expect(screen.getByRole("group", { name: "Filter" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Shortlisted" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Unwatched" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("a press replaces the address with the chip's own link, keeping the scroll", () => {
    render(<FilterChips label="Filter" items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "Unwatched" }));
    expect(replace).toHaveBeenCalledWith("/submissions/2024?filter=unwatched", { scroll: false });
  });
});
