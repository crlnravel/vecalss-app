import { Prisma } from "@/generated/prisma/client";

import { MFA_REQUIRED_ROLES, MFA_REVERIFY_SECONDS } from "./constants";

/**
 * Data-layer repeats of the admin check (see lib/auth/kapten-access.ts) look an
 * account up by id, with no session in hand. The session context already
 * withholds the admin role from an unverified session, so these are a second
 * line: an admin counts only while the account has a live session that is
 * currently verified under the factor that is still enrolled.
 *
 * Every time comparison here runs in SQL on the database clock. A Prisma `where`
 * would take `new Date()` from the application clock, and `mfa_verified_at` is
 * written by the database, so the two would disagree by milliseconds.
 */

/** The admin rule as SQL, for queries that already join `role_assignments` as `ra` and `users` as `u`. */
function kaptenOrAdminRoleSql() {
  return Prisma.sql`(
    ra."role" = 'tutor'
    OR (
      ra."role" = 'admin'
      AND EXISTS (
        SELECT 1
        FROM "auth_sessions" AS s
        JOIN "user_mfa_factors" AS f ON f."id" = s."mfa_factor_id" AND f."user_id" = s."user_id" AND f."confirmed_at" IS NOT NULL
        WHERE s."user_id" = u."id"
          AND s."status" = 'active'
          AND s."revoked_at" IS NULL
          AND s."expires_at" > now()
          AND s."mfa_verified_at" IS NOT NULL
          AND s."mfa_verified_at" <= now()
          AND s."mfa_verified_at" > now() - make_interval(secs => ${MFA_REVERIFY_SECONDS})
      )
    )
  )`;
}

/**
 * True when a privileged role was granted after the session was verified, so the
 * session needs a new check. For queries that select from `auth_sessions` as `s`.
 */
function privilegedRoleGrantedAfterVerificationSql() {
  return Prisma.sql`EXISTS (
    SELECT 1
    FROM "role_assignments" AS g
    WHERE g."user_id" = s."user_id"
      AND g."revoked_at" IS NULL
      AND g."role" = ANY(${[...MFA_REQUIRED_ROLES]}::role_name[])
      AND g."assigned_at" > s."mfa_verified_at"
  )`;
}

export { kaptenOrAdminRoleSql, privilegedRoleGrantedAfterVerificationSql };
