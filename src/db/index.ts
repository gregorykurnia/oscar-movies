// Database clients (IMPLEMENTATION_PLAN.md §1). The app uses Neon's HTTP driver (fastest for
// single queries on Vercel); scripts and database tests use the WebSocket `Pool`, which has
// real transactions. Both are created on first use, so importing this file needs no env.
import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { drizzle as drizzleWs } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export { schema };

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

let appDb: ReturnType<typeof createAppDb> | undefined;

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
