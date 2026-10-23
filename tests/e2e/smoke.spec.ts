// The smoke test (task 0.10): the home page answers from the production build, renders the
// race, and its "Updated" date comes from the `test` database's loads. It also checks that
// `/api/revalidate` refuses a call without the secret. Reads only; no writes.
import { expect, test } from "@playwright/test";

test("the home page renders the race and reads the database", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  await expect(page.getByRole("link", { name: "Oscar Movies", exact: true })).toBeVisible();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^The \d{4} race$/);
  const tabs = page.getByRole("tablist", { name: "Category" }).getByRole("tab");
  await expect(tabs).toHaveCount(4);
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/Updated \d{1,2} [A-Z][a-z]{2} \d{4}\./)).toBeVisible();
});

test("the category in the address picks the tab", async ({ page }) => {
  await page.goto("/?category=animated");
  await expect(page.getByRole("tab", { name: /^Animated/ })).toHaveAttribute("aria-selected", "true");
  await page.goto("/?category=nonsense");
  await expect(page.getByRole("tab", { name: /^Picture/ })).toHaveAttribute("aria-selected", "true");
});

test("/api/revalidate refuses a call without the secret", async ({ request }) => {
  const response = await request.post("/api/revalidate");
  expect(response.status()).toBe(401);
});
