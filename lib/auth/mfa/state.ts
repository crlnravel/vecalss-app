import { RoleName } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

import type { MfaStatus } from "../types";
import { MFA_REQUIRED_ROLES, MFA_REVERIFY_SECONDS } from "./constants";
import { privilegedRoleGrantedAfterVerificationSql } from "./data-layer";
import { loadMfaKeyRing, openMfaSecret } from "./secret-envelope.mjs";

type RoleAssignmentLike = { revokedAt: Date | null; role: RoleName };

function isMfaRequiredRole(role: RoleName) {
  return MFA_REQUIRED_ROLES.includes(role);
}

type FactorRow = {
  confirmed_at: Date | null;
  factor_id: string | null;
  fresh: boolean | null;
  granted_after_verification: boolean;
  secret_envelope: unknown;
  verified_at: Date | null;
};

/**
 * Decides whether this session may use the privileged roles of its account, and
 * returns the roles the session context may carry.
 *
 * Freshness is computed in the database against its own clock, so neither a
 * cookie nor the application server's clock can extend it. A session counts as
 * verified only when it was verified under the factor that is still enrolled,
 * within MFA_REVERIFY_SECONDS, and after the newest privileged role was
 * granted (also a database-clock comparison). Anything else leaves it signed in
 * but unprivileged.
 *
 * Fails closed: an unusable key ring, or a secret that does not open under it,
 * is "unavailable" and withholds the roles.
 */
async function resolveMfaRoles({
  assignments,
  sessionId,
  userId,
}: {
  assignments: readonly RoleAssignmentLike[];
  sessionId: string;
  userId: string;
}): Promise<{ roles: RoleName[]; status: MfaStatus }> {
  const activeAssignments = assignments.filter((assignment) => assignment.revokedAt === null);
  const roles = activeAssignments.map((assignment) => assignment.role);
  const privileged = activeAssignments.filter((assignment) => isMfaRequiredRole(assignment.role));

  if (!privileged.length) return { roles, status: "not_required" };

  const withheld = roles.filter((role) => !isMfaRequiredRole(role));
  const pending = (status: MfaStatus) => ({ roles: withheld, status });

  let keyRing: ReturnType<typeof loadMfaKeyRing>;
  try {
    keyRing = loadMfaKeyRing();
  } catch {
    return pending("unavailable");
  }

  const rows = await prisma.$queryRaw<FactorRow[]>`
    SELECT
      f.id AS factor_id,
      f.confirmed_at,
      f.secret_envelope,
      s.mfa_verified_at AS verified_at,
      (
        s.mfa_factor_id = f.id
        AND s.mfa_verified_at IS NOT NULL
        AND s.mfa_verified_at <= now()
        AND s.mfa_verified_at > now() - make_interval(secs => ${MFA_REVERIFY_SECONDS})
      ) AS fresh,
      ${privilegedRoleGrantedAfterVerificationSql()} AS granted_after_verification
    FROM auth_sessions AS s
    LEFT JOIN user_mfa_factors AS f
      ON f.user_id = s.user_id AND f.confirmed_at IS NOT NULL
    WHERE s.id = ${sessionId}::uuid AND s.user_id = ${userId}::uuid
  `;
  const row = rows[0];

  if (!row || !row.factor_id || !row.confirmed_at) return pending("enroll");

  try {
    openMfaSecret(row.secret_envelope, { factorId: row.factor_id, userId }, keyRing);
  } catch {
    return pending("unavailable");
  }

  if (!row.fresh || !row.verified_at) return pending("challenge");
  if (row.granted_after_verification) return pending("challenge");

  return { roles, status: "verified" };
}

export { isMfaRequiredRole, resolveMfaRoles };
