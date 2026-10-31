import "server-only";
import { isActiveTryoutManager } from "./manager-access";
import { isTryoutPolicyBaseline, type TryoutPolicyBaseline } from "@/lib/tryout/result-readiness";
import { randomUUID } from "node:crypto";
import { isUuid } from "@/lib/resource-edit-lock/canonical";

import {
  ContentStatus,
  Prisma,
  RoleName,
  UserStatus,
  TryoutAdmissionMode,
  TryoutAdmissionStatus,
  TryoutAssignmentStatus,
  TryoutDeliverySessionStatus,
  TryoutResultReleasePolicy,
} from "@/generated/prisma/client";
import {
  assertTryoutReleaseEligibility,
  createOrReuseAssessmentRelease,
} from "@/lib/tryout/assessment-release";
import { isManagedPreviewPurpose } from "@/lib/admin/student-preview-contract";
import { createTryoutInvitationNotification } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { MAIN_TRYOUT_SESSION_NAME, selectMainTryoutSession } from "@/lib/tryout/main-session";
import {
  isTryoutAdmissionSessionAvailable,
} from "@/lib/tryout/registration-availability";
import { parseTryoutDateTime } from "@/lib/tryout/time";
import {
  acquireTryoutIdentityMutex,
  assertTryoutIdentityStable,
  lockTryoutAggregate,
  lockTryoutAdmissions,
  lockTryoutAssignments,
  lockTryoutSessions,
  lockTryoutStudents,
  prepareTryoutTransaction,
} from "@/lib/tryout/locks";

class TryoutDeliveryValidationError extends Error {}

type DeliverySessionScheduleInput = {
  availableFrom: Date | string;
  availableUntil: Date | string;
  deliverySessionId: string;
};

function reasonOrThrow(reason: string) {
  const value = reason.trim();
  if (!value) throw new TryoutDeliveryValidationError("Alasan tindakan wajib diisi.");
  return value;
}

function dateOrThrow(value: Date | string, field: string) {
  const date = parseTryoutDateTime(value);
  if (Number.isNaN(date.getTime())) throw new TryoutDeliveryValidationError(`${field} tidak valid.`);
  return date;
}

function json(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }

async function audit(tx: Prisma.TransactionClient, input: { id?: string; action: string; admissionId?: string; after: unknown; before?: unknown; deliverySessionId?: string; reason: string; tryoutId: string; actorId: string }) {
  return tx.tryoutDeliveryAudit.create({ data: { id: input.id, action: input.action, actorUserId: input.actorId, admissionId: input.admissionId, after: json(input.after), before: input.before === undefined ? undefined : json(input.before), deliverySessionId: input.deliverySessionId, reason: input.reason, tryoutId: input.tryoutId } });
}

async function assertStudent(tx: Prisma.TransactionClient, studentId: string) {
  const student = await tx.user.findUnique({
    select: {
      previewPurpose: true,
      studentProfile: { select: { userId: true } },
    },
    where: { id: studentId },
  });
  if (!student?.studentProfile) throw new TryoutDeliveryValidationError("Pilih akun siswa yang masih aktif.");
  if (isManagedPreviewPurpose(student.previewPurpose)) {
    throw new TryoutDeliveryValidationError("Sesi pratinjau tidak dapat dikerjakan lewat halaman siswa. Buat sesi baru dari halaman admin.");
  }
}

async function assertAdmissionStudentIsNotManagedPreview(
  tx: Prisma.TransactionClient,
  admissionId: string,
) {
  const admission = await tx.tryoutAdmission.findUnique({
    select: { student: { select: { previewPurpose: true } } },
    where: { id: admissionId },
  });
  if (isManagedPreviewPurpose(admission?.student.previewPurpose)) {
    throw new TryoutDeliveryValidationError("Sesi pratinjau tidak dapat dikerjakan lewat halaman siswa. Buat sesi baru dari halaman admin.");
  }
}

async function assertInvitationStudent(tx: Prisma.TransactionClient, studentId: string) {
  const student = await tx.user.findFirst({
    select: { id: true },
    where: { id: studentId, status: UserStatus.active, softDeletedAt: null, previewPurpose: null, studentProfile: { isNot: null }, roleAssignments: { some: { role: RoleName.student, revokedAt: null } } },
  });
  if (!student) throw new TryoutDeliveryValidationError("Pilih akun siswa yang masih aktif.");
}

/**
 * Tryouts are shared across Kapten (see manager-access.ts): any active Kapten
 * or admin may manage any Tryout. This confirms the actor still holds that role
 * and that the Tryout exists. The creator stays on `createdByUserId` and every
 * audit row records the acting user.
 */
async function assertTryoutManageable(tx: Prisma.TransactionClient, tryoutId: string, actorId: string) {
  if (!(await isActiveTryoutManager(tx, actorId))) {
    throw new TryoutDeliveryValidationError("Anda tidak memiliki izin mengelola delivery Tryout.");
  }
  const tryout = await tx.tryoutPackage.findUnique({
    select: { createdByUserId: true, status: true },
    where: { id: tryoutId },
  });
  if (!tryout) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan.");
  return tryout;
}

async function assertAdmissionMutationAllowed(tx: Prisma.TransactionClient, tryoutId: string, actorId: string) {
  const parent = await assertTryoutManageable(tx, tryoutId, actorId);
  if (parent.status === ContentStatus.archived) throw new TryoutDeliveryValidationError("Tryout sudah diarsipkan. Pendaftaran hanya dapat dilihat sebagai riwayat.");
}

async function lockAdmission(tx: Prisma.TransactionClient, admissionId: string) {
  await lockTryoutAdmissions(tx, [admissionId]);
}

async function lockTryout(tx: Prisma.TransactionClient, tryoutId: string) {
  await lockTryoutAggregate(tx, tryoutId);
}

async function lockTryoutIdentityScope(
  tx: Prisma.TransactionClient,
  identity: { id: string; kind: "tryout" | "session" | "admission" | "assignment" },
) {
  const resolved = await acquireTryoutIdentityMutex(tx, identity);
  if (!resolved) throw new TryoutDeliveryValidationError("Tryout delivery tidak ditemukan.");
  await lockTryout(tx, resolved.tryoutId);
  return assertTryoutIdentityStable(tx, identity, resolved.tryoutId);
}

