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
  average: 86,
  count: 4,
};

const tiles = (container: HTMLElement) =>
  Array.from((container.firstChild as HTMLElement).children) as HTMLElement[];

describe("ScoreTiles", () => {
  it("shows the four sources with units and dates, then the average on the gold wash", () => {
    const { container } = render(<ScoreTiles scores={full} now={now} />);
    const t = tiles(container);
    expect(t.map((x) => x.textContent)).toEqual([
      "IMDb8.2/10Updated 14 Oct",
      "Rotten Tomatoes97%Updated 14 Oct",
      "Metacritic85/100Updated 14 Oct",
      "TMDB7.9/10Updated 16 Oct",
      "Average864 of 4 scores",
    ]);
    expect(t[4].className).toContain("bg-gold-wash");
    expect(t[4].children[1].className).toContain("text-gold-ink");
    expect((container.firstChild as HTMLElement).className).toContain("rounded-lg");
  });

  it("shows a missing score as a muted dash with No score yet", () => {
    const { container } = render(
      <ScoreTiles scores={{ ...full, rt: { value: null, updatedAt: null }, average: 84, count: 3 }} now={now} />,
    );
    const rt = tiles(container)[1];
    expect(rt.textContent).toBe("Rotten Tomatoes–No score yet");
    expect(rt.dataset.missing).toBe("true");
    expect(rt.children[1].className).toContain("text-ink-muted");
    expect(tiles(container)[4].textContent).toBe("Average843 of 4 scores");
  });

  it("with no scores, the average is a dash too", () => {
    const none = { value: null, updatedAt: null };
    const { container } = render(
      <ScoreTiles scores={{ imdb: none, rt: none, mc: none, tmdb: none, average: null, count: 0 }} now={now} />,
    );
    const avg = tiles(container)[4];
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
