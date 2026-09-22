import "server-only";

import {
  ContentStatus,
  Prisma,
  TryoutAdmissionMode,
  TryoutAdmissionStatus,
  TryoutAssignmentStatus,
  TryoutDeliverySessionStatus,
  TryoutRankingRule,
  TryoutResultReleasePolicy,
} from "@/generated/prisma/client";
import {
  assertTryoutReleaseEligibility,
  createOrReuseAssessmentRelease,
} from "@/lib/tryout/assessment-release";
import { isManagedPreviewPurpose } from "@/lib/admin/student-preview-contract";
import { createTryoutInvitationNotification } from "@/lib/notifications/service";
import { prisma } from "@/lib/prisma";
import { MAIN_TRYOUT_SESSION_NAME } from "@/lib/tryout/main-session";
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

type DeliverySessionInput = {
  availableFrom: Date | string;
  availableUntil: Date | string;
  fullscreenPrompt?: boolean;
  name: string;
  rankingRule?: "none" | "national" | "cohort";
  resultReleasePolicy?: "inherit" | "immediate" | "manual" | "automatic_at_end" | "scheduled";
  scheduledReleaseAt?: Date | string | null;
  status?: "draft" | "active";
  tryoutId: string;
};

type DeliverySessionScheduleInput = {
  availableFrom: Date | string;
  availableUntil: Date | string;
  deliverySessionId: string;
};

type AssignmentInput = { admissionId: string; deliverySessionId: string };
type RetakeInput = Omit<DeliverySessionInput, "tryoutId"> & { admissionId: string };

function reasonOrThrow(reason: string) {
  const value = reason.trim();
  if (!value) throw new TryoutDeliveryValidationError("Alasan audit wajib diisi.");
  return value;
}

function dateOrThrow(value: Date | string, field: string) {
  const date = parseTryoutDateTime(value);
  if (Number.isNaN(date.getTime())) throw new TryoutDeliveryValidationError(`${field} tidak valid.`);
  return date;
}

function json(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }

async function audit(tx: Prisma.TransactionClient, input: { action: string; admissionId?: string; after: unknown; before?: unknown; deliverySessionId?: string; reason: string; tryoutId: string; actorId: string }) {
  return tx.tryoutDeliveryAudit.create({ data: { action: input.action, actorUserId: input.actorId, admissionId: input.admissionId, after: json(input.after), before: input.before === undefined ? undefined : json(input.before), deliverySessionId: input.deliverySessionId, reason: input.reason, tryoutId: input.tryoutId } });
}

async function assertStudent(tx: Prisma.TransactionClient, studentId: string) {
  const student = await tx.user.findUnique({
    select: {
      previewPurpose: true,
      studentProfile: { select: { userId: true } },
    },
    where: { id: studentId },
  });
  if (!student?.studentProfile) throw new TryoutDeliveryValidationError("Peserta harus merupakan akun student dengan StudentProfile.");
  if (isManagedPreviewPurpose(student.previewPurpose)) {
    throw new TryoutDeliveryValidationError("Akun preview admin hanya dapat diakses melalui restart Tryout preview.");
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
    throw new TryoutDeliveryValidationError("Akun preview admin hanya dapat diakses melalui restart Tryout preview.");
  }
}

