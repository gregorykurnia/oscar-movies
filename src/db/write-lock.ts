import { sql } from "drizzle-orm";
import type { ScriptDb } from "./index";

/** Shared by all app identity/rank writes and backup restore; released by commit/rollback. */
export async function lockFilmWrites(tx: Pick<ScriptDb, "execute">): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(1869833074, 9)`);
}
