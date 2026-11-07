/**
 * The seeded admin account gets a fixed, publicly documented test
 * authenticator secret so agents and QA can still sign in. Like the default
 * seed passwords, it is only acceptable against a database on this machine:
 * anywhere else the seed enrolls nothing, and the account is enrolled with the
 * operator script (scripts/mfa-reset.mjs) like every real account. There is no
 * setting that turns the second factor off.
 */
import { randomUUID } from "node:crypto";

import { hashOneUseCode, normalizeOneUseCode } from "../lib/auth/mfa/codes.mjs";
import { loadMfaKeyRing, sealMfaSecret } from "../lib/auth/mfa/secret-envelope.mjs";
import { isLocalDatabaseUrl } from "./seed-password-policy.mjs";

/** Base32 test secret, valid only on a local database. Documented in docs/agent-app-testing-guide.md. */
export const SEED_MFA_TEST_SECRET = "KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD";

/** Fixed recovery codes for the seeded accounts, local database only. */
export const SEED_MFA_RECOVERY_CODES = Array.from({ length: 10 }, (_, index) => `RC0${index}-SEED-TEST`);

export function isSeedMfaAllowed(env = process.env) {
  return env.NODE_ENV !== "production" && isLocalDatabaseUrl(env.DATABASE_URL?.trim());
}

/**
 * Throws unless the fixed test secret may be used. Same rule as the default
 * seed passwords: a local DATABASE_URL and not production.
 */
export function assertSeedMfaAllowed(env = process.env) {
  if (!isSeedMfaAllowed(env)) {
    throw new Error(
      "Refusing to use the fixed MFA test secret: it is only allowed against a database on this machine (NODE_ENV is not production and DATABASE_URL points at localhost).",
    );
  }
}

/**
 * Enrolls the fixed test factor for the seeded admin. Returns false
 * (and enrolls nothing) when the database is not local or no MFA key ring is
 * configured, so a shared or staging seed never plants a known secret.
 */
export async function ensureSeedMfaFactor(client, userId, env = process.env) {
  if (!isSeedMfaAllowed(env)) return false;

  let keyRing;
  try {
    keyRing = loadMfaKeyRing(env);
  } catch (error) {
    console.warn(
      `[seed] MFA test factor not enrolled for ${userId}: ${error instanceof Error ? error.message : error}. Set MFA_KEY_RING and MFA_ACTIVE_KEY_ID (see .env.example) and seed again; admin sign-in stays closed until then.`,
    );
    return false;
  }

  const factorId = randomUUID();
  const envelope = sealMfaSecret(SEED_MFA_TEST_SECRET, { factorId, userId }, keyRing);

  // Replace any earlier factor (and, through the cascade, its recovery codes);
  // sessions that were verified under it stop counting.
  await client.query("DELETE FROM user_mfa_factors WHERE user_id = $1", [userId]);
  await client.query(
    `INSERT INTO user_mfa_factors (id, user_id, secret_envelope, confirmed_at)
     VALUES ($1, $2, $3::jsonb, NOW())`,
    [factorId, userId, JSON.stringify(envelope)],
  );
  for (const code of SEED_MFA_RECOVERY_CODES) {
    await client.query("INSERT INTO mfa_recovery_codes (factor_id, code_hash) VALUES ($1, $2)", [
      factorId,
      hashOneUseCode(normalizeOneUseCode(code)),
    ]);
  }

  return true;
}
