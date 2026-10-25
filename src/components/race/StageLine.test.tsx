// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StagePill } from "@/components/stage-pill/StagePill";
import { ContenderList, ContenderRow } from "./ContenderRow";
import { StageLine } from "./StageLine";

const scores = { imdb: 7.4, rt: 93, mc: 91, tmdb: null, average: 86, count: 3 };

describe("StageLine", () => {
  it("bolds the step and turns the dot ink once the season is over", () => {
    const { container, rerender } = render(<StageLine line={{ done: false, lead: "Nominations 22 Jan", rest: "Ceremony 15 Mar" }} />);
    expect(screen.getByText("Nominations 22 Jan").tagName).toBe("STRONG");
    expect(container.textContent).toBe("Nominations 22 Jan · Ceremony 15 Mar");
    expect(container.querySelector("[data-done]")).toBeNull();
    rerender(<StageLine line={{ done: true, lead: "Ceremony 2 Mar 2025", rest: null }} />);
    expect(container.textContent).toBe("Ceremony 2 Mar 2025");
    expect(container.querySelector("[data-done]")).not.toBeNull();
  });
});

describe("ContenderRow", () => {
  it("links the title, follows it with the pill, and carries the flag, scores and marks", () => {
    render(
      <ContenderList>
        <ContenderRow
          title="I'm Still Here"
          href="/movies/im-still-here"
          flag="BR"
          flagLabel="Brazil, submitting country"
          badge={<StagePill stage="won" />}
          scores={scores}
          marks={<button type="button">Mark as watched</button>}
        />
      </ContenderList>,
    );
    const heading = screen.getByRole("heading", { level: 3, name: /^I'm Still Here ?Won$/ });
    expect(heading.querySelector("a")?.getAttribute("href")).toBe("/movies/im-still-here");
    expect(screen.getByRole("img", { name: "Brazil, submitting country" })).toBeTruthy();
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByText("TMDB –")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mark as watched" })).toBeTruthy();
  });
});
