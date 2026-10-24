// The movie query (task 1.13) against the seeded `test` data: the 97th Oscars' results with
// list sizes, the score dates, and a film with no Oscar result.
import { afterAll, describe, expect, it } from "vitest";
import { createScriptDb } from "../../src/db";
import { queryMovie } from "../../src/data/movie";
import { queryRacePrecursors } from "../../src/data/precursors";
import { AWARDS } from "../../src/lib/awards";

const { db, close } = createScriptDb();
afterAll(() => close());

describe("queryMovie", () => {
  it("returns null for an unknown slug", async () => {
    expect(await queryMovie(db, "no-such-film-2024")).toBeNull();
  });

  it("carries the facts and an Oscar box per category, furthest first", async () => {
    const film = await queryMovie(db, "im-still-here");
    expect(film).toMatchObject({
      title: "I'm Still Here",
      originalTitle: "Ainda Estou Aqui",
      year: 2024,
      countries: ["BR", "FR"],
      language: "pt",
    });
    const boxes = film!.oscars.map((b) => [b.category, b.outcome, b.year, b.listSize, b.country]);
    expect(boxes).toEqual([
      ["international", "won", 2024, 5, "BR"],
      ["picture", "nominated", 2024, 10, null],
    ]);
    expect(film!.oscars[0].winnersOn).toBe("2025-03-02");
  });

  it("gives each score the day it was fetched", async () => {
    const film = await queryMovie(db, "emilia-perez");
    const { imdb, mc } = film!.scores;
    expect(imdb.value).not.toBeNull();
    expect(imdb.updatedAt).toBeInstanceOf(Date);
    expect(mc.value).not.toBeNull();
  });

  it("has no scores, and only the stage it reached, for a film nobody has rated", async () => {
    const film = await queryMovie(db, "baghdad-messi");
    expect(film!.scores.count).toBe(0);
    expect(film!.scores.average).toBeNull();
    expect(film!.scores.imdb).toEqual({ value: null, updatedAt: null });
  });

  // Task 2.11: a 2024 Best Picture nominee shows its won, nominated and not-nominated awards.
  it("lists a Best Picture nominee's won, nominated and not nominated awards", async () => {
    const film = await queryMovie(db, "the-brutalist");
    const row = (slug: string) => film!.awards.find((r) => r.awardSlug === slug && r.oscarCategory === "picture");
    expect(row("golden-globes")).toMatchObject({ result: "won", category: "Best Motion Picture – Drama", kind: "major" });
    expect(row("bafta")).toMatchObject({ result: "nominated", category: "Best Film" });
    expect(row("afi")).toMatchObject({ result: "nominated", isSelection: true });
    // Passed over by the Spirit Awards, once its nominations (4 Dec 2024) were out.
    expect(row("spirit-awards")).toMatchObject({ result: "not_nominated", since: "2024-12-04" });
    // Director and cast prizes never make a "not nominated"; festivals neither.
    // (Critics groups can say it too, from Phase 4: BIFA's Best British Independent Film list leaves it out.)
    expect(film!.awards.filter((r) => r.result === "not_nominated" && r.kind !== "critics").map((r) => r.awardSlug)).toEqual(["spirit-awards"]);
  });

  it("says not nominated once, for an award with two categories, in the Oscar category the film is up for", async () => {
    const film = await queryMovie(db, "im-still-here");
    const picture = film!.awards.filter((r) => r.oscarCategory === "picture" && r.result === "not_nominated");
    const globes = picture.filter((r) => r.awardSlug === "golden-globes");
    expect(globes).toHaveLength(1);
    expect(globes[0].category).toContain(" / ");
    expect(picture.find((r) => r.awardSlug === "bafta")).toMatchObject({ category: "Best Film", since: "2025-01-07" });
    // Its International results at the same awards are won and nominated rows, not passed over.
    expect(film!.awards.find((r) => r.awardSlug === "bafta" && r.oscarCategory === "international")?.result).toBe("nominated");
  });

  it("has no award rows for a film only on a long list", async () => {
    const film = await queryMovie(db, "baghdad-messi");
    expect(film!.awards).toEqual([]);
  });
});

describe("queryRacePrecursors", () => {
  it("gives each 2024 Best Picture nominee the awards it won and was nominated for", async () => {
    const anora = await queryMovie(db, "anora");
    const brutalist = await queryMovie(db, "the-brutalist");
    const lines = await queryRacePrecursors(db, 2024, "picture");
    const of = (id: number) => lines.find((l) => l.movieId === id)!;
    expect(of(anora!.id).won).toEqual(expect.arrayContaining(["PGA", "DGA"]));
    // The line holds four awards, wins first, majors before critics groups: with critics groups loaded a
    // nominated major (BAFTA) can fall off it behind critics wins (open for 4.10).
    expect(of(brutalist!.id).won).toEqual(expect.arrayContaining(["Globes"]));
    // Which critics groups fill the rest depends on the data loaded (Phase 6 added many), so check the order by kind.
    const kindOf = (short: string) => AWARDS.find((a) => a.shortName === short)?.kind;
    const won = of(brutalist!.id).won;
    expect(won.findIndex((s) => kindOf(s) === "critics")).toBeGreaterThan(won.indexOf("Globes"));
    for (const l of lines) expect(l.won.length + l.nominated.length).toBeLessThanOrEqual(4);
  });
});
