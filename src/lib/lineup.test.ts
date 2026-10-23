import { describe, expect, it } from "vitest";
import type { LineupFilm, LineupSection } from "@/data/lineup";
import { markSets } from "@/lib/mark-filter";
import {
  COVERAGE_NOTICE,
  filmCount,
  FIRST_LINEUP_YEAR,
  hasLineups,
  LINEUPS_START,
  lineupHref,
  lineupPath,
  lineupQuery,
  orderScreenings,
  parseLineupQuery,
  prizesOf,
  screeningCaption,
  viewLineup,
  type MovieScreening,
} from "./lineup";

const film = (id: number, title: string, more: Partial<LineupFilm> = {}): LineupFilm => ({
  id,
  slug: `film-${id}`,
  title,
  originalTitle: null,
  originalLang: null,
  year: 2025,
  countries: ["FR"],
  scores: { imdb: null, rt: null, mc: null, tmdb: null, average: null, count: 0 },
  prize: null,
  ...more,
});

const scored = (average: number | null) => ({ imdb: null, rt: null, mc: null, tmdb: null, average, count: average === null ? 0 : 4 });

const screening = (more: Partial<MovieScreening>): MovieScreening => ({
  awardSlug: "cannes",
  awardName: "Cannes Film Festival",
  calendarOrder: 30,
  year: 2025,
  section: "In Competition",
  sectionOrder: 1,
  prize: null,
  ...more,
});

describe("the coverage from 2025", () => {
  it("starts the lineups in 2025 and says so", () => {
    expect(FIRST_LINEUP_YEAR).toBe(2025);
    expect(hasLineups(2024)).toBe(false);
    expect(hasLineups(2025)).toBe(true);
    expect(LINEUPS_START).toBe("Lineups start in 2025");
    expect(COVERAGE_NOTICE).toBe("Festival lineups are tracked from 2025 on.");
    expect(lineupPath("cannes", 2025)).toBe("/festivals/cannes/2025");
  });
});

describe("the lineup's address", () => {
  it("reads the sort and the mark chip, and ignores anything unknown", () => {
    expect(parseLineupQuery({})).toEqual({ sort: "title", filter: null });
    expect(parseLineupQuery({ sort: "average", filter: "want" })).toEqual({ sort: "average", filter: "want" });
    expect(parseLineupQuery({ sort: "nonsense", filter: "later" })).toEqual({ sort: "title", filter: null });
  });

  it("writes only what differs from the defaults", () => {
    expect(lineupQuery({ sort: "title", filter: null })).toBe("");
    expect(lineupHref("cannes", 2025, { sort: "title", filter: null })).toBe("/festivals/cannes/2025");
    expect(lineupHref("cannes", 2025, { sort: "average", filter: "want" })).toBe("/festivals/cannes/2025?sort=average&filter=want");
  });
});

describe("viewLineup", () => {
  const sections: LineupSection[] = [
    {
      name: "In Competition",
      order: 1,
      films: [
        film(1, "Zodiac", { scores: scored(70) }),
        film(2, "Alpha", { scores: scored(null) }),
        film(3, "Sirāt", { scores: scored(90) }),
      ],
    },
    { name: "Midnight", order: 2, films: [film(4, "Bright", { scores: scored(70) })] },
  ];
  const none = markSets([]);

  it("sorts each section by title, and by average with the films that have none last", () => {
    const byTitle = viewLineup(sections, { sort: "title", filter: null }, none);
    expect(byTitle[0].films.map((f) => f.title)).toEqual(["Alpha", "Sirāt", "Zodiac"]);
    const byAverage = viewLineup(sections, { sort: "average", filter: null }, none);
    expect(byAverage[0].films.map((f) => f.title)).toEqual(["Sirāt", "Zodiac", "Alpha"]);
    // A tie is ordered by title.
    expect(byAverage[1].films.map((f) => f.title)).toEqual(["Bright"]);
  });

  it("keeps the films under the mark chip and drops the sections left with none", () => {
    const marks = markSets([{ movieId: 3, watched: false, want: true }]);
    const shown = viewLineup(sections, { sort: "title", filter: "want" }, marks);
    expect(shown.map((s) => [s.name, s.films.map((f) => f.title)])).toEqual([["In Competition", ["Sirāt"]]]);
    expect(viewLineup(sections, { sort: "title", filter: "watched" }, none)).toEqual([]);
  });

  it("leaves the lineup it was given as it was", () => {
    const before = JSON.stringify(sections);
    viewLineup(sections, { sort: "average", filter: null }, none);
    expect(JSON.stringify(sections)).toBe(before);
  });
});

describe("filmCount", () => {
  it("counts films in words the way the lists do", () => {
    expect(filmCount(1)).toBe("1 film");
    expect(filmCount(2)).toBe("2 films");
    expect(filmCount(1204)).toBe("1,204 films");
  });
});

describe("a film's screenings", () => {
  it("orders them by festival in calendar order, the newer year first, then the section", () => {
    const ordered = orderScreenings([
      screening({ awardSlug: "venice", awardName: "Venice", calendarOrder: 40, year: 2025, sectionOrder: 2 }),
      screening({ year: 2025, sectionOrder: 3 }),
      screening({ year: 2026, sectionOrder: 1 }),
      screening({ year: 2025, sectionOrder: 1 }),
    ]);
    expect(ordered.map((s) => [s.awardSlug, s.year, s.sectionOrder])).toEqual([
      ["cannes", 2026, 1],
      ["cannes", 2025, 1],
      ["cannes", 2025, 3],
      ["venice", 2025, 2],
    ]);
  });

  it("splits its prizes into one pill each, and has none when it won none", () => {
    expect(prizesOf(null)).toEqual([]);
    expect(prizesOf("Palme d'Or")).toEqual(["Palme d'Or"]);
    expect(prizesOf("Best Director; Best Actor")).toEqual(["Best Director", "Best Actor"]);
  });

  it("captions its section and prizes, with the year first when the list spans years", () => {
    expect(screeningCaption(screening({ prize: "Palme d'Or" }), false)).toBe("In Competition · Palme d'Or");
    expect(screeningCaption(screening({ section: "Un Certain Regard" }), true)).toBe("2025 · Un Certain Regard");
  });
});
