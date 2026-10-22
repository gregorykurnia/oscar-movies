// Runs once when a server starts (Next.js instrumentation). With `EXPECT_DB_BRANCH` set, as
// in `.env.test`, the server refuses to start unless its database says it is that branch
// (IMPLEMENTATION_PLAN.md §2). Production and local previews don't set it.
export async function register() {
  const expected = process.env.EXPECT_DB_BRANCH;
  if (process.env.NEXT_RUNTIME !== "nodejs" || !expected) return;
  const { guardAppBranch } = await import("./db/meta");
  await guardAppBranch(expected);
}
