import "server-only";

import {
  Prisma,
  RoleName,
  UserStatus,
} from "@/generated/prisma/client";
import type { SessionContext } from "@/lib/auth/types";
import { isAdminStudentPreviewEnabled } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import { createAdminStudentPreviewSurfaceContext } from "@/lib/student/surface-context";
import { isManagedPreviewPurpose } from "@/lib/admin/student-preview-contract";

const ADMIN_STUDENT_PREVIEW_PURPOSE = "admin.student-preview" as const;
const ADMIN_STUDENT_PREVIEW_FIXTURE_ID = "00000000-0000-4000-8000-000000000001" as const;
const ADMIN_STUDENT_PREVIEW_FIXTURE_EMAIL = "admin-student-preview@vecalss.local" as const;

type AdminStudentPreviewUnavailableCode =
  | "feature_disabled"
  | "fixture_ambiguous"
  | "fixture_missing"
  | "fixture_invalid";

class AdminStudentPreviewUnavailableError extends Error {
  readonly code: AdminStudentPreviewUnavailableCode;

  constructor(code: AdminStudentPreviewUnavailableCode, message: string) {
    super(message);
    this.name = "AdminStudentPreviewUnavailableError";
    this.code = code;
  }
}

function assertAdminStudentPreviewEnabled() {
  if (!isAdminStudentPreviewEnabled()) {
    throw new AdminStudentPreviewUnavailableError(
      "feature_disabled",
      "Student preview is currently unavailable.",
    );
  }
}

type AdminStudentPreviewSubject = {
  displayName: string;
  id: string;
  locale: "id-ID";
  previewPurpose: typeof ADMIN_STUDENT_PREVIEW_PURPOSE;
  timezone: string;
};

type AdminStudentPreviewContext = ReturnType<typeof createAdminStudentPreviewSurfaceContext>;

function isAdminStudentPreviewUnavailableError(error: unknown): error is AdminStudentPreviewUnavailableError {
  return error instanceof AdminStudentPreviewUnavailableError;
}

async function resolveAdminStudentPreviewSubject(): Promise<AdminStudentPreviewSubject | null> {
  const fixtures = await prisma.user.findMany({
    select: {
      email: true,
      fullName: true,
      id: true,
      previewPurpose: true,
      roleAssignments: {
        select: {
          revokedAt: true,
          role: true,
        },
      },
      softDeletedAt: true,
      status: true,
      studentProfile: {
        select: {
          displayName: true,
          timezone: true,
        },
      },
    },
    where: {
      previewPurpose: ADMIN_STUDENT_PREVIEW_PURPOSE,
    },
  });

  if (fixtures.length !== 1) {
    return null;
  }

  const fixture = fixtures[0];
  const activeRoles = fixture.roleAssignments
    .filter((assignment) => assignment.revokedAt === null)
    .map((assignment) => assignment.role);
  const hasOnlyActiveStudentRole = activeRoles.length === 1 && activeRoles[0] === RoleName.student;

  if (
    fixture.id !== ADMIN_STUDENT_PREVIEW_FIXTURE_ID
    || fixture.email !== ADMIN_STUDENT_PREVIEW_FIXTURE_EMAIL
    || fixture.previewPurpose !== ADMIN_STUDENT_PREVIEW_PURPOSE
    || fixture.status !== UserStatus.active
    || fixture.softDeletedAt !== null
    || !hasOnlyActiveStudentRole
    || !fixture.studentProfile
  ) {
    return null;
  }

  return {
    displayName: fixture.studentProfile.displayName?.trim() || fixture.fullName,
    id: fixture.id,
    locale: "id-ID",
    previewPurpose: ADMIN_STUDENT_PREVIEW_PURPOSE,
    timezone: fixture.studentProfile.timezone,
  };
}

async function requireAdminStudentPreviewSubject() {
  const fixtures = await prisma.user.findMany({
    select: { email: true, id: true },
    where: { previewPurpose: ADMIN_STUDENT_PREVIEW_PURPOSE },
  });

  if (fixtures.length === 0) {
    throw new AdminStudentPreviewUnavailableError(
      "fixture_missing",
      "Fixture siswa preview terkelola belum dikonfigurasi. Minta pemilik operasi menyiapkan fixture sebelum membuka Preview.",
    );
  }

  if (fixtures.length !== 1) {
    throw new AdminStudentPreviewUnavailableError(
      "fixture_ambiguous",
      "Fixture siswa preview terkelola berjumlah lebih dari satu, sehingga Preview dinonaktifkan sampai sumbernya diperbaiki.",
    );
  }

  const subject = await resolveAdminStudentPreviewSubject();
  if (!subject) {
    throw new AdminStudentPreviewUnavailableError(
      "fixture_invalid",
      "Fixture siswa preview terkelola tidak aktif atau tidak memiliki role/profile siswa yang diperlukan.",
    );
  }

  return subject;
}

function createAdminStudentPreviewContext({
  session,
  subject,
}: {
  session: SessionContext;
  subject: AdminStudentPreviewSubject;
}): AdminStudentPreviewContext {
  return createAdminStudentPreviewSurfaceContext({
    previewPurpose: subject.previewPurpose,
    session,
    student: {
      displayName: subject.displayName,
      id: subject.id,
    },
  });
}

/**
 * Generic account lifecycle services call this before touching a user row.
 * The database trigger is the final backstop, but this error keeps ordinary
 * enrollment flows deterministic and avoids partially preparing side effects.
 */
async function assertUserIsNotManagedPreviewFixture(
  tx: Prisma.TransactionClient,
  userId: string,
) {
  const user = await tx.user.findUnique({
    select: { previewPurpose: true },
    where: { id: userId },
  });

  if (user && isManagedPreviewPurpose(user.previewPurpose)) {
    throw new Error("Managed student preview fixtures cannot be edited through generic account lifecycle actions.");
  }
}

/**
 * Approved seed/operations repair code may opt into fixture maintenance for a
 * single transaction. It never creates a replacement row and callers must
 * still address the original fixture UUID.
 */
async function allowManagedPreviewFixtureRepair(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT set_config('app.admin_student_preview_repair', 'on', true)`;
}

export {
  ADMIN_STUDENT_PREVIEW_FIXTURE_EMAIL,
  ADMIN_STUDENT_PREVIEW_FIXTURE_ID,
  ADMIN_STUDENT_PREVIEW_PURPOSE,
  AdminStudentPreviewUnavailableError,
  allowManagedPreviewFixtureRepair,
  assertAdminStudentPreviewEnabled,
  assertUserIsNotManagedPreviewFixture,
  createAdminStudentPreviewContext,
  isAdminStudentPreviewUnavailableError,
  isManagedPreviewPurpose,
  requireAdminStudentPreviewSubject,
  resolveAdminStudentPreviewSubject,
};

export type {
  AdminStudentPreviewContext,
  AdminStudentPreviewSubject,
  AdminStudentPreviewUnavailableCode,
};
