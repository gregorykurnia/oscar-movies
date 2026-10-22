// Search (task 1.12, guide §7 Search): the `/` key, the popover on desktop and the full-screen sheet
// on a phone, finding a film by its original title, and the no-results message. Reads only.
// The film is the `test` branch's 2024 data (the 1.4 import).
import { expect, test } from "@playwright/test";

test("on a desktop, / opens the box, a result shows its row, and Enter opens the film", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.keyboard.press("/");
  const box = page.getByRole("combobox", { name: "Search films and awards" });
  await expect(box).toBeFocused();

  await box.fill("ainda estou");
  const option = page.getByRole("option", { name: /I'm Still Here/ });
  await expect(option).toBeVisible();
  await expect(option).toContainText("Ainda Estou");
  await expect(option.locator("mark")).toHaveText("Ainda Estou");
  await expect(option).toContainText("2024 · Best Picture, International");
  await expect(option).toContainText("Won");
  await expect(option.getByRole("img", { name: "Brazil" })).toBeVisible();
  await expect(option).toHaveAttribute("aria-selected", "true");

  await box.press("Escape");
  await expect(box).toBeHidden();
  await page.keyboard.press("/");
  await page.getByRole("combobox").fill("academy");
  await expect(page.getByRole("group", { name: "Awards and festivals" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/awards\/oscars\/20\d\d$/);
});

test("on a phone, the search button opens a full-screen sheet with Cancel, and no match says so", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Search" });
  await expect(sheet).toBeVisible();
  const size = await sheet.boundingBox();
  expect(size?.width).toBe(390);
  expect(size?.height).toBeCloseTo(800, 0);

  await page.getByRole("combobox").fill("parasyte");
  await expect(page.getByText("No movie or award matches “parasyte”.")).toBeVisible();
  await expect(page.getByText("Check the spelling, or try the original title.")).toBeVisible();

  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(sheet).toBeHidden();
});
