import { connection } from "next/server";
import { getMarks } from "@/data/watch-list";
import { HydrateMarks } from "./MarksProvider";

/**
 * Reads every mark for this request (never cached, plan §5.1) and hands them to the
 * `MarksProvider`. The root layout renders it inside Suspense, so pages don't wait for it.
 * If the read fails the page still loads; its marks stay disabled.
 */
export async function ServerMarks() {
  // Wait for the request, so `next build` never reads the database.
  await connection();
  let marks: Awaited<ReturnType<typeof getMarks>> | null = null;
  try {
    marks = await getMarks();
  } catch (error) {
    console.error("Couldn't read the marks", error);
  }
  return <HydrateMarks marks={marks} />;
}
