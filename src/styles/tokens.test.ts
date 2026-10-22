// tokens.css is the guide's §3 block, copied unchanged (DESIGN_GUIDE.md §3, §14). A token changes
// in the guide first, then here.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guide = readFileSync(new URL("../../DESIGN_GUIDE.md", import.meta.url), "utf8");
const section = guide.split(/^## /m).find((part) => part.startsWith("3. Design tokens"));
const block = section?.match(/^```css\n([\s\S]*?)\n```$/m)?.[1];

describe("tokens.css", () => {
  it("is the guide's §3 block byte for byte, ending with one newline", () => {
    expect(block).toBeDefined();
    expect(readFileSync(new URL("./tokens.css", import.meta.url), "utf8")).toBe(`${block}\n`);
  });
});
