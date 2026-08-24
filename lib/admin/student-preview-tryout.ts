import "server-only";

import {
  AssessmentResultReleaseState,
  ContentStatus,
  Prisma,
  TryoutAdmissionStatus,
  TryoutAssignmentStatus,
  TryoutDeliverySessionStatus,
  TryoutRankingRule,
  TryoutResultReleasePolicy,
} from "@/generated/prisma/client";
import { requireAdminStudentPreviewContext } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";

import {
  canonicalizeAdminPreviewReason,
  getPreviewTryoutScheduleStatus,
  isEligiblePreviewTryoutSource,
  isUuid,
  previewCurrentAssignmentKey,
  previewRetakeName,
  previewRetakeWindowSeconds,
} from "./student-preview-tryout-contract";

type AdminPreviewTryoutRestartInput = {
  expectedCurrentAssignmentId: string | null;
  reason: string;
  requestId: string;
  sourceDeliverySessionId: string;
  tryoutId: string;
};

type AdminPreviewTryoutRestartErrorCode =
  | "invalid_request"
  | "preview_admission_repair_required"
  | "preview_assignment_invariant"
  | "preview_state_changed"
  | "request_already_used_by_other_admin"
  | "request_id_mismatch"
  | "source_session_not_eligible"
  | "tryout_not_found"
  | "tryout_not_ready";

class AdminPreviewTryoutRestartError extends Error {
  readonly code: AdminPreviewTryoutRestartErrorCode;

  constructor(code: AdminPreviewTryoutRestartErrorCode, message: string) {
    super(message);
    this.name = "AdminPreviewTryoutRestartError";
    this.code = code;
  }
}

type PreviewAssignmentForInvariant = {
  id: string;
  previewCurrentKey: string | null;
  status: TryoutAssignmentStatus;
};

function validateRestartInput(input: AdminPreviewTryoutRestartInput) {
  if (
    !input
    || typeof input !== "object"
    || typeof input.tryoutId !== "string"
    || typeof input.sourceDeliverySessionId !== "string"
    || typeof input.requestId !== "string"
    || typeof input.reason !== "string"
    || (input.expectedCurrentAssignmentId !== null && typeof input.expectedCurrentAssignmentId !== "string")
  ) {
    throw new AdminPreviewTryoutRestartError(
      "invalid_request",
      "Permintaan restart preview tidak valid.",
    );
  }

  const tryoutId = input.tryoutId.trim().toLowerCase();
  const sourceDeliverySessionId = input.sourceDeliverySessionId.trim().toLowerCase();
  const requestId = input.requestId.trim().toLowerCase();
  const expectedCurrentAssignmentId = input.expectedCurrentAssignmentId === null
    ? null
    : input.expectedCurrentAssignmentId.trim().toLowerCase();

  if (
    !isUuid(tryoutId)
    || !isUuid(sourceDeliverySessionId)
    || !isUuid(requestId)
    || (expectedCurrentAssignmentId !== null && !isUuid(expectedCurrentAssignmentId))
  ) {
    throw new AdminPreviewTryoutRestartError(
      "invalid_request",
      "Tryout, sesi sumber, request ID, atau konfirmasi assignment tidak valid.",
    );
  }

  let canonicalReason: string;
  try {
    canonicalReason = canonicalizeAdminPreviewReason(input.reason);
  } catch (error) {
    throw new AdminPreviewTryoutRestartError(
      "invalid_request",
      error instanceof Error ? error.message : "Alasan audit tidak valid.",
    );
  }

  return {
    canonicalReason,
    expectedCurrentAssignmentId,
    rawReason: input.reason,
    requestId,
    sourceDeliverySessionId,
    tryoutId,
  };
}

function assertPreviewAssignmentInvariant<T extends PreviewAssignmentForInvariant>(
  assignments: T[],
  expectedKey: string,
): T | null {
  const active = assignments.filter((assignment) => assignment.status === TryoutAssignmentStatus.active);
  const superseded = assignments.filter((assignment) => assignment.status === TryoutAssignmentStatus.superseded);

  if (active.length > 1) {
    throw new AdminPreviewTryoutRestartError(
      "preview_assignment_invariant",
      "Preview memiliki lebih dari satu assignment aktif. Perbaiki state operasi sebelum melanjutkan.",
    );
  }

  const current = active[0] ?? null;
  if (current && current.previewCurrentKey !== expectedKey) {
    throw new AdminPreviewTryoutRestartError(
      "preview_assignment_invariant",
      "Assignment aktif preview tidak memiliki current key yang valid. Perbaiki state operasi sebelum melanjutkan.",
    );
  }

  if (!current && superseded.length > 0) {
    throw new AdminPreviewTryoutRestartError(
      "preview_assignment_invariant",
      "Riwayat assignment preview tidak memiliki assignment current. Perbaiki state operasi sebelum melanjutkan.",
    );
  }

  return current;
}

