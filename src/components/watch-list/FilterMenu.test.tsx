// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { FilterMenu } from "./FilterMenu";

it("opens at the current choice, wraps arrow keys, and restores focus on Escape or selection", () => {
  render(<FilterMenu label="Release" caption="Show films that are" choice="Coming" active items={[
    { label: "All", href: "/watch-list?platform=Netflix", current: false },
    { label: "Coming", href: "/watch-list?platform=Netflix&release=coming", current: true },
  ]} />);
  const button = screen.getByRole("button", { name: "Release: Coming" });
  fireEvent.keyDown(button, { key: "ArrowDown" });
  const coming = screen.getByRole("menuitemradio", { name: "Coming" });
  expect(document.activeElement).toBe(coming);
  fireEvent.keyDown(coming, { key: "ArrowDown" });
  expect(document.activeElement).toBe(screen.getByRole("menuitemradio", { name: "All" }));
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(button);
  fireEvent.click(button);
  fireEvent.click(screen.getByRole("menuitemradio", { name: "Coming" }));
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(button);
});

it("closes on an outside press or focus leaving the menu", () => {
  render(<FilterMenu label="Platform" caption="Show films on" choice="All" active={false}
    items={[{ label: "All platforms", href: "/watch-list", current: true }]} />);
  const button = screen.getByRole("button");
  fireEvent.click(button);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("menu")).toBeNull();
  fireEvent.click(button);
  fireEvent.blur(screen.getByRole("menuitemradio"), { relatedTarget: document.body });
  expect(screen.queryByRole("menu")).toBeNull();
});

it("aligns an overflowing menu with its own trigger's right edge", () => {
  render(<FilterMenu label="Release" caption="Show films that are" choice="All" active={false}
    items={[{ label: "All", href: "/watch-list", current: true }]} />);
  const button = screen.getByRole("button");
  const left = window.innerWidth - 189;
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue({ left, right: left + 115, width: 115, top: 0, bottom: 32, height: 32, x: left, y: 0, toJSON: () => ({}) });
  fireEvent.click(button);
  expect(screen.getByRole("menu").style.left).toBe("-133px");
  vi.restoreAllMocks();
});
