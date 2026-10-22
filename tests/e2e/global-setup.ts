// Playwright's global setup (IMPLEMENTATION_PLAN.md §2, §8). In this order, and the run
// stops at the first failure, before any test:
// 1. `.env.test` passes `envProblems` (no string that reaches production's database).
// 2. `app_meta.db_branch` is `test` over both the direct and the pooled connection.
// 3. Port 3100 is free (so the tests can't reach some other server).
// 4. `next build` into `.next-test`, skipped when the sources hash the same as last time.
// 5. `next start` on 3100 with only `.env.test` (`.env.local` is never read), where
//    `src/instrumentation.ts` checks the branch again before the server answers.
// The returned teardown stops that server (by its process group) when the run ends.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { drizzle as drizzleHttp } from "drizzle-orm/neon-http";
import { createScriptDb } from "../../src/db";
import { readDbBranch } from "../../src/db/meta";
import { ENV_FILES, readEnvFile, readTargetEnv, TEST_APP_URL } from "../../scripts/lib/target";

const DIST_DIR = ".next-test";
const NEXT_BIN = "node_modules/.bin/next";
const PORT = Number(new URL(TEST_APP_URL).port);
const HASH_FILE = `${DIST_DIR}/source.hash`;
const SERVER_LOG = `${DIST_DIR}/server.log`;
// What the test build is made from. Data files count because pages are prerendered from the
// database the seed fills from them.
const BUILD_INPUTS = [
  "src",
  "public",
  "data",
  "next.config.ts",
  "postcss.config.mjs",
  "tsconfig.json",
  "package.json",
  "package-lock.json",
  ENV_FILES.test,
];

async function checkBranches(env: Record<string, string>) {
  const direct = createScriptDb(env.DATABASE_URL);
  const branches = await Promise.all([
    readDbBranch(direct.db).finally(() => direct.close()),
    readDbBranch(drizzleHttp(env.DATABASE_URL_POOLED)),
  ]);
  if (branches.some((b) => b !== "test")) {
    throw new Error(
      `End-to-end tests need the test branch, but app_meta.db_branch reads ${JSON.stringify(branches)} (direct, pooled). Stopping.`,
    );
  }
}

async function checkPortFree() {
  await new Promise<void>((resolve, reject) => {
    const probe = createServer()
      .once("error", () =>
        reject(new Error(`Port ${PORT} is in use. Stop whatever holds it; the tests won't run against another server.`)),
      )
      .once("listening", () => probe.close(() => resolve()))
      .listen(PORT);
  });
}

function sourceHash(): string {
  const listed = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "--", ...BUILD_INPUTS], {
    encoding: "utf8",
  });
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr}`);
  const hash = createHash("sha256");
  // `.env.test` is gitignored, so git never lists it; hash it by name.
  const files = [...new Set([...listed.stdout.split("\n").filter(Boolean), ENV_FILES.test])].sort();
  for (const file of files) {
    if (!existsSync(file)) continue;
    hash.update(file).update("\0").update(readFileSync(file)).update("\0");
  }
  return hash.digest("hex");
}

/**
 * The environment for `next build` and `next start`: `.env.test`, every name `.env.local`
 * sets blanked (Next never overrides a variable that is already set, even to ""), and
 * Next's own env-file loading switched off.
 */
function serverEnv(testEnv: Record<string, string>): NodeJS.ProcessEnv {
  const blanks = existsSync(ENV_FILES.production)
    ? Object.fromEntries(Object.keys(readEnvFile(ENV_FILES.production)).map((k) => [k, ""]))
    : {};
  return {
    ...process.env,
    ...blanks,
    ...testEnv,
    NODE_ENV: "production",
    NEXT_DIST_DIR: DIST_DIR,
    NEXT_TELEMETRY_DISABLED: "1",
    __NEXT_PROCESSED_ENV: "true",
  };
}

function buildIfChanged(env: NodeJS.ProcessEnv) {
  const hash = sourceHash();
  const built = existsSync(`${DIST_DIR}/BUILD_ID`) && existsSync(HASH_FILE);
  if (built && readFileSync(HASH_FILE, "utf8") === hash) {
    console.log(`[e2e] ${DIST_DIR} is up to date; skipping the build.`);
    return;
  }
  console.log(`[e2e] Building into ${DIST_DIR}…`);
  // `next build` points `next-env.d.ts` at its own folder; keep the tracked file as it is.
  const nextEnvTypes = readFileSync("next-env.d.ts");
  const result = spawnSync(NEXT_BIN, ["build"], { env, stdio: "inherit" });
  writeFileSync("next-env.d.ts", nextEnvTypes);
  if (result.status !== 0) throw new Error(`next build failed (exit ${result.status}).`);
  writeFileSync(HASH_FILE, hash);
}

async function startServer(env: NodeJS.ProcessEnv): Promise<ChildProcess> {
  mkdirSync(DIST_DIR, { recursive: true });
  const log = openSync(SERVER_LOG, "w");
  const server = spawn(NEXT_BIN, ["start", "--port", String(PORT)], {
    env,
    detached: true,
    stdio: ["ignore", log, log],
  });
  let exited: number | null | undefined;
  server.once("exit", (code) => (exited = code));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (exited !== undefined) {
      throw new Error(`The test server stopped (exit ${exited}) before answering:\n${readFileSync(SERVER_LOG, "utf8")}`);
    }
    try {
      const response = await fetch(TEST_APP_URL);
      if (response.ok) return server;
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  stopServer(server);
  throw new Error(`The test server didn't answer on ${TEST_APP_URL} within 60 s. Log: ${SERVER_LOG}`);
}

function stopServer(server: ChildProcess) {
  if (server.pid === undefined || server.exitCode !== null) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    // Already gone.
  }
}

export default async function globalSetup() {
  const testEnv = readTargetEnv("test");
  await checkBranches(testEnv);
  // Tests that reset marks read the same env.
  Object.assign(process.env, testEnv);
  await checkPortFree();

  const env = serverEnv(testEnv);
  buildIfChanged(env);
  const server = await startServer(env);
  console.log(`[e2e] Test server on ${TEST_APP_URL} (pid ${server.pid}).`);

  return async () => {
    stopServer(server);
    await new Promise<void>((resolve) => {
      if (server.exitCode !== null || server.signalCode !== null) return resolve();
      const force = setTimeout(() => {
        try {
          process.kill(-server.pid!, "SIGKILL");
        } catch {
          // Already gone.
        }
      }, 5_000);
      server.once("exit", () => {
        clearTimeout(force);
        resolve();
      });
    });
  };
}
