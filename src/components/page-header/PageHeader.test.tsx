// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageHeader } from "./PageHeader";

const router = vi.hoisted(() => ({ back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

afterEach(() => router.back.mockReset());

describe("PageHeader", () => {
  it("is the page's one h1 in Display, with the sub line and actions", () => {
    render(
      <PageHeader
        title="The 2025 race"
        sub="98th Academy Awards. Updated 20 Dec 2025."
        actions={<button type="button">2025</button>}
      />,
    );
    const h1 = screen.getByRole("heading", { level: 1, name: "The 2025 race" });
    for (const cls of ["text-display-phone", "md:text-display", "font-semibold", "tracking-display"]) expect(h1.className).toContain(cls);
    const sub = screen.getByText("98th Academy Awards. Updated 20 Dec 2025.");
    expect(sub.className).toContain("text-ink-muted");
    expect(screen.getByRole("button", { name: "2025" })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("a back link names where it goes", () => {
    render(<PageHeader title="BAFTA 2024" back={{ label: "Awards 2024", href: "/awards/2024" }} />);
    const back = screen.getByRole("link", { name: "Awards 2024" });
    expect(back.getAttribute("href")).toBe("/awards/2024");
    expect(back.className).toContain("text-ink-muted");
    expect(back.querySelector("svg")).not.toBeNull();
  });

  it("the movie page's Back uses history when the visit came from this app, else the link", () => {
    render(<PageHeader title="Anora" back={{ label: "Back", href: "/", history: true }} />);
    const back = screen.getByRole("link", { name: "Back" });
    expect(back.getAttribute("href")).toBe("/");

    const referrer = vi.spyOn(document, "referrer", "get");
    referrer.mockReturnValue(`${window.location.origin}/race/2024`);
    window.history.pushState({}, "", "/movies/anora");
    fireEvent.click(back);
    expect(router.back).toHaveBeenCalledOnce();

    referrer.mockReturnValue("https://www.google.com/");
    fireEvent.click(back);
    expect(router.back).toHaveBeenCalledOnce();
    referrer.mockRestore();
  });
});
