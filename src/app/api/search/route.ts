// `GET /api/search?q=` (plan §5.5): up to eight films and five awards for what was typed.
// Read-only and public (the app has no sign-in); the answer is never cached, so the top bar's
// search always sees the data as loaded.
import { getAwardList, querySearchFilms } from "@/data/search";
import { getDb } from "@/db";
import { matchAwards, normalizeQuery, type SearchResponse } from "@/lib/search";

export async function GET(request: Request) {
  const query = normalizeQuery(new URL(request.url).searchParams.get("q") ?? "");
  const empty: SearchResponse = { films: [], awards: [] };
  if (!query) return Response.json(empty, { headers: { "Cache-Control": "no-store" } });

  try {
    const [films, awards] = await Promise.all([querySearchFilms(getDb(), query), getAwardList()]);
    const body: SearchResponse = { films, awards: matchAwards(awards, query) };
    return Response.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("search failed", error);
    return Response.json({ error: "Search failed" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
