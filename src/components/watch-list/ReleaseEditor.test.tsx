// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ReleaseEditor } from "./ReleaseEditor";

const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/actions/watch-list", () => ({ setRelease: mocks.save }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
const props = { movieId: 7, title: "Hamnet", releaseOn: null, releaseTentative: false, platform: null, today: "2026-11-11", usedPlatforms: [] };
const date = () => screen.getByLabelText("Date", { exact: true });
const choose = (name: string) => fireEvent.click(screen.getByRole("radio", { name }));
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));
const open = () => fireEvent.click(screen.getByRole("button", { expanded: false }));

beforeEach(() => { vi.clearAllMocks(); mocks.save.mockReset().mockResolvedValue({ ok: true }); });

it("starts new dates tentative, keeps an edited choice, and resets it after emptying the date", async () => {
  render(<ReleaseEditor {...props} />);
  open();
  expect(screen.queryByRole("radiogroup")).toBeNull();
  fireEvent.change(date(), { target: { value: "2030-12-12" } });
  expect(screen.getByRole("radio", { name: "Tentative" })).toHaveProperty("checked", true);
  choose("Confirmed");
  fireEvent.change(date(), { target: { value: "2030-12-13" } });
  expect(screen.getByRole("radio", { name: "Confirmed" })).toHaveProperty("checked", true);
  fireEvent.change(date(), { target: { value: "" } });
  expect(screen.queryByRole("radiogroup")).toBeNull();
  fireEvent.change(date(), { target: { value: "2030-12-14" } });
  expect(screen.getByRole("radiogroup", { name: "This date is" })).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Tentative" })).toHaveProperty("checked", true);
  save();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.save).toHaveBeenCalledWith(7, "2030-12-14", null, true);
  expect(screen.getByRole("button", { name: "14 Dec 2030, tentative" })).toBeTruthy();
});

it("keeps stored choices on edits and picks up a status-only refresh", async () => {
  const { rerender } = render(<ReleaseEditor {...props} releaseOn="2030-12-12" />);
  open();
  expect(screen.getByRole("radio", { name: "Confirmed" })).toHaveProperty("checked", true);
  fireEvent.change(date(), { target: { value: "2030-12-13" } });
  save();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.save).toHaveBeenCalledWith(7, "2030-12-13", null, false);
  rerender(<ReleaseEditor {...props} releaseOn="2030-12-12" releaseTentative />);
  expect(screen.getByRole("button", { name: "12 Dec 2030, tentative" })).toBeTruthy();
  open();
  expect(screen.getByRole("radio", { name: "Tentative" })).toHaveProperty("checked", true);
  choose("Confirmed");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  open();
  expect(screen.getByRole("radio", { name: "Tentative" })).toHaveProperty("checked", true);
  expect(mocks.save).toHaveBeenCalledTimes(1);
});

it("pauses both choices while saving, keeps a failed draft and retries the same choice", async () => {
  let finish!: (value: { ok: boolean }) => void;
  mocks.save.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  render(<ReleaseEditor {...props} releaseOn="2030-12-12" />);
  open();
  choose("Tentative");
  save(); save();
  expect(mocks.save).toHaveBeenCalledTimes(1);
  for (const radio of screen.getAllByRole("radio")) expect(radio).toHaveProperty("disabled", true);
  finish({ ok: false });
  await screen.findByRole("alert");
  expect(screen.getByRole("radio", { name: "Tentative" })).toHaveProperty("checked", true);
  expect(screen.getByRole("button", { name: "12 Dec 2030" })).toBeTruthy();
  save();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.save.mock.calls).toEqual([[7, "2030-12-12", null, true], [7, "2030-12-12", null, true]]);
});

it("keeps a confirmed choice through an incomplete date while editing", () => {
  render(<ReleaseEditor {...props} releaseOn="2030-12-12" />);
  open();
  const field = date();
  Object.defineProperty(field, "validity", { configurable: true, value: { badInput: true } });
  fireEvent.change(field, { target: { value: "" } });
  Object.defineProperty(field, "validity", { configurable: true, value: { badInput: false } });
  fireEvent.change(field, { target: { value: "2031-12-12" } });
  expect(screen.getByRole("radio", { name: "Confirmed" })).toHaveProperty("checked", true);
});

it.each(["Save", "Clear"])("drops the flag when %s removes the date", async (action) => {
  render(<ReleaseEditor {...props} releaseOn="2030-12-12" releaseTentative platform="Netflix" />);
  open();
  if (action === "Save") fireEvent.change(date(), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: action }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.save).toHaveBeenCalledWith(7, null, action === "Save" ? "Netflix" : null, false);
  expect(screen.queryByRole("button", { name: /tentative/ })).toBeNull();
});

it("keeps the chosen status visibly selected while saving (10.R)", async () => {
  let answer: (value: { ok: boolean }) => void = () => {};
  mocks.save.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
  render(<ReleaseEditor {...props} releaseOn="2030-12-12" releaseTentative />);
  open();
  save();
  const face = (name: string) => screen.getByRole("radio", { name }).nextElementSibling as HTMLElement;
  await waitFor(() => expect(screen.getByRole("radio", { name: "Tentative" })).toHaveProperty("disabled", true));
  expect(face("Tentative").className).toContain("bg-surface");
  expect(face("Confirmed").className).not.toContain("bg-surface");
  answer({ ok: true });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("puts a release that is out on the gold wash, and not one still to come", () => {
  const { rerender } = render(<ReleaseEditor {...props} releaseOn="2026-11-11" platform="Netflix" />);
  const out = screen.getByRole("button", { name: "Out 11 Nov · Netflix" });
  expect(out.className).toContain("bg-gold-wash");
  expect(out.hasAttribute("data-out")).toBe(true);
  rerender(<ReleaseEditor {...props} releaseOn="2026-11-12" platform="Netflix" />);
  const coming = screen.getByRole("button", { name: "12 Nov 2026 · Netflix" });
  expect(coming.className).not.toContain("bg-gold-wash");
  expect(coming.hasAttribute("data-out")).toBe(false);
});
