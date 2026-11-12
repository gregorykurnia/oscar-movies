// IMDb's ratings file: only the wanted IDs are kept, lines split across chunks still parse, and a
// failed download is a `failed` result (the batch then keeps OMDb's rating), never a throw.
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { fetchImdbRatings, IMDB_RATINGS_URL, readRatings } from "./imdb-ratings";

const FILE = "tconst\taverageRating\tnumVotes\ntt0000001\t5.7\t2100\ntt45368240\t9.0\t31050\ntt0000003\t6.5\t2000\n";

async function* chunks(text: string, size: number) {
  for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

describe("readRatings", () => {
  it.each([3, 7, 1000])("keeps only the wanted IDs, whatever the chunk size (%i)", async (size) => {
    const ratings = await readRatings(chunks(FILE, size), new Set(["tt45368240", "tt0000003", "tt9999999"]));
    expect(ratings).toEqual(new Map([["tt45368240", 9.0], ["tt0000003", 6.5]]));
  });

  it("reads a line without the votes column whole", async () => {
    expect(await readRatings(chunks("tt2\t7.1\ntt3\t9\n", 4), new Set(["tt2", "tt3"]))).toEqual(new Map([["tt2", 7.1], ["tt3", 9]]));
  });

  it("reads a last line without a newline and skips the header and junk", async () => {
    const ratings = await readRatings(chunks("tconst\taverageRating\tnumVotes\ntt1\tN/A\t3\ntt2\t7.1\t40", 5), new Set(["tconst", "tt1", "tt2"]));
    expect(ratings).toEqual(new Map([["tt2", 7.1]]));
  });
});

describe("fetchImdbRatings", () => {
  const gz = (text: string) => new Response(gzipSync(text));

  it("downloads and unzips the file", async () => {
    let url = "";
    const result = await fetchImdbRatings(["tt45368240"], async (u) => ((url = String(u)), gz(FILE)));
    expect(url).toBe(IMDB_RATINGS_URL);
    expect(result).toEqual({ kind: "ok", value: new Map([["tt45368240", 9.0]]) });
  });

  it("doesn't unzip twice a body fetch already unzipped (Content-Encoding: gzip)", async () => {
    const result = await fetchImdbRatings(["tt45368240"], async () => new Response(FILE, { headers: { "content-encoding": "gzip" } }));
    expect(result).toEqual({ kind: "ok", value: new Map([["tt45368240", 9.0]]) });
  });

  it("downloads nothing for no IDs", async () => {
    const result = await fetchImdbRatings([], async () => {
      throw new Error("called");
    });
    expect(result).toEqual({ kind: "ok", value: new Map() });
  });

  it("reports an HTTP error, a network error or a broken file as failed", async () => {
    expect(await fetchImdbRatings(["tt1"], async () => new Response("no", { status: 503 }))).toEqual({
      kind: "failed",
      reason: "IMDb ratings file: HTTP 503",
    });
    expect((await fetchImdbRatings(["tt1"], async () => Promise.reject(new Error("offline")))).kind).toBe("failed");
    expect((await fetchImdbRatings(["tt1"], async () => new Response("not gzip"))).kind).toBe("failed");
  });
});