async function lockTryoutParticipantIdentityScope(
  tx: Prisma.TransactionClient,
  identity: { id: string; kind: "tryout" | "admission" | "assignment" },
  expectedStudentId?: string,
) {
  const resolved = await acquireTryoutIdentityMutex(tx, identity);
  if (!resolved) throw new TryoutDeliveryValidationError("Tryout delivery tidak ditemukan.");
  const studentId = resolved.studentId ?? expectedStudentId;
  if (!studentId || (resolved.studentId && expectedStudentId && resolved.studentId !== expectedStudentId)) {
    throw new TryoutDeliveryValidationError("Identitas peserta Tryout berubah. Muat ulang lalu coba lagi.");
  }
  await lockTryoutStudents(tx, [studentId]);
  await lockTryout(tx, resolved.tryoutId);
  const stable = await assertTryoutIdentityStable(tx, identity, resolved.tryoutId);
  if (stable.studentId && stable.studentId !== studentId) {
    throw new TryoutDeliveryValidationError("Identitas peserta Tryout berubah. Muat ulang lalu coba lagi.");
  }
  return stable;
}

async function lockOverlappingDeliverySessions(
  tx: Prisma.TransactionClient,
  deliverySessionId: string,
  availableFrom: Date,
  availableUntil: Date,
) {
  const sessions = await tx.tryoutDeliverySession.findMany({
    where: {
      OR: [
        { id: deliverySessionId },
        { availableFrom: { lt: availableUntil }, availableUntil: { gt: availableFrom } },
      ],
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  await lockTryoutSessions(tx, sessions.map((session) => session.id));
}

type EligibleSession = {
  assessmentReleaseId: string | null;
  availableFrom: Date;
  availableUntil: Date;
  id: string;
  name: string;
  status: TryoutDeliverySessionStatus;
  tryoutId: string;
};

type RegistrationAssignment = {
  id: string;
  deliverySessionId: string;
  status: TryoutAssignmentStatus;
};

function activeRegistrationAssignment(assignments: RegistrationAssignment[]) {
  return assignments.find(
    (assignment) => assignment.status === TryoutAssignmentStatus.active,
  ) ?? null;
}

function assertEligibleSession(
  session: EligibleSession | null,
  now: Date,
) {
  const label = "Sesi Tryout";
  if (!session) throw new TryoutDeliveryValidationError(`${label} tidak ditemukan.`);
  if (session.status === TryoutDeliverySessionStatus.closed) throw new TryoutDeliveryValidationError(`${label} sudah ditutup dan tidak dapat digunakan.`);
  if (session.status === TryoutDeliverySessionStatus.archived) throw new TryoutDeliveryValidationError(`${label} sudah diarsipkan dan tidak dapat digunakan.`);
  if (session.status !== TryoutDeliverySessionStatus.active) throw new TryoutDeliveryValidationError(`${label} belum dibuka untuk peserta.`);
  if (!session.assessmentReleaseId) throw new TryoutDeliveryValidationError(`${label} belum memiliki konten yang siap dikerjakan.`);
  if (!isTryoutAdmissionSessionAvailable(session, now)) throw new TryoutDeliveryValidationError(`${label} sudah berakhir.`);
  return session;
}

async function findDefaultSessionCandidate(
  tx: Prisma.TransactionClient,
  tryoutId: string,
) {
  const candidates = await tx.tryoutDeliverySession.findMany({
    where: { tryoutId },
    orderBy: { availableFrom: "asc" },
    select: {
      assessmentReleaseId: true,
      availableFrom: true,
      availableUntil: true,
      id: true,
      name: true,
      status: true,
      tryoutId: true,
    },
  });
  return selectMainTryoutSession(candidates);
}

async function findDefaultSession(
  tx: Prisma.TransactionClient,
  tryoutId: string,
  now: Date,
) {
  return assertEligibleSession(
    await findDefaultSessionCandidate(tx, tryoutId),
    now,
  );
}

async function findSessionById(
  tx: Prisma.TransactionClient,
  tryoutId: string,
  sessionId: string,
  now: Date,
) {
  const candidate = await tx.tryoutDeliverySession.findFirst({
    where: { id: sessionId, tryoutId },
    select: {
      assessmentReleaseId: true,
      availableFrom: true,
      availableUntil: true,
      id: true,
      name: true,
      status: true,
      tryoutId: true,
    },
  });
  return assertEligibleSession(candidate, now);
}

async function lockSessionScope(
  tx: Prisma.TransactionClient,
  session: EligibleSession,
) {
  await lockOverlappingDeliverySessions(
    tx,
    session.id,
    session.availableFrom,
    session.availableUntil,
  );
}

async function lockParticipantAssignments(
  tx: Prisma.TransactionClient,
  admissionId: string,
  assignments: Array<{ deliverySessionId: string; id: string; deliverySession: { availableFrom: Date; availableUntil: Date } }>,
  extraSessions: Array<{ availableFrom: Date; availableUntil: Date; id: string }> = [],
) {
  const sessionIds = [...new Set([...assignments.map((assignment) => assignment.deliverySessionId), ...extraSessions.map((session) => session.id)])];
  if (sessionIds.length) {
    const sessions = await tx.tryoutDeliverySession.findMany({
      where: {
        OR: [
          { id: { in: sessionIds } },
          ...[...assignments.map((assignment) => assignment.deliverySession), ...extraSessions].map((session) => ({
            availableFrom: { lt: session.availableUntil },
            availableUntil: { gt: session.availableFrom },
          })),
        ],
      },
      select: { id: true },
    });
    await lockTryoutSessions(tx, sessions.map((session) => session.id));
  }
  await lockTryoutAdmissions(tx, [admissionId]);
  await lockTryoutAssignments(tx, assignments.map((assignment) => assignment.id));
}

async function ensureActiveAssignment(
  tx: Prisma.TransactionClient,
  admissionId: string,
  deliverySessionId: string,
  actorId: string,
) {
  const existing = await tx.tryoutDeliveryAssignment.findUnique({
    where: { admissionId_deliverySessionId: { admissionId, deliverySessionId } },
  });
  if (existing) {
    if (existing.status === TryoutAssignmentStatus.active) return existing;
    return tx.tryoutDeliveryAssignment.update({
      where: { id: existing.id },
      data: {
        assignedAt: new Date(),
        assignedByUserId: actorId,
        revokeReason: null,
        revokedAt: null,
        status: TryoutAssignmentStatus.active,
      },
    });
  }
  return tx.tryoutDeliveryAssignment.create({
    data: { admissionId, assignedByUserId: actorId, deliverySessionId },
  });
}

async function assertTryoutNotStarted(tx: Prisma.TransactionClient, tryoutId: string) {
  const tryout = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { status: true } });
  if (!tryout) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan.");
  if (tryout.status !== ContentStatus.published) throw new TryoutDeliveryValidationError("Delivery hanya tersedia setelah Tryout diterbitkan.");
  const started = await tx.tryoutAttempt.findFirst({ where: { tryoutId }, select: { id: true } });
  if (started) throw new TryoutDeliveryValidationError("Tryout yang sudah dimulai peserta tidak dapat mengubah konfigurasi delivery.");
}

async function configureTryoutAdmission(tryoutId: string, mode: "open" | "approval_required" | "invitation_only", actorId: string, reason: string) {
  if (!["open", "approval_required", "invitation_only"].includes(mode)) throw new TryoutDeliveryValidationError("Pilih akses peserta yang tersedia.");
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    await lockTryoutIdentityScope(tx, { id: tryoutId, kind: "tryout" });
    await assertTryoutNotStarted(tx, tryoutId);
    await assertTryoutManageable(tx, tryoutId, actorId);
    const record = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { admissionMode: true } });
    if (!record) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan.");
    await tx.tryoutPackage.update({ where: { id: tryoutId }, data: { admissionMode: mode as TryoutAdmissionMode } });
    await audit(tx, { action: "admission_mode.configured", actorId, after: { admissionMode: mode }, before: { admissionMode: record.admissionMode }, reason: auditReason, tryoutId });
    return { admissionMode: mode, tryoutId };
  });
}

