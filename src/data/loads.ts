// When the award data last changed (plan §3.1 `data_loads`): the race's "Updated 20 Dec 2025".
// Score refreshes don't count; the results do (an import, a race update or a correction).
import { desc, ne } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { getDb } from "@/db";
import { dataLoads } from "@/db/schema";
import type { ReadDb } from "./films";

export async function queryLastUpdate(db: ReadDb): Promise<Date | null> {
  const [row] = await db
    .select({ loadedAt: dataLoads.loadedAt })
    .from(dataLoads)
    .where(ne(dataLoads.kind, "scores"))
    .orderBy(desc(dataLoads.loadedAt))
    .limit(1);
  return row ? new Date(row.loadedAt) : null;
}

/** Cached `queryLastUpdate` (as an ISO string, so the cache can hold it). */
export async function getLastUpdate(): Promise<string | null> {
  "use cache";
  cacheTag("awards");
  cacheLife("max");
  return (await queryLastUpdate(getDb()))?.toISOString() ?? null;
}
