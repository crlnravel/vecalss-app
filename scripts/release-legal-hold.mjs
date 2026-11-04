#!/usr/bin/env node
/**
 * Releases a legal hold. The owner runs this with the owner's database login;
 * the app cannot release a hold (MS-19 C-01).
 *
 *   pnpm retention:release-hold -- --hold <hold id> --reason "<why, 10 to 500 characters>"
 *
 * It connects with MIGRATE_DATABASE_URL (else DATABASE_URL), records
 * FRAUD_OWNER_EMAIL's account as the one who released it, writes an audit row,
 * and refuses when the connected role is the application's runtime role.
 * The release is one-way: a released hold is never reopened, place a new one.
 */
import "dotenv/config";

import pg from "pg";

import { ReleaseHoldError, releaseHoldAsOwner } from "../lib/retention/release-hold.mjs";

const { Client } = pg;

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const name = argument.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value.`);
    values[name] = value;
    index += 1;
  }
  return values;
}

async function main() {
  const values = parseArguments(process.argv.slice(2));
  if (!values.hold) throw new Error("Pass --hold <hold id>.");
  if (!values.reason) throw new Error("Pass --reason with a written reason (10 to 500 characters).");
  const url = (process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (!url) throw new Error("Set MIGRATE_DATABASE_URL or DATABASE_URL to the schema owner's connection string.");

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const released = await releaseHoldAsOwner(client, {
      holdId: values.hold,
      ownerEmail: process.env.FRAUD_OWNER_EMAIL,
      reason: values.reason,
    });
    console.log(`Released the ${released.scope} hold ${released.holdId}. The audit log has the entry.`);
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof ReleaseHoldError || error instanceof Error ? error.message : "Unknown error.");
  process.exitCode = 1;
});
