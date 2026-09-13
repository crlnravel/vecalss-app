import {
  EnrollmentHandoffMethod,
  Prisma,
  RoleName,
  SessionStatus,
  UserStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { assertUserIsNotManagedPreviewFixture } from "@/lib/admin/student-preview";
import {
  buildEnrollmentInviteUrl,
  completeEnrollmentHandoffsForUser,
  createEnrollmentHandoff,
  releaseEnrollmentHandoff,
  revokeOpenEnrollmentHandoffs,
} from "@/lib/admin/handoffs/service";
import {
  createOpaqueToken,
  generateTemporaryPassword,
  hashPassword,
  hashToken,
  normalizeEmail,
  validatePassword,
} from "@/lib/auth/crypto";
import { normalizeReferralCode } from "@/lib/affiliator/contracts";

const MAX_EMAIL_LENGTH = 254;
const MAX_FULL_NAME_LENGTH = 160;
const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_PHONE_LENGTH = 40;
const MAX_HEADLINE_LENGTH = 160;
const MAX_BIO_LENGTH = 2_000;

type EnrollmentRole = "student" | "tutor" | "affiliator";
type EnrollmentStatus = "active" | "disabled";

type EnrollmentHandoffResult = {
  handoffId: string;
  inviteUrl: string | null;
  method: EnrollmentHandoffMethod;
  temporaryPassword: string | null;
  userId: string;
};

type StudentEnrollmentInput = {
  actorUserId: string;
  email: string;
  fullName: string;
  handoffMethod?: EnrollmentHandoffMethod;
  targetExamEventId?: string | null;
};

type KaptenEnrollmentInput = {
  actorUserId: string;
  bio?: string | null;
  email: string;
  fullName: string;
  handoffMethod?: EnrollmentHandoffMethod;
  headline?: string | null;
  phone?: string | null;
};

type AffiliatorEnrollmentInput = {
  actorUserId: string;
  email: string;
  fullName: string;
  handoffMethod?: EnrollmentHandoffMethod;
  referralCode: string;
};

type StudentEnrollmentUpdateInput = {
  actorUserId: string;
  email: string;
  fullName: string;
  targetExamEventId?: string | null;
  userId: string;
};

type DeleteStudentEnrollmentInput = {
  actorUserId: string;
  userId: string;
};

type ChangeStudentEnrollmentPasswordInput = {
  actorUserId: string;
  password: string;
  userId: string;
};

type KaptenEnrollmentUpdateInput = {
  actorUserId: string;
  bio?: string | null;
  email: string;
  fullName: string;
  headline?: string | null;
  phone?: string | null;
  userId: string;
};

type SetEnrollmentStatusInput = {
  actorUserId: string;
  confirmed: boolean;
  nextStatus: EnrollmentStatus;
  role: EnrollmentRole;
  userId: string;
};

type SetEnrollmentStatusBulkInput = {
  actorUserId: string;
  confirmed: boolean;
  nextStatus: EnrollmentStatus;
  role: EnrollmentRole;
  userIds: string[];
};

type EnrollmentStatusBulkResult = {
  changedCount: number;
  skippedCount: number;
};

type EnrollmentErrorCode =
  | "confirmation_required"
  | "duplicate_email"
  | "invalid_email"
  | "invalid_field"
  | "invalid_handoff_method"
  | "invalid_status_transition"
  | "not_found"
  | "role_conflict";

class EnrollmentServiceError extends Error {
  readonly code: EnrollmentErrorCode;

  constructor(code: EnrollmentErrorCode, message: string) {
    super(message);
    this.name = "EnrollmentServiceError";
    this.code = code;
  }
}

function invalidField(message: string): never {
  throw new EnrollmentServiceError("invalid_field", message);
}

function cleanRequired(value: string, label: string, maxLength: number) {
  const normalized = value.trim();

  if (!normalized) {
    invalidField(`${label} is required.`);
  }

  if (normalized.length > maxLength) {
    invalidField(`${label} must be ${maxLength} characters or fewer.`);
  }

  return normalized;
}

function cleanOptional(value: string | null | undefined, label: string, maxLength: number) {
  const normalized = value?.trim() ?? "";

  if (normalized.length > maxLength) {
    invalidField(`${label} must be ${maxLength} characters or fewer.`);
  }

  return normalized || null;
}

function cleanEmail(value: string) {
  const normalized = normalizeEmail(value);

  if (
    !normalized
    || normalized.length > MAX_EMAIL_LENGTH
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new EnrollmentServiceError("invalid_email", "Enter a valid email address.");
  }

  return normalized;
}

function assertHandoffMethod(method: EnrollmentHandoffMethod) {
  if (
    method !== EnrollmentHandoffMethod.invite_link
    && method !== EnrollmentHandoffMethod.temporary_password
  ) {
    throw new EnrollmentServiceError("invalid_handoff_method", "Choose a valid credential handoff method.");
  }
}

function mapPrismaEnrollmentError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    const target = Array.isArray(error.meta?.target)
      ? error.meta.target.map(String).join(",")
      : String(error.meta?.target ?? "");

    if (target.includes("referral_code")) {
      throw new EnrollmentServiceError(
        "invalid_field",
        "That referral code is already assigned to another affiliator.",
      );
    }

    throw new EnrollmentServiceError(
      "duplicate_email",
      "An account with that email already exists.",
    );
  }

  throw error;
}

