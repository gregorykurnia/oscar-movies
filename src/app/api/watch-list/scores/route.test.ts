// The Watch list's score request after an add: only films on the list, and the cached scores
// expire only when scores came back.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchScoresForAdd, revalidateTag, wanted } = vi.hoisted(() => ({
  fetchScoresForAdd: vi.fn(),
  revalidateTag: vi.fn(),
  wanted: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidateTag }));
vi.mock("@/lib/scores/after-add", () => ({ fetchScoresForAdd }));
vi.mock("@/db", () => ({
  getDb: () => ({ select: () => ({ from: () => ({ where: () => wanted() }) }) }),
}));

const { POST } = await import("./route");
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/watch-list/scores", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  wanted.mockResolvedValue([{ movieId: 7 }]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/watch-list/scores", () => {
  it("fetches a wanted film's scores and expires the cached scores", async () => {
    fetchScoresForAdd.mockResolvedValue(true);
    const response = await post({ movieId: 7 });
    expect(await response.json()).toEqual({ scored: true });
    expect(fetchScoresForAdd).toHaveBeenCalledWith(7);
    expect(revalidateTag).toHaveBeenCalledWith("scores", { expire: 0 });
  });

  it("expires nothing when no scores came back", async () => {
    fetchScoresForAdd.mockResolvedValue(false);
    expect(await (await post({ movieId: 7 })).json()).toEqual({ scored: false });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("spends nothing on a film that isn't on the watch list", async () => {
    wanted.mockResolvedValue([]);
    expect(await (await post({ movieId: 7 })).json()).toEqual({ scored: false });
    expect(fetchScoresForAdd).not.toHaveBeenCalled();
  });

  it("answers 500 when the watch list can't be read", async () => {
    wanted.mockRejectedValue(new Error("down"));
    expect((await post({ movieId: 7 })).status).toBe(500);
    expect(fetchScoresForAdd).not.toHaveBeenCalled();
  });

  it.each([[{}], [{ movieId: 0 }], [{ movieId: "7" }], [{ movieId: 7, extra: 1 }], ["not json"]])("refuses %j", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(fetchScoresForAdd).not.toHaveBeenCalled();
  });
});
