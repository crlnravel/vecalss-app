import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import pg from "pg";

/**
 * MS-23: the migration that retires the developer role. It runs inside a
 * transaction that is always rolled back, against a copy of the old state made
 * in that same transaction (PostgreSQL DDL is transactional), so it needs only
 * the local dev database and leaves nothing behind.
 *
 * It must turn a developer into an admin, keep their second factor, recovery
 * codes and session exactly as they were, leave audit_logs append-only, and
 * leave a database that cannot hold the developer role any more.
 */
if (!/@(127\.0\.0\.1|localhost):55432\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("test:remove-developer-role-migration only runs against the local dev database on 127.0.0.1:55432.");
}

const migrationDirectory = readdirSync(resolve(process.cwd(), "prisma/migrations")).find((name) => name.endsWith("_remove_developer_role"));
assert.ok(migrationDirectory, "the remove_developer_role migration exists");
const migrationFile = readFileSync(resolve(process.cwd(), "prisma/migrations", migrationDirectory, "migration.sql"), "utf8");
// The migration is its own transaction (Prisma does not wrap a script in one). Here it must run inside this
// test's transaction so the whole run can be rolled back, so the outer BEGIN and COMMIT are taken off.
assert.match(migrationFile, /^BEGIN;$/mu, "the migration runs as one transaction");
assert.match(migrationFile, /^COMMIT;\s*$/mu, "the migration commits once, at the end");
const migrationSql = migrationFile.replace(/^BEGIN;$/mu, "").replace(/^COMMIT;\s*$/mu, "");

const runId = randomUUID().slice(0, 8);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function insertUser(label: string) {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO users (email, full_name, password_hash, must_change_password)
     VALUES ($1, $2, 'fixture-hash', false) RETURNING id`,
    [`ms23-${label}-${runId}@vecalss.local`, `MS23 ${label}`],
  );
  return rows[0].id;
}

async function assign(userId: string, role: string, { revoked = false }: { revoked?: boolean } = {}) {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO role_assignments (user_id, role, assigned_at, revoked_at)
     VALUES ($1, $2::role_name, now() - interval '30 days', ${revoked ? "now() - interval '1 day'" : "NULL"}) RETURNING id`,
    [userId, role],
  );
  return rows[0].id;
}

async function rejects(sql: string, params: unknown[], pattern: RegExp, message: string) {
  await client.query("SAVEPOINT expected_error");
  await assert.rejects(client.query(sql, params), pattern, message);
  await client.query("ROLLBACK TO SAVEPOINT expected_error");
}

