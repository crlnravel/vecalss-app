import {
  EnrollmentHandoffMethod,
  EnrollmentHandoffStatus,
  LoginAttemptResult,
  Prisma,
  RoleName,
  SessionStatus,
  UserStatus,
} from "@/generated/prisma/client";
import { getAppBaseUrl, isProduction } from "@/lib/config";
import { prisma } from "@/lib/prisma";

import {
  ACCOUNT_LOCK_WINDOW_MINUTES,
  MAX_FAILED_LOGIN_ATTEMPTS,
  PASSWORD_RESET_WINDOW_MINUTES,
} from "./constants";
import {
  createOpaqueToken,
  hashPassword,
  hashToken,
  normalizeEmail,
  validatePassword,
  verifyPassword,
} from "./crypto";
import { getRequestMetadata } from "./request";
import { createSessionIfUserStateMatches } from "./session";
import type { AuthenticatedUser, LoginAudience } from "./types";
import {
  completeEnrollmentHandoffsForUser,
  lockEnrollmentHandoffByToken,
  writeHandoffAudit,
} from "@/lib/admin/handoffs/service";
import {
  consumePasswordResetRateLimit,
  getTrustedInviteIdentity,
} from "@/lib/admin/handoffs/rate-limit";
import {
  createStudentEnrollment as createStudentEnrollmentRecord,
  setStudentEnrollmentStatus as setStudentEnrollmentStatusRecord,
  updateStudentEnrollment as updateStudentEnrollmentRecord,
} from "@/lib/admin/enrollment";
import type {
  SetEnrollmentStatusInput,
  StudentEnrollmentInput,
  StudentEnrollmentUpdateInput,
} from "@/lib/admin/enrollment";

type LoginOutcome =
  | { ok: true; user: AuthenticatedUser }
  | { code: "invalid_credentials" | "locked" | "service_unavailable"; ok: false };

type PasswordResetRequestResult = {
  deliveredResetUrl: string | null;
};

type AuthenticateUserOptions = {
  requiredRole?: RoleName;
};

const ACTIVE_HANDOFF_STATUSES = [
  EnrollmentHandoffStatus.pending,
  EnrollmentHandoffStatus.released,
] as const;

/**
 * Deployment follow-up (intentionally not applied here): before adding a
 * forward-only database check, preflight
 * `SELECT count(*) FROM enrollment_handoffs WHERE method =
 * 'invite_link'::enrollment_handoff_method AND expires_at IS NULL`. Once the
 * count is zero, add and validate
 * `CHECK (method <> 'invite_link'::enrollment_handoff_method OR expires_at IS
 * NOT NULL)` in a forward-only migration. Ticket 2 cannot safely preflight or
 * mutate the staging-applied database, so this service remains fail-closed.
 */

async function recordLoginAttempt({
  email,
  failureReason,
  result,
  userId,
}: {
  email: string;
  failureReason?: string;
  result: LoginAttemptResult;
  userId?: string;
}) {
  const { ipAddress, userAgent } = await getRequestMetadata();

  await prisma.loginAttempt.create({
    data: {
      email,
      failureReason,
      ipAddress,
      result,
      userAgent,
      userId,
    },
  });
}

function mapAuthenticatedUser(user: {
  email: string;
  fullName: string;
  id: string;
  mustChangePassword: boolean;
  roleAssignments: Array<{ revokedAt: Date | null; role: RoleName }>;
  status: UserStatus;
  studentProfile?: { onboardingStatus: AuthenticatedUser["onboardingStatus"] } | null;
}): AuthenticatedUser {
  return {
    email: user.email,
    fullName: user.fullName,
    id: user.id,
    mustChangePassword: user.mustChangePassword,
    onboardingStatus: user.studentProfile?.onboardingStatus ?? null,
    roles: user.roleAssignments.filter((assignment) => assignment.revokedAt === null).map((assignment) => assignment.role),
    status: user.status,
  };
}