async function assertTargetExamEvent(
  tx: Prisma.TransactionClient,
  targetExamEventId: string | null,
) {
  if (!targetExamEventId) {
    return;
  }

  const examEvent = await tx.examEvent.findFirst({
    select: { id: true },
    where: {
      id: targetExamEventId,
      isActive: true,
    },
  });

  if (!examEvent) {
    throw new EnrollmentServiceError("invalid_field", "Selected exam event could not be found.");
  }
}

async function assertNoExistingEmail(tx: Prisma.TransactionClient, email: string, userId?: string) {
  const existing = await tx.user.findFirst({
    select: { id: true },
    where: { email },
  });

  if (existing && existing.id !== userId) {
    throw new EnrollmentServiceError(
      "duplicate_email",
      "An account with that email already exists.",
    );
  }
}

function roleNameForEnrollmentRole(role: EnrollmentRole) {
  switch (role) {
    case "student":
      return RoleName.student;
    case "tutor":
      return RoleName.tutor;
    case "affiliator":
      return RoleName.affiliator;
  }
}

function enrollmentRoleLabel(role: EnrollmentRole) {
  switch (role) {
    case "student":
      return "student";
    case "tutor":
      return "Kapten";
    case "affiliator":
      return "affiliator";
  }
}

function enrollmentAuditPrefix(role: EnrollmentRole) {
  switch (role) {
    case "student":
      return "student_enrollment";
    case "tutor":
      return "kapten_enrollment";
    case "affiliator":
      return "affiliator_enrollment";
  }
}