async function main() {
  await client.connect();
  try {
    await client.query("BEGIN");

    // The state before the migration: the enum still has developer.
    await client.query(`ALTER TYPE "role_name" RENAME TO "role_name_new"`);
    await client.query(`CREATE TYPE "role_name" AS ENUM ('student', 'tutor', 'admin', 'affiliator', 'developer')`);
    await client.query(`ALTER TABLE "role_assignments" ALTER COLUMN "role" TYPE "role_name" USING ("role"::text::"role_name")`);
    await client.query(`DROP TYPE "role_name_new"`);

    // A developer with an enrolled factor, recovery codes and a session that already passed the factor.
    const developerOnly = await insertUser("developer");
    const developerAssignment = await assign(developerOnly, "developer");
    const { rows: [factor] } = await client.query<{ id: string }>(
      `INSERT INTO user_mfa_factors (user_id, secret_envelope, confirmed_at, last_accepted_step)
       VALUES ($1, '{"v":1,"sealed":"fixture"}'::jsonb, now() - interval '10 days', 42) RETURNING id`,
      [developerOnly],
    );
    await client.query(
      `INSERT INTO mfa_recovery_codes (factor_id, code_hash) VALUES ($1, repeat('a', 64)), ($1, repeat('b', 64))`,
      [factor.id],
    );
    const { rows: [session] } = await client.query<{ id: string }>(
      `INSERT INTO auth_sessions (user_id, refresh_token_hash, expires_at, status, mfa_verified_at, mfa_factor_id)
       VALUES ($1, $2, now() + interval '1 hour', 'active', now() - interval '1 minute', $3) RETURNING id`,
      [developerOnly, `ms23-${runId}-session`, factor.id],
    );

    // A developer who is also an admin, a developer whose assignment was revoked (and who is a tutor), and bystanders.
    const both = await insertUser("both");
    const bothDeveloperAssignment = await assign(both, "developer");
    const bothAdminAssignment = await assign(both, "admin");
    const formerDeveloper = await insertUser("former");
    const formerDeveloperAssignment = await assign(formerDeveloper, "developer", { revoked: true });
    const formerTutorAssignment = await assign(formerDeveloper, "tutor");
    const adminOnly = await insertUser("admin");
    const adminAssignment = await assign(adminOnly, "admin");
    const studentOnly = await insertUser("student");
    const studentAssignment = await assign(studentOnly, "student");

    const snapshot = async () => {
      const factorRow = await client.query(`SELECT to_jsonb(f) AS row FROM user_mfa_factors f WHERE user_id = $1`, [developerOnly]);
      const codes = await client.query(`SELECT to_jsonb(c) AS row FROM mfa_recovery_codes c WHERE factor_id = $1 ORDER BY code_hash`, [factor.id]);
      const sessionRow = await client.query(`SELECT to_jsonb(s) AS row FROM auth_sessions s WHERE id = $1`, [session.id]);
      return { codes: codes.rows, factor: factorRow.rows, session: sessionRow.rows };
    };
    const before = await snapshot();
    const auditBefore = (await client.query<{ count: string }>(`SELECT count(*) FROM audit_logs`)).rows[0].count;
    assert.equal(before.factor.length, 1);
    assert.equal(before.codes.length, 2);

    await client.query(migrationSql);

    // The converted developer is an admin, on the same assignment (same id, same grant time).
    const converted = await client.query(
      `SELECT id, role::text AS role, revoked_at, assigned_at <= now() - interval '29 days' AS old_grant
       FROM role_assignments WHERE user_id = $1`,
      [developerOnly],
    );
    assert.deepEqual(converted.rows.map((row) => [row.id, row.role, row.revoked_at, row.old_grant]), [[developerAssignment, "admin", null, true]], "a developer becomes an admin");

    // A developer who was already an admin keeps exactly one active admin assignment.
    const merged = await client.query(`SELECT id, role::text AS role FROM role_assignments WHERE user_id = $1 AND revoked_at IS NULL`, [both]);
    assert.deepEqual(merged.rows.map((row) => [row.id, row.role]), [[bothAdminAssignment, "admin"]]);

    // A revoked developer assignment is gone; the account keeps its other roles.
    const former = await client.query(`SELECT id, role::text AS role FROM role_assignments WHERE user_id = $1`, [formerDeveloper]);
    assert.deepEqual(former.rows.map((row) => [row.id, row.role]), [[formerTutorAssignment, "tutor"]]);

    // Everyone else is untouched.
    const bystanders = await client.query(`SELECT id, role::text AS role FROM role_assignments WHERE user_id = ANY($1::uuid[]) ORDER BY role`, [[adminOnly, studentOnly]]);
    assert.deepEqual(bystanders.rows.map((row) => [row.id, row.role]), [[adminAssignment, "admin"], [studentAssignment, "student"]]);

    // The second factor, its recovery codes and the session are byte for byte what they were.
    assert.deepEqual(await snapshot(), before, "the migration never touches a factor, its recovery codes or a session");
    assert.equal((await client.query(`SELECT status::text AS status FROM auth_sessions WHERE id = $1`, [session.id])).rows[0].status, "active");

    // The role is gone from the database type, not only from the code.
    assert.deepEqual(
      (await client.query<{ label: string }>(`SELECT unnest(enum_range(NULL::role_name))::text AS label`)).rows.map((row) => row.label),
      ["student", "tutor", "admin", "affiliator"],
    );
    await rejects(`INSERT INTO role_assignments (user_id, role) VALUES ($1, 'developer')`, [studentOnly], /invalid input value for enum role_name/u, "developer can no longer be assigned");
    assert.equal(
      (await client.query(`SELECT 1 FROM pg_type WHERE typname = 'role_name_old'`)).rowCount,
      0,
      "the old type is dropped",
    );

    // What the migration touched is recorded, one audit row per assignment.
    const audit = await client.query<{ target_id: string; outcome: string; user_id: string }>(
      `SELECT target_id, metadata->>'outcome' AS outcome, metadata->>'userId' AS user_id
       FROM audit_logs WHERE action = 'role_assignment.developer_retired' AND target_id = ANY($1::uuid[]) ORDER BY outcome`,
      [[developerAssignment, bothDeveloperAssignment, formerDeveloperAssignment]],
    );
    assert.deepEqual(audit.rows.map((row) => [row.target_id, row.outcome, row.user_id]).sort(), [
      [developerAssignment, "converted_to_admin", developerOnly],
      [bothDeveloperAssignment, "merged_into_existing_admin", both],
      [formerDeveloperAssignment, "revoked_history_removed", formerDeveloper],
    ].sort());
    assert.equal(
      Number((await client.query<{ count: string }>(`SELECT count(*) FROM audit_logs`)).rows[0].count) - Number(auditBefore),
      audit.rowCount,
      "the migration wrote nothing else to the audit log (fixtures never wrote audit rows)",
    );

    // audit_logs is still append-only, and role_assignments keeps its unique active-role index.
    const triggers = await client.query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger WHERE tgrelid = 'audit_logs'::regclass AND NOT tgisinternal ORDER BY tgname`,
    );
    assert.deepEqual(triggers.rows.map((row) => row.tgname), ["audit_logs_immutable", "audit_logs_truncate_immutable"]);
    await rejects(`UPDATE audit_logs SET action = 'tampered' WHERE action = 'role_assignment.developer_retired'`, [], /audit logs are immutable/u, "audit rows cannot be rewritten");
    await rejects(`DELETE FROM audit_logs WHERE action = 'role_assignment.developer_retired'`, [], /audit logs are immutable/u, "audit rows cannot be deleted");
    const indexes = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'role_assignments' ORDER BY indexname`,
    );
    assert.ok(indexes.rows.some((row) => row.indexname === "role_assignments_active_user_role_uq"), "one active assignment per role is still enforced");
    await rejects(`INSERT INTO role_assignments (user_id, role) VALUES ($1, 'admin')`, [adminOnly], /role_assignments_active_user_role_uq/u, "no second active admin assignment");

    console.log("Remove developer role migration checks passed.");
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
