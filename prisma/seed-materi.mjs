import "dotenv/config";

import pg from "pg";

import { seedMateriCatalogue } from "./materi-seed.mjs";

const { Client } = pg;

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required before running the Materi-only seed.");
  return databaseUrl;
}

function requireTutorEmail() {
  const email = process.env.MATERI_SEED_TUTOR_EMAIL?.trim();
  if (!email) throw new Error("MATERI_SEED_TUTOR_EMAIL is required and must identify an existing active tutor with an active tutor profile.");
  return email;
}

async function resolveActiveTutor(client, email) {
  const result = await client.query(
    `
      SELECT users.id
      FROM users
      JOIN role_assignments
        ON role_assignments.user_id = users.id
        AND role_assignments.role = 'tutor'
        AND role_assignments.revoked_at IS NULL
      JOIN tutor_profiles
        ON tutor_profiles.user_id = users.id
        AND tutor_profiles.is_active = TRUE
      WHERE LOWER(users.email) = LOWER($1)
        AND users.status = 'active'
      LIMIT 1
      FOR UPDATE OF users, role_assignments, tutor_profiles
    `,
    [email],
  );
  if (!result.rowCount) {
    throw new Error(`MATERI_SEED_TUTOR_EMAIL must identify an existing active tutor with an active tutor role assignment and active tutor profile: ${email}`);
  }
  return result.rows[0].id;
}

async function main() {
  const tutorEmail = requireTutorEmail();
  const client = new Client({ connectionString: requireDatabaseUrl() });
  await client.connect();

  let transactionStarted = false;
  try {
    await client.query("BEGIN");
    transactionStarted = true;
    // Lock every row that proves the attribution is active before any Materi write.
    const tutorId = await resolveActiveTutor(client, tutorEmail);
    await seedMateriCatalogue(client, { authorUserId: tutorId });
    await client.query("COMMIT");
    transactionStarted = false;
    console.log(`Materi-only seed completed using existing tutor ${tutorEmail}.`);
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to seed the Materi catalogue.");
  console.error(error);
  process.exitCode = 1;
});
