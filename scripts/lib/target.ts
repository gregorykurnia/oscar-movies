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

export function parseTargetArgs(argv: string[]): TargetArgs {
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

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Loads the target's env file into `process.env` (its values win over the shell's) and
 * refuses when its database host is the same as the other target's, which would mean
 * `.env.test` points at production or the other way round.
 */
export function loadTargetEnv(target: DbBranch): void {
  const env = readEnvFile(ENV_FILES[target]);
  const host = hostOf(env.DATABASE_URL);
  if (!host) throw new Error(`DATABASE_URL in ${ENV_FILES[target]} is missing or not a URL.`);

  const other: DbBranch = target === "test" ? "production" : "test";
  if (existsSync(ENV_FILES[other])) {
    const otherHost = hostOf(readEnvFile(ENV_FILES[other]).DATABASE_URL);
    if (otherHost === host) {
      throw new Error(
        `${ENV_FILES[target]} and ${ENV_FILES[other]} point at the same database host. Fix the env files first.`,
      );
    }
  }
  Object.assign(process.env, env);
}