async function configureTryoutDefaultResultRelease(tryoutId: string, policy: "immediate" | "manual" | "automatic_at_end", actorId: string, reason: string, requestId?: string, expectedBaseline?: TryoutPolicyBaseline) {
  if (!["immediate", "manual", "automatic_at_end"].includes(policy)) throw new TryoutDeliveryValidationError("Pilih aturan rilis hasil yang tersedia.");
  if (requestId !== undefined && (typeof requestId !== "string" || !isUuid(requestId))) throw new TryoutDeliveryValidationError("Permintaan penyimpanan tidak dapat digunakan. Mulai perubahan baru.");
  if ((requestId !== undefined || expectedBaseline !== undefined) && !isTryoutPolicyBaseline(expectedBaseline)) throw new TryoutDeliveryValidationError("Permintaan penyimpanan tidak dapat digunakan. Muat aturan terbaru sebelum mencoba lagi.");
  const baseline = expectedBaseline ? { ...expectedBaseline } : undefined;
  const receiptId = requestId?.toLowerCase() ?? randomUUID();
  const auditReason = reasonOrThrow(reason);
  try { return await prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    await lockTryoutIdentityScope(tx, { id: tryoutId, kind: "tryout" });
    await assertTryoutManageable(tx, tryoutId, actorId);
    const existing = await tx.tryoutDeliveryAudit.findUnique({ where: { id: receiptId } });
    if (existing) {
      const after = existing.after as { policy?: string; expectedBaseline?: TryoutPolicyBaseline } | null;
      if (existing.actorUserId !== actorId || existing.tryoutId !== tryoutId || existing.action !== "result_release.default_configured" || existing.reason !== auditReason || after?.policy !== policy || after?.expectedBaseline?.auditCount !== baseline?.auditCount || after?.expectedBaseline?.policy !== baseline?.policy) throw new TryoutDeliveryValidationError("Permintaan penyimpanan tidak dapat digunakan. Mulai perubahan baru.");
      // Historical receipt replay never restores its old policy, including
      // after another intent, first Start or archive has superseded it.
      return { policy, tryoutId, receipt: { id: existing.id, configuredAt: existing.createdAt.toISOString(), reason: existing.reason, policy, ...(after?.expectedBaseline ? { expectedBaseline: after.expectedBaseline } : {}) } };
    }
    await assertTryoutNotStarted(tx, tryoutId);
    const record = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { defaultResultReleasePolicy: true } });
    if (!record) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan.");
    // Count is monotonic for immutable policy audits. Wall-clock timestamp/UUID
    // ordering cannot identify the last serialized write when timestamps tie.
    const auditCount = baseline ? await tx.tryoutDeliveryAudit.count({ where: { tryoutId, action: "result_release.default_configured" } }) : null;
    if (baseline && (baseline.auditCount !== auditCount || baseline.policy !== record.defaultResultReleasePolicy)) throw new TryoutDeliveryValidationError("Aturan rilis telah berubah. Muat aturan terbaru sebelum menyimpan kembali. Pilihan dan alasan Anda tetap tersedia.");
    await tx.tryoutPackage.update({ where: { id: tryoutId }, data: { defaultResultReleasePolicy: policy as TryoutResultReleasePolicy } });
    const receipt = await audit(tx, { id: receiptId, action: "result_release.default_configured", actorId, after: { policy, ...(baseline ? { expectedBaseline: baseline } : {}) }, before: { policy: record.defaultResultReleasePolicy }, reason: auditReason, tryoutId });
    return { policy, tryoutId, receipt: { id: receipt.id, configuredAt: receipt.createdAt.toISOString(), reason: auditReason, policy, ...(baseline ? { expectedBaseline: baseline } : {}) } };
  }); } catch (error) {
    // Cross-aggregate concurrent reuse can race on the global audit UUID.
    // The losing transaction rolls back its policy update as well as its audit.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new TryoutDeliveryValidationError("Permintaan penyimpanan tidak dapat digunakan. Mulai perubahan baru.");
    throw error;
  }
}

