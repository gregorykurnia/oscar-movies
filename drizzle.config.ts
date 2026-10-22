import { defineConfig } from "drizzle-kit";

// `db:migrate:test` and `db:migrate` (scripts/migrate.ts) load `.env.test` or `.env.local` and check the branch first;
// `db:generate` needs no connection.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});
