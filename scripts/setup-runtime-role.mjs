#!/usr/bin/env node
/**
 * Creates the application's restricted database login (MS-10). Run by the
 * database owner, once per environment, and again to rotate the password.
 *
 *   RUNTIME_DB_PASSWORD='<a long random password>' \
 *     node scripts/setup-runtime-role.mjs --login vecalss_app --yes
 *
 * It connects with MIGRATE_DATABASE_URL (or DATABASE_URL), as the schema owner,
 * and is safe to run twice:
 *
 *   1. Creates the NOLOGIN roles vecalss_retention and vecalss_runtime when they
 *      are missing. The migration needs them; they hold no password.
 *   2. Creates the login role (or sets a new password on it) and makes it a
 *      member of vecalss_runtime. It gets no other privilege: it is not a
 *      superuser, owns nothing, and cannot create objects.
 *      A login that already exists is checked first (MS-19): if it is a member
 *      of any other role (above all vecalss_retention) or owns anything, the
 *      script lists that and changes nothing. --revoke-extra removes extra
 *      role memberships; it never moves ownership.
 *   3. Connects as the login and runs retention_role_check(); the script
 *      reports success only when that passes (before the migration exists the
 *      check cannot run, and it says so: run it again after migrating).
 *   4. Prints the connection string with the password left out. Put the
 *      password into Vercel's DATABASE_URL yourself.
 *
 * The password is read only from RUNTIME_DB_PASSWORD, never from the command
 * line, and is never printed. Without --yes the script only says what it would
 * do. This script is not part of a migration on purpose: a migration must not
 * carry a password.
 */
import "dotenv/config";

import { provisionRuntimeLogin, SetupError } from "../lib/retention/runtime-login.mjs";

const LOGIN_PATTERN = /^[a-z][a-z0-9_]{2,40}$/u;
const RESERVED = new Set(["vecalss_retention", "vecalss_runtime", "postgres"]);

function parseArguments(argv) {
  const values = {};
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const name = argument.slice(2);
    if (name === "yes" || name === "revoke-extra") {
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
  const login = values.login ?? "vecalss_app";
  if (!LOGIN_PATTERN.test(login) || RESERVED.has(login)) {
    throw new Error("--login must be a lowercase role name (letters, digits and underscores), not one of the reserved roles.");
  }

  const ownerUrl = (process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (!ownerUrl) throw new Error("Set MIGRATE_DATABASE_URL or DATABASE_URL to the schema owner's connection string.");

  const password = process.env.RUNTIME_DB_PASSWORD ?? "";
  if (password.length < 24) {
    throw new Error("Set RUNTIME_DB_PASSWORD to a random password of at least 24 characters. It is not read from the command line.");
  }

  const url = new URL(ownerUrl);
  console.log(`Target: database "${url.pathname.slice(1)}" on host "${url.hostname}", as the schema owner.`);
  console.log(`Login role: ${login} (member of vecalss_runtime only).`);

  if (!flags.has("yes")) {
    console.log("Dry run: nothing was changed. Add --yes to apply.");
    return;
  }

  const result = await provisionRuntimeLogin({
    log: (line) => console.log(line),
    login,
    ownerUrl,
    password,
    revokeExtra: flags.has("revoke-extra"),
  });
  if (result.check.pending) {
    console.log("The runtime-role check does not exist yet (the migrations are not applied). Apply them, then run this again to confirm the login passes.");
  } else {
    console.log("The runtime-role check passed for this login.");
  }

  const runtimeUrl = new URL(ownerUrl);
  runtimeUrl.username = login;
  runtimeUrl.password = "";
  console.log("");
  console.log("Next: apply the migrations as the owner, then set the application's DATABASE_URL to this,");
  console.log("with the password you chose filled in (do not paste it into chat or tickets):");
  console.log(`  ${runtimeUrl.toString().replace("//" + login + "@", "//" + login + ":<password>@")}`);
  console.log("Keep MIGRATE_DATABASE_URL on the owner's connection string for `prisma migrate deploy`.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Unknown error.");
  if (error instanceof SetupError) for (const finding of error.findings) console.error(`  - ${finding}`);
  process.exitCode = 1;
});
