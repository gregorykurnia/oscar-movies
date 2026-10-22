// The smoke test (task 0.10): the home page answers from the production build, renders the
// race frame, and its film count is what the `test` database holds. It also checks that
// `/api/revalidate` refuses a call without the secret. Reads only; no writes.
import { expect, test } from "@playwright/test";
import { count } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { movies } from "../../src/db/schema";

test("the home page renders the race frame and the film count from the database", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await expect(page.getByRole("link", { name: "Oscar Movies", exact: true })).toBeVisible();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^The \d{4} race$/);
  const tabs = page.getByRole("navigation", { name: "Category" }).getByRole("link");
  await expect(tabs).toHaveCount(4);
  await expect(tabs.first()).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { level: 2, name: "No contenders yet" })).toBeVisible();

  const db = createScriptDb();
  const [{ n }] = await db.db.select({ n: count() }).from(movies).finally(() => db.close());
  expect(n).toBeGreaterThan(0);
  await expect(page.getByText(`${n} films are loaded so far.`)).toBeVisible();
});

test("the category in the address picks the tab", async ({ page }) => {
  await page.goto("/?category=animated");
  await expect(page.getByRole("link", { name: /^Animated/ })).toHaveAttribute("aria-current", "page");
  await page.goto("/?category=nonsense");
  await expect(page.getByRole("link", { name: /^Picture/ })).toHaveAttribute("aria-current", "page");
});

test("/api/revalidate refuses a call without the secret", async ({ request }) => {
  const response = await request.post("/api/revalidate");
  expect(response.status()).toBe(401);
});
