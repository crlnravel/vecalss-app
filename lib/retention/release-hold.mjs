/**
 * Releasing a legal hold (MS-19 C-01). A hold is placed in the app, but it is
 * released only here, on the owner's database login: the application's runtime
 * login has no UPDATE on the release columns, so a compromised app cannot lift
 * a hold and then run the cleanup against what it covered. The command
 * (scripts/release-legal-hold.mjs) and the tests share this function.
 *
 * Plain JavaScript on purpose: no server-only import, no Prisma client, and it
 * takes the connection it must use, so it can only ever run as the role the
 * caller connected with.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MIN_REASON = 10;
const MAX_REASON = 500;

/** Where the audit row points, so the release shows up on the thing the hold covered. */
const AUDIT_TARGETS = {
  buyer: "user",
  dispute: "payment_dispute",
  fraud: "fraud_case",
  order: "payment_order",
  refund: "refund_case",
};

class ReleaseHoldError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "ReleaseHoldError";
  }
}

/**
 * Releases one open hold, once, with a written reason and an audit row, in one
 * transaction. `client` is a connected pg client on the schema owner's login.
 * Refuses when that login is the application's runtime role (or a member of it).
 */
async function releaseHoldAsOwner(client, { holdId, ownerEmail, reason }) {
  const text = typeof reason === "string" ? reason.trim() : "";
  if (text.length < MIN_REASON || text.length > MAX_REASON) {
    throw new ReleaseHoldError("invalid_reason", `A written reason of ${MIN_REASON} to ${MAX_REASON} characters is required.`);
  }
  if (typeof holdId !== "string" || !UUID.test(holdId)) throw new ReleaseHoldError("not_found", "Hold not found.");
  const email = typeof ownerEmail === "string" ? ownerEmail.trim().toLowerCase() : "";
  if (!email) throw new ReleaseHoldError("owner_unset", "FRAUD_OWNER_EMAIL is not set, so there is no owner to record as the one releasing the hold.");

  const identity = await client.query(
    // A superuser is a member of every role as far as pg_has_role is concerned, and a superuser is the owner here.
    `SELECT r.rolname::text AS role, (NOT r.rolsuper AND pg_has_role(current_user, 'vecalss_runtime', 'MEMBER')) AS runtime
     FROM pg_roles r WHERE r.rolname = current_user`,
  );
  if (identity.rows[0].runtime) {
    throw new ReleaseHoldError(
      "runtime_role",
      `Connected as "${identity.rows[0].role}", the application's runtime login. A hold is released only with the owner's database login (MIGRATE_DATABASE_URL).`,
    );
  }

  await client.query("BEGIN");
  try {
    const owner = await client.query(
      `SELECT u.id FROM users u
       WHERE lower(u.email) = $1 AND u.soft_deleted_at IS NULL AND u.status = 'active'
         AND EXISTS (SELECT 1 FROM role_assignments ra WHERE ra.user_id = u.id AND ra.role = 'admin'::role_name AND ra.revoked_at IS NULL)`,
      [email],
    );
    if (owner.rowCount !== 1) throw new ReleaseHoldError("owner_unknown", "No active account has the FRAUD_OWNER_EMAIL address.");
    const ownerId = owner.rows[0].id;

    const found = await client.query(
      'SELECT scope, case_kind AS "caseKind", subject_id AS "subjectId", released_at AS "releasedAt" FROM legal_holds WHERE id = $1 FOR UPDATE',
      [holdId],
    );
    if (found.rowCount === 0) throw new ReleaseHoldError("not_found", "Hold not found.");
    const hold = found.rows[0];
    if (hold.releasedAt) throw new ReleaseHoldError("already_released", "Hold already released.");

    await client.query(
      "UPDATE legal_holds SET released_at = now(), released_by_user_id = $2, release_reason = $3 WHERE id = $1",
      [holdId, ownerId, text],
    );
    await client.query(
      `INSERT INTO audit_logs (action, actor_user_id, target_type, target_id, metadata)
       VALUES ('retention.hold.released', $1, $2, $3, $4::jsonb)`,
      [
        ownerId,
        AUDIT_TARGETS[hold.caseKind ?? hold.scope],
        hold.subjectId,
        JSON.stringify({ caseKind: hold.caseKind, databaseRole: identity.rows[0].role, holdId, scope: hold.scope, via: "owner_command" }),
      ],
    );
    await client.query("COMMIT");
    return { holdId, scope: hold.scope };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export { releaseHoldAsOwner, ReleaseHoldError };