async function createEnrollmentHandoffResult({
  actorUserId,
  email,
  fullName,
  handoffMethod,
  role,
  targetExamEventId,
  phone,
  headline,
  bio,
  referralCode,
}: {
  actorUserId: string;
  email: string;
  fullName: string;
  handoffMethod: EnrollmentHandoffMethod;
  role: EnrollmentRole;
  targetExamEventId?: string | null;
  phone?: string | null;
  headline?: string | null;
  bio?: string | null;
  referralCode?: string;
}): Promise<EnrollmentHandoffResult> {
  const rawSecret = handoffMethod === EnrollmentHandoffMethod.invite_link
    ? createOpaqueToken()
    : generateTemporaryPassword();
  const passwordHash = await hashPassword(
    handoffMethod === EnrollmentHandoffMethod.temporary_password
      ? rawSecret
      : createOpaqueToken(24),
  );
  if (handoffMethod === EnrollmentHandoffMethod.invite_link) {
    // Validate the trusted origin before creating the account. The released
    // token is still rebuilt only after the handoff CAS succeeds below.
    buildEnrollmentInviteUrl(rawSecret);
  }
  let handoffId = "";

  try {
    const user = await prisma.$transaction(async (tx) => {
      // This check gives callers a stable, field-level error in the common
      // path. The unique lower(email) index remains the final race-safe guard.
      await assertNoExistingEmail(tx, email);
      await assertTargetExamEvent(tx, targetExamEventId ?? null);

      const createdUser = await tx.user.create({
        data: {
          email,
          fullName,
          mustChangePassword: true,
          passwordHash,
          phone: phone ?? null,
          status: UserStatus.active,
        },
      });

      await tx.roleAssignment.create({
        data: {
          assignedByUserId: actorUserId,
          role: roleNameForEnrollmentRole(role),
          userId: createdUser.id,
        },
      });

      if (role === "student") {
        await tx.studentProfile.create({
          data: {
            displayName: fullName,
            enrolledByUserId: actorUserId,
            targetExamEventId: targetExamEventId ?? null,
            userId: createdUser.id,
          },
        });

        // Preserve the existing student enrollment behavior.
        await tx.notificationPreference.create({
          data: { userId: createdUser.id },
        });
      } else if (role === "tutor") {
        await tx.tutorProfile.create({
          data: {
            bio: bio ?? null,
            headline: headline ?? null,
            userId: createdUser.id,
          },
        });
      } else {
        if (!referralCode) {
          throw new EnrollmentServiceError("invalid_field", "Referral code is required for an affiliator.");
        }

        await tx.affiliatorProfile.create({
          data: {
            referralCode,
            userId: createdUser.id,
          },
        });

        await tx.notificationPreference.create({
          data: { userId: createdUser.id },
        });
      }

      const handoff = await createEnrollmentHandoff({
        createdByUserId: actorUserId,
        method: handoffMethod,
        rawSecret,
        tokenHash: handoffMethod === EnrollmentHandoffMethod.invite_link
          ? hashToken(rawSecret)
          : null,
        tx,
        userId: createdUser.id,
      });
      handoffId = handoff.handoffId;

      await tx.auditLog.create({
        data: {
          action: `${enrollmentAuditPrefix(role)}.created`,
          actorUserId,
          metadata: {
            handoffId: handoff.handoffId,
            method: handoffMethod,
            role,
            referralCode: referralCode ?? null,
            targetExamEventId: targetExamEventId ?? null,
            userId: createdUser.id,
          } as Prisma.InputJsonValue,
          targetId: createdUser.id,
          targetType: "user",
        },
      });

      return createdUser;
    });

    // Release is deliberately outside the create transaction: the committed
    // handoff is the recovery point if the response is lost.
    const released = await releaseEnrollmentHandoff({
      actorUserId,
      handoffId,
    });

    if (released.status !== "released" || !released.secret) {
      throw new Error("The enrollment handoff could not be released.");
    }

    return {
      handoffId,
      inviteUrl: handoffMethod === EnrollmentHandoffMethod.invite_link
        ? buildEnrollmentInviteUrl(released.secret)
        : null,
      method: handoffMethod,
      temporaryPassword: handoffMethod === EnrollmentHandoffMethod.temporary_password
        ? released.secret
        : null,
      userId: user.id,
    };
  } catch (error) {
    mapPrismaEnrollmentError(error);
  }
}

async function createStudentEnrollment(input: StudentEnrollmentInput) {
  const fullName = cleanRequired(input.fullName, "Student name", MAX_DISPLAY_NAME_LENGTH);
  const email = cleanEmail(input.email);
  const targetExamEventId = input.targetExamEventId?.trim() || null;
  const handoffMethod = input.handoffMethod ?? EnrollmentHandoffMethod.temporary_password;
  assertHandoffMethod(handoffMethod);

  return createEnrollmentHandoffResult({
    actorUserId: input.actorUserId,
    email,
    fullName,
    handoffMethod,
    role: "student",
    targetExamEventId,
  });
}

