import { beforeEach, describe, expect, it, vi } from "vitest";
const data = vi.hoisted(() => ({ getMovieCatalogue: vi.fn(), search: vi.fn() }));
vi.mock("@/lib/movie-catalogue", () => ({ getMovieCatalogue: data.getMovieCatalogue }));
import { GET } from "./route";
const get = (query: string) => GET(new Request(`http://localhost/api/movie-catalogue${query}`));
beforeEach(() => {
  data.getMovieCatalogue.mockReset().mockResolvedValue({ search: data.search });
  data.search.mockReset().mockResolvedValue({ ok: true, value: { films: [], page: 1, nextPage: null } });
});

describe("GET /api/movie-catalogue", () => {
  it("returns uncached typed results and passes validated text/page only", async () => {
    const response = await get("?q=%20Mother%20&page=2");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, value: { films: [], page: 1, nextPage: null } });
    expect(data.search).toHaveBeenCalledWith("Mother", 2);
  });

  it.each(["", "?q=", "?q=%20", `?q=${"a".repeat(201)}`, "?q=x&page=", "?q=x&page=0", "?q=x&page=501", "?q=x&page=1.5", "?q=x&page=1e2", "?q=x&page=no"])("rejects invalid input before provider setup: %s", async (query) => {
    expect((await get(query)).status).toBe(400);
    expect(data.getMovieCatalogue).not.toHaveBeenCalled();
  });

  it.each([
    ["unavailable", 503], ["refused", 503], ["not-found", 404], ["rate-limited", 429],
    ["timeout", 504], ["network", 502], ["invalid-response", 502], ["provider-error", 502],
  ])("distinguishes %s from empty success", async (error, status) => {
    data.search.mockResolvedValue({ ok: false, error });
    const response = await get("?q=Mother");
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ok: false, error, message: expect.stringContaining("manually") });
  });

  it("contains fixture guard errors without leaking internals", async () => {
    data.getMovieCatalogue.mockRejectedValue(new Error("secret guard internals"));
    const response = await get("?q=Mother");
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: "fixtures-refused" });
    expect(data.search).not.toHaveBeenCalled();
  });
});