async function authenticateUser(
  email: string,
  password: string,
  options: AuthenticateUserOptions = {},
): Promise<LoginOutcome> {
  const normalizedEmail = normalizeEmail(email);

  try {
    const userRecord = await prisma.user.findUnique({
      include: {
        roleAssignments: true,
        studentProfile: true,
      },
      where: {
        email: normalizedEmail,
      },
    });

    if (!userRecord) {
      await recordLoginAttempt({
        email: normalizedEmail,
        failureReason: "unknown_email",
        result: LoginAttemptResult.failed,
      });

      return {
        code: "invalid_credentials",
        ok: false,
      };
    }

    let user = userRecord;
    const now = new Date();

    if (user.status === UserStatus.locked && user.lockedUntil && user.lockedUntil <= now) {
      await prisma.user.updateMany({
        data: {
          failedLoginCount: 0,
          lockedUntil: null,
          status: UserStatus.active,
        },
        where: {
          id: user.id,
          softDeletedAt: null,
          status: UserStatus.locked,
        },
      });

      // The unlock changes account status. Reload all credential/account state
      // so the later post-bcrypt CAS observes the exact state it verifies.
      const refreshedUser = await prisma.user.findUnique({
        include: {
          roleAssignments: true,
          studentProfile: true,
        },
        where: { id: user.id },
      });

      if (!refreshedUser) {
        return {
          code: "invalid_credentials",
          ok: false,
        };
      }

      user = refreshedUser;
    }

    const activeRoles = user.roleAssignments
      .filter((assignment) => assignment.revokedAt === null)
      .map((assignment) => assignment.role);
    const hasSupportedRole = options.requiredRole
      ? activeRoles.includes(options.requiredRole)
      : activeRoles.some((role) => role === RoleName.admin || role === RoleName.student);

    if (
      user.status === UserStatus.disabled
      || user.status === UserStatus.soft_deleted
      || user.softDeletedAt
      || !hasSupportedRole
    ) {
      await recordLoginAttempt({
        email: normalizedEmail,
        failureReason: options.requiredRole && !hasSupportedRole
          ? "role_mismatch"
          : "inactive_or_unauthorized",
        result: LoginAttemptResult.failed,
        userId: user.id,
      });

      return {
        code: "invalid_credentials",
        ok: false,
      };
    }

    if (user.status === UserStatus.locked && user.lockedUntil && user.lockedUntil > now) {
      await recordLoginAttempt({
        email: normalizedEmail,
        failureReason: "account_locked",
        result: LoginAttemptResult.locked,
        userId: user.id,
      });

      return {
        code: "locked",
        ok: false,
      };
    }

    const passwordMatches = await verifyPassword(password, user.passwordHash);

    if (!passwordMatches) {
      const failedLoginCount = user.failedLoginCount + 1;
      const shouldLockAccount = failedLoginCount >= MAX_FAILED_LOGIN_ATTEMPTS;
      const lockedUntil = shouldLockAccount
        ? new Date(Date.now() + ACCOUNT_LOCK_WINDOW_MINUTES * 60 * 1000)
        : null;

      const failedLoginState = await prisma.user.updateMany({
        data: {
          failedLoginCount,
          lockedUntil,
          ...(shouldLockAccount ? { passwordUpdatedAt: new Date() } : {}),
          status: shouldLockAccount ? UserStatus.locked : user.status,
        },
        where: {
          failedLoginCount: user.failedLoginCount,
          id: user.id,
          lockedUntil: null,
          passwordHash: user.passwordHash,
          passwordUpdatedAt: user.passwordUpdatedAt,
          softDeletedAt: null,
          status: { notIn: [UserStatus.disabled, UserStatus.soft_deleted] },
        },
      });

      await recordLoginAttempt({
        email: normalizedEmail,
        failureReason: failedLoginState.count === 1 && shouldLockAccount
          ? "max_failed_attempts"
          : failedLoginState.count === 1
            ? "invalid_password"
            : "stale_account_state",
        result: failedLoginState.count === 1 && shouldLockAccount
          ? LoginAttemptResult.locked
          : LoginAttemptResult.failed,
        userId: user.id,
      });

      return {
        code: failedLoginState.count === 1 && shouldLockAccount ? "locked" : "invalid_credentials",
        ok: false,
      };
    }

    // Keep the account CAS and session insert in one transaction. This closes
    // the post-bcrypt window where reset/reissue/deactivation could win after
    // verification but before a stale session was created.
    const session = await createSessionIfUserStateMatches({
      expectedFailedLoginCount: user.failedLoginCount,
      expectedLockedUntil: user.lockedUntil,
      expectedMustChangePassword: user.mustChangePassword,
      expectedPasswordHash: user.passwordHash,
      expectedPasswordUpdatedAt: user.passwordUpdatedAt,
      userId: user.id,
    });

    if (!session) {
      await recordLoginAttempt({
        email: normalizedEmail,
        failureReason: "inactive_or_unauthorized",
        result: LoginAttemptResult.failed,
        userId: user.id,
      });

      return {
        code: "invalid_credentials",
        ok: false,
      };
    }

    await recordLoginAttempt({
      email: normalizedEmail,
      result: LoginAttemptResult.success,
      userId: user.id,
    });

    return {
      ok: true,
      user: mapAuthenticatedUser(user),
    };
  } catch (error) {
    console.error("Failed to authenticate user", error);

    return {
      code: "service_unavailable",
      ok: false,
    };
  }
}

