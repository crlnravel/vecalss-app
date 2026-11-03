import { Prisma, RoleName, SessionStatus } from "@/generated/prisma/client";

import { MFA_REVERIFY_SECONDS } from "./constants";

/**
 * Data-layer repeats of the admin check (see lib/auth/kapten-access.ts) look an
 * account up by id, with no session in hand. The session context already
 * withholds the admin role from an unverified session, so these are a second
 * line: an admin counts only while the account has a live session that is
 * currently verified under the factor that is still enrolled.
 */
function verifiedPrivilegedSessionWhere(now = new Date()): Prisma.AuthSessionWhereInput {
  return {
    expiresAt: { gt: now },
    mfaFactorId: { not: null },
    mfaVerifiedAt: { gt: new Date(now.getTime() - MFA_REVERIFY_SECONDS * 1000), lte: now },
    revokedAt: null,
    status: SessionStatus.active,
  };
}

/** Active tutor assignment, or an admin assignment backed by a verified session. */
function kaptenOrAdminAssignmentWhere(now = new Date()): Prisma.RoleAssignmentWhereInput {
  return {
    OR: [
      { role: RoleName.tutor },
      { role: RoleName.admin, user: { authSessions: { some: verifiedPrivilegedSessionWhere(now) } } },
    ],
    revokedAt: null,
  };
}

/** The same rule as raw SQL, on database time, for queries that already join `role_assignments` as `ra` and `users` as `u`. */
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

export { kaptenOrAdminAssignmentWhere, kaptenOrAdminRoleSql, verifiedPrivilegedSessionWhere };