async function openTryoutDeliverySession(deliverySessionId: string, actorId: string, reason: string) {
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    const identity = await lockTryoutIdentityScope(tx, { id: deliverySessionId, kind: "session" });
    await lockTryoutSessions(tx, [identity.sessionId ?? deliverySessionId]);
    let session = await tx.tryoutDeliverySession.findUnique({
      where: { id: deliverySessionId },
      include: {
        tryout: {
          include: {
            sections: {
              include: {
                packageVersion: { include: { items: { select: { sourceContentDigest: true, sourceQuestionId: true, sourceQuestionRevisionId: true, sourceRevisionProvenance: true, subtestId: true } } } },
              },
            },
          },
        },
      },
    });
    if (!session) throw new TryoutDeliveryValidationError("Sesi Tryout tidak ditemukan.");
    await assertTryoutNotStarted(tx, session.tryoutId);
    await assertTryoutManageable(tx, session.tryoutId, actorId);

    // Authoring also locks the Tryout aggregate. Re-read the session after
    // acquiring that lock so readiness and the draft transition cannot use a
    // stale pre-lock status/content view.
    session = await tx.tryoutDeliverySession.findUnique({
      where: { id: deliverySessionId },
      include: {
        tryout: {
          include: {
            sections: {
              include: {
                packageVersion: { include: { items: { select: { sourceContentDigest: true, sourceQuestionId: true, sourceQuestionRevisionId: true, sourceRevisionProvenance: true, subtestId: true } } } },
              },
            },
          },
        },
      },
    });
    if (!session) throw new TryoutDeliveryValidationError("Sesi Tryout tidak ditemukan.");
    if (session.status !== TryoutDeliverySessionStatus.draft) throw new TryoutDeliveryValidationError("Hanya sesi draft yang dapat dibuka.");
    try {
      await assertTryoutReleaseEligibility(tx, session.tryoutId);
    } catch (error) {
      throw new TryoutDeliveryValidationError(error instanceof Error ? error.message : "Tryout belum memenuhi syarat AssessmentRelease.");
    }
    const release = session.assessmentReleaseId
      ? await tx.assessmentRelease.findFirst({ where: { id: session.assessmentReleaseId, tryoutId: session.tryoutId } })
      : await createOrReuseAssessmentRelease(tx, session.tryoutId, actorId, session.tryout.publishedAt ?? new Date(), { assumeTryoutLocked: true });
    if (!release) throw new TryoutDeliveryValidationError("Sesi tidak memiliki AssessmentRelease yang valid dan tidak dapat dibuka.");
    const opened = await tx.tryoutDeliverySession.update({ where: { id: deliverySessionId }, data: { assessmentReleaseId: release.id, status: TryoutDeliverySessionStatus.active, updatedByUserId: actorId } });
    await audit(tx, { action: "delivery_session.opened", actorId, after: { status: opened.status }, before: { status: session.status }, deliverySessionId, reason: auditReason, tryoutId: session.tryoutId });
    return opened;
  });
}

async function updateTryoutDeliverySessionSchedule(
  input: DeliverySessionScheduleInput,
  actorId: string,
  reason: string,
) {
  const auditReason = reasonOrThrow(reason);
  const availableFrom = dateOrThrow(input.availableFrom, "Waktu mulai");
  const availableUntil = dateOrThrow(input.availableUntil, "Waktu selesai");
  if (availableUntil <= availableFrom) throw new TryoutDeliveryValidationError("Jendela ketersediaan sesi tidak valid.");

  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    const identity = await lockTryoutIdentityScope(tx, { id: input.deliverySessionId, kind: "session" });
    const candidate = await tx.tryoutDeliverySession.findUnique({
      where: { id: input.deliverySessionId },
      select: { availableFrom: true, availableUntil: true, tryoutId: true },
    });
    if (!candidate) throw new TryoutDeliveryValidationError("Sesi Tryout tidak ditemukan setelah penguncian.");
    const oldOverlaps = await tx.tryoutDeliverySession.findMany({
      where: {
        OR: [
          { id: input.deliverySessionId },
          { availableFrom: { lt: candidate.availableUntil }, availableUntil: { gt: candidate.availableFrom } },
        ],
      },
      select: { id: true },
    });
    // react-doctor-disable-next-line server-sequential-independent-await -- both overlap sets are read after the same session lock in one transaction.
    const newOverlaps = await tx.tryoutDeliverySession.findMany({
      where: {
        OR: [
          { id: input.deliverySessionId },
          { availableFrom: { lt: availableUntil }, availableUntil: { gt: availableFrom } },
        ],
      },
      select: { id: true },
    });
    await lockTryoutSessions(tx, [...oldOverlaps, ...newOverlaps].map((session) => session.id));

    const session = await tx.tryoutDeliverySession.findUnique({
      where: { id: input.deliverySessionId },
      select: {
        availableFrom: true,
        availableUntil: true,
        id: true,
        name: true,
        status: true,
        tryoutId: true,
      },
    });
    if (!session) throw new TryoutDeliveryValidationError("Sesi Tryout tidak ditemukan setelah penguncian.");
    await assertTryoutManageable(tx, identity.tryoutId, actorId);
    const tryout = await tx.tryoutPackage.findUnique({
      where: { id: session.tryoutId },
      select: { status: true },
    });
    const draftMainSession = tryout?.status === ContentStatus.draft
      && session.name === MAIN_TRYOUT_SESSION_NAME
      && session.status === TryoutDeliverySessionStatus.draft;
    if (!tryout || (tryout.status !== ContentStatus.published && !draftMainSession)) {
      throw new TryoutDeliveryValidationError("Delivery hanya tersedia setelah Tryout diterbitkan.");
    }
    if (session.status !== TryoutDeliverySessionStatus.draft && session.status !== TryoutDeliverySessionStatus.active) {
      throw new TryoutDeliveryValidationError("Sesi yang sudah ditutup atau diarsipkan tidak dapat diubah.");
    }
    const existingAttempt = await tx.tryoutAttempt.findFirst({
      where: { deliverySessionId: session.id },
      select: { id: true },
    });
    if (existingAttempt) {
      throw new TryoutDeliveryValidationError("Jadwal sesi yang sudah memiliki pengerjaan tidak dapat diubah.");
    }

    const updated = await tx.tryoutDeliverySession.update({
      where: { id: session.id },
      data: { availableFrom, availableUntil, updatedByUserId: actorId },
    });
    await audit(tx, {
      action: "delivery_session.schedule_updated",
      actorId,
      after: { availableFrom: availableFrom.toISOString(), availableUntil: availableUntil.toISOString() },
      before: { availableFrom: session.availableFrom.toISOString(), availableUntil: session.availableUntil.toISOString() },
      deliverySessionId: session.id,
      reason: auditReason,
      tryoutId: session.tryoutId,
    });
    return updated;
  });
}

