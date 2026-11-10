import { catalogueErrors, catalogueQuerySchema, type CatalogueError, type CatalogueResult } from "@/lib/movie-catalogue/contract";
import { getMovieCatalogue } from "@/lib/movie-catalogue";

const statuses: Record<CatalogueError, number> = {
  "invalid-input": 400, unavailable: 503, refused: 503, "not-found": 404, "rate-limited": 429,
  timeout: 504, network: 502, "invalid-response": 502, "provider-error": 502, "fixtures-refused": 503,
};
const respond = <T>(result: CatalogueResult<T>) => Response.json(
  result.ok ? result : { ...result, message: catalogueErrors[result.error] },
  { status: result.ok ? 200 : statuses[result.error], headers: { "Cache-Control": "no-store" } },
);

/** Public read-only provider search. Local/global search keeps its existing contract. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const page = params.get("page");
  const input = catalogueQuerySchema.safeParse({
    query: params.get("q"), page: page === null ? 1 : /^\d+$/.test(page) ? Number(page) : NaN,
  });
  if (!input.success) return respond({ ok: false, error: "invalid-input" });
  let catalogue;
  try {
    catalogue = await getMovieCatalogue();
  } catch {
    return respond({ ok: false, error: "fixtures-refused" });
  }
  return respond(await catalogue.search(input.data.query, input.data.page));
}
