/**
 * Demo seed accounts ship with well-known fallback passwords (they are listed
 * in the repository docs). Those fallbacks are only acceptable against a
 * database on this machine. Anywhere else the caller must supply an explicit
 * SEED_*_PASSWORD value, otherwise the seed stops instead of creating
 * accounts anyone could sign in to.
 */

import { PASSWORD_VIOLATION_MESSAGES, getPasswordViolation } from "../lib/auth/password-policy.mjs";

const LOCAL_DATABASE_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "[::1]",
  "host.docker.internal",
]);

function readDatabaseHostname(databaseUrl) {
  try {
    return new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isLocalDatabaseUrl(databaseUrl) {
  const hostname = databaseUrl ? readDatabaseHostname(databaseUrl) : null;
  return hostname !== null && LOCAL_DATABASE_HOSTS.has(hostname);
}

export function assertDefaultSeedPasswordsAllowed(
  envName,
  env = process.env,
) {
  if (env.NODE_ENV === "production") {
    throw new Error(
      `Refusing to use a default seed password for ${envName} when NODE_ENV=production. Set ${envName} explicitly.`,
    );
  }

  if (!isLocalDatabaseUrl(env.DATABASE_URL?.trim())) {
    throw new Error(
      `Refusing to use a default seed password for ${envName} because DATABASE_URL does not point at localhost. Set ${envName} (or the matching SEED_*_PASSWORD) explicitly.`,
    );
  }
}

/**
 * Seeded accounts follow the same password rule as every other account, so a
 * seed can never create a login the application would refuse. The message names
 * the setting and the rule, never the value.
 */
export function assertSeedPasswordCompliant(envName, password) {
  const violation = getPasswordViolation(password);
  if (violation) {
    throw new Error(`${envName} does not meet the password rule. ${PASSWORD_VIOLATION_MESSAGES[violation]}`);
  }

  return password;
}

/**
 * Resolve a seed account password. An explicit environment value always wins;
 * the well-known fallback is only returned for a local database.
 */
export function seedPassword(envName, fallback, env = process.env) {
  const configured = env[envName]?.trim();
  if (configured) {
    return assertSeedPasswordCompliant(envName, configured);
  }

  assertDefaultSeedPasswordsAllowed(envName, env);
  return assertSeedPasswordCompliant(envName, fallback);
}
