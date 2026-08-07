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
  generateTemporaryPassword,
  hashPassword,
  hashToken,
  normalizeEmail,
  validatePassword,
  verifyPassword,
} from "./crypto";
import { getRequestMetadata } from "./request";
import { createSession } from "./session";
import type { AuthenticatedUser, LoginAudience } from "./types";
import {
  buildEnrollmentInviteUrl,
  completeEnrollmentHandoffsForUser,
  createEnrollmentHandoff,
  lockEnrollmentHandoffByToken,
  releaseEnrollmentHandoff,
  revokeOpenEnrollmentHandoffs,
  writeHandoffAudit,
} from "@/lib/admin/handoffs/service";

type LoginOutcome =
  | { ok: true; user: AuthenticatedUser }
  | { code: "invalid_credentials" | "locked" | "service_unavailable"; ok: false };

type PasswordResetRequestResult = {
  deliveredResetUrl: string | null;
};

type AuthenticateUserOptions = {
  requiredRole?: RoleName;
};

type EnrollmentCreateInput = {
  actorUserId: string;
  email: string;
  fullName: string;
  targetExamEventId: string | null;
  handoffMethod?: EnrollmentHandoffMethod;
};

type EnrollmentUpdateInput = {
  actorUserId: string;
  email: string;
  fullName: string;
  targetExamEventId: string | null;
  userId: string;
};

const ACTIVE_HANDOFF_STATUSES = [
  EnrollmentHandoffStatus.pending,
  EnrollmentHandoffStatus.released,
] as const;

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

