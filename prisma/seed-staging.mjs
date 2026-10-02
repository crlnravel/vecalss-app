import "dotenv/config";

import pg from "pg";
import {
  cleanStagingDatabase,
  ensureCanonicalSubtests,
  seedMentors,
} from "./seed-mentors.mjs";

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

  console.log("Seeding mentor accounts...");
  const seeded = await seedMentors(client);

  return seeded;
}

async function main() {
  const client = new Client({ connectionString: requireDatabaseUrl() });
  await client.connect();

  try {
    await client.query("BEGIN");
    const seeded = await seedStaging(client);
    await client.query("COMMIT");

    console.log(`\nSuccessfully seeded ${seeded.length} mentor accounts on staging (all other tables empty):\n`);
    console.table(
      seeded.map((m) => ({
        "Full Name": m.fullName,
        Email: m.email,
        Role: m.role,
        "Temporary Password": m.temporaryPassword,
        "Must Change Password": m.mustChangePassword ? "YES (First Login)" : "NO",
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
