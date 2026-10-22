import { defineConfig } from "vitest/config";

// `npm test` runs the unit project, which never touches a database.
// `npm run test:db` runs the database project on the `test` branch; its setup file stops
// every test unless `.env.test` passes its checks and `app_meta` says `test`.
export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          setupFiles: ["tests/db/setup.ts"],
          testTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
