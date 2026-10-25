import { describe, expect, it } from "vitest";
import { primaryCountry } from "./flags";

describe("primaryCountry", () => {
  it("is the first production country of a co-production", () => {
    expect(primaryCountry(["fr", "BR", "NL"])).toBe("FR");
    expect(primaryCountry(["GB", "US"], [])).toBe("GB");
  });

  it("is the submitting country, even one not among the production countries", () => {
    expect(primaryCountry(["FR", "BR"], [{ year: 2024, country: "BR" }])).toBe("BR");
    expect(primaryCountry(["FR"], [{ year: 2024, country: "BE" }])).toBe("BE");
  });

  it("is the latest year's submitting country for a film submitted twice", () => {
    const submissions = [
      { year: 2023, country: "FR" },
      { year: 2025, country: "TN" },
      { year: 2024, country: "DZ" },
    ];
    expect(primaryCountry(["FR", "TN"], submissions)).toBe("TN");
  });

  it("ignores a submission without a country", () => {
    expect(primaryCountry(["US"], [{ year: 2024, country: null }])).toBe("US");
  });

  it("is null for a film with no country at all", () => {
    expect(primaryCountry([])).toBeNull();
  });
});
