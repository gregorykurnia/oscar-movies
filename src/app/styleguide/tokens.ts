import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** `--name: value;` pairs of tokens.css, so the swatches print the real values and no colour is typed twice. */
export function parseTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out[match[1]] = match[2].trim();
  }
  return out;
}

export async function readTokens(): Promise<Record<string, string>> {
  return parseTokens(await readFile(join(process.cwd(), "src/styles/tokens.css"), "utf8"));
}

/** Where /styleguide is open: everywhere except production on Vercel (plan §6). */
export function styleguideOpen(env: string | undefined = process.env.VERCEL_ENV): boolean {
  return env !== "production";
}
