// `POST /api/watch-list/scores` with `{ movieId }`: the Watch list calls it right after an add so
// the new film's scores show without a reload (owner, 2026-11-17). A route rather than a Server
// Action: the client runs actions one at a time, and this one can take seconds. Public like the
// rest of the app (no sign-in), so it only acts on films on the Watch list, and a film checked in
// the last 20 hours spends no call.
import { and, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db";
import { marks } from "@/db/schema";
import { fetchScoresForAdd } from "@/lib/scores/after-add";

export const maxDuration = 60;

const bodySchema = z.object({ movieId: z.number().int().positive().max(2_147_483_647) }).strict();
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send { movieId }" }, { status: 400, headers: noStore });
  const { movieId } = parsed.data;
  try {
    const [wanted] = await getDb()
      .select({ movieId: marks.movieId })
      .from(marks)
      .where(and(eq(marks.movieId, movieId), eq(marks.want, true)));
    if (!wanted) return Response.json({ scored: false }, { headers: noStore });
  } catch (error) {
    console.error("Reading the watch list for a score fetch failed", { movieId }, error);
    return Response.json({ scored: false }, { status: 500, headers: noStore });
  }
  const scored = await fetchScoresForAdd(movieId);
  if (scored) revalidateTag("scores", { expire: 0 });
  return Response.json({ scored }, { headers: noStore });
}
