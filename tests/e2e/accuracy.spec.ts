// The accuracy page (task 2.8, guide §8.5): the table of every award's figures for an Oscar
// category, grouped, sortable by each figure with the keyboard, with aria-sort following. Reads
// only; no writes.
import { expect, test, type Page } from "@playwright/test";

const HEADS = {
  win: "Winner won the Oscar",
  nomination: "Winner nominated",
  nominees: "Nominees nominated",
  years: "Years",
} as const;
const COLUMN = { win: 1, nomination: 2, nominees: 3, years: 4 } as const;

/** The first group's rows' cell texts in one column, for the order check ("–" as null). */
async function majorsColumn(page: Page, key: keyof typeof COLUMN): Promise<(number | null)[]> {
  return page.evaluate((index) => {
    const out: (number | null)[] = [];
    let inMajors = false;
    for (const tr of document.querySelectorAll("tbody tr")) {
      const group = tr.querySelector('th[scope="colgroup"]');
      if (group) {
        inMajors = group.textContent === "Major awards";
        continue;
      }
      if (!inMajors) continue;
      const text = tr.querySelectorAll("td")[index].textContent ?? "";
      const n = parseFloat(text);
      out.push(Number.isNaN(n) ? null : n);
    }
    return out;
  }, COLUMN[key]);
}

function isSorted(values: (number | null)[], direction: "ascending" | "descending"): boolean {
  const real = values.filter((v): v is number => v !== null);
  // A figure that doesn't apply goes last whichever way.
  const dashesLast = values.slice(real.length).every((v) => v === null);
  const ordered = real.every((v, i) => i === 0 || (direction === "descending" ? real[i - 1] >= v : real[i - 1] <= v));
  return dashesLast && ordered;
}

