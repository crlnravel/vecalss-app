#!/usr/bin/env node
/**
 * Operator script for admin and developer two-step verification: first setup,
 * a lost phone, and the last admin. It is the only way to enroll or reset a
 * factor; there is no web route for it, and it needs access to the database.
 *
 *   node scripts/mfa-reset.mjs --email <address> --operator "<your name>" \
 *        --reason "<why>" [--ttl-minutes 30] --yes
 *
 * Without --yes it only prints what it would do and writes nothing.
 *
 * In one transaction it removes the account's factor and recovery codes, signs
 * the account out everywhere, voids any earlier setup code, issues a new
 * short-lived one-use setup code (stored only as a hash), and writes an audit
 * event naming the operator and the reason. A password reset never does this.
 */
import "dotenv/config";

import { hostname, userInfo } from "node:os";

import pg from "pg";

import {
  SETUP_CODE_TTL_MINUTES,
  generateOneUseCode,
  hashOneUseCode,
  normalizeOneUseCode,
} from "../lib/auth/mfa/codes.mjs";

const { Client } = pg;

function parseArguments(argv) {
  const values = {};
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const name = argument.slice(2);
    if (name === "yes") {
      flags.add(name);
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value.`);
    values[name] = value;
    index += 1;
  }
  return { flags, values };
}

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(
    'Usage: node scripts/mfa-reset.mjs --email <address> --operator "<your name>" --reason "<why>" [--ttl-minutes 30] --yes',
  );
  process.exit(message ? 2 : 0);
}

function describeDatabase(databaseUrl) {
  try {
    const url = new URL(databaseUrl);
    return `${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

export async function issueMfaSetupCode(client, { email, operator, reason, ttlMinutes = SETUP_CODE_TTL_MINUTES }) {
  await client.query("BEGIN");
  try {
    const users = await client.query(
      `SELECT id, email FROM users
       WHERE lower(email) = lower($1)
         AND status <> 'disabled' AND soft_deleted_at IS NULL AND preview_purpose IS NULL
       FOR UPDATE`,
      [email.trim()],
    );
    const user = users.rows[0];
    if (!user) throw new CliError("No active account with that email.");

    const roles = await client.query(
      `SELECT role FROM role_assignments
       WHERE user_id = $1 AND revoked_at IS NULL AND role IN ('admin', 'developer')`,
      [user.id],
    );
    if (!roles.rowCount) throw new CliError("That account is not an admin or developer, so it does not use two-step verification.");

    const hadFactor = (await client.query("SELECT 1 FROM user_mfa_factors WHERE user_id = $1", [user.id])).rowCount > 0;
    await client.query("DELETE FROM user_mfa_factors WHERE user_id = $1", [user.id]);

    const revoked = await client.query(
      `UPDATE auth_sessions SET status = 'revoked', revoked_at = NOW()
       WHERE user_id = $1 AND status = 'active'`,
      [user.id],
    );
    await client.query("UPDATE mfa_setup_codes SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL", [user.id]);
    await client.query("DELETE FROM mfa_failed_attempts WHERE user_id = $1", [user.id]);

    const setupCode = generateOneUseCode();
    const issued = await client.query(
      `INSERT INTO mfa_setup_codes (user_id, code_hash, issued_by, reason, expires_at)
       VALUES ($1, $2, $3, $4, NOW() + make_interval(mins => $5))
       RETURNING id, expires_at`,
      [user.id, hashOneUseCode(normalizeOneUseCode(setupCode)), operator, reason, ttlMinutes],
    );

    await client.query(
      `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, metadata)
       VALUES (NULL, 'auth.mfa.reset_by_operator', 'user', $1, $2::jsonb)`,
      [
        user.id,
        JSON.stringify({
          hadFactor,
          operator,
          operatingSystemUser: userInfo().username,
          operatorHost: hostname(),
          reason,
          revokedSessions: revoked.rowCount,
          roles: roles.rows.map((row) => row.role),
          setupCodeExpiresAt: issued.rows[0].expires_at.toISOString(),
          setupCodeId: issued.rows[0].id,
        }),
      ],
    );

    await client.query("COMMIT");
    return {
      email: user.email,
      expiresAt: issued.rows[0].expires_at,
      hadFactor,
      revokedSessions: revoked.rowCount,
      setupCode,
      userId: user.id,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

class CliError extends Error {}

async function main() {
  let parsed;
  try {
    parsed = parseArguments(process.argv.slice(2));
  } catch (error) {
    usage(error.message);
  }
  const { flags, values } = parsed;

  const email = values.email?.trim();
  const operator = values.operator?.trim();
  const reason = values.reason?.trim();
  const ttlMinutes = values["ttl-minutes"] ? Number(values["ttl-minutes"]) : SETUP_CODE_TTL_MINUTES;

  if (!email) usage("--email is required.");
  if (!operator || operator.length < 3 || operator.length > 160) usage("--operator must be your name (3 to 160 characters).");
  if (!reason || reason.length < 5 || reason.length > 500) usage("--reason must say why (5 to 500 characters).");
  if (!Number.isInteger(ttlMinutes) || ttlMinutes < 1 || ttlMinutes > 24 * 60) usage("--ttl-minutes must be a whole number between 1 and 1440.");

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) usage("DATABASE_URL is required (this script needs database access).");

  console.log(`Database: ${describeDatabase(databaseUrl)}`);
  console.log(`Account:  ${email}`);
  console.log(`Operator: ${operator}`);
  console.log(`Reason:   ${reason}`);

  if (!flags.has("yes")) {
    console.log("\nDry run: nothing was changed. Run again with --yes to remove the factor, sign the account out and issue a setup code.");
    process.exit(2);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await issueMfaSetupCode(client, { email, operator, reason, ttlMinutes });
    console.log(`\nDone. ${result.hadFactor ? "The old factor and its recovery codes were removed." : "The account had no factor."}`);
    console.log(`Signed out ${result.revokedSessions} session(s).`);
    console.log(`\nSetup code (shown once, valid until ${result.expiresAt.toISOString()}, one use):\n\n  ${result.setupCode}\n`);
    console.log("Give it to the account owner. They sign in with their password, then enter it on the verification screen.");
  } finally {
    await client.end();
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main().catch((error) => {
    if (error instanceof CliError) {
      console.error(`Error: ${error.message}`);
      process.exit(3);
    }
    console.error(error);
    process.exit(1);
  });
}