async function registerForTryout(
  tryoutId: string,
  studentId: string,
  target?: { majorId: string; universityId: string },
) {
  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    await lockTryoutParticipantIdentityScope(tx, { id: tryoutId, kind: "tryout" }, studentId);
    await assertStudent(tx, studentId);
    if (target) {
      const major = await tx.major.findFirst({
        select: { id: true, universityId: true },
        where: { id: target.majorId, isActive: true },
      });
      if (!major || major.universityId !== target.universityId) {
        throw new TryoutDeliveryValidationError("Kampus dan jurusan tujuan tidak cocok atau sudah tidak tersedia.");
      }
    }
    let existing = await tx.tryoutAdmission.findUnique({
      where: { tryoutId_studentId: { studentId, tryoutId } },
      include: {
        assignments: {
          include: { deliverySession: true },
          orderBy: { assignedAt: "desc" },
        },
      },
    });
    if (existing) {
      const activeAssignments = existing.assignments
        .filter((item) => item.status === TryoutAssignmentStatus.active)
        .sort((left, right) => left.id.localeCompare(right.id));
      await lockParticipantAssignments(tx, existing.id, activeAssignments);
      existing = await tx.tryoutAdmission.findUnique({
        where: { id: existing.id },
        include: {
          assignments: {
            where: { status: TryoutAssignmentStatus.active },
            include: { deliverySession: true },
            orderBy: { assignedAt: "desc" },
          },
        },
      });
      if (!existing) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak ditemukan setelah penguncian.");
      const existingAssignment = activeRegistrationAssignment(existing.assignments);
      if (target) {
        await tx.studentProfile.update({ data: { targetMajorId: target.majorId, targetUniversityId: target.universityId }, where: { userId: studentId } });
      }
      return { admissionId: existing.id, assignmentId: existingAssignment?.id ?? null, deliverySessionId: existingAssignment?.deliverySessionId ?? null, state: "existing" as const, status: existing.status };
    }
    const tryout = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { admissionMode: true, id: true, isHidden: true, status: true } });
    if (!tryout || tryout.status !== ContentStatus.published || tryout.isHidden) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak tersedia.");
    if (tryout.admissionMode === TryoutAdmissionMode.invitation_only) throw new TryoutDeliveryValidationError("Tryout ini hanya menerima undangan.");
    const status = tryout.admissionMode === TryoutAdmissionMode.open ? TryoutAdmissionStatus.active : TryoutAdmissionStatus.pending;
    const now = new Date();
    let registrationSession: EligibleSession | null = null;
    if (status === TryoutAdmissionStatus.active) {
      try {
        registrationSession = await findDefaultSession(tx, tryoutId, now);
      } catch (error) {
        if (error instanceof TryoutDeliveryValidationError) {
          return { admissionId: null, assignmentId: null, deliverySessionId: null, state: "unavailable" as const, status: null };
        }
        throw error;
      }
    } else {
      try {
        const defaultSession = await findDefaultSessionCandidate(tx, tryoutId);
        if (defaultSession) {
          registrationSession = assertEligibleSession(defaultSession, now);
        }
      } catch (error) {
        if (error instanceof TryoutDeliveryValidationError) {
          return { admissionId: null, assignmentId: null, deliverySessionId: null, state: "unavailable" as const, status: null };
        }
        throw error;
      }
    }
    // Open admissions bind to this session. Approval-required admissions use
    // it only to validate the selected/default registration window.
    const admissionWindowSession = registrationSession;
    if (status === TryoutAdmissionStatus.active && !admissionWindowSession) return { admissionId: null, assignmentId: null, deliverySessionId: null, state: "unavailable" as const, status: null };
    existing = await tx.tryoutAdmission.findUnique({
      where: { tryoutId_studentId: { studentId, tryoutId } },
      include: {
        assignments: {
          where: { status: TryoutAssignmentStatus.active },
          include: { deliverySession: true },
          orderBy: { assignedAt: "desc" },
        },
      },
    });
    if (existing) {
      const activeAssignments = existing.assignments
        .filter((item) => item.status === TryoutAssignmentStatus.active)
        .sort((left, right) => left.id.localeCompare(right.id));
      await lockParticipantAssignments(tx, existing.id, activeAssignments);
      existing = await tx.tryoutAdmission.findUnique({
        where: { id: existing.id },
        include: {
          assignments: {
            where: { status: TryoutAssignmentStatus.active },
            include: { deliverySession: true },
            orderBy: { assignedAt: "desc" },
          },
        },
      });
      if (!existing) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak ditemukan setelah penguncian.");
      const existingAssignment = activeRegistrationAssignment(existing.assignments);
      if (target) await tx.studentProfile.update({ data: { targetMajorId: target.majorId, targetUniversityId: target.universityId }, where: { userId: studentId } });
      return { admissionId: existing.id, assignmentId: existingAssignment?.id ?? null, deliverySessionId: existingAssignment?.deliverySessionId ?? null, state: "existing" as const, status: existing.status };
    }
    if (admissionWindowSession) await lockSessionScope(tx, admissionWindowSession);
    const lockedDefaultSession = admissionWindowSession
      ? await findSessionById(tx, tryoutId, admissionWindowSession.id, new Date())
      : null;
    const lockedRegistrationSession = lockedDefaultSession;
    const lockedTryout = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { admissionMode: true, id: true, status: true } });
    if (!lockedTryout || lockedTryout.status !== ContentStatus.published) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak tersedia.");
    if (lockedTryout.admissionMode === TryoutAdmissionMode.invitation_only) throw new TryoutDeliveryValidationError("Tryout ini hanya menerima undangan.");
    const lockedStatus = lockedTryout.admissionMode === TryoutAdmissionMode.open ? TryoutAdmissionStatus.active : TryoutAdmissionStatus.pending;
    if (lockedStatus === TryoutAdmissionStatus.active && !lockedRegistrationSession) throw new TryoutDeliveryValidationError("Sesi Tryout tidak tersedia untuk pendaftaran terbuka.");
    if (target) {
      await tx.studentProfile.update({ data: { targetMajorId: target.majorId, targetUniversityId: target.universityId }, where: { userId: studentId } });
    }
    const admission = await tx.tryoutAdmission.create({ data: { status: lockedStatus, studentId, tryoutId } });
    if (lockedStatus === TryoutAdmissionStatus.pending) return { admissionId: admission.id, assignmentId: null, deliverySessionId: null, state: "pending_approval" as const, status: lockedStatus };
    const assignment = await tx.tryoutDeliveryAssignment.create({ data: { admissionId: admission.id, assignedByUserId: studentId, deliverySessionId: lockedRegistrationSession!.id } });
    return { admissionId: admission.id, assignmentId: assignment.id, deliverySessionId: lockedRegistrationSession!.id, state: "assigned" as const, status: lockedStatus };
  });
}