function restartResult(record: {
  assignmentId: string;
  auditId: string;
  deliverySessionId: string;
  id: string;
  requestId: string;
  tryoutId: string;
}, replayed: boolean) {
  return {
    assignmentId: record.assignmentId,
    auditId: record.auditId,
    deliverySessionId: record.deliverySessionId,
    idempotencyId: record.id,
    replayed,
    requestId: record.requestId,
    tryoutId: record.tryoutId,
  } as const;
}

function isSamePreviewSource(
  source: { availableFrom: Date; availableUntil: Date; status: TryoutDeliverySessionStatus },
  now: Date,
) {
  return isEligiblePreviewTryoutSource(source, now);
}

async function restartAdminStudentPreviewTryout(input: AdminPreviewTryoutRestartInput) {
  const parsed = validateRestartInput(input);
  const context = await requireAdminStudentPreviewContext();
  const actorId = context.actor.session.user.id;
  const previewStudentId = context.student.id;

  return prisma.$transaction(async (tx) => {
    const lockKey = `admin.student-preview:${previewStudentId}:${parsed.tryoutId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    // The lifecycle lock protects one preview student + Tryout. This second
    // transaction lock serializes the cross-Tryout request-ID scope before the
    // unique `(previewStudentId, requestId)` row is inspected/created.
    const requestLockKey = `admin.student-preview-request:${previewStudentId}:${parsed.requestId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${requestLockKey}, 0))`;

    // Idempotent replays return before any content/release side effect. This
    // remains valid even if the Tryout was edited or unpublished after the
    // original request committed.
    const existingRequest = await tx.adminPreviewTryoutRestart.findUnique({
      select: {
        actorUserId: true,
        assignmentId: true,
        auditId: true,
        canonicalReason: true,
        deliverySessionId: true,
        id: true,
        rawReason: true,
        requestId: true,
        sourceDeliverySessionId: true,
        tryoutId: true,
      },
      where: {
        previewStudentId_requestId: {
          previewStudentId,
          requestId: parsed.requestId,
        },
      },
    });
    if (existingRequest) {
      if (existingRequest.actorUserId !== actorId) {
        throw new AdminPreviewTryoutRestartError(
          "request_already_used_by_other_admin",
          "Request ID ini sudah digunakan oleh admin lain.",
        );
      }
      if (
        existingRequest.tryoutId !== parsed.tryoutId
        || existingRequest.sourceDeliverySessionId !== parsed.sourceDeliverySessionId
        || existingRequest.canonicalReason !== parsed.canonicalReason
      ) {
        throw new AdminPreviewTryoutRestartError(
          "request_id_mismatch",
          "Request ID sudah digunakan untuk operasi preview yang berbeda.",
        );
      }
      return restartResult(existingRequest, true);
    }

    const [tryout, sourceSession] = await Promise.all([
      tx.tryoutPackage.findUnique({
        select: { id: true, status: true },
        where: { id: parsed.tryoutId },
      }),
      tx.tryoutDeliverySession.findUnique({
        select: {
          availableFrom: true,
          availableUntil: true,
          id: true,
          status: true,
          tryoutId: true,
        },
        where: { id: parsed.sourceDeliverySessionId },
      }),
    ]);

    if (!tryout || tryout.status !== ContentStatus.published) {
      throw new AdminPreviewTryoutRestartError(
        "tryout_not_ready",
        "Tryout preview hanya tersedia untuk konten yang sudah published.",
      );
    }

    const now = new Date();
    if (
      !sourceSession
      || sourceSession.tryoutId !== parsed.tryoutId
      || !isSamePreviewSource(sourceSession, now)
    ) {
      throw new AdminPreviewTryoutRestartError(
        "source_session_not_eligible",
        "Restart hanya dapat menggunakan sesi Tryout published yang sedang aktif atau sudah closed.",
      );
    }

    // Preview restarts create a participant-accessible active session too, so
    // they must pin an existing immutable release boundary. Creating or
    // materializing an AssessmentRelease here would expose answer-key payload
    // data to an admin-preview mutation and would add a forbidden side effect.
    const release = await tx.assessmentRelease.findFirst({
      orderBy: { releaseNumber: "desc" },
      select: { id: true },
      where: { tryoutId: parsed.tryoutId },
    });
    if (!release) {
      throw new AdminPreviewTryoutRestartError(
        "tryout_not_ready",
        "Tryout preview belum memiliki AssessmentRelease yang sudah dipublikasikan.",
      );
    }

    const admission = await tx.tryoutAdmission.findUnique({
      select: { id: true, status: true },
      where: {
        tryoutId_studentId: {
          studentId: previewStudentId,
          tryoutId: parsed.tryoutId,
        },
      },
    });

    const assignments = admission
      ? await tx.tryoutDeliveryAssignment.findMany({
          orderBy: { assignedAt: "asc" },
          select: {
            assignedAt: true,
            deliverySessionId: true,
            id: true,
            previewCurrentKey: true,
            status: true,
          },
          where: { admissionId: admission.id },
        })
      : [];
    const current = assertPreviewAssignmentInvariant(
      assignments,
      previewCurrentAssignmentKey(previewStudentId, parsed.tryoutId),
    );

    if (parsed.expectedCurrentAssignmentId !== (current?.id ?? null)) {
      throw new AdminPreviewTryoutRestartError(
        "preview_state_changed",
        "State preview berubah sejak konfirmasi dibuka. Muat ulang Tryout dan konfirmasi restart lagi.",
      );
    }

    if (admission && admission.status !== TryoutAdmissionStatus.active) {
      throw new AdminPreviewTryoutRestartError(
        "preview_admission_repair_required",
        "Admission preview belum aktif. Minta operations owner memperbaiki admission preview sebelum restart.",
      );
    }

    const activeAdmission = admission ?? await tx.tryoutAdmission.create({
      data: {
        decidedAt: now,
        decidedByUserId: actorId,
        status: TryoutAdmissionStatus.active,
        studentId: previewStudentId,
        tryoutId: parsed.tryoutId,
      },
      select: { id: true, status: true },
    });

    if (current) {
      await tx.tryoutDeliveryAssignment.update({
        data: {
          previewCurrentKey: null,
          status: TryoutAssignmentStatus.superseded,
        },
        where: { id: current.id },
      });
    }

    const availableUntil = new Date(
      now.getTime() + previewRetakeWindowSeconds() * 1000,
    );
    const session = await tx.tryoutDeliverySession.create({
      data: {
        assessmentReleaseId: release.id,
        availableFrom: now,
        availableUntil,
        createdByUserId: actorId,
        fullscreenPrompt: false,
        isDefaultOpenRegistration: false,
        name: previewRetakeName(parsed.requestId),
        rankingRule: TryoutRankingRule.none,
        releaseReason: "Admin student preview restart",
        releaseState: AssessmentResultReleaseState.released,
        releasedAt: now,
        releasedByUserId: actorId,
        resultReleasePolicy: TryoutResultReleasePolicy.immediate,
        scheduledReleaseAt: null,
        status: TryoutDeliverySessionStatus.active,
        tryoutId: parsed.tryoutId,
        updatedByUserId: actorId,
      },
    });
    const assignment = await tx.tryoutDeliveryAssignment.create({
      data: {
        admissionId: activeAdmission.id,
        assignedByUserId: actorId,
        deliverySessionId: session.id,
        previewCurrentKey: previewCurrentAssignmentKey(previewStudentId, parsed.tryoutId),
        status: TryoutAssignmentStatus.active,
      },
    });
    const audit = await tx.tryoutDeliveryAudit.create({
      data: {
        action: "admin_preview.tryout_restarted",
        actorUserId: actorId,
        admissionId: activeAdmission.id,
        after: {
          admissionCreated: !admission,
          assignmentId: assignment.id,
          assignmentStatus: assignment.status,
          canonicalReason: parsed.canonicalReason,
          deliverySessionId: session.id,
          sourceDeliverySessionId: sourceSession.id,
          sourceScheduleStatus: getPreviewTryoutScheduleStatus(sourceSession, now),
        } satisfies Prisma.InputJsonObject,
        before: current
          ? {
              assignmentId: current.id,
              assignmentStatus: current.status,
            } satisfies Prisma.InputJsonObject
          : undefined,
        deliverySessionId: session.id,
        reason: parsed.rawReason,
        tryoutId: parsed.tryoutId,
      },
    });
    const idempotency = await tx.adminPreviewTryoutRestart.create({
      data: {
        actorUserId: actorId,
        assignmentId: assignment.id,
        auditId: audit.id,
        canonicalReason: parsed.canonicalReason,
        deliverySessionId: session.id,
        previewStudentId,
        rawReason: parsed.rawReason,
        requestId: parsed.requestId,
        sourceDeliverySessionId: sourceSession.id,
        tryoutId: parsed.tryoutId,
      },
      select: {
        assignmentId: true,
        auditId: true,
        deliverySessionId: true,
        id: true,
        requestId: true,
        tryoutId: true,
      },
    });

    return restartResult(idempotency, false);
  });
}

export {
  AdminPreviewTryoutRestartError,
  assertPreviewAssignmentInvariant,
  restartAdminStudentPreviewTryout,
  validateRestartInput,
};

export type {
  AdminPreviewTryoutRestartErrorCode,
  AdminPreviewTryoutRestartInput,
};
