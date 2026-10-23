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
  await expect(table.getByRole("row", { name: /Cannes/ }).getByTitle("Not counted: the award announces winners only").first()).toBeVisible();
  await expect(page.getByText(/means the figure doesn't apply/)).toBeVisible();
  await expect(page.getByRole("link", { name: "How the % chance works" })).toHaveAttribute("href", "/accuracy/picture#method");
});

test("every figure head sorts by keyboard, aria-sort is right, and the address keeps the sort", async ({ page }) => {
  await page.goto("/accuracy/picture");
  const table = page.getByRole("table");

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
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: HEADS.years })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
