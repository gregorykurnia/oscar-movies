import { defineConfig } from "drizzle-kit";

// `db:migrate:test` and `db:migrate` load `.env.test` or `.env.local` before this runs;
// `db:generate` needs no connection.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
});