async function ensureExamEventExists(targetExamEventId: string | null) {
  if (!targetExamEventId) {
    return null;
  }

  const examEvent = await prisma.examEvent.findFirst({
    where: {
      id: targetExamEventId,
      isActive: true,
    },
  });

  if (!examEvent) {
    throw new Error("Selected exam event could not be found.");
  }

  return examEvent;
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
      const unlocked = await prisma.user.updateMany({
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

      if (unlocked.count === 1) {
        user = {
          ...user,
          failedLoginCount: 0,
          lockedUntil: null,
          status: UserStatus.active,
        };
      }
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

      await prisma.user.updateMany({
        data: {
          failedLoginCount,
          lockedUntil,
          status: shouldLockAccount ? UserStatus.locked : user.status,
        },
        where: {
          id: user.id,
          softDeletedAt: null,
          status: { notIn: [UserStatus.disabled, UserStatus.soft_deleted] },
        },
      });

      await recordLoginAttempt({
        email: normalizedEmail,
        failureReason: shouldLockAccount ? "max_failed_attempts" : "invalid_password",
        result: shouldLockAccount ? LoginAttemptResult.locked : LoginAttemptResult.failed,
        userId: user.id,
      });

      return {
        code: shouldLockAccount ? "locked" : "invalid_credentials",
        ok: false,
      };
    }

    const loginState = await prisma.user.updateMany({
      data: {
        failedLoginCount: 0,
        lastLoginAt: new Date(),
        lockedUntil: null,
        status: UserStatus.active,
      },
      where: {
        id: user.id,
        softDeletedAt: null,
        status: { notIn: [UserStatus.disabled, UserStatus.soft_deleted] },
      },
    });

    if (loginState.count !== 1) {
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

    const session = await createSession(user.id);

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

  const passwordHash = await hashPassword(nextPassword);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const candidate = await tx.$queryRaw<Array<{ id: string; user_id: string }>>`
      SELECT id, user_id
      FROM password_reset_tokens
      WHERE token_hash = ${hashToken(rawToken)}
        AND used_at IS NULL
        AND expires_at > ${now}
    `;

    if (!candidate[0]) {
      throw new Error("This reset link is invalid or has already expired.");
    }

    // First-login completion also locks the user before touching reset-token
    // rows, keeping concurrent completion paths in a deterministic order.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${candidate[0].user_id}::uuid FOR UPDATE`;

    const claimed = await tx.$queryRaw<Array<{ id: string; user_id: string }>>`
      UPDATE password_reset_tokens
      SET used_at = ${now}
      WHERE token_hash = ${hashToken(rawToken)}
        AND used_at IS NULL
        AND expires_at > ${now}
      RETURNING id, user_id
    `;

    const record = claimed[0];

    if (!record) {
      throw new Error("This reset link is invalid or has already expired.");
    }

    const user = await tx.user.findUnique({
      select: {
        id: true,
        softDeletedAt: true,
        status: true,
      },
      where: { id: record.user_id },
    });

    if (!user || user.status === UserStatus.disabled || user.status === UserStatus.soft_deleted || user.softDeletedAt) {
      throw new Error("This reset link is invalid or has already expired.");
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

async function changePasswordForUser(userId: string, nextPassword: string) {
  const validationError = validatePassword(nextPassword);

  if (validationError) {
    throw new Error(validationError);
  }

  const passwordHash = await hashPassword(nextPassword);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const users = await tx.$queryRaw<Array<{
      soft_deleted_at: Date | null;
      status: UserStatus;
    }>>`
      SELECT status, soft_deleted_at
      FROM users
      WHERE id = ${userId}::uuid
      FOR UPDATE
    `;

    const currentUser = users[0];

    if (
      !currentUser
      || currentUser.status === UserStatus.disabled
      || currentUser.status === UserStatus.soft_deleted
      || currentUser.soft_deleted_at
    ) {
      throw new Error("The account is inactive and cannot complete first-login setup.");
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

    if (handoff.expires_at !== null && handoff.expires_at <= now) {
      const expired = await tx.enrollmentHandoff.updateMany({
        data: {
          secretEnvelope: Prisma.DbNull,
          status: EnrollmentHandoffStatus.expired,
        },
        where: {
          id: handoff.id,
          expiresAt: { lte: now },
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

    return { expired: false as const };
  });

  if (outcome.expired) {
    throw new Error("This invite link is invalid or has already expired.");
  }

  return { completed: true as const };
}

async function createStudentEnrollment(input: EnrollmentCreateInput) {
  await ensureExamEventExists(input.targetExamEventId);

  const handoffMethod = input.handoffMethod ?? EnrollmentHandoffMethod.temporary_password;
  const rawSecret = handoffMethod === EnrollmentHandoffMethod.invite_link
    ? createOpaqueToken()
    : generateTemporaryPassword();
  const passwordHash = await hashPassword(
    handoffMethod === EnrollmentHandoffMethod.temporary_password
      ? rawSecret
      : createOpaqueToken(24),
  );
  const expiresAt = handoffMethod === EnrollmentHandoffMethod.invite_link
    ? new Date(Date.now() + 24 * 60 * 60 * 1000)
    : null;
  const inviteUrl = handoffMethod === EnrollmentHandoffMethod.invite_link
    ? buildEnrollmentInviteUrl(rawSecret)
    : null;
  let handoffId = "";

  try {
    const student = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizeEmail(input.email),
          fullName: input.fullName.trim(),
          mustChangePassword: true,
          passwordHash,
          status: UserStatus.active,
        },
      });

      await tx.roleAssignment.create({
        data: {
          assignedByUserId: input.actorUserId,
          role: RoleName.student,
          userId: user.id,
        },
      });

      await tx.studentProfile.create({
        data: {
          displayName: input.fullName.trim(),
          enrolledByUserId: input.actorUserId,
          targetExamEventId: input.targetExamEventId,
          userId: user.id,
        },
      });

      await tx.notificationPreference.create({
        data: {
          userId: user.id,
        },
      });

      const handoff = await createEnrollmentHandoff({
        createdByUserId: input.actorUserId,
        expiresAt,
        method: handoffMethod,
        rawSecret,
        tokenHash: handoffMethod === EnrollmentHandoffMethod.invite_link ? hashToken(rawSecret) : null,
        tx,
        userId: user.id,
      });
      handoffId = handoff.handoffId;

      await tx.auditLog.create({
        data: {
          action: "student_enrollment.created",
          actorUserId: input.actorUserId,
          metadata: {
            handoffId: handoff.handoffId,
            method: handoffMethod,
            targetExamEventId: input.targetExamEventId,
            userId: user.id,
          },
          targetId: user.id,
          targetType: "user",
        },
      });

      return user;
    });

    const released = await releaseEnrollmentHandoff({
      actorUserId: input.actorUserId,
      handoffId,
    });

    if (released.status !== "released" || !released.secret) {
      throw new Error("The enrollment handoff could not be released.");
    }

    return {
      inviteUrl: handoffMethod === EnrollmentHandoffMethod.invite_link
        ? inviteUrl
        : null,
      temporaryPassword: handoffMethod === EnrollmentHandoffMethod.temporary_password
        ? released.secret
        : null,
      userId: student.id,
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("A student account with that email already exists.");
    }

    throw error;
  }
}

async function updateStudentEnrollment(input: EnrollmentUpdateInput) {
  await ensureExamEventExists(input.targetExamEventId);

  try {
    await prisma.$transaction([
      prisma.user.update({
        data: {
          email: normalizeEmail(input.email),
          fullName: input.fullName.trim(),
        },
        where: {
          id: input.userId,
        },
      }),
      prisma.studentProfile.update({
        data: {
          displayName: input.fullName.trim(),
          targetExamEventId: input.targetExamEventId,
        },
        where: {
          userId: input.userId,
        },
      }),
      prisma.auditLog.create({
        data: {
          action: "student_enrollment.updated",
          actorUserId: input.actorUserId,
          metadata: {
            email: normalizeEmail(input.email),
            targetExamEventId: input.targetExamEventId,
          },
          targetId: input.userId,
          targetType: "user",
        },
      }),
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("A student account with that email already exists.");
    }

    throw error;
  }
}

async function setStudentEnrollmentStatus({
  actorUserId,
  nextStatus,
  userId,
}: {
  actorUserId: string;
  nextStatus: "active" | "disabled";
  userId: string;
}) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      data: { status: nextStatus },
      where: { id: userId },
    });

    if (nextStatus === UserStatus.disabled) {
      await revokeOpenEnrollmentHandoffs(tx, userId, actorUserId);
      await tx.authSession.updateMany({
        data: {
          revokedAt: new Date(),
          status: SessionStatus.revoked,
        },
        where: {
          status: SessionStatus.active,
          userId,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        action:
          nextStatus === UserStatus.disabled
            ? "student_enrollment.deactivated"
            : "student_enrollment.reactivated",
        actorUserId,
        metadata: {
          method: "admin_status_change",
          nextStatus,
          userId,
        },
        targetId: userId,
        targetType: "user",
      },
    });
  });
}

export {
  authenticateUser,
  changePasswordForUser,
  completeEnrollmentInvite,
  completePasswordReset,
  createStudentEnrollment,
  getValidPasswordResetRecord,
  requestPasswordReset,
  setStudentEnrollmentStatus,
  updateStudentEnrollment,
};