test("/accuracy opens Best Picture: grouped table, winner-won first, years counted", async ({ page }) => {
  await page.goto("/accuracy");
  await expect(page).toHaveURL(/\/accuracy\/picture$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Accuracy: Best Picture");
  await expect(page.getByText(/^How often each award's results matched the Oscars, 2012–\d{4} \(\d+ finished seasons\)\.$/)).toBeVisible();

  const table = page.getByRole("table", { name: "How well each award foretells Best Picture" });
  await expect(table.getByRole("columnheader", { name: /^(Major awards|Festivals)$/ })).toHaveText(["Major awards", "Festivals"]);
  const bafta = table.getByRole("row", { name: /BAFTA/ });
  await expect(bafta).toContainText("Best Film");
  await expect(bafta.getByRole("cell").last()).toHaveText("14");

  // Winner won the Oscar is the sorted head, highest first, and only that head says so.
  await expect(table.getByRole("columnheader", { name: HEADS.win })).toHaveAttribute("aria-sort", "descending");
  await expect(table.locator("[aria-sort]")).toHaveCount(1);
  expect(isSorted(await majorsColumn(page, "win"), "descending")).toBe(true);

  // A winners-only festival has no nominee figure, and the footnote says why.
  await expect(table.getByRole("row", { name: /Cannes/ }).getByTitle("Not counted: only the winners are known").first()).toBeVisible();
  await expect(page.getByText(/means the figure doesn't apply/)).toBeVisible();
  await expect(page.getByRole("link", { name: "How the % chance works" })).toHaveAttribute("href", "/accuracy/picture#method");
});

test("the Backtest lists every finished season with its favourite and result, and the method follows", async ({ page }) => {
  await page.goto("/accuracy/picture");
  const seasonsLine = (await page.getByText(/finished seasons\)\.$/).textContent()) ?? "";
  const finished = Number(/\((\d+) finished seasons\)/.exec(seasonsLine)![1]);

  const backtest = page.getByRole("region", { name: "Backtest" });
  await expect(backtest.getByRole("heading", { level: 2 })).toHaveText("Backtest");
  const table = backtest.getByRole("table", { name: "The app's eve-of-ceremony favourite for Best Picture, by season" });
  const rows = table.locator("tbody tr");
  await expect(rows).toHaveCount(finished);
  // Newest first; a season's favourite links to its film and its result is a Won pill or "Lost to".
  const years = (await rows.locator("td:first-child").allTextContents()).map(Number);
  expect(years).toEqual([...years].sort((a, b) => b - a));
  expect(years.at(-1)).toBe(2012);
  await expect(rows.first().getByRole("link")).toHaveAttribute("href", /^\/movies\//);
  await expect(rows.first().getByRole("cell").nth(2)).toHaveText(/^\d+%$/);
  for (const result of await rows.locator("td:last-child").allTextContents()) expect(result).toMatch(/^(Won|Lost to .+)$/);

  // The strip's first figure counts the same rows.
  // (Counted in the Result column: the phone copy under each title is hidden at this width.)
  const won = (await rows.locator("td:last-child [data-stage='won']").count()).toString();
  await expect(backtest.getByText(new RegExp(`^${won} of ${finished}$`))).toBeVisible();
  await expect(backtest.getByText("Nominees in the top slots, eve of nominations")).toBeVisible();

  // The link to the method lands on it.
  await page.getByRole("link", { name: "How the % chance works" }).click();
  await expect(page).toHaveURL(/\/accuracy\/picture#method$/);
  const method = page.locator("section#method");
  await expect(method.getByRole("heading", { level: 2 })).toHaveText("How the % chance works");
  await expect(method).toContainText("never sees its own answer");
  await expect(method).toBeInViewport();
});

test("every figure head sorts by keyboard, aria-sort is right, and the address keeps the sort", async ({ page }) => {
  await page.goto("/accuracy/picture");
  const table = page.getByRole("table", { name: "How well each award foretells Best Picture" });

  for (const key of ["nomination", "nominees", "years", "win"] as const) {
    const head = table.getByRole("columnheader", { name: HEADS[key] });
    await head.getByRole("button").focus();
    await page.keyboard.press("Enter");
    await expect(head).toHaveAttribute("aria-sort", "descending");
    await expect(table.locator("[aria-sort]")).toHaveCount(1);
    expect(isSorted(await majorsColumn(page, key), "descending")).toBe(true);

    await page.keyboard.press("Space");
    await expect(head).toHaveAttribute("aria-sort", "ascending");
    expect(isSorted(await majorsColumn(page, key), "ascending")).toBe(true);
    // Focus stays on the head's button for the next key press.
    await expect(head.getByRole("button")).toBeFocused();
  }

  // The last sort was winner-won ascending: it's in the address, and a reload keeps it.
  await expect(page).toHaveURL(/\/accuracy\/picture\?sort=win&dir=asc$/);
  await page.reload();
  await expect(table.getByRole("columnheader", { name: HEADS.win })).toHaveAttribute("aria-sort", "ascending");
  expect(isSorted(await majorsColumn(page, "win"), "ascending")).toBe(true);
});

test("the Award head sorts A to Z first", async ({ page }) => {
  await page.goto("/accuracy/picture");
  const head = page.getByRole("columnheader", { name: "Award", exact: true });
  await head.getByRole("button").focus();
  await page.keyboard.press("Enter");
  await expect(head).toHaveAttribute("aria-sort", "ascending");
  const names = await page.evaluate(() => {
    const out: string[] = [];
    let inMajors = false;
    for (const tr of document.querySelectorAll("tbody tr")) {
      const group = tr.querySelector('th[scope="colgroup"]');
      if (group) {
        inMajors = group.textContent === "Major awards";
        continue;
      }
      if (inMajors) out.push(tr.querySelector("td")?.firstElementChild?.firstChild?.textContent ?? "");
    }
    return out;
  });
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
});

test("the category control switches category and starts from the default sort; an unknown category shows the 404 page", async ({ page }) => {
  await page.goto("/accuracy/picture?sort=years&dir=asc");
  await page.getByRole("navigation", { name: "Category" }).getByRole("link", { name: "Documentary" }).click();
  await expect(page).toHaveURL(/\/accuracy\/documentary$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Accuracy: Best Documentary Feature");
  await expect(page.getByRole("columnheader", { name: HEADS.win })).toHaveAttribute("aria-sort", "descending");
  await expect(page.getByRole("navigation", { name: "Category" }).getByRole("link", { name: "Documentary" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // The 404 page streams in with a 200 status (a prerendered shell), as on the award pages.
  await page.goto("/accuracy/costume");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This page isn't here");
});

test("at 390 the page never scrolls sideways and the Years column is left out", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/accuracy/picture");
  await expect(page.getByRole("table", { name: "How well each award foretells Best Picture" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: HEADS.years })).toBeHidden();
  await expect(page.getByRole("table", { name: /eve-of-ceremony favourite/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("Best Picture lists the first eight critics groups below the majors, and Show all opens the rest", async ({ page }) => {
  await page.goto("/accuracy/picture");
  const table = page.getByRole("table", { name: "How well each award foretells Best Picture" });
  const groups = table.getByRole("columnheader", { name: /^(Major awards|Festivals|Critics groups)$/ });
  await expect(groups).toHaveText(["Major awards", "Festivals", "Critics groups"]);

  // The critics groups' rows are the ones after the Critics groups heading.
  const criticsRows = () =>
    page.evaluate(() => {
      const rows = [...document.querySelector("tbody")!.querySelectorAll("tr")];
      const start = rows.findIndex((tr) => tr.querySelector('th[scope="colgroup"]')?.textContent === "Critics groups");
      return start < 0 ? 0 : rows.length - start - 1;
    });
  expect(await criticsRows()).toBe(8);

  const show = page.getByRole("button", { name: /^Show all \d+ critics groups/ });
  await expect(show).toHaveAttribute("aria-expanded", "false");
  const total = Number((await show.textContent())!.match(/Show all (\d+) critics groups/)![1]);
  expect(total).toBeGreaterThan(8);
  // A press before hydration does nothing: press again only while the button still says Show all (3-18).
  const less = page.getByRole("button", { name: "Show the first 8 critics groups" });
  await expect(async () => {
    if (await show.count()) {
      await show.focus();
      await page.keyboard.press("Enter");
    }
    await expect(less).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(less).toHaveAttribute("aria-expanded", "true");
  expect(await criticsRows()).toBeGreaterThanOrEqual(total);
});