async function createKaptenEnrollment(input: KaptenEnrollmentInput) {
  const fullName = cleanRequired(input.fullName, "Kapten name", MAX_FULL_NAME_LENGTH);
  const email = cleanEmail(input.email);
  const handoffMethod = input.handoffMethod ?? EnrollmentHandoffMethod.temporary_password;
  assertHandoffMethod(handoffMethod);

  return createEnrollmentHandoffResult({
    actorUserId: input.actorUserId,
    bio: cleanOptional(input.bio, "Kapten bio", MAX_BIO_LENGTH),
    email,
    fullName,
    handoffMethod,
    headline: cleanOptional(input.headline, "Kapten headline", MAX_HEADLINE_LENGTH),
    phone: cleanOptional(input.phone, "Kapten phone", MAX_PHONE_LENGTH),
    role: "tutor",
  });
}

async function createAffiliatorEnrollment(input: AffiliatorEnrollmentInput) {
  const fullName = cleanRequired(input.fullName, "Affiliator name", MAX_FULL_NAME_LENGTH);
  const email = cleanEmail(input.email);
  const referralCode = normalizeReferralCode(input.referralCode);
  if (!referralCode) {
    invalidField("Referral code must be 3-40 characters using letters, numbers, or hyphens.");
  }

  const handoffMethod = input.handoffMethod ?? EnrollmentHandoffMethod.temporary_password;
  assertHandoffMethod(handoffMethod);

  return createEnrollmentHandoffResult({
    actorUserId: input.actorUserId,
    email,
    fullName,
    handoffMethod,
    referralCode,
    role: "affiliator",
  });
}

async function assertEnrollmentRole(
  tx: Prisma.TransactionClient,
  userId: string,
  role: EnrollmentRole,
) {
  await assertUserIsNotManagedPreviewFixture(tx, userId);

  const assignment = await tx.roleAssignment.findFirst({
    select: { id: true },
    where: {
      revokedAt: null,
      role: roleNameForEnrollmentRole(role),
      userId,
    },
  });

  if (!assignment) {
    throw new EnrollmentServiceError(
      role === "student" ? "not_found" : "role_conflict",
      role === "student"
        ? "The student account could not be found."
        : `The ${enrollmentRoleLabel(role)} account could not be found.`,
    );
  }
}

