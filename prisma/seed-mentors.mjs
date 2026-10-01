import "dotenv/config";

import bcrypt from "bcryptjs";
import pg from "pg";

const { Client } = pg;

export const FIRST_LOGIN_TUTOR_PASSWORD =
  process.env.SEED_FIRST_LOGIN_TUTOR_PASSWORD?.trim() || "TempTutor123!";

export const FIRST_LOGIN_TUTORS = [
  { email: "davinaadindaui@gmail.com", fullName: "Davina" },
  { email: "efatyas01@gmail.com", fullName: "Efaphras" },
  { email: "nauvferry@gmail.com", fullName: "Nauval" },
  { email: "nicholassaputratjandra@gmail.com", fullName: "Nicho" },
  { email: "berliantheresiart@gmail.com", fullName: "Berli" },
  { email: "carleanoravel@gmail.com", fullName: "Carleano" },
];

export const CANONICAL_SUBTESTS = [
  { code: "PU", name: "Penalaran Umum", sortOrder: 1 },
  { code: "PPU", name: "Pengetahuan dan Pemahaman Umum", sortOrder: 2 },
  { code: "PBM", name: "Pemahaman Bacaan dan Menulis", sortOrder: 3 },
  { code: "PK", name: "Pengetahuan Kuantitatif", sortOrder: 4 },
  { code: "LBI", name: "Literasi Bahasa Indonesia", sortOrder: 5 },
  { code: "LBE", name: "Literasi Bahasa Inggris", sortOrder: 6 },
  { code: "PM", name: "Penalaran Matematika", sortOrder: 7 },
];

export async function ensureCanonicalSubtests(client) {
  for (const s of CANONICAL_SUBTESTS) {
    await client.query(
      `
        INSERT INTO subtests (code, name, description, sort_order, is_active)
        VALUES ($1, $2, $3, $4, TRUE)
        ON CONFLICT (code)
        DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          sort_order = EXCLUDED.sort_order,
          is_active = TRUE
      `,
      [s.code, s.name, s.name, s.sortOrder],
    );
  }
}

export async function cleanStagingDatabase(client) {
  const tablesResult = await client.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations', 'subtests')
    ORDER BY tablename
  `);

  if (tablesResult.rows.length === 0) return;

  const tableList = tablesResult.rows
    .map((r) => `"${r.tablename.replace(/"/g, '""')}"`)
    .join(", ");

  await client.query("ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_immutable;");
  await client.query("ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_truncate_immutable;");
  try {
    await client.query(`TRUNCATE TABLE ${tableList} CASCADE;`);
  } finally {
    await client.query("ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_immutable;");
    await client.query("ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_truncate_immutable;");
  }
}

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before running the seed script.");
  }

  return databaseUrl;
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function upsertMentorUser(client, { email, fullName, passwordHash }) {
  const normalizedEmail = email.trim().toLowerCase();
  const result = await client.query(
    `
      INSERT INTO users (
        email,
        full_name,
        password_hash,
        password_updated_at,
        must_change_password,
        status
      )
      VALUES ($1, $2, $3, NULL, TRUE, 'active')
      ON CONFLICT (email)
      DO UPDATE
        SET full_name = EXCLUDED.full_name,
            failed_login_count = 0,
            locked_until = NULL,
            must_change_password = TRUE,
            password_hash = EXCLUDED.password_hash,
            password_updated_at = NULL,
            soft_deleted_at = NULL,
            status = 'active',
            updated_at = NOW()
      RETURNING id
    `,
    [normalizedEmail, fullName, passwordHash],
  );

  const userId = result.rows[0].id;

  // Revoke any active auth sessions so stale sessions do not persist
  await client.query(
    `
      UPDATE auth_sessions
      SET status = 'revoked',
          revoked_at = NOW()
      WHERE user_id = $1::uuid
        AND status = 'active'
    `,
    [userId],
  );

  return userId;
}