async function decideTryoutAdmission(
  admissionId: string,
  decision: "approve" | "reject",
  actorId: string,
  reason: string,
) {
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    const candidate = await tx.tryoutAdmission.findUnique({ where: { id: admissionId }, select: { studentId: true, tryoutId: true } });
    if (!candidate) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak ditemukan.");
    await lockTryoutParticipantIdentityScope(tx, { id: admissionId, kind: "admission" }, candidate.studentId);
    let admission = await tx.tryoutAdmission.findUnique({
      where: { id: admissionId },
      include: {
        assignments: {
          include: { deliverySession: true },
          orderBy: { assignedAt: "desc" },
        },
      },
    });
    if (!admission) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak ditemukan setelah penguncian.");
    await assertAdmissionStudentIsNotManagedPreview(tx, admission.id);

    await assertAdmissionMutationAllowed(tx, admission.tryoutId, actorId);

    if (decision === "approve") {
      await assertInvitationStudent(tx, admission.studentId);
      const replayAssignment = admission.status === TryoutAdmissionStatus.active
        ? admission.assignments.find((assignment) => assignment.status === TryoutAssignmentStatus.active)
        : null;
      if (replayAssignment) {
        await lockSessionScope(tx, replayAssignment.deliverySession);
        await lockTryoutAdmissions(tx, [admissionId]);
        await lockTryoutAssignments(tx, [replayAssignment.id]);
        admission = await tx.tryoutAdmission.findUnique({
          where: { id: admissionId },
          include: {
            assignments: {
              include: { deliverySession: true },
              orderBy: { assignedAt: "desc" },
            },
          },
        });
        if (!admission) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak ditemukan setelah penguncian.");
        await assertTryoutManageable(tx, admission.tryoutId, actorId);
        const replayedAssignment = admission.status === TryoutAdmissionStatus.active
          ? admission.assignments.find((assignment) => assignment.status === TryoutAssignmentStatus.active)
          : null;
        if (replayedAssignment) return admission;
      }
      if (admission.status !== TryoutAdmissionStatus.pending) throw new TryoutDeliveryValidationError("Pendaftaran sudah diputuskan. Muat ulang untuk melihat status terbaru.");
      const now = new Date();
      const selected = await findDefaultSession(tx, admission.tryoutId, now);
      const assignmentsToLock = admission.assignments
        .filter((assignment) => assignment.status === TryoutAssignmentStatus.active || assignment.deliverySessionId === selected.id)
        .sort((left, right) => left.id.localeCompare(right.id));
      await lockParticipantAssignments(tx, admission.id, assignmentsToLock, [selected]);
      const lockedSelected = await findSessionById(tx, admission.tryoutId, selected.id, new Date());
      admission = await tx.tryoutAdmission.findUnique({
        where: { id: admissionId },
        include: {
          assignments: {
            include: { deliverySession: true },
            orderBy: { assignedAt: "desc" },
          },
        },
      });
      if (!admission) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak ditemukan setelah penguncian.");
      await assertTryoutManageable(tx, admission.tryoutId, actorId);
      if (admission.status === TryoutAdmissionStatus.active) {
        const existingAssignment = admission.assignments.find(
          (assignment) => assignment.status === TryoutAssignmentStatus.active && assignment.deliverySessionId === lockedSelected.id,
        );
        if (existingAssignment) return admission;
      } else if (admission.status !== TryoutAdmissionStatus.pending) {
        throw new TryoutDeliveryValidationError("Hanya pendaftaran menunggu persetujuan yang dapat disetujui.");
      }
      const status = TryoutAdmissionStatus.active;
      const updated = await tx.tryoutAdmission.update({ where: { id: admissionId }, data: { decidedAt: new Date(), decidedByUserId: actorId, revokeReason: null, status } });
      const assignment = await ensureActiveAssignment(tx, admissionId, lockedSelected.id, actorId);
      await audit(tx, { action: "admission.approved", actorId, admissionId, after: { assignmentId: assignment.id, sessionId: lockedSelected.id, status }, before: { status: admission.status }, reason: auditReason, deliverySessionId: lockedSelected.id, tryoutId: admission.tryoutId });
      return { ...updated, assignmentId: assignment.id, deliverySessionId: lockedSelected.id };
    }

    await lockAdmission(tx, admissionId);
    admission = await tx.tryoutAdmission.findUnique({
      where: { id: admissionId },
      include: {
        assignments: {
          include: { deliverySession: true },
          orderBy: { assignedAt: "desc" },
        },
      },
    });
    if (!admission) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak ditemukan setelah penguncian.");
    await assertTryoutManageable(tx, admission.tryoutId, actorId);
    if (admission.status === TryoutAdmissionStatus.rejected) return admission;
    if (admission.status !== TryoutAdmissionStatus.pending) throw new TryoutDeliveryValidationError("Hanya pendaftaran menunggu persetujuan yang dapat ditolak.");
    const status = TryoutAdmissionStatus.rejected;
    const updated = await tx.tryoutAdmission.update({ where: { id: admissionId }, data: { decidedAt: new Date(), decidedByUserId: actorId, status } });
    await audit(tx, { action: "admission.rejected", actorId, admissionId, after: { status }, before: { status: admission.status }, reason: auditReason, tryoutId: admission.tryoutId });
    return updated;
  });
}

