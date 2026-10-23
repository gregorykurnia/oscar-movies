// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Method } from "./Method";

describe("Method", () => {
  it("is the #method section and states §5.3's numbers", () => {
    const { container } = render(<Method />);
    expect(container.querySelector("section#method")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "How the % chance works" })).toBeTruthy();
    const text = container.textContent ?? "";
    for (const part of ["between −1 and 3", "one season left out", "never sees its own answer", "above 90%", "10 for Best Picture from 2021", "none above 99%", "fewer than 3 awards"]) {
      expect(text, part).toContain(part);
    }
  });
});