async function requestPasswordReset(
  email: string,
  audience: LoginAudience = "student",
): Promise<PasswordResetRequestResult> {
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: {
      email: normalizedEmail,
    },
  });

  if (
    !user
    || user.status === UserStatus.disabled
    || user.status === UserStatus.soft_deleted
    || user.softDeletedAt
  ) {
    return {
      deliveredResetUrl: null,
    };
  }

  const rawToken = createOpaqueToken();
  const tokenHash = hashToken(rawToken);
  const { ipAddress } = await getRequestMetadata();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_WINDOW_MINUTES * 60 * 1000);

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      data: {
        usedAt: now,
      },
      where: {
        usedAt: null,
        userId: user.id,
      },
    }),
    prisma.passwordResetToken.create({
      data: {
        expiresAt,
        ipAddress,
        tokenHash,
        userId: user.id,
      },
    }),
  ]);

  const query = audience === "admin"
    ? "?audience=admin"
    : audience === "tutor"
      ? "?audience=tutor"
      : "";
  const deliveredResetUrl = `${getAppBaseUrl()}/reset-password/${rawToken}${query}`;

  return {
    deliveredResetUrl: isProduction ? null : deliveredResetUrl,
  };
}

async function getValidPasswordResetRecord(rawToken: string) {
  return prisma.passwordResetToken.findFirst({
    include: {
      user: true,
    },
    where: {
      expiresAt: {
        gt: new Date(),
      },
      tokenHash: hashToken(rawToken),
      usedAt: null,
    },
  });
}

async function completePasswordReset(rawToken: string, nextPassword: string) {
  const validationError = validatePassword(nextPassword);

  if (validationError) {
    throw new Error(validationError);
  }

  const tokenHash = hashToken(rawToken);

  if (!consumePasswordResetRateLimit({
    identity: getTrustedInviteIdentity(),
    tokenHash,
  })) {
    throw new Error("This reset link is invalid or has already expired.");
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const candidate = await tx.$queryRaw<Array<{ id: string; user_id: string }>>`
      SELECT id, user_id
      FROM password_reset_tokens
      WHERE token_hash = ${tokenHash}
        AND used_at IS NULL
        AND expires_at > ${now}
    `;

    if (!candidate[0]) {
      throw new Error("This reset link is invalid or has already expired.");
    }

    // First-login completion also locks the user before touching reset-token
    // rows, keeping concurrent completion paths in a deterministic order.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${candidate[0].user_id}::uuid FOR UPDATE`;

    const user = await tx.user.findUnique({
      select: {
        id: true,
        softDeletedAt: true,
        status: true,
      },
      where: { id: candidate[0].user_id },
    });

    if (!user || user.status === UserStatus.disabled || user.status === UserStatus.soft_deleted || user.softDeletedAt) {
      throw new Error("This reset link is invalid or has already expired.");
    }

    // Claim the bearer token before spending bcrypt work. The claim is part of
    // this transaction, so a hash failure rolls it back without committing a
    // partial credential transition.
    const claimed = await tx.$queryRaw<Array<{ id: string; user_id: string }>>`
      UPDATE password_reset_tokens
      SET used_at = ${now}
      WHERE token_hash = ${tokenHash}
        AND user_id = ${candidate[0].user_id}::uuid
        AND used_at IS NULL
        AND expires_at > ${now}
      RETURNING id, user_id
    `;

    const record = claimed[0];

    if (!record) {
      throw new Error("This reset link is invalid or has already expired.");
    }

    const passwordHash = await hashPassword(nextPassword);

    await tx.user.update({
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        mustChangePassword: false,
        passwordHash,
        passwordUpdatedAt: now,
        status: UserStatus.active,
      },
      where: { id: record.user_id },
    });

    await tx.passwordResetToken.updateMany({
      data: { usedAt: now },
      where: {
        id: { not: record.id },
        usedAt: null,
        userId: record.user_id,
      },
    });

    await completeEnrollmentHandoffsForUser(tx, record.user_id);

    await tx.authSession.updateMany({
      data: {
        revokedAt: now,
        status: SessionStatus.revoked,
      },
      where: {
        status: SessionStatus.active,
        userId: record.user_id,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "password_reset.completed",
        metadata: {
          method: "password_reset",
          userId: record.user_id,
        },
        targetId: record.user_id,
        targetType: "user",
      },
    });
  });
}

