// Task 11.2's Watch list gallery. Global setup checks both Neon connections are on test.
import { expect, test, type Locator } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { createScriptDb } from "../../src/db";
import { marks, movies } from "../../src/db/schema";

// GALLERY_OUT sends a later run (11.R) to its own folder and keeps the earlier shots.
const OUT = process.env.GALLERY_OUT ?? "screenshots/phase-11/11.2";
const SHAPES = [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 900 }];

async function rowGeometry(row: Locator) {
  return row.evaluate((el) => {
    const title = el.querySelector("h3 a")!.getBoundingClientRect();
    const release = el.querySelector("[data-out]")!.getBoundingClientRect();
    return { titleHeight: title.height, releaseHeight: release.height, releaseOffset: release.top - title.top };
  });
}

async function expectStarContrast(star: Locator) {
  const [text, outline] = await star.evaluate((button) => {
    const wash = document.createElement("span");
    wash.style.color = "var(--gold-wash)";
    document.body.append(wash);
    const luminance = (color: string) => {
      const linear = color.match(/\d+/g)!.slice(0, 3).map((channel) => {
        const c = Number(channel) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const background = luminance(getComputedStyle(wash).color);
    wash.remove();
    const ratio = (color: string) => (background + 0.05) / (luminance(color) + 0.05);
    return [ratio(getComputedStyle(button).color), ratio(getComputedStyle(button.querySelector("svg")!).stroke)];
  });
  expect(text).toBeGreaterThanOrEqual(4.5);
  expect(outline).toBeGreaterThanOrEqual(3);
}

test("Watch list star gallery: tight row, supported shapes, filter and failures", async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(OUT, { recursive: true });
  const { db, close } = createScriptDb();
  const saved = await db.select().from(marks);
  try {
    const fixtures = await db.select({ id: movies.id, slug: movies.slug, title: movies.title })
      .from(movies).where(inArray(movies.slug, ["anora", "hamnet", "sentimental-value"]));
    expect(fixtures).toHaveLength(3);
    const winner = fixtures.find((film) => film.slug === "anora")!;
    const otherQueue = fixtures.find((film) => film.slug === "hamnet")!;
    const otherWant = fixtures.find((film) => film.slug === "sentimental-value")!;
    const [longest] = await db.select({ id: movies.id, title: movies.title }).from(movies)
      .orderBy(desc(sql`char_length(${movies.title})`), movies.id).limit(1);

    await db.transaction(async (tx) => {
      await tx.delete(marks);
      await tx.insert(marks).values([
        { movieId: winner.id, want: true, wantRank: 1, favorite: true },
        { movieId: otherWant.id, want: true, wantRank: 2, platform: "Netflix" },
        { movieId: longest.id, want: true, wantRank: 3, queueRank: 1, platform: "Cinema XXI", releaseOn: "2020-01-01" },
        { movieId: otherQueue.id, want: true, wantRank: 4, queueRank: 2 },
      ]);
    });

    const star = (title: string) => page.getByRole("button", { name: `Star ${title}`, exact: true });
    const row = (title: string) => page.getByRole("heading", { name: title, exact: true })
      .locator("xpath=ancestor::div[contains(@class,'border-b')][1]");
    const center = (element: Locator) => element.evaluate((el) => el.scrollIntoView({ block: "center" }));
    const shot = async (name: string) => {
      await page.mouse.move(0, 0);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
      await page.screenshot({ path: `${OUT}/${name}.png`, animations: "disabled" });
    };
    const crop = async (element: Locator, name: string) => {
      await page.mouse.move(0, 0);
      return element.screenshot({ path: `${OUT}/${name}.png`, animations: "disabled" });
    };

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/watch-list?sort=mine");
    const tight = row(longest.title);
    const tightStar = star(longest.title);
    await expect(tight.getByRole("button", { name: /^Reorder / })).toBeVisible();
    await expect(tight.locator("[data-out]")).toBeVisible();
    await expect(tightStar).toHaveAttribute("aria-pressed", "false");
    await page.evaluate(() => document.fonts.ready);

    // Reconstruct the old row from the same fixture, font and viewport for a direct geometry comparison.
    const baseline = await page.addStyleTag({ content: `
      button[aria-label^="Star "] { display: none }
      div:has(> button[aria-label^="Star "]) { display: contents }
      div:has(> div > button[aria-label^="Star "]) { flex-direction: row; column-gap: 12px; row-gap: 0 }
    ` });
    const original = await rowGeometry(tight);
    await crop(tight, "baseline-row-360");
    await baseline.evaluate((style) => style.parentNode?.removeChild(style));
    expect(await rowGeometry(tight)).toEqual(original);
    await crop(tight, "unstarred-row-360");

    let abort!: () => void;
    const hold = new Promise<void>((resolve) => { abort = resolve; });
    const address = "**/watch-list?sort=mine";
    await page.route(address, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await hold;
      await route.abort();
    });
    const toast = page.getByText(`Couldn't star ${longest.title}`, { exact: true });
    try {
      await tightStar.click();
      await expect(tightStar).toBeDisabled();
      await expect(tightStar).toHaveAttribute("aria-pressed", "true");
      await crop(tight, "saving-row-360");
    } finally {
      abort();
    }
    await expect(toast).toBeVisible();
    await expect(tightStar).toHaveAttribute("aria-pressed", "false");
    await center(tight);
    await page.evaluate(() => window.scrollBy(0, 100));
    await shot("failure-360");
    await crop(toast.locator("xpath=ancestor::*[@data-tone='error'][1]"), "failure-base-360");
    await page.unroute(address);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(tightStar).toHaveAttribute("aria-pressed", "true");
    await expect(tightStar).toBeEnabled();
    expect(await rowGeometry(tight)).toEqual(original);
    await expectStarContrast(tightStar);

    const queue = tight.getByRole("button", { name: /^Remove .* from the watch queue$/ });
    const [q, s] = await Promise.all([queue.boundingBox(), tightStar.boundingBox()]);
    expect(q && s && q.y === s.y && q.x + q.width <= s.x).toBeTruthy();
    const [queueIcon, calendar] = await Promise.all([
      queue.locator("svg").boundingBox(),
      tight.locator("[data-out] svg").boundingBox(),
    ]);
    expect(queueIcon?.x).toBe(calendar?.x);
    const hitHeight = await tightStar.evaluate((button) => {
      const hit = getComputedStyle(button, "::before");
      return button.clientHeight - parseFloat(hit.top) - parseFloat(hit.bottom);
    });
    expect(hitHeight).toBeGreaterThanOrEqual(44);
    await page.getByRole("group", { name: "Filter", exact: true }).evaluate((toolbar) => {
      window.scrollTo(0, toolbar.getBoundingClientRect().top + window.scrollY - 12);
    });
    await shot("tight-360");
    await crop(tight, "tight-row-360");

    await expect(row(winner.title)).toHaveAttribute("data-winner", "true");
    await expectStarContrast(star(winner.title));
    const shortQueue = row(winner.title).getByRole("button", { name: `Add ${winner.title} to the watch queue` });
    const [shortAction, winnerStar] = await Promise.all([shortQueue.boundingBox(), star(winner.title).boundingBox()]);
    expect(shortAction?.y).toBe(winnerStar?.y);
    await crop(row(winner.title), "winner-row-360");
    await crop(row(otherQueue.title), "last-queue-row-360");
    await crop(row(otherWant.title), "last-want-row-360");

    for (const viewport of SHAPES) {
      await page.setViewportSize(viewport);
      await page.goto("/watch-list?sort=mine&starred=1");
      await expect(page.getByText("1 of 2 films", { exact: true })).toBeVisible();
      if (viewport.width === 390) {
        await shot("filtered-top-390");
        await page.getByRole("navigation", { name: "Sort by" }).evaluate((toolbar) => {
          window.scrollTo(0, toolbar.parentElement!.getBoundingClientRect().top + window.scrollY - 12);
        });
      } else if (viewport.width === 844) {
        await page.getByRole("group", { name: "Filter", exact: true }).evaluate((toolbar) => {
          window.scrollTo(0, toolbar.getBoundingClientRect().top + window.scrollY - 10);
        });
        await shot("filtered-toolbar-844");
        await page.locator("#queue-h").evaluate((heading) => {
          window.scrollTo(0, heading.getBoundingClientRect().top + window.scrollY - 16);
        });
      }
      await shot(`filtered-${viewport.width}`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/watch-list?platform=Netflix&starred=1");
    const noMatches = page.getByRole("heading", { name: "No films match these filters" });
    await expect(noMatches).toBeVisible();
    await center(noMatches.locator(".."));
    await shot("excluded-390");

    await db.update(marks).set({ favorite: false });
    await page.goto("/watch-list?starred=1");
    const empty = page.getByRole("heading", { name: "Nothing starred yet" });
    await expect(empty).toBeVisible();
    await center(empty.locator(".."));
    await shot("empty-390");

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/watch-list?sort=mine");
    await expect(star(winner.title)).toHaveAttribute("aria-pressed", "false");
    await crop(row(winner.title), "winner-unstarred-360");
    for (const [film, name] of [[otherQueue, "last-queue-starred-360"], [otherWant, "last-want-starred-360"]] as const) {
      const button = star(film.title);
      await expect(button).toHaveAttribute("aria-pressed", "false");
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(button).toBeEnabled();
      await crop(row(film.title), name);
    }
    await page.setViewportSize({ width: 320, height: 720 });
    const nominations = row(otherQueue.title).getByText("Nominations", { exact: true }).locator("..");
    const result = await nominations.boundingBox();
    expect(result).not.toBeNull();
    expect(result!.x + result!.width).toBeLessThanOrEqual(304);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

    await page.setViewportSize({ width: 640, height: 800 });
    const [releaseAction, queueAction] = await Promise.all([
      row(winner.title).getByRole("button", { name: "Add release date", exact: true }).boundingBox(),
      shortQueue.boundingBox(),
    ]);
    expect(releaseAction).not.toBeNull();
    expect(queueAction?.y).toBe(releaseAction?.y);

    // 11.R: Starred opened by a direct link while every wanted film is queued. The count reads "0 films".
    await db.update(marks).set({ want: false, wantRank: null }).where(and(eq(marks.want, true), isNull(marks.queueRank)));
    await db.update(marks).set({ favorite: true }).where(isNotNull(marks.queueRank));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/watch-list?starred=1");
    const allQueued = page.getByRole("heading", { name: "Everything is in your queue" });
    await expect(allQueued).toBeVisible();
    await expect(page.getByText("0 films", { exact: true })).toBeVisible();
    // The page ends here, so clip from the last queue row's top: no row shows without its title.
    await center(allQueued.locator(".."));
    const lastQueued = (await row(otherQueue.title).boundingBox())!;
    const wantEnd = (await page.locator("section[aria-labelledby=\"want-h\"]").boundingBox())!;
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: `${OUT}/queue-only-390.png`, animations: "disabled",
      clip: { x: 0, y: lastQueued.y, width: 390, height: wantEnd.y + wantEnd.height - lastQueued.y + 16 },
    });
  } finally {
    try {
      await db.transaction(async (tx) => {
        await tx.delete(marks);
        if (saved.length) await tx.insert(marks).values(saved);
      });
    } finally {
      await close();
    }
  }
});