async function inviteTryoutParticipant(
  tryoutId: string,
  studentId: string,
  actorId: string,
  reason: string,
  intent: "invite" | "restore" = "invite",
) {
  const auditReason = reasonOrThrow(reason);
  if (intent !== "invite" && intent !== "restore") throw new TryoutDeliveryValidationError("Pilih tindakan akses yang tersedia.");
  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    await lockTryoutParticipantIdentityScope(tx, { id: tryoutId, kind: "tryout" }, studentId);
    await assertAdmissionMutationAllowed(tx, tryoutId, actorId);
    await assertInvitationStudent(tx, studentId);
    const initialAdmission = await tx.tryoutAdmission.findUnique({
      where: { tryoutId_studentId: { studentId, tryoutId } },
      include: {
        assignments: {
          include: { deliverySession: true },
          orderBy: { assignedAt: "desc" },
        },
      },
    });
    // react-doctor-disable-next-line server-sequential-independent-await -- re-read admission and tryout identity within the same transaction.
    const tryout = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { id: true, status: true } });
    let admission = initialAdmission;
    if (!tryout) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan.");
    if (tryout.status !== ContentStatus.published) throw new TryoutDeliveryValidationError("Undangan tersedia setelah Tryout diterbitkan.");
    const intendedSessionId = (await findDefaultSessionCandidate(tx, tryoutId))?.id;
    const replayAssignment = admission?.status === TryoutAdmissionStatus.active
      ? admission.assignments.find((assignment) => assignment.status === TryoutAssignmentStatus.active && assignment.deliverySessionId === intendedSessionId)
      : null;
    if (replayAssignment) {
      await lockSessionScope(tx, replayAssignment.deliverySession);
      await lockTryoutAdmissions(tx, [admission!.id]);
      await lockTryoutAssignments(tx, [replayAssignment.id]);
      admission = await tx.tryoutAdmission.findUnique({
        where: { tryoutId_studentId: { studentId, tryoutId } },
        include: {
          assignments: {
            include: { deliverySession: true },
            orderBy: { assignedAt: "desc" },
          },
        },
      });
      if (!admission) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak ditemukan setelah penguncian.");
      await assertAdmissionMutationAllowed(tx, tryoutId, actorId);
      await assertInvitationStudent(tx, studentId);
      const replayedAssignment = admission.status === TryoutAdmissionStatus.active
        ? admission.assignments.find((assignment) => assignment.status === TryoutAssignmentStatus.active && assignment.deliverySessionId === intendedSessionId)
        : null;
      if (replayedAssignment) return { ...admission, changed: false, assignmentId: replayedAssignment.id, deliverySessionId: replayedAssignment.deliverySessionId };
    }
    if (admission?.status === TryoutAdmissionStatus.pending) throw new TryoutDeliveryValidationError("Pendaftaran menunggu persetujuan. Gunakan Setujui atau Tolak pada detail peserta.");
    const now = new Date();
    const selected = await findDefaultSession(tx, tryoutId, now);
    if (admission) {
      const assignmentsToLock = admission.assignments
        .filter((assignment) => assignment.status === TryoutAssignmentStatus.active || assignment.deliverySessionId === selected.id)
        .sort((left, right) => left.id.localeCompare(right.id));
      await lockParticipantAssignments(tx, admission.id, assignmentsToLock, [selected]);
    } else {
      await lockSessionScope(tx, selected);
    }
    const lockedSelected = await findSessionById(tx, tryoutId, selected.id, new Date());
    const lockedTryout = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { id: true } });
    if (!lockedTryout) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan setelah penguncian.");
    await assertAdmissionMutationAllowed(tx, tryoutId, actorId);
    await assertInvitationStudent(tx, studentId);
    admission = await tx.tryoutAdmission.findUnique({
      where: { tryoutId_studentId: { studentId, tryoutId } },
      include: {
        assignments: {
          include: { deliverySession: true },
          orderBy: { assignedAt: "desc" },
        },
      },
    });
    if (admission?.status === TryoutAdmissionStatus.pending) throw new TryoutDeliveryValidationError("Pendaftaran menunggu persetujuan. Gunakan Setujui atau Tolak pada detail peserta.");
    const priorAssignment = admission?.assignments.find((assignment) => assignment.deliverySessionId === lockedSelected.id);
    assertEligibleSession(lockedSelected, new Date());
    const needsRestore = admission?.status === TryoutAdmissionStatus.rejected || admission?.status === TryoutAdmissionStatus.revoked || priorAssignment?.status === TryoutAssignmentStatus.revoked;
    if (needsRestore && intent !== "restore") throw new TryoutDeliveryValidationError("Akses sudah dicabut atau ditolak. Konfirmasikan pemberian akses lagi untuk melanjutkan.");
    if (!needsRestore && intent === "restore") throw new TryoutDeliveryValidationError("Status akses berubah. Muat ulang data peserta sebelum memberi akses.");
    const alreadyActive = admission?.status === TryoutAdmissionStatus.active;
    const restored = admission
      ? alreadyActive
        ? admission
        : await tx.tryoutAdmission.update({ where: { id: admission.id }, data: { decidedAt: new Date(), decidedByUserId: actorId, revokeReason: null, status: TryoutAdmissionStatus.active } })
      : await tx.tryoutAdmission.create({ data: { decidedAt: new Date(), decidedByUserId: actorId, status: TryoutAdmissionStatus.active, studentId, tryoutId } });
    const existingAssignment = restored.id === admission?.id
      ? admission?.assignments.find((assignment) => assignment.deliverySessionId === lockedSelected.id)
      : null;
    const assignment = existingAssignment?.status === TryoutAssignmentStatus.active
      ? existingAssignment
      : await ensureActiveAssignment(tx, restored.id, lockedSelected.id, actorId);
    // The assignment row is reused when a revoked invite is restored. Use the
    // audit row created for this invitation lifecycle as the notification key
    // so a fresh reinvite cannot be deduped against its prior unread/read one.
    const invitationAudit = await audit(tx, { action: needsRestore ? "admission.access_restored" : "admission.invited", actorId, admissionId: restored.id, before: { status: admission?.status ?? null, assignmentId: priorAssignment?.id ?? null, assignmentStatus: priorAssignment?.status ?? null }, after: { assignmentId: assignment.id, sessionId: lockedSelected.id, status: restored.status, studentId }, reason: auditReason, deliverySessionId: lockedSelected.id, tryoutId });
    if (needsRestore || existingAssignment?.status !== TryoutAssignmentStatus.active) {
      await createTryoutInvitationNotification({
        recipientUserId: studentId,
        sourceEntityId: invitationAudit.id,
        tryoutId,
        tx,
      });
    }
    return { ...restored, changed: true, assignmentId: assignment.id, deliverySessionId: lockedSelected.id };
  });
}

