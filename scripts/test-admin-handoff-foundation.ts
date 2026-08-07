import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [migration, schema, handoffs, auth, session] = await Promise.all([
  readFile(resolve(root, "prisma/migrations/20260805000000_admin_operations_foundation/migration.sql"), "utf8"),
  readFile(resolve(root, "prisma/schema.prisma"), "utf8"),
  readFile(resolve(root, "lib/admin/handoffs/service.ts"), "utf8"),
  readFile(resolve(root, "lib/auth/service.ts"), "utf8"),
  readFile(resolve(root, "lib/auth/session.ts"), "utf8"),
]);

assert.match(migration, /admin_operations_preflight_unresolved_duplicate_emails/);
assert.match(migration, /UPDATE role_assignments[\s\S]*duplicate_revoked/);
assert.match(migration, /CREATE UNIQUE INDEX "users_email_lower_uq"/);
assert.match(migration, /CREATE UNIQUE INDEX "role_assignments_active_user_role_uq"/);
assert.match(migration, /CREATE UNIQUE INDEX "enrollment_handoffs_one_open_user_uq"/);
assert.match(migration, /user_record\.must_change_password/);
assert.match(migration, /'pending'::enrollment_handoff_status/);
assert.match(migration, /'revoked'::enrollment_handoff_status/);
assert.match(migration, /CREATE INDEX "enrollment_handoffs_source_import_row_id_idx"/);
assert.doesNotMatch(migration, /CREATE UNIQUE INDEX "enrollment_handoffs_source_import_row_id_key"/);

assert.match(schema, /sourceImportRowId String\?/);
assert.doesNotMatch(schema, /sourceImportRowId String\?\s+@unique/);
assert.match(schema, /sourceHandoffs EnrollmentHandoff\[\]/);

assert.doesNotMatch(handoffs, /secretEnvelope:\s*Prisma\.JsonNull/);
assert.match(handoffs, /secretEnvelope:\s*Prisma\.DbNull/);
assert.match(handoffs, /status: \{ in: \[\.\.\.OPEN_HANDOFF_STATUSES\] \}/);
assert.match(handoffs, /A handoff can only be reissued with its existing delivery method/);
assert.match(handoffs, /input\.method === EnrollmentHandoffMethod\.invite_link/);
assert.doesNotMatch(handoffs, /FROM enrollment_handoffs[\s\S]{0,160}FOR SHARE/);

assert.match(auth, /UPDATE password_reset_tokens[\s\S]*RETURNING id, user_id/);
assert.match(auth, /status: \{ notIn: \[UserStatus\.disabled, UserStatus\.soft_deleted\] \}/);
assert.match(auth, /WHERE id = \$\{userId\}::uuid[\s\S]*FOR UPDATE/);
assert.match(auth, /status: \{ in: \[\.\.\.ACTIVE_HANDOFF_STATUSES\] \}/);
assert.doesNotMatch(auth, /secretEnvelope:\s*Prisma\.JsonNull/);

assert.match(session, /FROM users[\s\S]*FOR UPDATE/);
assert.match(session, /tx\.authSession\.create/);
assert.match(session, /status: UserStatus\.locked/);

console.log("admin handoff foundation invariants passed");