async function assertTryoutOwnership(
  tx: Prisma.TransactionClient,
  tryoutId: string,
  actorId: string,
  allowCrossOwner = false,
) {
  const tryout = await tx.tryoutPackage.findUnique({
    select: { createdByUserId: true },
    where: { id: tryoutId },
  });
  if (!tryout) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan.");
  if (!allowCrossOwner && tryout.createdByUserId !== actorId) {
    throw new TryoutDeliveryValidationError("Anda tidak dapat mengubah delivery Tryout milik Kapten lain.");
  }
  return tryout;
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

async function lockTryoutDeliverySessions(
  tx: Prisma.TransactionClient,
  tryoutId: string,
) {
  const sessions = await tx.tryoutDeliverySession.findMany({
    where: { tryoutId },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  await lockTryoutSessions(tx, sessions.map((session) => session.id));
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
  isDefaultOpenRegistration: boolean;
  name: string;
  status: TryoutDeliverySessionStatus;
  tryoutId: string;
};

type RegistrationAssignment = {
  id: string;
  deliverySessionId: string;
  status: TryoutAssignmentStatus;
};

function activeRegistrationAssignment(
  assignments: RegistrationAssignment[],
  selectedSessionId?: string | null,
) {
  const activeAssignments = assignments.filter(
    (assignment) => assignment.status === TryoutAssignmentStatus.active,
  );
  if (selectedSessionId !== undefined && selectedSessionId !== null) {
    return activeAssignments.find(
      (assignment) => assignment.deliverySessionId === selectedSessionId,
    ) ?? null;
  }
  return activeAssignments[0] ?? null;
}

function assertEligibleSession(
  session: EligibleSession | null,
  now: Date,
  source: "default" | "selected",
) {
  const label = source === "default" ? "Sesi default Tryout" : "Sesi Tryout yang dipilih";
  if (!session) throw new TryoutDeliveryValidationError(`${label} tidak ditemukan.`);
  if (session.status === TryoutDeliverySessionStatus.closed) throw new TryoutDeliveryValidationError(`${label} sudah ditutup dan tidak dapat digunakan.`);
  if (session.status === TryoutDeliverySessionStatus.archived) throw new TryoutDeliveryValidationError(`${label} sudah diarsipkan dan tidak dapat digunakan.`);
  if (session.status !== TryoutDeliverySessionStatus.active) throw new TryoutDeliveryValidationError(`${label} belum dibuka untuk peserta.`);
  if (!session.assessmentReleaseId) throw new TryoutDeliveryValidationError(`${label} belum memiliki AssessmentRelease yang valid.`);
  if (session.availableUntil <= now) throw new TryoutDeliveryValidationError(`${label} sudah berakhir.`);
  return session;
}

async function findDefaultSession(
  tx: Prisma.TransactionClient,
  tryoutId: string,
  now: Date,
) {
  const candidates = await tx.tryoutDeliverySession.findMany({
    where: { isDefaultOpenRegistration: true, tryoutId },
    orderBy: { availableFrom: "asc" },
    select: {
      assessmentReleaseId: true,
      availableFrom: true,
      availableUntil: true,
      id: true,
      isDefaultOpenRegistration: true,
      name: true,
      status: true,
      tryoutId: true,
    },
  });
  if (candidates.length > 1) {
    throw new TryoutDeliveryValidationError("Tryout memiliki lebih dari satu sesi default; perbaiki konfigurasi akses terlebih dahulu.");
  }
  return assertEligibleSession(candidates[0] ?? null, now, "default");
}

async function findSelectedSession(
  tx: Prisma.TransactionClient,
  tryoutId: string,
  selectedSessionId: string,
  now: Date,
) {
  const candidate = await tx.tryoutDeliverySession.findFirst({
    where: { id: selectedSessionId, tryoutId },
    select: {
      assessmentReleaseId: true,
      availableFrom: true,
      availableUntil: true,
      id: true,
      isDefaultOpenRegistration: true,
      name: true,
      status: true,
      tryoutId: true,
    },
  });
  return assertEligibleSession(candidate, now, "selected");
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

async function configureTryoutAdmission(tryoutId: string, mode: "open" | "approval_required" | "invitation_only", actorId: string, reason: string, allowCrossOwner = false) {
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    await lockTryoutIdentityScope(tx, { id: tryoutId, kind: "tryout" });
    await assertTryoutNotStarted(tx, tryoutId);
    await assertTryoutOwnership(tx, tryoutId, actorId, allowCrossOwner);
    const record = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { admissionMode: true } });
    if (!record) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan.");
    await tx.tryoutPackage.update({ where: { id: tryoutId }, data: { admissionMode: mode as TryoutAdmissionMode } });
    await audit(tx, { action: "admission_mode.configured", actorId, after: { admissionMode: mode }, before: { admissionMode: record.admissionMode }, reason: auditReason, tryoutId });
    return { admissionMode: mode, tryoutId };
  });
}

async function configureTryoutDefaultResultRelease(tryoutId: string, policy: "immediate" | "manual" | "automatic_at_end", actorId: string, reason: string, allowCrossOwner = false) {
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    await lockTryoutIdentityScope(tx, { id: tryoutId, kind: "tryout" });
    await assertTryoutNotStarted(tx, tryoutId);
    await assertTryoutOwnership(tx, tryoutId, actorId, allowCrossOwner);
    const record = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { defaultResultReleasePolicy: true } });
    if (!record) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan.");
    await tx.tryoutPackage.update({ where: { id: tryoutId }, data: { defaultResultReleasePolicy: policy as TryoutResultReleasePolicy } });
    await audit(tx, { action: "result_release.default_configured", actorId, after: { policy }, before: { policy: record.defaultResultReleasePolicy }, reason: auditReason, tryoutId });
    return { policy, tryoutId };
  });
}