async function updateStudentEnrollment(input: StudentEnrollmentUpdateInput) {
  const fullName = cleanRequired(input.fullName, "Student name", MAX_DISPLAY_NAME_LENGTH);
  const email = cleanEmail(input.email);
  const targetExamEventId = input.targetExamEventId?.trim() || null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.userId}::uuid FOR UPDATE`;
      await assertEnrollmentRole(tx, input.userId, "student");
      await assertNoExistingEmail(tx, email, input.userId);
      await assertTargetExamEvent(tx, targetExamEventId);

      await tx.user.update({
        data: { email, fullName },
        where: { id: input.userId },
      });

      await tx.studentProfile.upsert({
        create: {
          displayName: fullName,
          enrolledByUserId: input.actorUserId,
          targetExamEventId,
          userId: input.userId,
        },
        update: {
          displayName: fullName,
          targetExamEventId,
        },
        where: { userId: input.userId },
      });

      await tx.auditLog.create({
        data: {
          action: "student_enrollment.updated",
          actorUserId: input.actorUserId,
          metadata: {
            email,
            targetExamEventId,
          } as Prisma.InputJsonValue,
          targetId: input.userId,
          targetType: "user",
        },
      });
    });
  } catch (error) {
    mapPrismaEnrollmentError(error);
  }
}

async function updateKaptenEnrollment(input: KaptenEnrollmentUpdateInput) {
  const fullName = cleanRequired(input.fullName, "Kapten name", MAX_FULL_NAME_LENGTH);
  const email = cleanEmail(input.email);
  const phone = cleanOptional(input.phone, "Kapten phone", MAX_PHONE_LENGTH);
  const headline = cleanOptional(input.headline, "Kapten headline", MAX_HEADLINE_LENGTH);
  const bio = cleanOptional(input.bio, "Kapten bio", MAX_BIO_LENGTH);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.userId}::uuid FOR UPDATE`;
      await assertEnrollmentRole(tx, input.userId, "tutor");
      await assertNoExistingEmail(tx, email, input.userId);

      await tx.user.update({
        data: { email, fullName, phone },
        where: { id: input.userId },
      });

      await tx.tutorProfile.upsert({
        create: { bio, headline, userId: input.userId },
        update: { bio, headline },
        where: { userId: input.userId },
      });

      await tx.auditLog.create({
        data: {
          action: "kapten_enrollment.updated",
          actorUserId: input.actorUserId,
          metadata: {
            email,
            profileFields: "phone,headline,bio",
          } as Prisma.InputJsonValue,
          targetId: input.userId,
          targetType: "user",
        },
      });
    });
  } catch (error) {
    mapPrismaEnrollmentError(error);
  }
}

async function deleteStudentEnrollment(input: DeleteStudentEnrollmentInput) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.userId}::uuid FOR UPDATE`;
    await assertEnrollmentRole(tx, input.userId, "student");

    const current = await tx.user.findUnique({
      select: {
        softDeletedAt: true,
        status: true,
      },
      where: { id: input.userId },
    });

    if (
      !current
      || current.softDeletedAt !== null
      || current.status === UserStatus.soft_deleted
    ) {
      throw new EnrollmentServiceError("not_found", "The student account could not be found.");
    }

    const now = new Date();

    await tx.user.update({
      data: {
        passwordUpdatedAt: now,
        softDeletedAt: now,
        status: UserStatus.soft_deleted,
      },
      where: { id: input.userId },
    });

    await revokeOpenEnrollmentHandoffs(tx, input.userId, input.actorUserId);
    await tx.authSession.updateMany({
      data: {
        revokedAt: now,
        status: SessionStatus.revoked,
      },
      where: {
        status: SessionStatus.active,
        userId: input.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "student_enrollment.deleted",
        actorUserId: input.actorUserId,
        metadata: {
          method: "admin_delete",
          role: "student",
          userId: input.userId,
        } as Prisma.InputJsonValue,
        targetId: input.userId,
        targetType: "user",
      },
    });
  });
}

async function changeStudentEnrollmentPassword(input: ChangeStudentEnrollmentPasswordInput) {
  const validationError = validatePassword(input.password);

  if (validationError) {
    throw new EnrollmentServiceError("invalid_field", validationError);
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.userId}::uuid FOR UPDATE`;
    await assertEnrollmentRole(tx, input.userId, "student");

    const current = await tx.user.findUnique({
      select: {
        softDeletedAt: true,
        status: true,
      },
      where: { id: input.userId },
    });

    if (
      !current
      || current.softDeletedAt !== null
      || current.status === UserStatus.soft_deleted
    ) {
      throw new EnrollmentServiceError("not_found", "The student account could not be found.");
    }

    const now = new Date();

    await tx.user.update({
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        mustChangePassword: false,
        passwordHash,
        passwordUpdatedAt: now,
        status: current.status === UserStatus.locked ? UserStatus.active : current.status,
      },
      where: { id: input.userId },
    });

    await tx.passwordResetToken.updateMany({
      data: { usedAt: now },
      where: {
        usedAt: null,
        userId: input.userId,
      },
    });

    await completeEnrollmentHandoffsForUser(tx, input.userId, input.actorUserId);

    await tx.authSession.updateMany({
      data: {
        revokedAt: now,
        status: SessionStatus.revoked,
      },
      where: {
        status: SessionStatus.active,
        userId: input.userId,
      },
    });

    await tx.auditLog.create({
      data: {
        action: "student_enrollment.password_changed",
        actorUserId: input.actorUserId,
        metadata: {
          method: "admin_password_change",
          userId: input.userId,
        } as Prisma.InputJsonValue,
        targetId: input.userId,
        targetType: "user",
      },
    });
  });
}

