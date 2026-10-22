import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidateTag }));

const { POST } = await import("./route");

const post = (headers: Record<string, string>, body?: string) =>
  POST(new Request("http://localhost/api/revalidate", { method: "POST", headers, body }));

beforeEach(() => {
  vi.stubEnv("REVALIDATE_SECRET", "s3cret");
  revalidateTag.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/revalidate", () => {
  it("refuses a missing or wrong secret and expires nothing", async () => {
    expect((await post({})).status).toBe(401);
    expect((await post({ authorization: "Bearer nope" })).status).toBe(401);
    expect((await post({ authorization: "s3cret" })).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("refuses every call when no secret is configured", async () => {
    vi.stubEnv("REVALIDATE_SECRET", "");
    expect((await post({ authorization: "Bearer " })).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("expires every tag with no body", async () => {
    const response = await post({ authorization: "Bearer s3cret" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: ["awards", "scores"] });
    expect(revalidateTag).toHaveBeenCalledWith("awards", { expire: 0 });
    expect(revalidateTag).toHaveBeenCalledWith("scores", { expire: 0 });
  });

  it("expires only the tags asked for", async () => {
    const response = await post({ authorization: "Bearer s3cret" }, JSON.stringify({ tags: ["scores"] }));
    expect(await response.json()).toEqual({ revalidated: ["scores"] });
    expect(revalidateTag).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown tags and bad JSON", async () => {
    expect((await post({ authorization: "Bearer s3cret" }, JSON.stringify({ tags: ["x"] }))).status).toBe(400);
    expect((await post({ authorization: "Bearer s3cret" }, "{")).status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
