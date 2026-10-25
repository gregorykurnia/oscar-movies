import { describe, expect, it } from "vitest";
import { chooseMethod, NOMINATION_METHOD } from "./method";

describe("NOMINATION_METHOD", () => {
  it("uses the patterns only where they picked more nominees; a tie keeps the engine", () => {
    expect(chooseMethod(35, 31)).toBe("patterns");
    expect(chooseMethod(38, 38)).toBe("engine");
    expect(chooseMethod(30, 31)).toBe("engine");
  });

  it("names the engine for the categories with no shortlist", () => {
    expect(NOMINATION_METHOD.picture).toBe("engine");
    expect(NOMINATION_METHOD.animated).toBe("engine");
  });
});
