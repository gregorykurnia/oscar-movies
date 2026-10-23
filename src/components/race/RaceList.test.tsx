// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Why } from "@/lib/predict/types";
import { ContenderRow, type RowChance } from "./ContenderRow";
import { RaceList } from "./RaceList";
import { WhyPanel } from "./WhyPanel";

const scores = { imdb: 7.4, rt: 93, mc: 91, tmdb: null, average: 86, count: 3 };
const WHY: Why = {
  top: [{ category: "pga/theatrical", result: "won", weight: 1.1, hits: 10, count: 14 }],
  similar: { count: 3, won: 2, films: [{ movie: 1, year: 2014, won: true }] },
};

function row(id: number, title: string, c: Partial<RowChance> & { pWin: number }) {
  const chance: RowChance = {
    id: `picture-${id}`,
    pNominate: null,
    leader: false,
    final: false,
    why: <WhyPanel pct={String(Math.round(c.pWin * 100))} why={WHY} oscar="Best Picture" methodHref="/accuracy/picture#method" />,
    ...c,
  };
  return (
    <ContenderRow
      key={id}
      title={title}
      href={`/movies/${id}`}
      flags={["US"]}
      scores={scores}
      marks={<span />}
      columns={chance.pNominate === null ? "win" : "both"}
      chance={chance}
    />
  );
}

describe("ContenderRow with chances", () => {
  it("shows the %, the leader in gold, the chance to be nominated and the chance line", () => {
    const { container } = render(
      <RaceList rows={[row(1, "Anora", { pWin: 0.41, pNominate: 0.99, leader: true }), row(2, "Conclave", { pWin: 0.18, pNominate: 0.5 })]} />,
    );
    const anora = screen.getByRole("button", { name: "41% chance to win, show why" });
    expect(anora.getAttribute("aria-expanded")).toBe("false");
    expect(anora.querySelector("[data-leader]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "18% chance to win, show why" }).querySelector("[data-leader]")).toBeNull();
    expect(screen.getByText("99%").textContent).toBe("99% to be nominated");
    const lines = container.querySelectorAll<HTMLElement>("[data-chance-line]");
    expect([...lines].map((l) => l.style.width)).toEqual(["41%", "18%"]);
  });

  it("says final prediction after the ceremony", () => {
    render(<RaceList rows={[row(1, "Anora", { pWin: 0.38, final: true })]} />);
    expect(screen.getByRole("button", { name: "38% final prediction, show why" })).toBeTruthy();
    expect(screen.getByText("final prediction")).toBeTruthy();
  });
});

describe("the why", () => {
  it("opens and closes from its %, one at a time, and Esc returns focus to the %", () => {
    render(<RaceList rows={[row(1, "Anora", { pWin: 0.41 }), row(2, "Conclave", { pWin: 0.18 })]} />);
    const anora = screen.getByRole("button", { name: /^41%/ });
    const conclave = screen.getByRole("button", { name: /^18%/ });
    expect(screen.queryByRole("heading", { name: "Why 41%" })).toBeNull();

    anora.focus();
    fireEvent.click(anora);
    expect(anora.getAttribute("aria-expanded")).toBe("true");
    const region = document.getElementById(anora.getAttribute("aria-controls")!)!;
    expect(region.textContent).toContain("Why 41%");
    expect(region.textContent).toContain("Won PGA");
    expect(region.textContent).toContain("won the Oscar 10 of 14 years");
    expect(region.textContent).toContain("Similar seasons: 2014");
    expect(screen.getByRole("link", { name: "How the % chance works" }).getAttribute("href")).toBe("/accuracy/picture#method");
    // Opening moves no focus.
    expect(document.activeElement).toBe(anora);

    fireEvent.click(conclave);
    expect(anora.getAttribute("aria-expanded")).toBe("false");
    expect(conclave.getAttribute("aria-expanded")).toBe("true");

    screen.getByRole("link", { name: "How the % chance works" }).focus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(conclave.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("heading", { name: /^Why/ })).toBeNull();
    expect(document.activeElement).toBe(conclave);

    fireEvent.click(conclave);
    fireEvent.click(conclave);
    expect(conclave.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("Show all", () => {
  it("keeps the rest back until asked, then shows them and moves focus to the first", () => {
    render(
      <RaceList
        rows={[row(1, "Anora", { pWin: 0.9 })]}
        more={[row(2, "Bugonia", { pWin: 0.06 }), row(3, "Train Dreams", { pWin: 0.04 })]}
        moreLabel="Show all 3 contenders"
        moreRest="Bugonia and Train Dreams under 3%"
      />,
    );
    expect(screen.queryByRole("link", { name: "Bugonia" })).toBeNull();
    const button = screen.getByRole("button", { name: "Show all 3 contenders · Bugonia and Train Dreams under 3%" });
    fireEvent.click(button);
    expect(screen.queryByRole("button", { name: /^Show all/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Train Dreams" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Bugonia" }));
  });
});
