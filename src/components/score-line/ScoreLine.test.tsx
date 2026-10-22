// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScoreLine } from "./ScoreLine";

const text = (el: Element) => Array.from(el.children).map((c) => c.textContent);

describe("ScoreLine", () => {
  it("shows all four and the average with its count", () => {
    const { container } = render(
      <ScoreLine scores={{ imdb: 7.9, rt: 95, mc: 95, tmdb: 7.5, average: 86.2, count: 4 }} />,
    );
    const line = container.firstChild as HTMLElement;
    expect(text(line)).toEqual(["IMDb 7.9", "RT 95", "MC 95", "TMDB 7.5", "86 · 4 of 4"]);
    expect(line.className).toContain("text-ink-muted");
    expect(line.lastElementChild!.className).toContain("text-ink");
    expect(line.lastElementChild!.className).toContain("font-medium");
  });

  it("shows a missing score as a dash, never 0", () => {
    const { container } = render(
      <ScoreLine scores={{ imdb: 8.1, rt: null, mc: 89, tmdb: 7.8, average: 83, count: 3 }} />,
    );
    expect(text(container.firstChild as Element)).toEqual(["IMDb 8.1", "RT –", "MC 89", "TMDB 7.8", "83 · 3 of 4"]);
  });

  it("says No scores yet when there are none", () => {
    const { container } = render(
      <ScoreLine scores={{ imdb: null, rt: null, mc: null, tmdb: null, average: null, count: 0 }} />,
    );
    expect(text(container.firstChild as Element)).toEqual(["IMDb –", "RT –", "MC –", "TMDB –", "No scores yet"]);
  });

  it("keeps a real zero", () => {
    const { container } = render(
      <ScoreLine scores={{ imdb: null, rt: 0, mc: null, tmdb: null, average: 0, count: 1 }} />,
    );
    expect(text(container.firstChild as Element)).toContain("RT 0");
  });
});
