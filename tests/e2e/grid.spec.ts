// The year grid (task 2.9, guide §8.4): one row per film with a nomination, one column per award,
// won and nominated cells labelled; the view in the address; the page never scrolls sideways on a
// phone. Reads only; no writes. The expected rows come from the `test` branch's 2025 data.
import { expect, test } from "@playwright/test";

const OSCAR_NOMINEES_2025 = [
  "Bugonia",
  "F1",
  "Frankenstein",
  "Hamnet",
  "Marty Supreme",
  "One Battle After Another",
  "Sentimental Value",
  "Sinners",
  "The Secret Agent",
  "Train Dreams",
];

test("/grid/2025 shows every nominated Picture film with its won and nominated cells", async ({ page }) => {
  await page.goto("/grid/2025");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("2025 year grid");
  // Critics groups' nominees are rows too (task 4.10), so the count is more than the Oscars' and BAFTA's.
  await expect(page.getByText(/^Best Picture · \d+ films with a nomination$/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Year summary" })).toHaveAttribute("href", "/years/2025");

  const table = page.getByRole("table");
  const rows = table.getByRole("rowheader").filter({ has: page.getByRole("link") });
  expect(await rows.count()).toBeGreaterThanOrEqual(31);
  // In Oscar order: the Best Picture winner first.
  await expect(rows.first()).toContainText("One Battle After Another");

  // Every Oscar nominee is a row, the winner's Oscar cell won, the others nominated.
  for (const title of OSCAR_NOMINEES_2025) {
    await expect(table.getByRole("rowheader", { name: title, exact: true })).toHaveCount(1);
  }
  await expect(table.getByRole("img", { name: "Won: Best Picture" })).toHaveCount(1);
  await expect(table.getByRole("img", { name: "Nominated: Best Picture" })).toHaveCount(9);
  const winner = table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "One Battle After Another" }) });
  await expect(winner.getByRole("img", { name: "Won: Best Picture" })).toBeVisible();
  await expect(winner.getByRole("img", { name: "Won: Best Film" })).toBeVisible();
  // Wins and Noms count every award, critics groups included (task 4.10): at least the Oscar,
  // BAFTA and the other majors' five wins and eight nominations.
  const wins = Number(await winner.getByRole("cell").nth(0).textContent());
  const noms = Number(await winner.getByRole("cell").nth(1).textContent());
  expect(wins).toBeGreaterThanOrEqual(5);
  expect(noms).toBeGreaterThanOrEqual(8);

  // Columns: Oscars, then majors, then festivals; the legend under the grid.
  await expect(table.getByRole("columnheader", { name: "Major awards" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Festivals" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "BAFTA" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Legend" })).toContainText("Nominated or on the list");
  // The marks are the table's buttons; the Watched chip above it is not one of them.
  await expect(table.getByRole("button", { name: /^(Mark as watched|Watched)$/ })).toHaveCount(await rows.count());
});

