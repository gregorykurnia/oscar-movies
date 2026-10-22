import { describe, expect, it } from "vitest";
import type { OscarEntry } from "@/data/oscars";
import type { Outcome } from "./stage";
import {
  parseSubmissionQuery,
  submissionsHref,
  submissionsQuery,
  submissionStage,
  toggleFilter,
  viewSubmissions,
  type SubmissionQuery,
} from "./submissions";

function row(id: number, title: string, country: string, outcome: Outcome, average: number | null): OscarEntry {
  return {
    film: {
      id,
      slug: `film-${id}`,
      title,
      originalTitle: null,
      originalLang: null,
      year: 2024,
      countries: [country],
      scores: { imdb: null, rt: null, mc: null, tmdb: null, average, count: average === null ? 0 : 4 },
    },
    outcome,
    country,
    flags: [country],
  };
}

// Countries: Brazil, France, Latvia, Norway, Albania, Algeria, Argentina, Iran, Türkiye.
const WON = row(1, "I'm Still Here", "BR", "won", 81.7);
const NOMINATED_FR = row(2, "Emilia Pérez", "FR", "nominated", 62.3);
const NOMINATED_LV = row(3, "Flow", "LV", "nominated", 85.8);
const SHORTLISTED = row(4, "Armand", "NO", "shortlisted", 64.8);
const ELIGIBLE_AL = row(5, "Waterdrop", "AL", "eligible", 0);
const SUBMITTED = row(6, "Algiers", "DZ", "submitted", null);
const ELIGIBLE_IR = row(7, "In the Arms of the Tree", "IR", "eligible", 90);
const ELIGIBLE_AR = row(8, "Kill the Jockey", "AR", "eligible", 70);
const ELIGIBLE_TR = row(9, "Life", "TR", "eligible", 70);
const ENTRIES = [WON, NOMINATED_FR, NOMINATED_LV, SHORTLISTED, ELIGIBLE_AL, SUBMITTED, ELIGIBLE_IR, ELIGIBLE_AR, ELIGIBLE_TR];
const titles = (rows: OscarEntry[]) => rows.map((e) => e.film.title);
const NONE = new Set<number>();

describe("parseSubmissionQuery", () => {
  it("the address without parameters is the default sort and no filters", () => {
    expect(parseSubmissionQuery({})).toEqual({ sort: "country", filters: [] });
  });

  it("reads a known sort, and the filters in the order the chips are shown", () => {
    expect(parseSubmissionQuery({ sort: "stage", filter: ["unwatched", "shortlisted", "nonsense"] })).toEqual({
      sort: "stage",
      filters: ["shortlisted", "unwatched"],
    });
  });

  it("ignores an unknown sort, a single filter value, and a repeated sort (the first wins)", () => {
    expect(parseSubmissionQuery({ sort: "nonsense", filter: "unwatched" })).toEqual({
      sort: "country",
      filters: ["unwatched"],
    });
    expect(parseSubmissionQuery({ sort: ["average", "stage"] }).sort).toBe("average");
  });
});

describe("submissionsQuery and submissionsHref", () => {
  it("the defaults have no query at all", () => {
    expect(submissionsQuery({ sort: "country", filters: [] })).toBe("");
    expect(submissionsHref(2024, { sort: "country", filters: [] })).toBe("/submissions/2024");
  });

  it("the sort, then each filter once, in chip order", () => {
    expect(submissionsQuery({ sort: "average", filters: ["unwatched", "shortlisted"] })).toBe(
      "?sort=average&filter=shortlisted&filter=unwatched",
    );
    expect(submissionsHref(2025, { sort: "stage", filters: ["shortlisted"] })).toBe(
      "/submissions/2025?sort=stage&filter=shortlisted",
    );
  });

  it("an address parses back to the same state", () => {
    const state: SubmissionQuery = { sort: "average", filters: ["shortlisted", "unwatched"] };
    const params = new URLSearchParams(submissionsQuery(state));
    expect(parseSubmissionQuery({ sort: params.get("sort") ?? undefined, filter: params.getAll("filter") })).toEqual(state);
  });
});

describe("toggleFilter", () => {
  it("adds or removes one chip and keeps the chip order", () => {
    expect(toggleFilter(["unwatched"], "shortlisted")).toEqual(["shortlisted", "unwatched"]);
    expect(toggleFilter(["shortlisted", "unwatched"], "shortlisted")).toEqual(["unwatched"]);
    expect(toggleFilter([], "unwatched")).toEqual(["unwatched"]);
  });
});

describe("submissionStage", () => {
  it("International's eligible rows read Not nominated; the other stages are as elsewhere", () => {
    expect(submissionStage("eligible")).toBe("not-nominated");
    expect(submissionStage("submitted")).toBe("submitted");
    expect(submissionStage("shortlisted")).toBe("shortlisted");
    expect(submissionStage("nominated")).toBe("nominated");
    expect(submissionStage("won")).toBe("won");
  });
});

describe("viewSubmissions", () => {
  it("the default sort is by country name, then title", () => {
    expect(titles(viewSubmissions(ENTRIES, { sort: "country", filters: [] }, NONE))).toEqual([
      "Waterdrop",
      "Algiers",
      "Kill the Jockey",
      "I'm Still Here",
      "Emilia Pérez",
      "In the Arms of the Tree",
      "Flow",
      "Armand",
      "Life",
    ]);
  });

  it("by Oscar stage, furthest first, then by country", () => {
    expect(titles(viewSubmissions(ENTRIES, { sort: "stage", filters: [] }, NONE))).toEqual([
      "I'm Still Here",
      "Emilia Pérez",
      "Flow",
      "Armand",
      "Waterdrop",
      "Kill the Jockey",
      "In the Arms of the Tree",
      "Life",
      "Algiers",
    ]);
  });

  it("by average score, highest first, a 0 above no score, ties by country", () => {
    expect(titles(viewSubmissions(ENTRIES, { sort: "average", filters: [] }, NONE))).toEqual([
      "In the Arms of the Tree",
      "Flow",
      "I'm Still Here",
      "Kill the Jockey",
      "Life",
      "Armand",
      "Emilia Pérez",
      "Waterdrop",
      "Algiers",
    ]);
  });

  it("Shortlisted keeps the shortlist and everything past it", () => {
    expect(titles(viewSubmissions(ENTRIES, { sort: "country", filters: ["shortlisted"] }, NONE))).toEqual([
      "I'm Still Here",
      "Emilia Pérez",
      "Flow",
      "Armand",
    ]);
  });

  it("Unwatched drops the watched films and keeps the rest (want to watch included)", () => {
    const watched = new Set([WON.film.id]);
    expect(titles(viewSubmissions(ENTRIES, { sort: "country", filters: ["unwatched"] }, watched))).toEqual([
      "Waterdrop",
      "Algiers",
      "Kill the Jockey",
      "Emilia Pérez",
      "In the Arms of the Tree",
      "Flow",
      "Armand",
      "Life",
    ]);
  });

  it("both chips together, then the sort", () => {
    const watched = new Set([WON.film.id]);
    expect(titles(viewSubmissions(ENTRIES, { sort: "stage", filters: ["shortlisted", "unwatched"] }, watched))).toEqual([
      "Emilia Pérez",
      "Flow",
      "Armand",
    ]);
  });

  it("leaves the rows it was given in their order", () => {
    viewSubmissions(ENTRIES, { sort: "average", filters: [] }, NONE);
    expect(ENTRIES[0]).toBe(WON);
  });
});
