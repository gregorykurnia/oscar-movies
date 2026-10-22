// The env-file checks that stop tests and scripts before they reach the wrong database
// (IMPLEMENTATION_PLAN.md §2). Made-up hosts only; no connection is opened.
import { describe, expect, it } from "vitest";
import { endpointOf, envProblems, parseTargetArgs, TEST_APP_URL } from "./target";

const url = (endpoint: string, pooled = false) =>
  `postgresql://user:pw@${endpoint}${pooled ? "-pooler" : ""}.c-4.ap-southeast-1.aws.neon.tech/neondb`;

const prod = { DATABASE_URL: url("ep-prod-1"), DATABASE_URL_POOLED: url("ep-prod-1", true) };
const goodTest = {
  DATABASE_URL: url("ep-test-2"),
  DATABASE_URL_POOLED: url("ep-test-2", true),
  EXPECT_DB_BRANCH: "test",
  APP_URL: TEST_APP_URL,
};

describe("endpointOf", () => {
  it("gives the same endpoint for a branch's direct and pooled strings", () => {
    expect(endpointOf(url("ep-a"))).toBe("ep-a");
    expect(endpointOf(url("ep-a", true))).toBe("ep-a");
  });

  it("is null for a missing or broken string", () => {
    expect(endpointOf(undefined)).toBeNull();
    expect(endpointOf("not a url")).toBeNull();
  });
});

describe("envProblems for .env.test", () => {
  it("accepts a correct file", () => {
    expect(envProblems("test", goodTest, prod)).toEqual([]);
  });

  it("refuses a direct string copied from production", () => {
    const problems = envProblems("test", { ...goodTest, DATABASE_URL: prod.DATABASE_URL }, prod);
    expect(problems).toContain(".env.test points at the same database as .env.local.");
  });

  it("refuses a pooled string copied from production", () => {
    const problems = envProblems("test", { ...goodTest, DATABASE_URL_POOLED: prod.DATABASE_URL_POOLED }, prod);
    expect(problems).toContain(".env.test points at the same database as .env.local.");
    expect(problems).toContain("DATABASE_URL and DATABASE_URL_POOLED in .env.test reach different databases.");
  });

  it("refuses direct and pooled strings for different databases", () => {
    const problems = envProblems("test", { ...goodTest, DATABASE_URL_POOLED: url("ep-other-3", true) }, null);
    expect(problems).toEqual(["DATABASE_URL and DATABASE_URL_POOLED in .env.test reach different databases."]);
  });

  it("refuses a missing string, a missing branch name and a live APP_URL", () => {
    const problems = envProblems(
      "test",
      { ...goodTest, DATABASE_URL_POOLED: undefined, EXPECT_DB_BRANCH: "production", APP_URL: "https://example.com" },
      prod,
    );
    expect(problems).toEqual([
      "DATABASE_URL_POOLED in .env.test is missing or not a URL.",
      'EXPECT_DB_BRANCH in .env.test must be "test".',
      `APP_URL in .env.test must be ${TEST_APP_URL}.`,
    ]);
  });
});

describe("envProblems for .env.local", () => {
  it("has no test-only rules", () => {
    expect(envProblems("production", prod, goodTest)).toEqual([]);
  });

  it("refuses a production file that points at the test database", () => {
    expect(envProblems("production", goodTest, goodTest)).toContain(
      ".env.local points at the same database as .env.test.",
    );
  });
});

describe("parseTargetArgs", () => {
  it("needs --yes-production for production", () => {
    expect(() => parseTargetArgs(["--target", "production"])).toThrow(/--yes-production/);
    expect(parseTargetArgs(["--target", "test"])).toEqual({ target: "test", yesProduction: false });
  });
});