async function createTryoutDeliverySession(input: DeliverySessionInput, actorId: string, reason: string, allowCrossOwner = false) {
  const auditReason = reasonOrThrow(reason);
  const availableFrom = dateOrThrow(input.availableFrom, "Waktu mulai");
  const availableUntil = dateOrThrow(input.availableUntil, "Waktu selesai");
  const name = input.name.trim();
  if (!name) throw new TryoutDeliveryValidationError("Nama sesi wajib diisi.");
  if (availableUntil <= availableFrom) throw new TryoutDeliveryValidationError("Waktu selesai harus setelah waktu mulai.");
  const status = input.status ?? "active";
  if (status !== "draft" && status !== "active") throw new TryoutDeliveryValidationError("Status sesi tidak valid.");
  const resultReleasePolicy = input.resultReleasePolicy ?? "inherit";
  if (!["inherit", "immediate", "manual", "automatic_at_end", "scheduled"].includes(resultReleasePolicy)) throw new TryoutDeliveryValidationError("Kebijakan rilis hasil tidak valid.");
  const scheduledReleaseAt = resultReleasePolicy === "scheduled"
    ? dateOrThrow(input.scheduledReleaseAt ?? "", "Waktu rilis hasil")
    : null;
  if (scheduledReleaseAt && scheduledReleaseAt < availableUntil) throw new TryoutDeliveryValidationError("Waktu rilis hasil terjadwal harus sama dengan atau setelah sesi selesai.");
  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    await lockTryoutIdentityScope(tx, { id: input.tryoutId, kind: "tryout" });
    await assertTryoutNotStarted(tx, input.tryoutId);
    await assertTryoutOwnership(tx, input.tryoutId, actorId, allowCrossOwner);
    const tryout = await tx.tryoutPackage.findUnique({ where: { id: input.tryoutId }, select: { id: true, publishedAt: true } });
    if (!tryout) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan.");
    const existingSession = await tx.tryoutDeliverySession.findFirst({
      where: { tryoutId: input.tryoutId },
      select: { id: true, name: true },
    });
    if (existingSession) {
      throw new TryoutDeliveryValidationError("Tryout hanya memiliki satu sesi utama. Atur waktu buka dan tutup pada sesi utama yang sudah tersedia.");
    }
    if (name !== MAIN_TRYOUT_SESSION_NAME) {
      throw new TryoutDeliveryValidationError("Tryout hanya menggunakan sesi utama.");
    }
    let assessmentReleaseId: string | null = null;
    if (status === "active") {
      try {
        await assertTryoutReleaseEligibility(tx, input.tryoutId);
      } catch (error) {
        throw new TryoutDeliveryValidationError(error instanceof Error ? error.message : "Tryout belum memenuhi syarat AssessmentRelease.");
      }
      const release = await createOrReuseAssessmentRelease(tx, input.tryoutId, actorId, tryout.publishedAt ?? new Date(), { assumeTryoutLocked: true });
      assessmentReleaseId = release.id;
    }
    const isDefaultOpenRegistration = name === MAIN_TRYOUT_SESSION_NAME && status === "active";
    const session = await tx.tryoutDeliverySession.create({ data: { assessmentReleaseId, availableFrom, availableUntil, createdByUserId: actorId, fullscreenPrompt: Boolean(input.fullscreenPrompt), isDefaultOpenRegistration, name, rankingRule: (input.rankingRule ?? "none") as TryoutRankingRule, resultReleasePolicy: resultReleasePolicy as TryoutResultReleasePolicy, scheduledReleaseAt, status: status as TryoutDeliverySessionStatus, tryoutId: input.tryoutId, updatedByUserId: actorId } });
    await audit(tx, { action: "delivery_session.created", actorId, after: { availableFrom, availableUntil, fullscreenPrompt: session.fullscreenPrompt, isDefaultOpenRegistration, name, resultReleasePolicy, scheduledReleaseAt, status: session.status }, deliverySessionId: session.id, reason: auditReason, tryoutId: input.tryoutId });
    return session;
  });
}

