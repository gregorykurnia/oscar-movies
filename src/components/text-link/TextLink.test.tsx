// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextLink } from "./TextLink";

describe("TextLink", () => {
  it("underlines in line-strong and turns the text colour on hover", () => {
    render(<TextLink href="/accuracy/picture#method">How the % chance works</TextLink>);
    const link = screen.getByRole("link", { name: "How the % chance works" });
    expect(link.getAttribute("href")).toBe("/accuracy/picture#method");
    expect(link.className).toContain("text-ink");
    expect(link.className).toContain("decoration-line-strong");
    expect(link.className).toContain("underline-offset-[3px]");
    expect(link.className).toContain("hover:decoration-current");
    expect(link.className).toContain("focus-visible:shadow-focus");
  });

  it("uses gold-ink on a gold-soft underline inside the gold wash", () => {
    render(
      <TextLink href="/" tone="gold">
        How the % chance works
      </TextLink>,
    );
    const link = screen.getByRole("link");
    expect(link.className).toContain("text-gold-ink");
    expect(link.className).toContain("decoration-gold-soft");
  });
});
