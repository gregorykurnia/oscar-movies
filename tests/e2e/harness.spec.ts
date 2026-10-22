// The harness itself (task 0.4): the run reaches the test build on port 3100, and the app
// sends its noindex header. The smoke test (task 0.10) checks the page against the database.
import { expect, test } from "@playwright/test";

test("the test build answers on port 3100 with noindex", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await expect(page.getByRole("link", { name: "Oscar Movies", exact: true })).toBeVisible();
});
