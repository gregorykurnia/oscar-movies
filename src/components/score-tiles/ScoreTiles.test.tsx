// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScoreTiles, type ScoreTilesData } from "./ScoreTiles";

const oct14 = new Date("2026-10-14T09:00:00Z");
const now = new Date("2026-10-22T09:00:00Z");

const full: ScoreTilesData = {
  imdb: { value: 8.2, updatedAt: oct14 },
  rt: { value: 97, updatedAt: oct14 },
  mc: { value: 85, updatedAt: oct14 },
  tmdb: { value: 7.9, updatedAt: new Date("2026-10-16T09:00:00Z") },
  lb: { value: 3.76, updatedAt: oct14 },
  average: 83.6,
  count: 5,
};

const tiles = (container: HTMLElement) =>
  Array.from((container.firstChild as HTMLElement).children) as HTMLElement[];

describe("ScoreTiles", () => {
  it("shows the five sources with units and dates, then the average on the gold wash", () => {
    const { container } = render(<ScoreTiles scores={full} now={now} />);
    const t = tiles(container);
    expect(t.map((x) => x.textContent)).toEqual([
      "IMDb8.2/10Updated 14 Oct",
      "Rotten Tomatoes97%Updated 14 Oct",
      "Metacritic85/100Updated 14 Oct",
      "TMDB7.9/10Updated 16 Oct",
      "Letterboxd3.8/5Updated 14 Oct",
      "Average845 of 5 scores",
    ]);
    expect(t[5].className).toContain("bg-gold-wash");
    expect(t[5].children[1].className).toContain("text-gold-ink");
    expect((container.firstChild as HTMLElement).className).toContain("rounded-lg");
  });

  it("shows a missing score as a muted dash with No score yet", () => {
    const { container } = render(
      <ScoreTiles scores={{ ...full, rt: { value: null, updatedAt: null }, average: 80.3, count: 4 }} now={now} />,
    );
    const rt = tiles(container)[1];
    expect(rt.textContent).toBe("Rotten Tomatoes–No score yet");
    expect(rt.dataset.missing).toBe("true");
    expect(rt.children[1].className).toContain("text-ink-muted");
    expect(tiles(container)[5].textContent).toBe("Average804 of 5 scores");
  });

  it("with no scores, the average is a dash too", () => {
    const none = { value: null, updatedAt: null };
    const { container } = render(
      <ScoreTiles scores={{ imdb: none, rt: none, mc: none, tmdb: none, lb: none, average: null, count: 0 }} now={now} />,
    );
    expect(tiles(container)[4].textContent).toBe("Letterboxd–No score yet");
    const avg = tiles(container)[5];
    expect(avg.textContent).toBe("Average–No scores yet");
    expect(avg.children[1].className).toContain("text-ink-muted");
  });

  it("adds the year to dates from another year", () => {
    const { container } = render(
      <ScoreTiles scores={{ ...full, imdb: { value: 8.2, updatedAt: new Date("2025-12-01T00:00:00Z") } }} now={now} />,
    );
    expect(tiles(container)[0].textContent).toBe("IMDb8.2/10Updated 1 Dec 2025");
  });
});