async function changePasswordForUser(userId: string, sessionId: string, nextPassword: string) {
  const validationError = validatePassword(nextPassword);

  if (validationError) {
    throw new Error(validationError);
  }

  const passwordHash = await hashPassword(nextPassword);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const users = await tx.$queryRaw<Array<{
      must_change_password: boolean;
      soft_deleted_at: Date | null;
      status: UserStatus;
    }>>`
      SELECT status, soft_deleted_at, must_change_password
      FROM users
      WHERE id = ${userId}::uuid
      FOR UPDATE
    `;

    const currentUser = users[0];

    if (
      !currentUser
      || currentUser.status !== UserStatus.active
      || currentUser.soft_deleted_at
    ) {
      throw new Error("The account is inactive and cannot complete first-login setup.");
    }

    if (!currentUser.must_change_password) {
      throw new Error("First-login password setup has already been completed.");
    }

    // Lock and validate the exact session used to authorize this action. The
    // user lock above serializes this check with reset/reissue/deactivation;
    // the session lock also makes concurrent logout/revocation deterministic.
    const sessions = await tx.$queryRaw<Array<{
      expires_at: Date;
      id: string;
      revoked_at: Date | null;
      status: SessionStatus;
    }>>`
      SELECT id, status, expires_at, revoked_at
      FROM auth_sessions
      WHERE id = ${sessionId}::uuid
        AND user_id = ${userId}::uuid
      FOR UPDATE
    `;
    const currentSession = sessions[0];

    if (
      !currentSession
      || currentSession.status !== SessionStatus.active
      || currentSession.revoked_at !== null
      || currentSession.expires_at <= now
    ) {
      throw new Error("The sign-in session is no longer active. Please sign in again.");
    }

    await tx.user.update({
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        mustChangePassword: false,
        passwordHash,
        passwordUpdatedAt: now,
        status: UserStatus.active,
      },
      where: { id: userId },
    });

    await tx.passwordResetToken.updateMany({
      data: { usedAt: now },
      where: {
        usedAt: null,
        userId,
      },
    });

    await completeEnrollmentHandoffsForUser(tx, userId);

    await tx.auditLog.create({
      data: {
        action: "first_login_password_changed",
        metadata: {
          method: "first_login",
          userId,
        },
        targetId: userId,
        targetType: "user",
      },
    });
  });
}

/**
 * Consume a manual-share invite link and complete the recipient's credential
 * setup in the same transaction as the handoff transition.
 */
