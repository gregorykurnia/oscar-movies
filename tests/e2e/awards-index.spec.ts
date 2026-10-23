// The awards index and the festivals index (task 2.7, guide §8.7): the Oscars as one feature link,
// then major awards, festivals and critics groups in calendar order, with "No data" and "Partly
// loaded" pills; the year-less addresses the nav uses; and an unknown year. Reads only; no writes.
import { expect, test } from "@playwright/test";

test("/awards/2025 lists the Oscars first, then the majors, festivals and critics groups in calendar order", async ({ page }) => {
  await page.goto("/awards/2025");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Awards 2025");

  const oscars = page.getByRole("link", { name: /98th Academy Awards/ });
  await expect(oscars).toHaveAttribute("href", "/awards/oscars/2025");
  await expect(oscars.getByText("15 Mar 2026 · One Battle After Another won Best Picture")).toBeVisible();

  await expect(page.getByRole("heading", { level: 2 })).toHaveText(["Major awards", "Festivals", "Critics groups"]);
  const majors = page.getByRole("region", { name: "Major awards" }).getByRole("listitem");
  await expect(majors).toHaveCount(11);
  await expect(majors.first()).toContainText("AFI Awards (Top 10 films)");
  // By that year's dates: Satellite's 2025 winners came out on 10 Mar 2026, after the Actor Awards.
  await expect(majors.nth(9)).toContainText("Actor Awards (formerly SAG Awards)");
  await expect(majors.last()).toContainText("Satellite Awards");
  // The critics groups (tasks 4.1–4.10): all 64 entries below the majors, a group with an edition that year
  // a link to its page, the others No data.
  const criticsRegion = page.getByRole("region", { name: "Critics groups" });
  const critics = criticsRegion.getByRole("listitem");
  await expect(critics).toHaveCount(64);
  await expect(critics.first()).toContainText("Critics Choice Documentary Awards");
  await expect(critics.last()).toContainText("Peabody Awards");
  expect(await criticsRegion.getByRole("link").count()).toBeGreaterThan(10);
});

test("/awards/2026 marks the majors No data and the Oscars Partly loaded", async ({ page }) => {
  await page.goto("/awards/2026");
  const oscars = page.getByRole("link", { name: /99th Academy Awards/ });
  await expect(oscars.getByText("14 Mar 2027")).toBeVisible();
  await expect(oscars.getByText("Partly loaded", { exact: true })).toBeVisible();

  const majors = page.getByRole("region", { name: "Major awards" });
  await expect(majors.getByText("No data", { exact: true })).toHaveCount(11);
  await expect(majors.getByRole("link")).toHaveCount(0);

  // A festival with its prizes loaded links to them, dated by the month.
  const cannes = page.getByRole("region", { name: "Festivals" }).getByRole("link", { name: /Cannes Film Festival/ });
  await expect(cannes).toHaveAttribute("href", "/awards/cannes/2026");
  await expect(cannes.getByText("May 2026")).toBeVisible();
});

test("a partly loaded award is a link, with its pill where the date would be", async ({ page }) => {
  await page.goto("/awards/2012");
  const cinemaEye = page.getByRole("link", { name: /Cinema Eye Honors/ });
  await expect(cinemaEye).toHaveAttribute("href", "/awards/cinema-eye/2012");
  await expect(cinemaEye.getByText("Partly loaded", { exact: true })).toBeVisible();
});

test("a row opens the award's page for that year, which links back to the index", async ({ page }) => {
  await page.goto("/awards/2025");
  await page.getByRole("link", { name: /BAFTA Film Awards/ }).click();
  await expect(page).toHaveURL(/\/awards\/bafta\/2025$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("BAFTA 2025");
  await expect(page.getByRole("link", { name: "Awards 2025" })).toHaveAttribute("href", "/awards/2025");
});

test("/awards and /festivals open the live season, and the festivals index lists five festivals in calendar order", async ({
  page,
}) => {
  await page.goto("/awards");
  await expect(page).toHaveURL(/\/awards\/2026$/);
  await page.goto("/festivals");
  await expect(page).toHaveURL(/\/festivals\/2026$/);

  await page.goto("/festivals/2025");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Festivals 2025");
  // evaluateAll doesn't wait for the streamed list, so wait for its five links first.
  const links = page.getByRole("region", { name: "Festivals" }).getByRole("link");
  await expect(links).toHaveCount(5);
  const hrefs = await links.evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  // From 2025 a festival row opens its lineup (task 5.3).
  expect(hrefs).toEqual([
    "/festivals/sundance/2025",
    "/festivals/berlin/2025",
    "/festivals/cannes/2025",
    "/festivals/venice/2025",
    "/festivals/tiff/2025",
  ]);
});

test("an unknown year is not found on either index", async ({ page }) => {
  await page.goto("/awards/1999");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page isn't here");
  await page.goto("/festivals/1999");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page isn't here");
});
