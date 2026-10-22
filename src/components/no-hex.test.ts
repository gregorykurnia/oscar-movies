import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guide §15: no raw colour values in components or pages; every colour comes from tokens.css.
const ROOTS = ["src/components", "src/app"];
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("tokens only", () => {
  it("has no hex, rgb or hsl colours in components and pages", () => {
    const offenders = ROOTS.flatMap(files)
      .filter((f) => /\.(tsx?|css)$/.test(f) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"))
      .filter((f) => readFileSync(f, "utf8").split("\n").some((line) => RAW_COLOUR.test(line)));
    expect(offenders).toEqual([]);
  });
});
