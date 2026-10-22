// Called by the loader and the cron after data changes (plan §4, §5.1): expires a cache tag
// so the next request reads fresh data. Needs `REVALIDATE_SECRET` as a Bearer token.
import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";

const TAGS = ["awards", "scores"] as const;

function authorised(request: Request): boolean {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/** Body (JSON, optional): `{ "tags": ["awards"] }`. Without it, every tag is expired. */
export async function POST(request: Request) {
  if (!authorised(request)) return Response.json({ error: "Unauthorised" }, { status: 401 });

  let requested: unknown = TAGS;
  const text = await request.text();
  if (text) {
    try {
      requested = (JSON.parse(text) as { tags?: unknown }).tags ?? TAGS;
    } catch {
      return Response.json({ error: "The body must be JSON." }, { status: 400 });
    }
  }
  const tags = Array.isArray(requested) ? requested : [];
  if (tags.length === 0 || !tags.every((t): t is (typeof TAGS)[number] => TAGS.includes(t))) {
    return Response.json({ error: `Tags must be from: ${TAGS.join(", ")}.` }, { status: 400 });
  }

  // Expired at once, not served stale: a load is followed by someone checking the result.
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return Response.json({ revalidated: tags });
}
