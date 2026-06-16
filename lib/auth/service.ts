import {
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
import { createSession, revokeAllUserSessions } from "./session";
import type { AuthenticatedUser, LoginAudience } from "./types";

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
};

type EnrollmentUpdateInput = {
  actorUserId: string;
  email: string;
  fullName: string;
  targetExamEventId: string | null;
  userId: string;
};

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
      user = await prisma.user.update({
        data: {
          failedLoginCount: 0,
          lockedUntil: null,
          status: UserStatus.active,
        },
        include: {
          roleAssignments: true,
          studentProfile: true,
        },
        where: {
          id: user.id,
        },
      });
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

      await prisma.user.update({
        data: {
          failedLoginCount,
          lockedUntil,
          status: shouldLockAccount ? UserStatus.locked : user.status,
        },
        where: {
          id: user.id,
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

    await prisma.user.update({
      data: {
        failedLoginCount: 0,
        lastLoginAt: new Date(),
        lockedUntil: null,
        status: UserStatus.active,
      },
      where: {
        id: user.id,
      },
    });

    await recordLoginAttempt({
      email: normalizedEmail,
      result: LoginAttemptResult.success,
      userId: user.id,
    });

    await createSession(user.id);

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

  const query = audience === "admin" ? "?audience=admin" : "";
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

  const record = await getValidPasswordResetRecord(rawToken);

  if (!record) {
    throw new Error("This reset link is invalid or has already expired.");
  }

  const passwordHash = await hashPassword(nextPassword);
  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        mustChangePassword: false,
        passwordHash,
        passwordUpdatedAt: now,
        status: UserStatus.active,
      },
      where: {
        id: record.userId,
      },
    }),
    prisma.passwordResetToken.update({
      data: {
        usedAt: now,
      },
      where: {
        id: record.id,
      },
    }),
    prisma.passwordResetToken.updateMany({
      data: {
        usedAt: now,
      },
      where: {
        id: {
          not: record.id,
        },
        usedAt: null,
        userId: record.userId,
      },
    }),
    prisma.authSession.updateMany({
      data: {
        revokedAt: now,
        status: SessionStatus.revoked,
      },
      where: {
        status: SessionStatus.active,
        userId: record.userId,
      },
    }),
  ]);
}

async function changePasswordForUser(userId: string, nextPassword: string) {
  const validationError = validatePassword(nextPassword);

  if (validationError) {
    throw new Error(validationError);
  }

  const passwordHash = await hashPassword(nextPassword);
  const now = new Date();

  await prisma.$transaction([
    prisma.user.update({
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        mustChangePassword: false,
        passwordHash,
        passwordUpdatedAt: now,
        status: UserStatus.active,
      },
      where: {
        id: userId,
      },
    }),
    prisma.passwordResetToken.updateMany({
      data: {
        usedAt: now,
      },
      where: {
        usedAt: null,
        userId,
      },
    }),
  ]);
}

async function createStudentEnrollment(input: EnrollmentCreateInput) {
  await ensureExamEventExists(input.targetExamEventId);

  const password = generateTemporaryPassword();
  const passwordHash = await hashPassword(password);

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

      await tx.auditLog.create({
        data: {
          action: "student_enrollment.created",
          actorUserId: input.actorUserId,
          metadata: {
            email: normalizeEmail(input.email),
            targetExamEventId: input.targetExamEventId,
          },
          targetId: user.id,
          targetType: "user",
        },
      });

      return user;
    });

    return {
      temporaryPassword: password,
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
  await prisma.$transaction([
    prisma.user.update({
      data: {
        status: nextStatus,
      },
      where: {
        id: userId,
      },
    }),
    prisma.auditLog.create({
      data: {
        action:
          nextStatus === UserStatus.disabled
            ? "student_enrollment.deactivated"
            : "student_enrollment.reactivated",
        actorUserId,
        metadata: {
          nextStatus,
        },
        targetId: userId,
        targetType: "user",
      },
    }),
  ]);

  if (nextStatus === UserStatus.disabled) {
    await revokeAllUserSessions(userId);
  }
}

export {
  authenticateUser,
  changePasswordForUser,
  completePasswordReset,
  createStudentEnrollment,
  getValidPasswordResetRecord,
  requestPasswordReset,
  setStudentEnrollmentStatus,
  updateStudentEnrollment,
};
