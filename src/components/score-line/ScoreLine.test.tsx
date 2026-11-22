// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScoreLine } from "./ScoreLine";

const text = (el: Element) => Array.from(el.children).map((c) => c.textContent);

describe("ScoreLine", () => {
  it("shows all five scores, followed by the average and its count", () => {
    const { container } = render(
      <ScoreLine scores={{ imdb: 7.9, rt: 95, mc: 95, tmdb: 7.5, lb: 3.76, average: 83.8, count: 5 }} />,
    );
    const line = container.firstChild as HTMLElement;
    expect(text(line)).toEqual(["IMDb 7.9", "RT 95", "MC 95", "TMDB 7.5", "Letterboxd 3.8", "84 · 5 of 5"]);
    expect(line.className).toContain("text-ink-muted");
    expect(line.lastElementChild!.className).toContain("text-ink");
    expect(line.lastElementChild!.className).toContain("font-medium");
    expect(line.lastElementChild!.className).toContain("whitespace-nowrap");
  });

  it("shows a missing score as a dash, never 0", () => {
    const { container } = render(
      <ScoreLine scores={{ imdb: 8.1, rt: null, mc: 89, tmdb: 7.8, lb: null, average: 82.7, count: 3 }} />,
    );
    expect(text(container.firstChild as Element)).toEqual(["IMDb 8.1", "RT –", "MC 89", "TMDB 7.8", "Letterboxd –", "83 · 3 of 5"]);
  });

  it("says No scores yet when there are none", () => {
    const { container } = render(
      <ScoreLine scores={{ imdb: null, rt: null, mc: null, tmdb: null, lb: null, average: null, count: 0 }} />,
    );
    expect(text(container.firstChild as Element)).toEqual(["IMDb –", "RT –", "MC –", "TMDB –", "Letterboxd –", "No scores yet"]);
  });

  it("keeps a real zero", () => {
    const { container } = render(
      <ScoreLine scores={{ imdb: null, rt: 0, mc: null, tmdb: null, lb: null, average: 0, count: 1 }} />,
    );
    expect(text(container.firstChild as Element)).toContain("RT 0");
  });
});
