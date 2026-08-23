import "dotenv/config";

import { pathToFileURL } from "node:url";
import pg from "pg";
import { seedQuestionBankOrganization } from "./question-bank-organization-seed.mjs";

const { Client } = pg;

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required before running the question-bank organization seed.");
  return databaseUrl;
}

async function resolveTutor(client) {
  const email = process.env.ASSESSMENT_SEED_TUTOR_EMAIL?.trim()
    || process.env.SEED_TUTOR_EMAIL?.trim()
    || "tutor@vecalss.local";
  const result = await client.query(
    `SELECT users.id
       FROM users
       JOIN role_assignments ON role_assignments.user_id = users.id
        AND role_assignments.role = 'tutor'
        AND role_assignments.revoked_at IS NULL
      WHERE LOWER(users.email) = LOWER($1)
        AND users.status = 'active'
      LIMIT 1`,
    [email],
  );
  if (!result.rowCount) throw new Error(`The organization seed requires an active tutor account for ${email}.`);
  return result.rows[0].id;
}

async function main() {
  const client = new Client({ connectionString: requireDatabaseUrl() });
  await client.connect();
  try {
    await client.query("BEGIN");
    const tutorId = await resolveTutor(client);
    const summary = await seedQuestionBankOrganization(client, { tutorId });
    await client.query("COMMIT");
    console.log(`Question-bank organization completed: ${summary.banksMoved} banks filed, ${summary.foldersCreated} folders created, ${summary.categoriesCreated} categories created, and ${summary.assignmentsCreated} category assignments added.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((error) => {
    console.error("Failed to seed the question-bank organization.");
    console.error(error);
    process.exitCode = 1;
  });
}

export { main };
