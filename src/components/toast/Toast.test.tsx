// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toast } from "./Toast";
import { Toaster, showToast } from "./Toaster";

const failed = {
  title: "Couldn't save",
  description: "Hamnet is back to not watched. Check the connection and try again.",
};

describe("Toast", () => {
  it("error: icon, bold title, muted sentence, Try again and close", () => {
    const onRetry = vi.fn();
    const onClose = vi.fn();
    render(<Toast {...failed} onRetry={onRetry} onClose={onClose} />);
    const toast = screen.getByRole("status");
    expect(toast.className).toContain("shadow-toast");
    expect(toast.className).toContain("bg-surface");
    expect(toast.className).toContain("md:w-[380px]");
    expect(toast.querySelector("svg")!.getAttribute("class")).toContain("text-error");
    expect(screen.getByText(failed.description).className).toContain("text-ink-muted");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("info: neutral icon, no buttons unless given", () => {
    render(<Toast tone="info" title="Scores are a few days old" />);
    const toast = screen.getByRole("status");
    expect(toast.querySelector("svg")!.getAttribute("class")).toContain("text-ink-muted");
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("showToast", () => {
  it("shows our toast through the Toaster until it's closed", async () => {
    render(<Toaster />);
    act(() => {
      showToast({ ...failed, onRetry: () => {} });
    });
    expect(await screen.findByText("Couldn't save")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await vi.waitFor(() => expect(screen.queryByText("Couldn't save")).toBeNull());
  });
});