async function setEnrollmentStatus(input: SetEnrollmentStatusInput) {
  if (!input.confirmed) {
    throw new EnrollmentServiceError(
      "confirmation_required",
      "Explicit confirmation is required to change account status.",
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.userId}::uuid FOR UPDATE`;
    await assertEnrollmentRole(tx, input.userId, input.role);

    const current = await tx.user.findUnique({
      select: {
        softDeletedAt: true,
        status: true,
      },
      where: { id: input.userId },
    });

    if (
      !current
      || current.softDeletedAt !== null
      || current.status === UserStatus.soft_deleted
    ) {
      throw new EnrollmentServiceError("not_found", "The account could not be found.");
    }

    const expectedCurrentStatus = input.nextStatus === UserStatus.disabled
      ? UserStatus.active
      : UserStatus.disabled;

    if (current.status !== expectedCurrentStatus) {
      throw new EnrollmentServiceError(
        "invalid_status_transition",
        input.nextStatus === UserStatus.active
          ? "Only a disabled account can be reactivated through enrollment."
          : "Only an active account can be deactivated through enrollment.",
      );
    }

    const now = new Date();

    await tx.user.update({
      data: {
        // Treat status transitions as credential-generation changes so a
        // bcrypt verification that started before deactivate/reactivate
        // cannot issue a session after the account is active again.
        passwordUpdatedAt: now,
        status: input.nextStatus,
      },
      where: { id: input.userId },
    });

    if (input.nextStatus === UserStatus.disabled) {
      await revokeOpenEnrollmentHandoffs(tx, input.userId, input.actorUserId);
      await tx.authSession.updateMany({
        data: {
          revokedAt: now,
          status: SessionStatus.revoked,
        },
        where: {
          status: SessionStatus.active,
          userId: input.userId,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        action: `${enrollmentAuditPrefix(input.role)}.${input.nextStatus === UserStatus.disabled ? "deactivated" : "reactivated"}`,
        actorUserId: input.actorUserId,
        metadata: {
          method: "admin_status_change",
          nextStatus: input.nextStatus,
          role: input.role,
          userId: input.userId,
        } as Prisma.InputJsonValue,
        targetId: input.userId,
        targetType: "user",
      },
    });
  });
}

async function setEnrollmentStatusBulk(input: SetEnrollmentStatusBulkInput): Promise<EnrollmentStatusBulkResult> {
  if (!input.confirmed) {
    throw new EnrollmentServiceError(
      "confirmation_required",
      "Explicit confirmation is required to change account status.",
    );
  }

  const userIds = [...new Set(input.userIds)];
  if (!userIds.length) {
    throw new EnrollmentServiceError("invalid_field", "Select at least one account.");
  }

  if (userIds.length > 100) {
    throw new EnrollmentServiceError("invalid_field", "Select no more than 100 accounts at a time.");
  }

  const expectedCurrentStatus = input.nextStatus === UserStatus.disabled
    ? UserStatus.active
    : UserStatus.disabled;
  const lockedUserIds = [...userIds].sort((left, right) => left.localeCompare(right));

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ANY(${lockedUserIds}::uuid[]) ORDER BY id FOR UPDATE`;

    const accounts = await tx.user.findMany({
      select: {
        id: true,
        previewPurpose: true,
        softDeletedAt: true,
        status: true,
      },
      where: {
        id: { in: userIds },
        roleAssignments: {
          some: {
            revokedAt: null,
            role: roleNameForEnrollmentRole(input.role),
          },
        },
        softDeletedAt: null,
        status: { not: UserStatus.soft_deleted },
      },
    });

    if (accounts.length !== userIds.length) {
      throw new EnrollmentServiceError(
        input.role === "student" ? "not_found" : "role_conflict",
        input.role === "student"
          ? "One or more student accounts could not be found. Refresh the directory and try again."
          : `One or more ${enrollmentRoleLabel(input.role)} accounts could not be found. Refresh the directory and try again.`,
      );
    }

    if (accounts.some((account) => account.previewPurpose !== null)) {
      throw new Error("Managed student preview fixtures cannot be edited through generic account lifecycle actions.");
    }

    const eligibleAccounts = accounts.filter((account) => account.status === expectedCurrentStatus);
    if (!eligibleAccounts.length) {
      return {
        changedCount: 0,
        skippedCount: accounts.length,
      };
    }

    const eligibleUserIds = eligibleAccounts.map((account) => account.id);
    const now = new Date();

    await tx.user.updateMany({
      data: {
        passwordUpdatedAt: now,
        status: input.nextStatus,
      },
      where: { id: { in: eligibleUserIds } },
    });

    if (input.nextStatus === UserStatus.disabled) {
      await Promise.all(
        eligibleUserIds.map((userId) => revokeOpenEnrollmentHandoffs(tx, userId, input.actorUserId)),
      );

      await tx.authSession.updateMany({
        data: {
          revokedAt: now,
          status: SessionStatus.revoked,
        },
        where: {
          status: SessionStatus.active,
          userId: { in: eligibleUserIds },
        },
      });
    }

    await tx.auditLog.createMany({
      data: eligibleUserIds.map((userId) => ({
        action: `${enrollmentAuditPrefix(input.role)}.${input.nextStatus === UserStatus.disabled ? "deactivated" : "reactivated"}`,
        actorUserId: input.actorUserId,
        metadata: {
          method: "admin_bulk_status_change",
          nextStatus: input.nextStatus,
          role: input.role,
          userId,
        } as Prisma.InputJsonValue,
        targetId: userId,
        targetType: "user",
      })),
    });

    return {
      changedCount: eligibleAccounts.length,
      skippedCount: accounts.length - eligibleAccounts.length,
    };
  });
}

