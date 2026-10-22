// Identity and search engines (task 0.9): the icon and preview files have their sizes, every
// page has its title and says noindex, and robots.txt disallows every crawler.
import { expect, test, type APIRequestContext } from "@playwright/test";

async function fetchBody(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.status(), url).toBe(200);
  return response.body();
}

// A PNG has "PNG" at bytes 1–3; its IHDR chunk holds the width and height at bytes 16–23.
function expectPngSize(body: Buffer, width: number, height: number) {
  expect(body.subarray(1, 4).toString("ascii")).toBe("PNG");
  expect({ width: body.readUInt32BE(16), height: body.readUInt32BE(20) }).toEqual({ width, height });
}

test("robots.txt disallows every crawler", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("User-Agent: *\nDisallow: /");
});

test("favicon.ico holds the 16 and 32 pixel images", async ({ request }) => {
  const icon = await fetchBody(request, "/favicon.ico");
  // ICONDIR: reserved 0, type 1 (icon), count; then 16 bytes per image, width first.
  expect(icon.readUInt16LE(2)).toBe(1);
  const sizes = Array.from({ length: icon.readUInt16LE(4) }, (_, i) => icon[6 + 16 * i]);
  expect(sizes).toEqual([16, 32]);
});

test("the mark, the apple icon, the 512 icon and the preview image have their sizes", async ({ request }) => {
  const mark = await request.get("/icon.svg");
  expect(mark.status()).toBe(200);
  expect(mark.headers()["content-type"]).toContain("image/svg+xml");
  expectPngSize(await fetchBody(request, "/apple-icon.png"), 180, 180);
  expectPngSize(await fetchBody(request, "/icon-512.png"), 512, 512);
  expectPngSize(await fetchBody(request, "/opengraph-image.png"), 1200, 630);
});

test("the home page links the apple icon and the absolute preview image", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  const image = await page.locator('meta[property="og:image"]').first().getAttribute("content");
  expect(image).toContain("/opengraph-image.png");
  expectPngSize(await fetchBody(request, String(image)), 1200, 630);
});

const PAGES = [
  { path: "/", title: "Oscar Movies", status: 200 },
  { path: "/styleguide", title: "Styleguide · Oscar Movies", status: 200 },
  { path: "/no-such-page", title: "Page not found · Oscar Movies", status: 404 },
];

for (const { path, title, status } of PAGES) {
  test(`${path} has its title and says noindex in the header and the tag`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(status);
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    await expect(page).toHaveTitle(title);
    // Next adds its own `noindex` tag to every 404 page, so a 404 has two robots tags; both say noindex.
    const robots = await page.locator('meta[name="robots"]').evaluateAll((tags) => tags.map((tag) => tag.getAttribute("content")));
    expect(robots).toContain("noindex, nofollow");
    expect(robots.every((content) => content?.includes("noindex"))).toBe(true);
  });
}
