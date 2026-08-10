import {
  EnrollmentHandoffMethod,
  Prisma,
  RoleName,
  SessionStatus,
  UserStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildEnrollmentInviteUrl,
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
} from "@/lib/auth/crypto";

const MAX_EMAIL_LENGTH = 254;
const MAX_FULL_NAME_LENGTH = 160;
const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_PHONE_LENGTH = 40;
const MAX_HEADLINE_LENGTH = 160;
const MAX_BIO_LENGTH = 2_000;

type EnrollmentRole = "student" | "tutor";
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

type StudentEnrollmentUpdateInput = {
  actorUserId: string;
  email: string;
  fullName: string;
  targetExamEventId?: string | null;
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
          role: role === "student" ? RoleName.student : RoleName.tutor,
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
      } else {
        await tx.tutorProfile.create({
          data: {
            bio: bio ?? null,
            headline: headline ?? null,
            userId: createdUser.id,
          },
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
          action: role === "student"
            ? "student_enrollment.created"
            : "kapten_enrollment.created",
          actorUserId,
          metadata: {
            handoffId: handoff.handoffId,
            method: handoffMethod,
            role,
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

async function assertEnrollmentRole(
  tx: Prisma.TransactionClient,
  userId: string,
  role: EnrollmentRole,
) {
  const assignment = await tx.roleAssignment.findFirst({
    select: { id: true },
    where: {
      revokedAt: null,
      role: role === "student" ? RoleName.student : RoleName.tutor,
      userId,
    },
  });

  if (!assignment) {
    throw new EnrollmentServiceError(
      role === "student" ? "not_found" : "role_conflict",
      role === "student"
        ? "The student account could not be found."
        : "The Kapten account could not be found.",
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
        action: input.role === "student"
          ? input.nextStatus === UserStatus.disabled
            ? "student_enrollment.deactivated"
            : "student_enrollment.reactivated"
          : input.nextStatus === UserStatus.disabled
            ? "kapten_enrollment.deactivated"
            : "kapten_enrollment.reactivated",
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

async function setStudentEnrollmentStatus(input: Omit<SetEnrollmentStatusInput, "role">) {
  return setEnrollmentStatus({ ...input, role: "student" });
}

async function setKaptenEnrollmentStatus(input: Omit<SetEnrollmentStatusInput, "role">) {
  return setEnrollmentStatus({ ...input, role: "tutor" });
}

export {
  EnrollmentServiceError,
  createKaptenEnrollment,
  createStudentEnrollment,
  setEnrollmentStatus,
  setKaptenEnrollmentStatus,
  setStudentEnrollmentStatus,
  updateKaptenEnrollment,
  updateStudentEnrollment,
};

export type {
  EnrollmentErrorCode,
  EnrollmentHandoffResult,
  KaptenEnrollmentInput,
  KaptenEnrollmentUpdateInput,
  SetEnrollmentStatusInput,
  StudentEnrollmentInput,
  StudentEnrollmentUpdateInput,
};