async function completeEnrollmentInvite(rawToken: string, nextPassword: string) {
  const validationError = validatePassword(nextPassword);

  if (validationError) {
    throw new Error(validationError);
  }

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const outcome = await prisma.$transaction(async (tx) => {
    const handoff = await lockEnrollmentHandoffByToken(tx, tokenHash);

    if (!handoff || handoff.method !== EnrollmentHandoffMethod.invite_link) {
      throw new Error("This invite link is invalid or has already expired.");
    }

    if (!ACTIVE_HANDOFF_STATUSES.includes(handoff.status as (typeof ACTIVE_HANDOFF_STATUSES)[number])) {
      throw new Error("This invite link is invalid or has already expired.");
    }

    if (handoff.expires_at === null || handoff.expires_at <= now) {
      const expired = await tx.enrollmentHandoff.updateMany({
        data: {
          secretEnvelope: Prisma.DbNull,
          status: EnrollmentHandoffStatus.expired,
        },
        where: {
          id: handoff.id,
          OR: [
            { expiresAt: null },
            { expiresAt: { lte: now } },
          ],
          status: { in: [...ACTIVE_HANDOFF_STATUSES] },
        },
      });

      if (expired.count === 1) {
        await writeHandoffAudit({
          action: "enrollment_handoff.expired",
          handoffId: handoff.id,
          metadata: {
            method: handoff.method,
          },
          tx,
          userId: handoff.user_id,
        });
      }

      return { expired: true as const };
    }

    if (handoff.user_status !== UserStatus.active || handoff.soft_deleted_at !== null) {
      throw new Error("This invite link is invalid or has already expired.");
    }

    const activeRoles = await tx.roleAssignment.findMany({
      select: { role: true },
      where: {
        revokedAt: null,
        userId: handoff.user_id,
      },
    });
    const loginAudience = activeRoles.some((assignment) => assignment.role === RoleName.tutor)
      ? "tutor" as const
      : "student" as const;

    // Do not spend bcrypt work on invalid, expired, or terminal bearer tokens.
    const passwordHash = await hashPassword(nextPassword);

    await tx.user.update({
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        mustChangePassword: false,
        passwordHash,
        passwordUpdatedAt: now,
        status: UserStatus.active,
      },
      where: { id: handoff.user_id },
    });

    await tx.enrollmentHandoff.update({
      data: {
        completedAt: now,
        secretEnvelope: Prisma.DbNull,
        status: EnrollmentHandoffStatus.completed,
      },
      where: {
        id: handoff.id,
        status: { in: [...ACTIVE_HANDOFF_STATUSES] },
      },
    });

    await tx.passwordResetToken.updateMany({
      data: { usedAt: now },
      where: {
        usedAt: null,
        userId: handoff.user_id,
      },
    });

    await tx.authSession.updateMany({
      data: {
        revokedAt: now,
        status: SessionStatus.revoked,
      },
      where: {
        status: SessionStatus.active,
        userId: handoff.user_id,
      },
    });

    await writeHandoffAudit({
      action: "enrollment_handoff.completed",
      handoffId: handoff.id,
      metadata: {
        method: EnrollmentHandoffMethod.invite_link,
      },
      tx,
      userId: handoff.user_id,
    });

    await tx.auditLog.create({
      data: {
        action: "invite.accepted",
        metadata: {
          handoffId: handoff.id,
          method: EnrollmentHandoffMethod.invite_link,
          userId: handoff.user_id,
        },
        targetId: handoff.user_id,
        targetType: "user",
      },
    });

    return { expired: false as const, loginAudience };
  });

  if (outcome.expired) {
    throw new Error("This invite link is invalid or has already expired.");
  }

  return {
    completed: true as const,
    loginAudience: outcome.loginAudience,
  };
}

async function getEnrollmentInviteStatus(rawToken: string) {
  if (!rawToken || typeof rawToken !== "string") {
    return { valid: false } as const;
  }

  const handoff = await prisma.enrollmentHandoff.findFirst({
    select: { id: true },
    where: {
      expiresAt: { gt: new Date() },
      method: EnrollmentHandoffMethod.invite_link,
      status: { in: [...ACTIVE_HANDOFF_STATUSES] },
      tokenHash: hashToken(rawToken),
      user: {
        softDeletedAt: null,
        status: UserStatus.active,
      },
    },
  });

  return { valid: Boolean(handoff) } as const;
}

async function createStudentEnrollment(input: StudentEnrollmentInput) {
  return createStudentEnrollmentRecord(input);
}

async function updateStudentEnrollment(input: StudentEnrollmentUpdateInput) {
  return updateStudentEnrollmentRecord(input);
}

async function setStudentEnrollmentStatus(input: Omit<SetEnrollmentStatusInput, "role">) {
  return setStudentEnrollmentStatusRecord(input);
}

export {
  authenticateUser,
  changePasswordForUser,
  completeEnrollmentInvite,
  completePasswordReset,
  createStudentEnrollment,
  getEnrollmentInviteStatus,
  getValidPasswordResetRecord,
  requestPasswordReset,
  setStudentEnrollmentStatus,
  updateStudentEnrollment,
};
