import "server-only";

// Fictional provider records, shared by request handlers and Server Actions. No live lookup.
const movie = (id: number, title: string, release_date: string, extra = {}) => ({
  id, title, original_title: title, release_date, adult: false, overview: `Deterministic catalogue fixture: ${title}.`,
  original_language: "en", origin_country: [], production_countries: [],
  imdb_id: null, external_ids: { imdb_id: null, wikidata_id: null }, vote_average: 0, vote_count: 0,
  ...extra,
});
export const catalogueFixtureMovies = [
  movie(99004001, "Mother", "2009-05-28", {
    original_title: "마더", original_language: "ko", origin_country: ["KR"],
    production_countries: [{ iso_3166_1: "KR" }], imdb_id: "tt99004001",
    external_ids: { imdb_id: "tt99004001", wikidata_id: "Q99004001" }, vote_average: 7.56, vote_count: 12,
  }),
  movie(99004002, "Mother", "1926-10-11", { original_title: "Мать", original_language: "ru", origin_country: ["SU"] }),
  movie(99004003, "Upcoming fixture", "2030-06-01"),
  movie(99004004, "Unknown year fixture", "", { original_language: "ja" }),
  movie(99004005, "Deleted fixture", "2024-01-01"),
];

/** Unknown fixture requests never fall through to fetch. Timeout is immediate here; unit tests time the real client. */
export const catalogueFixtureFetch: typeof fetch = async (input) => {
  const url = new URL(String(input));
  if (url.origin !== "https://api.themoviedb.org") throw new Error("Unexpected fixture host");
  if (url.pathname === "/3/search/movie") {
    const query = url.searchParams.get("query") ?? "";
    const page = Number(url.searchParams.get("page"));
    const status = { "fixture:401": 401, "fixture:403": 403, "fixture:429": 429, "fixture:500": 500 }[query];
    if (status) return Response.json({}, { status });
    if (query === "fixture:malformed") return Response.json({ results: [{ id: "invalid" }] });
    if (query === "fixture:timeout") throw new DOMException("Fixture timeout", "TimeoutError");
    if (query === "fixture:offline") throw new TypeError("Fixture offline");
    const films = query === "fixture:all" || query === "fixture:pages" ? catalogueFixtureMovies
      : catalogueFixtureMovies.filter((film) => film.title.toLowerCase().includes(query.toLowerCase()));
    const paged = query === "fixture:pages";
    const results = paged ? films.slice((page - 1) * 3, page * 3) : page === 1 ? films : [];
    return Response.json({ page, total_pages: films.length ? paged ? 2 : 1 : 0, total_results: films.length, results });
  }
  const id = Number(url.pathname.match(/^\/3\/movie\/(\d+)$/)?.[1]);
  const film = catalogueFixtureMovies.find((film) => film.id === id);
  return film && id !== 99004005 ? Response.json(film) : Response.json({}, { status: 404 });
};