async function openTryoutDeliverySession(deliverySessionId: string, actorId: string, reason: string, allowCrossOwner = false) {
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
    await assertTryoutOwnership(tx, session.tryoutId, actorId, allowCrossOwner);

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
  allowCrossOwner = false,
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
    await assertTryoutOwnership(tx, identity.tryoutId, actorId, allowCrossOwner);
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
      throw new TryoutDeliveryValidationError("Jadwal sesi yang sudah memiliki attempt tidak dapat diubah.");
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

async function setTryoutDefaultOpenRegistrationSession(
  deliverySessionId: string,
  actorId: string,
  reason: string,
  allowCrossOwner = false,
) {
  const auditReason = reasonOrThrow(reason);

  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    const candidate = await tx.tryoutDeliverySession.findUnique({
      where: { id: deliverySessionId },
      select: { id: true, tryoutId: true },
    });
    if (!candidate) throw new TryoutDeliveryValidationError("Sesi Tryout tidak ditemukan.");

    const identity = await lockTryoutIdentityScope(tx, { id: deliverySessionId, kind: "session" });
    await assertTryoutOwnership(tx, identity.tryoutId, actorId, allowCrossOwner);
    await lockTryoutDeliverySessions(tx, identity.tryoutId);
    await assertTryoutNotStarted(tx, identity.tryoutId);

    const session = await tx.tryoutDeliverySession.findUnique({
      where: { id: deliverySessionId },
      select: {
        assessmentReleaseId: true,
        id: true,
        isDefaultOpenRegistration: true,
        name: true,
        status: true,
        tryoutId: true,
      },
    });
    if (!session) throw new TryoutDeliveryValidationError("Sesi Tryout tidak ditemukan setelah penguncian.");
    if (session.name !== MAIN_TRYOUT_SESSION_NAME) {
      throw new TryoutDeliveryValidationError("Tryout hanya menggunakan sesi utama pendaftaran.");
    }
    if (session.status !== TryoutDeliverySessionStatus.active) {
      throw new TryoutDeliveryValidationError("Hanya sesi aktif yang dapat menjadi sesi utama pendaftaran.");
    }
    if (!session.assessmentReleaseId) {
      throw new TryoutDeliveryValidationError("Sesi aktif harus memiliki rilis konten sebelum menjadi sesi utama pendaftaran.");
    }

    const previous = await tx.tryoutDeliverySession.findFirst({
      where: { isDefaultOpenRegistration: true, tryoutId: session.tryoutId },
      select: { id: true, name: true },
    });

    if (previous?.id !== session.id) {
      await tx.tryoutDeliverySession.updateMany({
        where: { isDefaultOpenRegistration: true, tryoutId: session.tryoutId },
        data: { isDefaultOpenRegistration: false, updatedByUserId: actorId },
      });
      await tx.tryoutDeliverySession.update({
        where: { id: session.id },
        data: { isDefaultOpenRegistration: true, updatedByUserId: actorId },
      });
    }

    const updated = await tx.tryoutDeliverySession.findUnique({
      where: { id: session.id },
    });
    if (!updated) throw new TryoutDeliveryValidationError("Sesi utama pendaftaran tidak dapat disimpan.");
    await audit(tx, {
      action: "delivery_session.default_open_registration_updated",
      actorId,
      after: { isDefaultOpenRegistration: true, name: session.name, sessionId: session.id },
      before: previous
        ? { isDefaultOpenRegistration: true, name: previous.name, sessionId: previous.id }
        : { isDefaultOpenRegistration: false, sessionId: null },
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
  selectedSessionId?: string | null,
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
      const existingAssignment = activeRegistrationAssignment(existing.assignments, selectedSessionId);
      if (selectedSessionId !== undefined && selectedSessionId !== null && existing.status === TryoutAdmissionStatus.active && !existingAssignment) {
        throw new TryoutDeliveryValidationError("Sesi Tryout yang dipilih belum menjadi penugasanmu.");
      }
      if (target) {
        await tx.studentProfile.update({ data: { targetMajorId: target.majorId, targetUniversityId: target.universityId }, where: { userId: studentId } });
      }
      return { admissionId: existing.id, assignmentId: existingAssignment?.id ?? null, deliverySessionId: existingAssignment?.deliverySessionId ?? null, state: "existing" as const, status: existing.status };
    }
    const tryout = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { admissionMode: true, id: true, status: true } });
    if (!tryout || tryout.status !== ContentStatus.published) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak tersedia.");
    if (tryout.admissionMode === TryoutAdmissionMode.invitation_only) throw new TryoutDeliveryValidationError("Tryout ini hanya menerima undangan.");
    const status = tryout.admissionMode === TryoutAdmissionMode.open ? TryoutAdmissionStatus.active : TryoutAdmissionStatus.pending;
    const now = new Date();
    let registrationSession: EligibleSession | null = null;
    if (status === TryoutAdmissionStatus.active) {
      try {
        registrationSession = selectedSessionId !== undefined && selectedSessionId !== null
          ? await findSelectedSession(tx, tryoutId, selectedSessionId, now)
          : await findDefaultSession(tx, tryoutId, now);
      } catch (error) {
        if (error instanceof TryoutDeliveryValidationError && selectedSessionId == null) {
          return { admissionId: null, assignmentId: null, deliverySessionId: null, state: "unavailable" as const, status: null };
        }
        throw error;
      }
    }
    // Keep the established local name for the session that will receive a new
    // registration. It is either the requested session or the default session;
    // the selection above never falls back when a session was declared.
    const defaultSession = registrationSession;
    if (status === TryoutAdmissionStatus.active && !defaultSession) return { admissionId: null, assignmentId: null, deliverySessionId: null, state: "unavailable" as const, status: null };
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
      const existingAssignment = activeRegistrationAssignment(existing.assignments, selectedSessionId);
      if (selectedSessionId !== undefined && selectedSessionId !== null && existing.status === TryoutAdmissionStatus.active && !existingAssignment) {
        throw new TryoutDeliveryValidationError("Sesi Tryout yang dipilih belum menjadi penugasanmu.");
      }
      if (target) await tx.studentProfile.update({ data: { targetMajorId: target.majorId, targetUniversityId: target.universityId }, where: { userId: studentId } });
      return { admissionId: existing.id, assignmentId: existingAssignment?.id ?? null, deliverySessionId: existingAssignment?.deliverySessionId ?? null, state: "existing" as const, status: existing.status };
    }
    if (defaultSession) await lockSessionScope(tx, defaultSession);
    const lockedDefaultSession = defaultSession
      ? await findSelectedSession(tx, tryoutId, defaultSession.id, now)
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
  allowCrossOwner = false,
  selectedSessionId?: string | null,
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

    if (decision === "approve") {
      const replayAssignment = admission.status === TryoutAdmissionStatus.active
        ? admission.assignments.find((assignment) => assignment.status === TryoutAssignmentStatus.active && (!selectedSessionId || assignment.deliverySessionId === selectedSessionId))
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
        await assertTryoutOwnership(tx, admission.tryoutId, actorId, allowCrossOwner);
        const replayedAssignment = admission.status === TryoutAdmissionStatus.active
          ? admission.assignments.find((assignment) => assignment.status === TryoutAssignmentStatus.active && (!selectedSessionId || assignment.deliverySessionId === selectedSessionId))
          : null;
        if (replayedAssignment) return admission;
      }
      const now = new Date();
      const selected = selectedSessionId
        ? await findSelectedSession(tx, admission.tryoutId, selectedSessionId, now)
        : await findDefaultSession(tx, admission.tryoutId, now);
      const assignmentsToLock = admission.assignments
        .filter((assignment) => assignment.status === TryoutAssignmentStatus.active || assignment.deliverySessionId === selected.id)
        .sort((left, right) => left.id.localeCompare(right.id));
      await lockParticipantAssignments(tx, admission.id, assignmentsToLock, [selected]);
      const lockedSelected = selectedSessionId
        ? await findSelectedSession(tx, admission.tryoutId, selectedSessionId, now)
        : await findSelectedSession(tx, admission.tryoutId, selected.id, now);
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
      await assertTryoutOwnership(tx, admission.tryoutId, actorId, allowCrossOwner);
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
    await assertTryoutOwnership(tx, admission.tryoutId, actorId, allowCrossOwner);
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
  allowCrossOwner = false,
  selectedSessionId?: string | null,
) {
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    await lockTryoutParticipantIdentityScope(tx, { id: tryoutId, kind: "tryout" }, studentId);
    await assertTryoutOwnership(tx, tryoutId, actorId, allowCrossOwner);
    await assertStudent(tx, studentId);
    const initialAdmission = await tx.tryoutAdmission.findUnique({
      where: { tryoutId_studentId: { studentId, tryoutId } },
      include: {
        assignments: {
          include: { deliverySession: true },
          orderBy: { assignedAt: "desc" },
        },
      },
    });
    const tryout = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { id: true } });
    let admission = initialAdmission;
    if (!tryout) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan.");
    const replayAssignment = admission?.status === TryoutAdmissionStatus.active
      ? admission.assignments.find((assignment) => assignment.status === TryoutAssignmentStatus.active && (!selectedSessionId || assignment.deliverySessionId === selectedSessionId))
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
      await assertTryoutOwnership(tx, tryoutId, actorId, allowCrossOwner);
      const replayedAssignment = admission.status === TryoutAdmissionStatus.active
        ? admission.assignments.find((assignment) => assignment.status === TryoutAssignmentStatus.active && (!selectedSessionId || assignment.deliverySessionId === selectedSessionId))
        : null;
      if (replayedAssignment) return { ...admission, assignmentId: replayedAssignment.id, deliverySessionId: replayedAssignment.deliverySessionId };
    }
    const now = new Date();
    const selected = selectedSessionId
      ? await findSelectedSession(tx, tryoutId, selectedSessionId, now)
      : await findDefaultSession(tx, tryoutId, now);
    if (admission) {
      const assignmentsToLock = admission.assignments
        .filter((assignment) => assignment.status === TryoutAssignmentStatus.active || assignment.deliverySessionId === selected.id)
        .sort((left, right) => left.id.localeCompare(right.id));
      await lockParticipantAssignments(tx, admission.id, assignmentsToLock, [selected]);
    } else {
      await lockSessionScope(tx, selected);
    }
    const lockedSelected = selectedSessionId
      ? await findSelectedSession(tx, tryoutId, selectedSessionId, now)
      : await findSelectedSession(tx, tryoutId, selected.id, now);
    const lockedTryout = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { id: true } });
    if (!lockedTryout) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan setelah penguncian.");
    await assertTryoutOwnership(tx, tryoutId, actorId, allowCrossOwner);
    admission = await tx.tryoutAdmission.findUnique({
      where: { tryoutId_studentId: { studentId, tryoutId } },
      include: {
        assignments: {
          where: { status: TryoutAssignmentStatus.active },
          include: { deliverySession: true },
          orderBy: { assignedAt: "desc" },
        },
      },
    });
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
    const invitationAudit = await audit(tx, { action: "admission.invited", actorId, admissionId: restored.id, after: { assignmentId: assignment.id, sessionId: lockedSelected.id, status: restored.status, studentId }, reason: auditReason, deliverySessionId: lockedSelected.id, tryoutId });
    if (existingAssignment?.status !== TryoutAssignmentStatus.active) {
      await createTryoutInvitationNotification({
        recipientUserId: studentId,
        sourceEntityId: invitationAudit.id,
        tryoutId,
        tx,
      });
    }
    return { ...restored, assignmentId: assignment.id, deliverySessionId: lockedSelected.id };
  });
}

