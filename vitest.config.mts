import { defineConfig } from "vitest/config";

// `npm test` runs the unit project, which never touches a database.
// `npm run test:db` runs the database project; its branch guard arrives in task 0.4.
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
        },
      },
    ],
  },
});
