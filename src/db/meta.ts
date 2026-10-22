// Which Neon branch a connection reaches (IMPLEMENTATION_PLAN.md §2): each branch has an
// `app_meta` row `db_branch` = `test` or `production`, written once by `db:mark-branch`.
import { eq } from "drizzle-orm";
import { appMeta } from "./schema";
import type { ScriptDb } from "./index";

export const DB_BRANCHES = ["test", "production"] as const;
export type DbBranch = (typeof DB_BRANCHES)[number];

export function isDbBranch(value: unknown): value is DbBranch {
  return DB_BRANCHES.includes(value as DbBranch);
}

/** The branch the database says it is, or null when it hasn't been marked. */
export async function readDbBranch(db: Pick<ScriptDb, "select">): Promise<string | null> {
  const rows = await db
    .select({ value: appMeta.value })
    .from(appMeta)
    .where(eq(appMeta.key, "db_branch"));
  return rows[0]?.value ?? null;
}

/**
 * The server's branch guard, run by `src/instrumentation.ts` when `EXPECT_DB_BRANCH` is set
 * (`.env.test` only): reads `app_meta` over the app's own connection and stops the server at
 * once when the branch isn't the expected one, before it answers any request.
 */
export async function guardAppBranch(expected: string): Promise<void> {
  const { getDb } = await import("./index");
  const branch = await readDbBranch(getDb()).catch((error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    return `unreadable (${reason})`;
  });
  if (branch !== expected) {
    console.error(
      `Branch guard: EXPECT_DB_BRANCH is "${expected}" but app_meta.db_branch is ${JSON.stringify(branch)}. Stopping the server.`,
    );
    process.exit(1);
  }
}