async function assignTryoutDeliverySession(input: AssignmentInput, actorId: string, reason: string, allowCrossOwner = false) {
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    const candidate = await tx.tryoutAdmission.findUnique({ where: { id: input.admissionId }, select: { studentId: true, tryoutId: true } });
    if (!candidate) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak ditemukan.");
    await lockTryoutParticipantIdentityScope(tx, { id: input.admissionId, kind: "admission" }, candidate.studentId);
    const sessionCandidate = await tx.tryoutDeliverySession.findUnique({ where: { id: input.deliverySessionId }, select: { availableFrom: true, availableUntil: true, tryoutId: true } });
    const lockedCandidate = await tx.tryoutAdmission.findUnique({ where: { id: input.admissionId }, select: { studentId: true, tryoutId: true } });
    if (!lockedCandidate || !sessionCandidate || lockedCandidate.tryoutId !== sessionCandidate.tryoutId) throw new TryoutDeliveryValidationError("Pendaftaran dan sesi Tryout tidak cocok.");
    const assignmentCandidate = await tx.tryoutDeliveryAssignment.findUnique({ where: { admissionId_deliverySessionId: { admissionId: input.admissionId, deliverySessionId: input.deliverySessionId } }, select: { id: true } });
    await lockOverlappingDeliverySessions(tx, input.deliverySessionId, sessionCandidate.availableFrom, sessionCandidate.availableUntil);
    await lockTryoutAdmissions(tx, [input.admissionId]);
    if (assignmentCandidate) await lockTryoutAssignments(tx, [assignmentCandidate.id]);
    const admission = await tx.tryoutAdmission.findUnique({ where: { id: input.admissionId } });
    if (!admission) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak ditemukan setelah penguncian.");
    const session = await tx.tryoutDeliverySession.findUnique({ where: { id: input.deliverySessionId } });
    if (!session || admission.tryoutId !== session.tryoutId) throw new TryoutDeliveryValidationError("Pendaftaran dan sesi Tryout tidak cocok setelah penguncian.");
    await assertTryoutOwnership(tx, admission.tryoutId, actorId, allowCrossOwner);
    await assertAdmissionStudentIsNotManagedPreview(tx, admission.id);
    if (admission.status !== TryoutAdmissionStatus.active) throw new TryoutDeliveryValidationError("Peserta aktif diperlukan untuk penugasan.");
    assertEligibleSession(session, new Date(), "selected");
    const assignment = await ensureActiveAssignment(tx, input.admissionId, input.deliverySessionId, actorId);
    await audit(tx, { action: "delivery_session.assigned", actorId, admissionId: admission.id, after: { assignmentId: assignment.id, status: assignment.status }, deliverySessionId: session.id, reason: auditReason, tryoutId: admission.tryoutId });
    return assignment;
  });
}