async function ensureRoleAssignment(client, { assignedByUserId = null, role, userId }) {
  const existing = await client.query(
    `
      SELECT id
      FROM role_assignments
      WHERE user_id = $1::uuid
        AND role = $2
        AND revoked_at IS NULL
      LIMIT 1
    `,
    [userId, role],
  );

  if (existing.rowCount) {
    return existing.rows[0].id;
  }

  const created = await client.query(
    `
      INSERT INTO role_assignments (user_id, role, assigned_by_user_id)
      VALUES ($1::uuid, $2, $3::uuid)
      RETURNING id
    `,
    [userId, role, assignedByUserId],
  );

  return created.rows[0].id;
}

async function ensureNotificationPreference(client, userId) {
  await client.query(
    `
      INSERT INTO notification_preferences (user_id)
      VALUES ($1::uuid)
      ON CONFLICT (user_id)
      DO NOTHING
    `,
    [userId],
  );
}

async function upsertTutorProfile(client, { bio = null, headline = null, userId }) {
  await client.query(
    `
      INSERT INTO tutor_profiles (
        user_id,
        headline,
        bio,
        is_active
      )
      VALUES ($1::uuid, $2, $3, TRUE)
      ON CONFLICT (user_id)
      DO UPDATE
        SET bio = COALESCE(EXCLUDED.bio, tutor_profiles.bio),
            headline = COALESCE(EXCLUDED.headline, tutor_profiles.headline),
            is_active = TRUE,
            updated_at = NOW()
    `,
    [userId, headline, bio],
  );
}

async function ensureTutorCohortAssignment(client, { assignedByUserId = null, cohortId, tutorId }) {
  const existing = await client.query(
    `
      SELECT id
      FROM tutor_cohort_assignments
      WHERE cohort_id = $1::uuid
        AND tutor_id = $2::uuid
        AND revoked_at IS NULL
      LIMIT 1
    `,
    [cohortId, tutorId],
  );

  if (existing.rowCount) {
    return existing.rows[0].id;
  }

  const created = await client.query(
    `
      INSERT INTO tutor_cohort_assignments (
        tutor_id,
        cohort_id,
        assigned_by_user_id
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid)
      RETURNING id
    `,
    [tutorId, cohortId, assignedByUserId],
  );

  return created.rows[0].id;
}

export async function seedMentors(client) {
  // Find admin user to act as assigner for role assignments
  const adminResult = await client.query(
    `
      SELECT id
      FROM users
      WHERE email = 'admin@vecalss.local'
      LIMIT 1
    `,
  );
  const adminUserId = adminResult.rows[0]?.id ?? null;

  // Find active cohort if one exists
  const cohortResult = await client.query(
    `
      SELECT id
      FROM cohorts
      ORDER BY created_at DESC
      LIMIT 1
    `,
  );
  const cohortId = cohortResult.rows[0]?.id ?? null;

  const passwordHash = await hashPassword(FIRST_LOGIN_TUTOR_PASSWORD);
  const seededMentors = [];

  for (const mentor of FIRST_LOGIN_TUTORS) {
    const userId = await upsertMentorUser(client, {
      email: mentor.email,
      fullName: mentor.fullName,
      passwordHash,
    });

    await ensureRoleAssignment(client, {
      assignedByUserId: adminUserId,
      role: "tutor",
      userId,
    });

    await ensureNotificationPreference(client, userId);

    await upsertTutorProfile(client, {
      userId,
    });

    if (cohortId) {
      await ensureTutorCohortAssignment(client, {
        assignedByUserId: adminUserId,
        cohortId,
        tutorId: userId,
      });
    }

    seededMentors.push({
      email: mentor.email.toLowerCase(),
      fullName: mentor.fullName,
      id: userId,
      loginPath: "/login",
      mustChangePassword: true,
      role: "tutor",
      temporaryPassword: FIRST_LOGIN_TUTOR_PASSWORD,
    });
  }

  return seededMentors;
}

async function main() {
  const client = new Client({ connectionString: requireDatabaseUrl() });
  await client.connect();

  try {
    await client.query("BEGIN");
    const seeded = await seedMentors(client);
    await client.query("COMMIT");

    console.log(`\nSuccessfully seeded ${seeded.length} mentor accounts:\n`);
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
    console.error("Failed to seed mentor accounts.");
    console.error(error);
    process.exitCode = 1;
  });
}
