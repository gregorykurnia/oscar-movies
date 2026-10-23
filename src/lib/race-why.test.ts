import { describe, expect, it } from "vitest";
import type { Why, WhyResult } from "@/lib/predict/types";
import { precursorLabel, runText, similarSeasons, whyItem, whySentence } from "./race-why";

const result = (category: string, r: "won" | "nominated", hits: number, count: number): WhyResult => ({
  category,
  result: r,
  weight: 1,
  hits,
  count,
});

const ANORA: Why = {
  top: [result("pga/theatrical", "won", 10, 14), result("dga/feature", "won", 7, 13), result("bafta/film", "nominated", 7, 49), result("afi/top-10", "nominated", 12, 89)],
  similar: {
    count: 10,
    won: 7,
    films: [2012, 2013, 2014, 2016, 2016, 2025].map((year, i) => ({ movie: i, year, won: i % 2 === 0 })),
  },
};

describe("precursorLabel", () => {
  it("names an award by its short name, a festival with its prize, and tells sibling categories apart", () => {
    expect(precursorLabel("bafta/film")).toBe("BAFTA");
    expect(precursorLabel("cannes/palme-dor")).toBe("Cannes Palme d'Or");
    expect(precursorLabel("golden-globes/drama")).toBe("Globes (Drama)");
    expect(precursorLabel("golden-globes/musical-comedy")).toBe("Globes (Musical or Comedy)");
    expect(precursorLabel("annie/indie-feature")).toBe("Annie (Independent)");
    expect(precursorLabel("nowhere/at-all")).toBe("nowhere/at-all");
  });
});

describe("whyItem", () => {
  it("gives each result its record", () => {
    expect(whyItem(result("pga/theatrical", "won", 10, 14))).toEqual({ label: "Won PGA", record: "won the Oscar 10 of 14 years" });
    expect(whyItem(result("bafta/film", "nominated", 7, 49))).toEqual({ label: "Nominated, BAFTA", record: "7 of 49 won the Oscar" });
    expect(whyItem(result("afi/top-10", "nominated", 12, 89)).label).toBe("Selected, AFI");
    expect(whyItem(result("tiff/peoples-choice", "nominated", 3, 12)).label).toBe("Runner-up, TIFF People's Choice Award");
    expect(whyItem(result("bafta/film", "won", 0, 0)).record).toBe("no past record");
  });
});

describe("whySentence", () => {
  it("counts the past contenders with the same two strongest results and how many won", () => {
    expect(runText(ANORA.top)).toBe("won PGA and DGA");
    expect(whySentence(ANORA, "Best Picture")).toBe("Ten past contenders had a season like this one (won PGA and DGA). Seven of them won Best Picture.");
  });

  it("mixes wins and nominations, and handles one, none and all", () => {
    const top = [result("golden-globes/drama", "won", 5, 13), result("bafta/film", "nominated", 7, 49)];
    const why = (count: number, won: number): Why => ({ top, similar: { count, won, films: [] } });
    expect(runText(top)).toBe("won Globes (Drama), nominated at BAFTA");
    expect(whySentence(why(3, 2), "Best Picture")).toBe(
      "Three past contenders had a season like this one (won Globes (Drama), nominated at BAFTA). Two of them won Best Picture.",
    );
    expect(whySentence(why(1, 0), "Best Picture")).toMatch(/^One past contender had .* It didn't win Best Picture\.$/);
    expect(whySentence(why(2, 2), "Best Picture")).toMatch(/Both won Best Picture\.$/);
    expect(whySentence(why(4, 0), "Best Picture")).toMatch(/None of them won Best Picture\.$/);
    expect(whySentence(why(0, 0), "Best Picture")).toMatch(/^No past contender had a season like this one/);
    expect(whySentence({ top: [], similar: null }, "Best Picture")).toMatch(/^It has no wins or nominations yet/);
  });
});

describe("similarSeasons", () => {
  it("lists each year once, in order", () => {
    expect(similarSeasons(ANORA)).toBe("Similar seasons: 2012, 2013, 2014, 2016, 2025");
    expect(similarSeasons({ top: [], similar: null })).toBeNull();
  });
});