async function revokeTryoutDeliveryAssignment(assignmentId: string, actorId: string, reason: string, allowCrossOwner = false) {
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
    await assertTryoutOwnership(tx, assignment.admission.tryoutId, actorId, allowCrossOwner);
    if (assignment.status === TryoutAssignmentStatus.revoked) return assignment;
    if (assignment.status !== TryoutAssignmentStatus.active) throw new TryoutDeliveryValidationError("Hanya penugasan aktif yang dapat dicabut.");
    const existingAttempt = await tx.tryoutAttempt.findUnique({
      where: { deliverySessionId_studentId: { deliverySessionId: assignment.deliverySessionId, studentId: assignment.admission.studentId } },
      select: { id: true },
    });
    if (existingAttempt) throw new TryoutDeliveryValidationError("Akses sesi yang telah memiliki attempt tidak dapat dicabut; riwayat peserta harus dipertahankan.");
    const updated = await tx.tryoutDeliveryAssignment.update({
      where: { id: assignmentId },
      data: { revokeReason: auditReason, revokedAt: new Date(), status: TryoutAssignmentStatus.revoked },
    });
    await audit(tx, { action: "delivery_session.revoked", actorId, admissionId: assignment.admissionId, after: { status: updated.status }, before: { status: assignment.status }, deliverySessionId: assignment.deliverySessionId, reason: auditReason, tryoutId: assignment.admission.tryoutId });
    return updated;
  });
}

