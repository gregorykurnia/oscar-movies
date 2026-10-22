// `--target test|production` for every script that writes (IMPLEMENTATION_PLAN.md §2): the
// target picks the env file, and `production` needs `--yes-production` as well.
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { isDbBranch, type DbBranch } from "../../src/db/meta";

export const ENV_FILES: Record<DbBranch, string> = {
  test: ".env.test",
  production: ".env.local",
};

export type TargetArgs = { target: DbBranch; yesProduction: boolean };

/** A script's own arguments on top of `--target` and `--yes-production`. */
export type ArgSpec = { flags?: string[]; values?: string[] };

/**
 * Stops on anything the script doesn't know, so a typo such as `--dryrun` never turns a dry
 * run into a real write, and a value can't be another flag (`--file --dry-run`).
 */
export function checkArgs(argv: string[], spec: ArgSpec = {}): void {
  const flags = ["--yes-production", ...(spec.flags ?? [])];
  const values = ["--target", ...(spec.values ?? [])];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (values.includes(arg)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} needs a value.`);
      i++;
    } else if (!flags.includes(arg)) {
      throw new Error(`Unknown argument ${JSON.stringify(arg)}. Nothing was written.`);
    }
  }
}

export function parseTargetArgs(argv: string[], spec?: ArgSpec): TargetArgs {
  checkArgs(argv, spec);
  const i = argv.indexOf("--target");
  const target = i >= 0 ? argv[i + 1] : undefined;
  if (!isDbBranch(target)) {
    throw new Error("Pass --target test or --target production.");
  }
  const yesProduction = argv.includes("--yes-production");
  if (target === "production" && !yesProduction) {
    throw new Error("Writing to production needs --yes-production as well.");
  }
  return { target, yesProduction };
}

export function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) throw new Error(`${path} is missing.`);
  return parseEnv(readFileSync(path, "utf8")) as Record<string, string>;
}

/**
 * The Neon endpoint a connection string reaches: the host's first label without `-pooler`,
 * so a branch's direct and pooled strings give the same answer. Null when it isn't a URL.
 */
export function endpointOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.split(".")[0].replace(/-pooler$/, "");
  } catch {
    return null;
  }
}

const DB_URL_KEYS = ["DATABASE_URL", "DATABASE_URL_POOLED"] as const;

/**
 * What is wrong with a target's env file, given the other target's (null when that file is
 * missing). Empty means it's safe to use. Never includes a connection string.
 */
export function envProblems(
  target: DbBranch,
  env: Record<string, string | undefined>,
  otherEnv: Record<string, string | undefined> | null,
): string[] {
  const file = ENV_FILES[target];
  const problems: string[] = [];
  const endpoints = DB_URL_KEYS.map((key) => {
    const endpoint = endpointOf(env[key]);
    if (!endpoint) problems.push(`${key} in ${file} is missing or not a URL.`);
    return endpoint;
  });
  if (endpoints[0] && endpoints[1] && endpoints[0] !== endpoints[1]) {
    problems.push(`DATABASE_URL and DATABASE_URL_POOLED in ${file} reach different databases.`);
  }
  if (otherEnv) {
    const other: DbBranch = target === "test" ? "production" : "test";
    const otherEndpoints = DB_URL_KEYS.map((key) => endpointOf(otherEnv[key]));
    if (endpoints.some((e) => e && otherEndpoints.includes(e))) {
      problems.push(`${file} points at the same database as ${ENV_FILES[other]}.`);
    }
  }
  if (target === "test") {
    if (env.EXPECT_DB_BRANCH !== "test") {
      problems.push(`EXPECT_DB_BRANCH in ${file} must be "test".`);
    }
    if (env.APP_URL !== TEST_APP_URL) {
      problems.push(`APP_URL in ${file} must be ${TEST_APP_URL}.`);
    }
  }
  return problems;
}

/** Where the end-to-end tests run the app (IMPLEMENTATION_PLAN.md §8). */
export const TEST_APP_URL = "http://localhost:3100";

/**
 * Reads the target's env file and refuses it when `envProblems` finds anything: above all,
 * a database string that reaches the other target's database, which would mean `.env.test`
 * points at production or the other way round.
 */
export function readTargetEnv(target: DbBranch): Record<string, string> {
  const env = readEnvFile(ENV_FILES[target]);
  const other: DbBranch = target === "test" ? "production" : "test";
  const otherEnv = existsSync(ENV_FILES[other]) ? readEnvFile(ENV_FILES[other]) : null;
  const problems = envProblems(target, env, otherEnv);
  if (problems.length > 0) {
    throw new Error(`Refusing ${ENV_FILES[target]}. Fix the env file first:\n- ${problems.join("\n- ")}`);
  }
  return env;
}

/** `readTargetEnv`, then loads the values into `process.env` (they win over the shell's). */
export function loadTargetEnv(target: DbBranch): void {
  Object.assign(process.env, readTargetEnv(target));
}
