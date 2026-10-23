import { defineConfig, devices } from "@playwright/test";
import { TEST_APP_URL } from "./scripts/lib/target";

// End-to-end tests (IMPLEMENTATION_PLAN.md §8): a production build in `.next-test` on port
// 3100, on the Neon `test` branch. The global setup checks `.env.test` and the database
// before it builds or starts anything, and stops the server when the run ends.
// `chromium` is the end-to-end suite (`npm run test:e2e`); `screens` is the screenshot spec
// (`npm run screens`), kept out of that run.
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: TEST_APP_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "screens",
      testDir: "tests/screens",
      use: { ...devices["Desktop Chrome"], colorScheme: "light" },
    },
    {
      name: "launch",
      testDir: "tests/launch",
      use: { ...devices["Desktop Chrome"], colorScheme: "light" },
    },
  ],
});
