// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StagePill } from "@/components/stage-pill/StagePill";
import { FilmList, FilmRow } from "./FilmRow";

const scores = { imdb: 7.4, rt: 93, mc: 79, tmdb: 7.2, average: 80, count: 4 };

function list(winner = false) {
  return render(
    <FilmList head={["BAFTA", "Oscar, Best Picture"]}>
      <FilmRow
        title="Conclave"
        href="/movies/conclave"
        flags={["gb", "us"]}
        meta="2024 · Picture"
        scores={scores}
        winner={winner}
        results={[
          { label: "BAFTA", value: <StagePill stage="won" /> },
          { label: "Oscar", value: <StagePill stage="nominated" /> },
        ]}
        marks={<button type="button">Mark as watched</button>}
      />
      <FilmRow title="Ainda Estou Aqui" lang="pt" href="/movies/im-still-here" results={[{ label: "Wins", value: "3", numeric: true, gold: true }]} />
    </FilmList>,
  );
}

describe("FilmList and FilmRow", () => {
  it("the list starts on an ink rule; the head row labels the columns on desktop only", () => {
    const { container } = list();
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain("border-ink");
    expect(root.style.getPropertyValue("--film-cols")).toBe("minmax(0,1fr) 132px 168px 84px");
    const head = root.firstElementChild as HTMLElement;
    expect(head.getAttribute("aria-hidden")).toBe("true");
    expect(head.className).toContain("hidden");
    expect(head.className).toContain("md:grid");
    expect(head.textContent).toBe("FilmBAFTAOscar, Best Picture");
  });

  it("a row: flags, the title linking to the movie, meta, scores, results with labels, marks", () => {
    list();
    const title = screen.getByRole("heading", { level: 3, name: "Conclave" });
    expect(within(title).getByRole("link").getAttribute("href")).toBe("/movies/conclave");
    expect(screen.getByRole("img", { name: "United Kingdom" })).toBeTruthy();
    expect(screen.getByText("2024 · Picture").className).toContain("text-caption");
    expect(screen.getByText("80 · 4 of 4")).toBeTruthy();
    // Each result carries its column's name: visible on phone, read out on desktop.
    const result = screen.getByText("Won").closest("span:not([class*=rounded])") as HTMLElement;
    expect(result.textContent).toBe("BAFTA Won");
    expect(result.querySelector(".md\\:sr-only")?.textContent).toBe("BAFTA ");
    expect(screen.getByRole("button", { name: "Mark as watched" })).toBeTruthy();
  });

  it("numbers are 18px light and right-aligned on desktop; gold where asked; titles carry their language", () => {
    list();
    const wins = screen.getByText("3");
    for (const cls of ["md:text-right", "md:text-[18px]", "md:font-light", "text-gold-ink"]) expect(wins.className).toContain(cls);
    expect(screen.getByRole("link", { name: "Ainda Estou Aqui" }).getAttribute("lang")).toBe("pt");
  });

  it("the winner's row gets the gold wash from the left", () => {
    const { container } = list(true);
    const row = container.querySelector("[data-winner]") as HTMLElement;
    expect(row.className).toContain("var(--gold-wash)");
    expect(within(row).getByText("Conclave")).toBeTruthy();
  });

  it("a lead is the first column on desktop and a line above the film on phone", () => {
    const { container } = render(
      <FilmList head={["Oscar"]} leadLabel="Country" columns={["176px", "minmax(0,1fr)", "132px", "84px"]}>
        <FilmRow
          title="I'm Still Here"
          href="/movies/im-still-here"
          lead={<span>Brazil</span>}
          results={[{ label: "Oscar", value: <StagePill stage="won" /> }]}
        />
      </FilmList>,
    );
    const head = container.querySelector("[aria-hidden]") as HTMLElement;
    expect(head.textContent).toBe("CountryFilmOscar");
    const lead = screen.getByText("Brazil").parentElement as HTMLElement;
    expect(lead.className).toContain("max-md:[grid-area:lead]");
    expect(lead.parentElement?.className).toContain("[grid-template-areas:'lead_lead'_'film_marks'_'res_res']");
  });

  it("the results line is indented past the flags only when the row has flags", () => {
    const { container } = render(
      <FilmList>
        <FilmRow title="With flags" href="/a" flags={["gb"]} results={[{ label: "Oscar", value: "Won" }]} />
        <FilmRow title="No flags" href="/b" results={[{ label: "Oscar", value: "Won" }]} />
      </FilmList>,
    );
    const lines = container.querySelectorAll(".md\\:contents");
    expect(lines[0].className).toContain("pl-[33px]");
    expect(lines[1].className).not.toContain("pl-[33px]");
  });

  it("without a lead the phone areas are unchanged", () => {
    list();
    const row = screen.getByRole("heading", { level: 3, name: "Conclave" }).closest(".grid") as HTMLElement;
    expect(row.className).toContain("[grid-template-areas:'film_marks'_'res_res']");
  });

  it("leaves a phone-hidden result out of the phone's results line, and the line itself when nothing is left", () => {
    render(
      <FilmList head={["Prize"]}>
        <FilmRow title="Alpha" href="/movies/alpha" results={[{ label: "Prize", value: <span>–</span>, phoneHidden: true }]} />
        <FilmRow title="Sirāt" href="/movies/sirat" results={[{ label: "Prize", value: <span><StagePill stage="won">Jury Prize</StagePill></span> }]} />
      </FilmList>,
    );
    const empty = screen.getByText("–").parentElement!;
    expect(empty.className).toContain("max-md:hidden");
    expect(empty.parentElement!.className).toContain("max-md:hidden");
    const prize = screen.getByText("Jury Prize").parentElement!.parentElement!;
    expect(prize.className).not.toContain("max-md:hidden");
    expect(prize.parentElement!.className).not.toContain("max-md:hidden");
  });
});