async function createTryoutRetake(input: RetakeInput, actorId: string, reason: string, allowCrossOwner = false) {
  const auditReason = reasonOrThrow(reason);
  const availableFrom = dateOrThrow(input.availableFrom, "Waktu mulai");
  const availableUntil = dateOrThrow(input.availableUntil, "Waktu selesai");
  const name = input.name.trim();
  if (!name || availableUntil <= availableFrom) throw new TryoutDeliveryValidationError("Nama dan jendela ketersediaan retake tidak valid.");
  const resultReleasePolicy = input.resultReleasePolicy ?? "inherit";
  if (!["inherit", "immediate", "manual", "automatic_at_end", "scheduled"].includes(resultReleasePolicy)) throw new TryoutDeliveryValidationError("Kebijakan rilis hasil tidak valid.");
  const scheduledReleaseAt = resultReleasePolicy === "scheduled"
    ? dateOrThrow(input.scheduledReleaseAt ?? "", "Waktu rilis hasil")
    : null;
  if (scheduledReleaseAt && scheduledReleaseAt < availableUntil) throw new TryoutDeliveryValidationError("Waktu rilis hasil terjadwal harus sama dengan atau setelah sesi selesai.");
  return prisma.$transaction(async (tx) => {
    await prepareTryoutTransaction(tx);
    const candidate = await tx.tryoutAdmission.findUnique({ where: { id: input.admissionId }, select: { studentId: true } });
    if (!candidate) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak ditemukan.");
    await lockTryoutParticipantIdentityScope(tx, { id: input.admissionId, kind: "admission" }, candidate.studentId);
    let admission = await tx.tryoutAdmission.findUnique({ where: { id: input.admissionId } });
    if (!admission || admission.status !== TryoutAdmissionStatus.active) throw new TryoutDeliveryValidationError("Peserta aktif diperlukan untuk membuat retake.");
    await assertTryoutOwnership(tx, admission.tryoutId, actorId, allowCrossOwner);
    await assertAdmissionStudentIsNotManagedPreview(tx, admission.id);
    try {
      await assertTryoutReleaseEligibility(tx, admission.tryoutId);
    } catch (error) {
      throw new TryoutDeliveryValidationError(error instanceof Error ? error.message : "Tryout belum memenuhi syarat AssessmentRelease.");
    }
    const release = await createOrReuseAssessmentRelease(tx, admission.tryoutId, actorId, new Date(), { assumeTryoutLocked: true });
    await lockTryoutAdmissions(tx, [admission.id]);
    admission = await tx.tryoutAdmission.findUnique({ where: { id: input.admissionId } });
    if (!admission || admission.status !== TryoutAdmissionStatus.active) throw new TryoutDeliveryValidationError("Peserta aktif diperlukan untuk membuat retake setelah penguncian.");
    const existing = await tx.tryoutDeliverySession.findFirst({ where: { name, tryoutId: admission.tryoutId }, select: { id: true } });
    if (existing) throw new TryoutDeliveryValidationError("Nama sesi retake sudah digunakan pada Tryout ini.");
    const session = await tx.tryoutDeliverySession.create({ data: { assessmentReleaseId: release.id, availableFrom, availableUntil, createdByUserId: actorId, fullscreenPrompt: Boolean(input.fullscreenPrompt), isDefaultOpenRegistration: false, name, rankingRule: (input.rankingRule ?? "none") as TryoutRankingRule, resultReleasePolicy: resultReleasePolicy as TryoutResultReleasePolicy, scheduledReleaseAt, status: TryoutDeliverySessionStatus.active, tryoutId: admission.tryoutId, updatedByUserId: actorId } });
    const assignment = await tx.tryoutDeliveryAssignment.create({ data: { admissionId: admission.id, assignedByUserId: actorId, deliverySessionId: session.id } });
    await audit(tx, { action: "delivery_session.retake_created", actorId, admissionId: admission.id, after: { assignmentId: assignment.id, sessionId: session.id, window: { availableFrom, availableUntil } }, deliverySessionId: session.id, reason: auditReason, tryoutId: admission.tryoutId });
    return { assignment, session };
  });
}

