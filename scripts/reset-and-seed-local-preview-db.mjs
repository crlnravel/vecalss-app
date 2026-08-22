import "dotenv/config";

import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const CONFIRMATION = "RESET_LOCAL_PREVIEW_DB";
const ALLOWED_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const ALLOWED_PORT = "55432";
const ALLOWED_DATABASE = "vecalss_preview_test";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(args) {
  const options = { confirmation: null, databaseUrl: null, dryRun: false };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (argument.startsWith("--confirm=")) {
      options.confirmation = argument.slice("--confirm=".length);
      continue;
    }
    if (argument === "--confirm" && args[index + 1]) {
      options.confirmation = args[++index];
      continue;
    }
    if (argument.startsWith("--database-url=")) {
      options.databaseUrl = argument.slice("--database-url=".length);
      continue;
    }
    if (argument === "--database-url" && args[index + 1]) {
      options.databaseUrl = args[++index];
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${argument}`);
  }

  return options;
}

function resolveDatabaseUrl(explicitUrl) {
  const value = (explicitUrl || process.env.PREVIEW_TEST_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (!value) throw new Error("Set PREVIEW_TEST_DATABASE_URL to the local preview database URL before running this script.");

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("The preview database URL is not valid.");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
  if (!(parsed.protocol === "postgres:" || parsed.protocol === "postgresql:")) {
    throw new Error("Refusing to reset a non-PostgreSQL database URL.");
  }
  if (!ALLOWED_HOSTNAMES.has(parsed.hostname)) {
    throw new Error("Refusing to reset a non-local database host.");
  }
  if (parsed.port !== ALLOWED_PORT) {
    throw new Error(`Refusing to reset a database outside local port ${ALLOWED_PORT}.`);
  }
  if (databaseName !== ALLOWED_DATABASE) {
    throw new Error(`Refusing to reset database ${databaseName || "<empty>"}; expected ${ALLOWED_DATABASE}.`);
  }

  return { parsed, value };
}

function displayTarget(parsed) {
  return `${parsed.protocol}//${parsed.hostname}:${parsed.port}/${decodeURIComponent(parsed.pathname.slice(1))}`;
}

function run(command, args, env) {
  const executable = process.platform === "win32" && command === "pnpm" ? "pnpm.cmd" : command;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: REPO_ROOT,
      env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${command} was terminated by ${signal}.`));
      else if (code !== 0) reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
      else resolve();
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = resolveDatabaseUrl(options.databaseUrl);

  console.log(`Target: ${displayTarget(target.parsed)}`);
  console.log("This guard allows only the local seeded preview database.");

  if (options.dryRun) {
    console.log("Dry run only; no reset or seed was executed.");
    return;
  }

  if (options.confirmation !== CONFIRMATION) {
    throw new Error(`Destructive reset blocked. Re-run with --confirm=${CONFIRMATION}.`);
  }

  const env = { ...process.env, DATABASE_URL: target.value };
  console.warn("Resetting the local preview database and reseeding demo data...");
  await run("pnpm", ["exec", "prisma", "migrate", "reset", "--force"], env);
  await run(process.execPath, [path.join(REPO_ROOT, "prisma", "seed.mjs")], env);
  console.log("Local preview database reset and seed completed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
