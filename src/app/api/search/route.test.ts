import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchableAward, SearchFilm } from "@/lib/search";

const data = vi.hoisted(() => ({
  querySearchFilms: vi.fn<(db: unknown, query: string) => Promise<SearchFilm[]>>(),
  getAwardList: vi.fn<() => Promise<SearchableAward[]>>(),
}));
vi.mock("@/data/search", () => data);
vi.mock("@/db", () => ({ getDb: () => "db" }));

const { GET } = await import("./route");

const get = (q?: string) => GET(new Request(`http://localhost/api/search${q === undefined ? "" : `?q=${encodeURIComponent(q)}`}`));

const film: SearchFilm = {
  id: 1,
  slug: "im-still-here",
  title: "I'm Still Here",
  originalTitle: "Ainda Estou Aqui",
  originalLang: "pt-BR",
  year: 2024,
  flag: "BR",
  categories: ["Best Picture"],
  stage: "nominated",
  href: "/movies/im-still-here",
};

beforeEach(() => {
  data.querySearchFilms.mockReset().mockResolvedValue([film]);
  data.getAwardList
    .mockReset()
    .mockResolvedValue([{ slug: "oscars", name: "Academy Awards", shortName: "Oscars", kind: "oscars", year: 2025, calendarOrder: 100 }]);
});

describe("GET /api/search", () => {
  it("answers with films and matching awards, uncached, searching the folded query", async () => {
    const response = await get("  OSCAR  ");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(data.querySearchFilms).toHaveBeenCalledWith("db", "oscar");
    expect(await response.json()).toEqual({
      films: [film],
      awards: [{ slug: "oscars", name: "Academy Awards", shortName: "Oscars", kindLabel: "Oscars", href: "/awards/oscars/2025" }],
    });
  });

  it("answers an empty query with nothing and never touches the database", async () => {
    for (const q of [undefined, "", "   "]) {
      expect(await (await get(q)).json()).toEqual({ films: [], awards: [] });
    }
    expect(data.querySearchFilms).not.toHaveBeenCalled();
    expect(data.getAwardList).not.toHaveBeenCalled();
  });

  it("answers 500 when the database fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    data.querySearchFilms.mockRejectedValue(new Error("down"));
    const response = await get("anora");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Search failed" });
  });
});
