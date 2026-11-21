// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { StarButton } from "./StarButton";

const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn(), toast: vi.fn() }));
vi.mock("@/app/actions/watch-list", () => ({ setFavorite: mocks.save }));
vi.mock("@/components/toast/Toaster", () => ({ showToast: mocks.toast }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

const film = { movieId: 7, title: "Hamnet", favorite: false, markVersion: "51" };
const star = () => screen.getByRole("button", { name: "Star Hamnet" });

beforeEach(() => { vi.resetAllMocks(); });

it.each(["refused", "lost response"] as const)("reverts a %s and retries the same value with the first read's version after a refresh", async (failure) => {
  if (failure === "refused") mocks.save.mockResolvedValueOnce({ ok: false });
  else mocks.save.mockRejectedValueOnce(new Error("connection lost"));
  mocks.save.mockResolvedValueOnce({ ok: true });
  const { rerender } = render(<StarButton {...film} />);

  fireEvent.click(star());
  expect(star().getAttribute("aria-pressed")).toBe("true");
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledTimes(1));
  expect(star().getAttribute("aria-pressed")).toBe("false");
  await waitFor(() => expect(star()).toHaveProperty("disabled", false));
  rerender(<StarButton {...film} markVersion="52" />);

  act(() => { mocks.toast.mock.calls[0][0].onRetry(); });
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(2));
  expect(mocks.save.mock.calls).toEqual([[7, true, undefined], [7, true, "51"]]);
  rerender(<StarButton {...film} favorite markVersion="53" />);
  expect(star().getAttribute("aria-pressed")).toBe("true");
});

it("blocks a second save while pending and keeps another row's busy and failure state independent", async () => {
  let finish!: (result: { ok: boolean }) => void;
  mocks.save.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce({ ok: false });
  render(<><StarButton {...film} /><StarButton {...film} movieId={8} title="Anora" favorite /></>);
  const other = screen.getByRole("button", { name: "Star Anora" });

  fireEvent.click(star());
  fireEvent.click(star());
  expect(star()).toHaveProperty("disabled", true);
  expect(other).toHaveProperty("disabled", false);
  fireEvent.click(other);
  await waitFor(() => expect(other).toHaveProperty("disabled", false));
  expect(mocks.save.mock.calls).toEqual([[7, true, undefined], [8, false, undefined]]);
  expect(other.getAttribute("aria-pressed")).toBe("true");
  expect(star()).toHaveProperty("disabled", true);
  expect(mocks.toast.mock.calls[0][0].title).toBe("Couldn't unstar Anora");

  await act(async () => { finish({ ok: true }); });
  expect(star()).toHaveProperty("disabled", false);
  expect(mocks.toast).toHaveBeenCalledTimes(1);
});

it("lets a confirmed save finish after the row was left without sending it twice", async () => {
  let finish!: (result: { ok: boolean }) => void;
  mocks.save.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  const { unmount } = render(<StarButton {...film} favorite />);
  fireEvent.click(star());
  unmount();
  await act(async () => { finish({ ok: true }); });
  expect(mocks.save.mock.calls).toEqual([[7, false, undefined]]);
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.toast).not.toHaveBeenCalled();
});
