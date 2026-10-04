import "dotenv/config";

import pg from "pg";
import {
  cleanStagingDatabase,
  ensureCanonicalSubtests,
  seedMentors,
} from "./seed-mentors.mjs";
import { seedCoreAccounts } from "./seed-core-accounts.mjs";

const { Client } = pg;

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before running the staging seed script.");
  }

  return databaseUrl;
}

export async function seedStaging(client, options = {}) {
  const clean =
    options.clean ??
    (process.argv.includes("--clean") || process.env.SEED_CLEAN === "1");

  if (clean) {
    console.log("Cleaning all application tables for staging (preserving migrations & taxonomy)...");
    await cleanStagingDatabase(client);
  }

  console.log("Ensuring canonical subtests taxonomy...");
  await ensureCanonicalSubtests(client);

  console.log("Seeding core accounts & reference taxonomy...");
  const core = await seedCoreAccounts(client);

  console.log("Seeding mentor accounts...");
  const mentors = await seedMentors(client);

  const allAccounts = [
    ...core.seededAccounts.map((a) => ({
      email: a.email,
      fullName: a.fullName,
      loginPath: a.loginPath,
      mustChangePassword: a.mustChangePassword,
      role: a.role,
      temporaryPassword: a.password,
    })),
    ...mentors.map((m) => ({
      email: m.email,
      fullName: m.fullName,
      loginPath: m.loginPath,
      mustChangePassword: m.mustChangePassword,
      role: m.role,
      temporaryPassword: m.temporaryPassword,
    })),
  ];

  return allAccounts;
}

async function main() {
  const client = new Client({ connectionString: requireDatabaseUrl() });
  await client.connect();

  try {
    await client.query("BEGIN");
    const seeded = await seedStaging(client);
    await client.query("COMMIT");

    console.log(`\nSuccessfully seeded ${seeded.length} accounts on staging (all content/activity tables empty):\n`);
    console.table(
      seeded.map((m) => ({
        "Full Name": m.fullName,
        Email: m.email,
        Role: m.role,
        "Password / Temp Password": m.temporaryPassword,
        "Must Change Password": m.mustChangePassword ? "YES" : "NO",
        "Login Path": m.loginPath,
      })),
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^[./]+/, ""))) {
  main().catch((error) => {
    console.error("Failed to seed staging database.");
    console.error(error);
    process.exitCode = 1;
  });
}
