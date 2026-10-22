// The daily score batch (plan §5.4), run by Vercel Cron (`vercel.json`). Vercel sends
// `CRON_SECRET` as a Bearer token; without a configured secret every call is refused.
import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { getDb } from "@/db";
import { createScoreStore, describeRun, runScores, scoreClientsFromEnv } from "@/lib/scores";

// The batch stops itself at 250 seconds; this leaves room to write its `data_loads` row.
export const maxDuration = 300;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export async function GET(request: Request) {
  if (!authorised(request)) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
  const summary = await runScores(createScoreStore(getDb(), commit), scoreClientsFromEnv(), {
    source: "cron",
    log: console.log,
  });
  console.log(describeRun(summary));
  if (summary.checked > 0) revalidateTag("scores", { expire: 0 });
  return Response.json(summary);
}
