import { describe, expect, it } from "vitest";
import { keepFigures } from "./words";

const NBSP = " ";

describe("keepFigures (guide §7: a figure never breaks inside its phrase)", () => {
  it("joins the figure phrases with no-break spaces and leaves the rest", () => {
    expect(keepFigures("3+ strong awards, not US-only: 8 of 20 nominated")).toBe(`3+ strong awards, not US-only: 8${NBSP}of${NBSP}20${NBSP}nominated`);
    expect(keepFigures("2 nominations, 1 at a strong award")).toBe(`2${NBSP}nominations, 1${NBSP}at${NBSP}a${NBSP}strong${NBSP}award`);
    expect(keepFigures("1 nomination, none at a strong award")).toBe(`1${NBSP}nomination, none${NBSP}at${NBSP}a${NBSP}strong${NBSP}award`);
    expect(keepFigures("41 nominations, 3 at strong awards")).toBe(`41${NBSP}nominations, 3${NBSP}at${NBSP}strong${NBSP}awards`);
  });
});