async function setStudentEnrollmentStatus(input: Omit<SetEnrollmentStatusInput, "role">) {
  return setEnrollmentStatus({ ...input, role: "student" });
}

async function setStudentEnrollmentStatusBulk(input: Omit<SetEnrollmentStatusBulkInput, "role">) {
  return setEnrollmentStatusBulk({ ...input, role: "student" });
}

async function setKaptenEnrollmentStatus(input: Omit<SetEnrollmentStatusInput, "role">) {
  return setEnrollmentStatus({ ...input, role: "tutor" });
}

export {
  EnrollmentServiceError,
  createAffiliatorEnrollment,
  createKaptenEnrollment,
  createStudentEnrollment,
  changeStudentEnrollmentPassword,
  deleteStudentEnrollment,
  setEnrollmentStatus,
  setEnrollmentStatusBulk,
  setKaptenEnrollmentStatus,
  setStudentEnrollmentStatus,
  setStudentEnrollmentStatusBulk,
  updateKaptenEnrollment,
  updateStudentEnrollment,
};

export type {
  EnrollmentErrorCode,
  AffiliatorEnrollmentInput,
  EnrollmentHandoffResult,
  EnrollmentStatusBulkResult,
  KaptenEnrollmentInput,
  KaptenEnrollmentUpdateInput,
  DeleteStudentEnrollmentInput,
  ChangeStudentEnrollmentPasswordInput,
  SetEnrollmentStatusInput,
  StudentEnrollmentInput,
  StudentEnrollmentUpdateInput,
};
