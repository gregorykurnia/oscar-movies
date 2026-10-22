// Search on the `test` branch (plan §5.5, task 1.12): the film match runs in Postgres on
// `movies.search_key`, so these run against the seeded data. Read-only.
import { afterAll, describe, expect, it } from "vitest";
import { queryAwardList, querySearchFilms } from "../../src/data/search";
import { createScriptDb } from "../../src/db";
import { matchAwards } from "../../src/lib/search";

const { db, close } = createScriptDb();
afterAll(() => close());

const slugs = async (q: string) => (await querySearchFilms(db, q)).map((f) => f.slug);

describe("film search", () => {
  it("finds I'm Still Here by its original title, in any case, and with accents ignored", async () => {
    for (const q of ["ainda estou", "AINDA", "ainda estóu aqui", "  Ainda   Estou "]) {
      expect(await slugs(q), q).toContain("im-still-here");
    }
  });

  it("finds it by its English title, curly apostrophe included", async () => {
    for (const q of ["I'm Still Here", "i'm still", "I’m Still Here", "still here"]) {
      expect(await slugs(q), q).toContain("im-still-here");
    }
  });

  it("returns what a row needs: flag, year, the Oscar categories and the furthest stage", async () => {
    const [film] = (await querySearchFilms(db, "I'm Still Here")).filter((f) => f.slug === "im-still-here");
    expect(film).toMatchObject({
      title: "I'm Still Here",
      originalTitle: "Ainda Estou Aqui",
      originalLang: "pt-BR",
      year: 2024,
      href: "/movies/im-still-here",
    });
    expect(film.flag).toBe("BR");
    expect(film.categories).toEqual(expect.arrayContaining(["Best Picture", "International"]));
    expect(film.stage).toBe("won"); // it won International Feature
  });

  it("matches the start of a word, not the middle of one, and puts a title that starts with it first", async () => {
    const found = await querySearchFilms(db, "an");
    expect(found.length).toBeGreaterThan(1);
    expect(found.length).toBeLessThanOrEqual(8);
    const words = (f: { title: string; originalTitle: string | null }) =>
      `${f.title} ${f.originalTitle ?? ""}`.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    for (const f of found) expect(words(f), f.title).toMatch(/(^|[^a-z0-9])an/);
    // Titles that start with the query come before titles where a later word starts with it.
    const starts = found.map((f) => f.title.toLowerCase().startsWith("an"));
    expect(starts[0]).toBe(true);
    expect(starts).toEqual([...starts].sort((x, y) => Number(y) - Number(x)));
  });

  it("treats % and _ as text and finds nothing for a title that isn't there", async () => {
    expect(await slugs("%")).toEqual([]);
    expect(await slugs("a_o")).toEqual([]);
    expect(await slugs("zzzzqqqq")).toEqual([]);
    expect(await slugs("   ")).toEqual([]);
  });
});

describe("award search", () => {
  it("lists the awards that have results loaded, with their newest year", async () => {
    const list = await queryAwardList(db);
    const oscars = list.find((a) => a.slug === "oscars");
    expect(oscars).toMatchObject({ name: "Academy Awards", shortName: "Oscars", kind: "oscars" });
    expect(oscars!.year).toBeGreaterThanOrEqual(2025);
    expect(matchAwards(list, "oscar")[0].href).toBe(`/awards/oscars/${oscars!.year}`);
    expect(matchAwards(list, "academy")[0].slug).toBe("oscars");
  });
});
