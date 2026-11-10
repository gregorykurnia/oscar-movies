// Database clients (IMPLEMENTATION_PLAN.md §1). Page reads use Neon's HTTP driver; locked
// app writes, scripts and database tests use the WebSocket Pool for real transactions.
// Both are created on first use, so importing this file needs no env.
import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
import { lockFilmWrites } from "./write-lock";

export { schema };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

let appDb: ReturnType<typeof createAppDb> | undefined;
// Load only when an app transaction is used, so ordinary CLI clients work outside Next.
let serverOnly: Promise<unknown> | undefined;

function createAppDb() {
  return drizzleHttp(requireEnv("DATABASE_URL_POOLED"), { schema });
}

/** The app's client (pages, Server Actions, route handlers). */
export function getDb() {
  appDb ??= createAppDb();
  return appDb;
}

/**
 * A client for scripts and database tests, on the direct connection string unless one is
 * given. Call `close()` when done so the process can exit.
 */
export function createScriptDb(connectionString = requireEnv("DATABASE_URL")) {
  const pool = new Pool({ connectionString });
  const db = drizzleWs({ client: pool, schema });
  return { db, close: () => pool.end() };
}

export type ScriptDb = ReturnType<typeof createScriptDb>["db"];
export type FilmTransaction = Parameters<Parameters<ScriptDb["transaction"]>[0]>[0];

/** Request-scoped, server-only writes; ordinary page reads keep using HTTP. */
export async function withFilmTransaction<T>(write: (tx: FilmTransaction) => Promise<T>): Promise<T> {
  await (serverOnly ??= import("server-only"));
  const client = createScriptDb(requireEnv("DATABASE_URL_POOLED"));
  try {
    return await client.db.transaction(async (tx) => {
      await lockFilmWrites(tx);
      return write(tx);
    });
  } finally {
    // A pool that fails to close after the commit must not turn a saved write into a reported failure.
    try { await client.close(); } catch { /* the write already committed or failed on its own */ }
  }
}
