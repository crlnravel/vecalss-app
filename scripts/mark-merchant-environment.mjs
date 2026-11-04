#!/usr/bin/env node
/**
 * Marks the connected database as the merchant environment. The owner runs it
 * once, at go-live:
 *
 *   pnpm env:mark-merchant -- --database <database name> --note "<why>" --yes
 *
 * After this, db:reset, db:seed, the seed scripts and the cleanup scripts refuse
 * to run against the database. The mark is a single append-only row; it cannot be
 * changed or removed through the application or the runtime role. Removing it is
 * a deliberate database-owner act (see docs/payments.md) and is not offered here.
 *
 * It runs as the schema owner (MIGRATE_DATABASE_URL, else DATABASE_URL), and
 * --database must match the name of the database it will mark, so it cannot be
 * pointed at the wrong one by accident. Without --yes it only says what it would do.
 */
import "dotenv/config";

import { userInfo } from "node:os";

import pg from "pg";

const { Client } = pg;

function parseArguments(argv) {
  const values = {};
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
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

async function main() {
  const { flags, values } = parseArguments(process.argv.slice(2));
  const url = (process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (!url) throw new Error("Set MIGRATE_DATABASE_URL or DATABASE_URL to the schema owner's connection string.");

  const databaseName = new URL(url).pathname.slice(1);
  if (values.database !== databaseName) {
    throw new Error(`--database must be "${databaseName}", the name of the database this would mark.`);
  }
  const note = (values.note ?? "").trim();
  if (note.length < 10 || note.length > 500) throw new Error("--note needs a reason of 10 to 500 characters.");

  console.log(`Will mark database "${databaseName}" on host "${new URL(url).hostname}" as the merchant environment.`);
  if (!flags.has("yes")) {
    console.log("Dry run: nothing was changed. Add --yes to apply.");
    return;
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const result = await client.query(
      "INSERT INTO environment_marks (id, environment, marked_by, note) VALUES (1, 'merchant', $1, $2) ON CONFLICT (id) DO NOTHING",
      [`${userInfo().username}@operator`.slice(0, 120), note],
    );
    console.log(result.rowCount === 1 ? "Marked. Resets, seeds and cleanups now refuse here." : "Already marked; nothing changed.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown error.");
  process.exitCode = 1;
});
