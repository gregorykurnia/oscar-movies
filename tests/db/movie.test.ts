// The movie query (task 1.13) against the seeded `test` data: the 97th Oscars' results with
// list sizes, the score dates, and a film with no Oscar result.
import { afterAll, describe, expect, it } from "vitest";
import { createScriptDb } from "../../src/db";
import { queryMovie } from "../../src/data/movie";

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
});