async function revokeTryoutDeliveryAssignment(assignmentId: string, actorId: string, reason: string) {
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    const candidate = await tx.tryoutDeliveryAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        admission: { select: { id: true, studentId: true, tryoutId: true } },
        deliverySession: { select: { availableFrom: true, availableUntil: true, id: true } },
        id: true,
      },
    });
    if (!candidate) throw new TryoutDeliveryValidationError("Penugasan sesi Tryout tidak ditemukan.");
    await lockTryoutParticipantIdentityScope(tx, { id: assignmentId, kind: "assignment" }, candidate.admission.studentId);
    const lockedCandidate = await tx.tryoutDeliveryAssignment.findUnique({
      where: { id: assignmentId },
      select: {
        admission: { select: { id: true, studentId: true, tryoutId: true } },
        deliverySession: { select: { availableFrom: true, availableUntil: true, id: true } },
      },
    });
    if (!lockedCandidate) throw new TryoutDeliveryValidationError("Penugasan sesi Tryout tidak ditemukan setelah penguncian.");
    await lockOverlappingDeliverySessions(tx, lockedCandidate.deliverySession.id, lockedCandidate.deliverySession.availableFrom, lockedCandidate.deliverySession.availableUntil);
    await lockTryoutAdmissions(tx, [lockedCandidate.admission.id]);
    await lockTryoutAssignments(tx, [assignmentId]);
    let assignment = await tx.tryoutDeliveryAssignment.findUnique({
      where: { id: assignmentId },
      include: { admission: true, deliverySession: true },
    });
    if (!assignment) throw new TryoutDeliveryValidationError("Penugasan sesi Tryout tidak ditemukan.");
    await assertAdmissionStudentIsNotManagedPreview(tx, assignment.admissionId);
    assignment = await tx.tryoutDeliveryAssignment.findUnique({
      where: { id: assignmentId },
      include: { admission: true, deliverySession: true },
    });
    if (!assignment) throw new TryoutDeliveryValidationError("Penugasan sesi Tryout tidak ditemukan setelah penguncian.");
    await assertAdmissionMutationAllowed(tx, assignment.admission.tryoutId, actorId);
    if (assignment.status === TryoutAssignmentStatus.revoked) return assignment;
    if (assignment.status !== TryoutAssignmentStatus.active) throw new TryoutDeliveryValidationError("Hanya penugasan aktif yang dapat dicabut.");
    const existingAttempt = await tx.tryoutAttempt.findUnique({
      where: { deliverySessionId_studentId: { deliverySessionId: assignment.deliverySessionId, studentId: assignment.admission.studentId } },
      select: { id: true },
    });
    if (existingAttempt) throw new TryoutDeliveryValidationError("Akses sesi yang sudah memiliki pengerjaan tidak dapat dicabut; riwayat peserta tetap dipertahankan.");
    const updated = await tx.tryoutDeliveryAssignment.update({
      where: { id: assignmentId },
      data: { revokeReason: auditReason, revokedAt: new Date(), status: TryoutAssignmentStatus.revoked },
    });
    await audit(tx, { action: "delivery_session.revoked", actorId, admissionId: assignment.admissionId, after: { status: updated.status }, before: { status: assignment.status }, deliverySessionId: assignment.deliverySessionId, reason: auditReason, tryoutId: assignment.admission.tryoutId });
    return updated;
  });
}

async function getOwnedTryoutDeliverySessionIdsWithAttempts(tryoutId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    if (!(await isActiveTryoutManager(tx, actorId))) return null;
    const managedTryout = await tx.tryoutPackage.findFirst({
      select: { id: true },
      where: { id: tryoutId },
    });
    if (!managedTryout) return null;
    const sessions = await tx.tryoutDeliverySession.findMany({
      orderBy: { id: "asc" },
      select: { id: true },
      where: { tryoutId: managedTryout.id, attempts: { some: {} } },
    });
    return sessions.map((session) => session.id);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

async function getTryoutDeliveryOperations(tryoutId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
  // This is a read-only graph load. A repeatable-read snapshot keeps the
  // manager check and graph consistent without holding the exclusive Tryout
  // mutation mutex while the large result payload is fetched.
  if (!(await isActiveTryoutManager(tx, actorId))) return null;
  const managedTryout = await tx.tryoutPackage.findFirst({
    select: { id: true },
    where: { id: tryoutId },
  });
  if (!managedTryout) return null;
  const tryout = await tx.tryoutPackage.findFirst({
    where: { id: managedTryout.id },
    include: {
      _count: { select: { attempts: true } },
      assessmentReleases: { orderBy: { releaseNumber: "desc" }, take: 1 },
      sections: {
        select: { id: true, sequenceNo: true, subtestId: true },
        orderBy: { sequenceNo: "asc" },
      },
      admissions: {
        include: {
          student: { select: { email: true, fullName: true, id: true } },
          assignments: {
            include: {
              deliverySession: {
                include: {
                  attempts: {
                    select: {
                      attemptState: true,
                      id: true,
                      normalizedScore: true,
                      rawScore: true,
                      releaseAt: true,
                      releaseState: true,
                      scaledScore: true,
                      score: true,
                      scoringState: true,
                      scoringVersion: true,
                      status: true,
                      studentId: true,
                    },
                  },
                },
              },
            },
            orderBy: { assignedAt: "desc" },
          },
        },
        orderBy: { requestedAt: "desc" },
      },
      deliverySessions: {
        include: {
          assessmentRelease: true,
          attempts: {
            include: {
              assessmentRelease: true,
              runs: {
                include: {
                  answers: {
                    select: {
                      answerText: true,
                      answeredAt: true,
                      selectedOptionId: true,
                      syncedAt: true,
                    },
                  },
                  assessmentRelease: true,
                  integrityEvents: { orderBy: { serverSequence: "asc" } },
                },
                orderBy: { sequenceNo: "asc" },
              },
              scoreBreakdowns: {
                select: {
                  normalizedScore: true,
                  rawScore: true,
                  scaledScore: true,
                  scoringProvenance: true,
                  scoringVersion: true,
                  subtestId: true,
                },
              },
              student: { select: { email: true, fullName: true, id: true } },
            },
            orderBy: { createdAt: "desc" },
          },
          audits: { orderBy: { createdAt: "desc" }, take: 100 },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!tryout) return null;
  return tryout;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    timeout: 15_000,
  });
}

export { configureTryoutAdmission, configureTryoutDefaultResultRelease, decideTryoutAdmission, getOwnedTryoutDeliverySessionIdsWithAttempts, getTryoutDeliveryOperations, inviteTryoutParticipant, openTryoutDeliverySession, registerForTryout, revokeTryoutDeliveryAssignment, TryoutDeliveryValidationError, updateTryoutDeliverySessionSchedule };
export type { DeliverySessionScheduleInput };