async function getTryoutDeliveryOperations(tryoutId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
  await prepareTryoutTransaction(tx);
  await lockTryoutIdentityScope(tx, { id: tryoutId, kind: "tryout" });
  // Resolve ownership in a narrow query before the graph query can touch
  // student identities or attempt payloads. Keep the predicate on the graph
  // query too so a concurrent ownership change cannot widen the read.
  const ownedTryout = await tx.tryoutPackage.findFirst({
    select: { id: true },
    where: { createdByUserId: actorId, id: tryoutId },
  });
  if (!ownedTryout) return null;
  const tryout = await tx.tryoutPackage.findFirst({
    where: { createdByUserId: actorId, id: ownedTryout.id },
    include: {
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
  });
}

export { assignTryoutDeliverySession, configureTryoutAdmission, configureTryoutDefaultResultRelease, createTryoutDeliverySession, createTryoutRetake, decideTryoutAdmission, getTryoutDeliveryOperations, inviteTryoutParticipant, openTryoutDeliverySession, registerForTryout, revokeTryoutDeliveryAssignment, setTryoutDefaultOpenRegistrationSession, TryoutDeliveryValidationError, updateTryoutDeliverySessionSchedule };
export type { AssignmentInput, DeliverySessionInput, DeliverySessionScheduleInput, RetakeInput };
