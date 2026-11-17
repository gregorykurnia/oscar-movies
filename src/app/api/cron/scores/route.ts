// The score batch (plan §5.4), run by Vercel Cron five times a day (`vercel.json`). Vercel sends
// `CRON_SECRET` as a Bearer token; without a configured secret every call is refused.
import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { getDb } from "@/db";
import { getMovieCatalogue } from "@/lib/movie-catalogue";
import { createScoreStore, describeRun, runScores, scoreClientsFromEnv } from "@/lib/scores";
import { DEADLINE_MS } from "@/lib/scores/batch";
import { linkHandAddedFilms } from "@/lib/scores/link-film";

// The batch stops itself at 250 seconds; this leaves room to write its `data_loads` row.
export const maxDuration = 300;
const LINK_MS = 60_000;

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
  const db = getDb();
  const started = Date.now();
  // Hand-added films TMDB couldn't match at the add get another try (at most a minute of the
  // batch's time), then score with the rest.
  const linked = await getMovieCatalogue().then((c) => linkHandAddedFilms(db, c, started + LINK_MS), (error: unknown) => {
    console.error("No film catalogue for linking hand-added films", error);
    return 0;
  });
  if (linked > 0) console.log(`Linked ${linked} hand-added films to TMDB.`);
  const summary = await runScores(createScoreStore(db, commit), scoreClientsFromEnv(), {
    source: "cron",
    // The linking above came out of the same 250 seconds.
    deadlineMs: Math.max(0, DEADLINE_MS - (Date.now() - started)),
    log: console.log,
  });
  console.log(describeRun(summary));
  if (summary.checked > 0 || linked > 0) revalidateTag("scores", { expire: 0 });
  return Response.json(summary);
}
