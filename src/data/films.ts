// Data functions read the database through cached queries (plan §5.1): a long life, a tag,
// and `/api/revalidate` expires the tag after a load. Pages never query directly.
import { count } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { movies } from "@/db/schema";

/** How many films the database holds. */
export async function countFilms(): Promise<number> {
  "use cache";
  cacheTag("awards");
  cacheLife("max");
  const [row] = await getDb().select({ n: count() }).from(movies);
  return row.n;
}
