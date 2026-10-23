// The lineup query (task 5.3) against the `test` branch's loaded lineups: Cannes 2025's ten
// sections in programme order with their films, the prizes a film won in its section, no films
// before 2025, and a film's screenings on its movie page.
import { afterAll, describe, expect, it } from "vitest";
import { createScriptDb } from "../../src/db";
import { queryLineup } from "../../src/data/lineup";
import { queryMovie } from "../../src/data/movie";

const { db, close } = createScriptDb();
afterAll(() => close());

describe("queryLineup", () => {
  it("lists Cannes 2025's sections in programme order, with every film in its section", async () => {
    const lineup = await queryLineup(db, "cannes", 2025);
    expect(lineup.edition).toMatchObject({ year: 2025, status: "loaded" });
    expect(lineup.sections.map((s) => [s.order, s.name, s.films.length])).toEqual([
      [1, "In Competition", 22],
      [2, "Un Certain Regard", 20],
      [3, "Out of Competition", 12],
      [4, "Cannes Premiere", 10],
      [5, "Special Screenings", 9],
      [6, "Cinéma de la Plage", 3],
      [7, "Critics' Week", 11],
      [8, "Directors' Fortnight", 19],
      [9, "ACID", 9],
      [10, "Three films for Ukraine", 3],
    ]);
  });

  it("gives each film its flags, its scores and the prizes it won in that section", async () => {
    const lineup = await queryLineup(db, "cannes", 2025);
    const inCompetition = lineup.sections[0].films;
    expect(inCompetition.find((f) => f.title === "The Secret Agent")).toMatchObject({
      countries: expect.any(Array),
      prize: "Best Director; Best Actor",
      scores: expect.objectContaining({ count: expect.any(Number) }),
    });
    expect(inCompetition.find((f) => f.title === "Alpha")?.prize).toBeNull();
  });

  it("has no lineup before 2025: the festival's 2024 edition exists, with no films", async () => {
    const lineup = await queryLineup(db, "cannes", 2024);
    expect(lineup.edition).toMatchObject({ year: 2024 });
    expect(lineup.sections).toEqual([]);
  });

  // The movie page's screenings: a film from the 2025 Cannes lineup lists its section and prizes there.
  it("gives a film in a lineup its screenings, in calendar order", async () => {
    const lineup = await queryLineup(db, "cannes", 2025);
    const slug = lineup.sections[0].films.find((f) => f.title === "The Secret Agent")!.slug;
    const film = await queryMovie(db, slug);
    expect(film!.screenings).toContainEqual(
      expect.objectContaining({ awardSlug: "cannes", year: 2025, section: "In Competition", prize: "Best Director; Best Actor" }),
    );
    const orders = film!.screenings.map((s) => s.calendarOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});