test("the category, sort and Unwatched filter are kept in the address and survive a reload", async ({ page }) => {
  await page.goto("/grid/2025");

  await page.getByRole("button", { name: "Sort: Oscars" }).click();
  await page.getByRole("menu", { name: "Sort the films by" }).getByRole("menuitemradio", { name: "Title" }).click();
  await expect(page).toHaveURL(/\/grid\/2025\?sort=title$/);
  // In title order, as the page sorts (`localeCompare`); the first title changes as precursors add films.
  await expect(async () => {
    const titles = await page.locator('tbody th[scope="row"]').evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
    expect(titles.length).toBeGreaterThan(10);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, "en")));
  }).toPass();

  await page.getByRole("navigation", { name: "Category" }).getByRole("link", { name: "International" }).click();
  await expect(page).toHaveURL(/\/grid\/2025\?category=international&sort=title$/);
  await expect(page.getByText(/^Best International Feature · \d+ films with a nomination$/)).toBeVisible();
  await expect(page.getByRole("table").getByRole("img", { name: "Shortlisted: Best International Feature Film" })).toHaveCount(10);

  await page.getByRole("group", { name: "Filter" }).getByRole("button", { name: "Unwatched" }).click();
  await expect(page).toHaveURL(/\/grid\/2025\?category=international&sort=title&filter=unwatched$/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Sort: Title" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Filter" }).getByRole("button", { name: "Unwatched" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("navigation", { name: "Category" }).getByRole("link", { name: "International" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // The year switcher keeps the view.
  await page.getByRole("button", { name: "Year: 2025" }).click();
  await page.getByRole("dialog", { name: "Choose a year" }).getByRole("link", { name: "2024" }).click();
  await expect(page).toHaveURL(/\/grid\/2024\?category=international&sort=title&filter=unwatched$/);
});

test("Watched and Unwatched are one choice, and All categories lists every category's films", async ({ page }) => {
  await page.goto("/grid/2025?category=all&filter=unwatched");
  await expect(page.getByText(/^All categories · \d+ films with a nomination$/)).toBeVisible();
  const filter = page.getByRole("group", { name: "Filter" });
  await expect(filter.getByRole("button", { name: "Unwatched", exact: true })).toHaveAttribute("aria-pressed", "true");

  await filter.getByRole("button", { name: "Watched", exact: true }).click();
  await expect(page).toHaveURL(/\/grid\/2025\?category=all&filter=watched$/);
  await expect(filter.getByRole("button", { name: "Watched", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(filter.getByRole("button", { name: "Unwatched", exact: true })).toHaveAttribute("aria-pressed", "false");

  await filter.getByRole("button", { name: "Watched", exact: true }).click();
  await expect(page).toHaveURL(/\/grid\/2025\?category=all$/);
  await expect(filter.getByRole("button", { name: "Watched", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("the sort menu works by keyboard", async ({ page }) => {
  await page.goto("/grid/2025");
  const button = page.getByRole("button", { name: "Sort: Oscars" });
  await button.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Sort the films by" });
  await expect(menu.getByRole("menuitemradio", { name: "Oscars" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitemradio", { name: "Wins" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp");
  await expect(menu.getByRole("menuitemradio", { name: "Title" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/grid\/2025\?sort=title$/);
  // Choosing a sort keeps the keyboard's place on the button, and Esc works from the button too.
  const titleButton = page.getByRole("button", { name: "Sort: Title" });
  await expect(titleButton).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+Tab");
  await expect(titleButton).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("at 390 the page never scrolls sideways: the grid scrolls in its frame and the film column stays", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/grid/2025");
  await expect(page.getByRole("table").getByRole("rowheader").filter({ has: page.getByRole("link") }).first()).toBeVisible();

  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);

  const region = page.getByRole("region", { name: "Awards for each film" });
  const inner = await region.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(inner.scroll).toBeGreaterThan(inner.client);

  const film = page.getByRole("table").getByRole("rowheader").filter({ has: page.getByRole("link") }).first();
  const before = await film.boundingBox();
  await region.evaluate((el) => el.scrollTo({ left: 400 }));
  await expect.poll(() => region.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const after = await film.boundingBox();
  expect(after!.x).toBe(before!.x);
});

test("/grid opens the live season, and a year with nothing yet says so", async ({ page }) => {
  await page.goto("/grid");
  await expect(page).toHaveURL(/\/grid\/2026$/);
  await page.goto("/grid/2026?category=animated");
  await expect(page.getByRole("heading", { level: 2, name: "No nominations yet" })).toBeVisible();
  await expect(page.getByText("Best Animated Feature · 0 films with a nomination")).toBeVisible();
});

test("critics=open gives each critics group with data its own column, after the festivals", async ({ page }) => {
  await page.goto("/grid/2025?critics=open");
  const table = page.getByRole("table");
  const heads = table.getByRole("columnheader");
  const names = await heads.allTextContents();
  const group = (label: string) => names.findIndex((n) => n.startsWith(label));
  expect(group("Major awards")).toBeGreaterThan(-1);
  expect(group("Critics groups")).toBeGreaterThan(group("Major awards"));
  // One column per group after the Critics groups head, far more than the folded count column.
  expect(names.length - group("Critics groups")).toBeGreaterThan(10);
  await expect(page.getByRole("button", { name: /Critics groups folded/ })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("img", { name: /^Won: Best Picture/ }).first()).toBeVisible();
});
