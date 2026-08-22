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
import { CANONICAL_2PL_MODEL_VERSION } from "@/lib/tryout/cat-profile";
import { isManagedPreviewPurpose } from "@/lib/admin/student-preview-contract";
import { prisma } from "@/lib/prisma";

class TryoutDeliveryValidationError extends Error {}

type DeliverySessionInput = {
  availableFrom: Date | string;
  availableUntil: Date | string;
  fullscreenPrompt?: boolean;
  isDefaultOpenRegistration?: boolean;
  name: string;
  rankingRule?: "none" | "national" | "cohort";
  resultReleasePolicy?: "inherit" | "immediate" | "manual" | "automatic_at_end" | "scheduled";
  scheduledReleaseAt?: Date | string | null;
  tryoutId: string;
};

type AssignmentInput = { admissionId: string; deliverySessionId: string };
type RetakeInput = Omit<DeliverySessionInput, "tryoutId"> & { admissionId: string };

function reasonOrThrow(reason: string) {
  const value = reason.trim();
  if (!value) throw new TryoutDeliveryValidationError("Alasan audit wajib diisi.");
  return value;
}

function dateOrThrow(value: Date | string, field: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TryoutDeliveryValidationError(`${field} tidak valid.`);
  return date;
}

function json(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }

async function audit(tx: Prisma.TransactionClient, input: { action: string; admissionId?: string; after: unknown; before?: unknown; deliverySessionId?: string; reason: string; tryoutId: string; actorId: string }) {
  await tx.tryoutDeliveryAudit.create({ data: { action: input.action, actorUserId: input.actorId, admissionId: input.admissionId, after: json(input.after), before: input.before === undefined ? undefined : json(input.before), deliverySessionId: input.deliverySessionId, reason: input.reason, tryoutId: input.tryoutId } });
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

async function lockStudent(tx: Prisma.TransactionClient, studentId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${studentId}, 0))`;
}

async function lockAdmission(tx: Prisma.TransactionClient, admissionId: string) {
  await tx.$queryRaw`SELECT id FROM tryout_admissions WHERE id = ${admissionId}::uuid FOR UPDATE`;
}

async function lockAdmissionForParticipant(
  tx: Prisma.TransactionClient,
  tryoutId: string,
  studentId: string,
) {
  await tx.$queryRaw`
    SELECT id
      FROM tryout_admissions
     WHERE tryout_id = ${tryoutId}::uuid
       AND student_id = ${studentId}::uuid
     FOR UPDATE
  `;
}

async function lockAssignment(tx: Prisma.TransactionClient, assignmentId: string) {
  await tx.$queryRaw`SELECT id FROM tryout_delivery_assignments WHERE id = ${assignmentId}::uuid FOR UPDATE`;
}

async function lockTryout(tx: Prisma.TransactionClient, tryoutId: string) {
  await tx.$queryRaw`SELECT id FROM tryout_packages WHERE id = ${tryoutId}::uuid FOR UPDATE`;
}

async function lockOverlappingDeliverySessions(
  tx: Prisma.TransactionClient,
  deliverySessionId: string,
  availableFrom: Date,
  availableUntil: Date,
) {
  await tx.$queryRaw`
    SELECT id
      FROM tryout_delivery_sessions
     WHERE id = ${deliverySessionId}::uuid
        OR (available_from < ${availableUntil} AND available_until > ${availableFrom})
     ORDER BY id
     FOR UPDATE
  `;
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
    await lockAssignment(tx, existing.id);
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
  await tx.$queryRaw`SELECT id FROM tryout_packages WHERE id = ${tryoutId}::uuid FOR UPDATE`;
  const started = await tx.tryoutAttempt.findFirst({ where: { tryoutId }, select: { id: true } });
  if (started) throw new TryoutDeliveryValidationError("Tryout yang sudah dimulai peserta tidak dapat mengubah konfigurasi delivery.");
}

async function configureTryoutAdmission(tryoutId: string, mode: "open" | "approval_required" | "invitation_only", actorId: string, reason: string, allowCrossOwner = false) {
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
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
  if (!name || availableUntil <= availableFrom) throw new TryoutDeliveryValidationError("Nama dan jendela ketersediaan sesi tidak valid.");
  const resultReleasePolicy = input.resultReleasePolicy ?? "inherit";
  if (!["inherit", "immediate", "manual", "automatic_at_end", "scheduled"].includes(resultReleasePolicy)) throw new TryoutDeliveryValidationError("Kebijakan rilis hasil tidak valid.");
  const scheduledReleaseAt = resultReleasePolicy === "scheduled"
    ? dateOrThrow(input.scheduledReleaseAt ?? "", "Waktu rilis hasil")
    : null;
  if (scheduledReleaseAt && scheduledReleaseAt < availableUntil) throw new TryoutDeliveryValidationError("Waktu rilis hasil terjadwal harus sama dengan atau setelah sesi selesai.");
  return prisma.$transaction(async (tx) => {
    await assertTryoutNotStarted(tx, input.tryoutId);
    await assertTryoutOwnership(tx, input.tryoutId, actorId, allowCrossOwner);
    const tryout = await tx.tryoutPackage.findUnique({ where: { id: input.tryoutId }, select: { id: true } });
    if (!tryout) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan.");
    const session = await tx.tryoutDeliverySession.create({ data: { availableFrom, availableUntil, createdByUserId: actorId, fullscreenPrompt: Boolean(input.fullscreenPrompt), isDefaultOpenRegistration: Boolean(input.isDefaultOpenRegistration), name, rankingRule: (input.rankingRule ?? "none") as TryoutRankingRule, resultReleasePolicy: resultReleasePolicy as TryoutResultReleasePolicy, scheduledReleaseAt, tryoutId: input.tryoutId, updatedByUserId: actorId } });
    await audit(tx, { action: "delivery_session.created", actorId, after: { availableFrom, availableUntil, fullscreenPrompt: session.fullscreenPrompt, isDefaultOpenRegistration: session.isDefaultOpenRegistration, name, resultReleasePolicy, scheduledReleaseAt, status: session.status }, deliverySessionId: session.id, reason: auditReason, tryoutId: input.tryoutId });
    return session;
  });
}

async function openTryoutDeliverySession(deliverySessionId: string, actorId: string, reason: string, allowCrossOwner = false) {
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tryout_delivery_sessions WHERE id = ${deliverySessionId}::uuid FOR UPDATE`;
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
    if (session.tryout.sections.some((section) => section.testType === "cat" && section.catModelVersion !== CANONICAL_2PL_MODEL_VERSION)) throw new TryoutDeliveryValidationError("Pool CAT immutable harus memakai profil 2PL kanonis dan mencukupi jumlah soal.");
    const release = session.assessmentReleaseId
      ? await tx.assessmentRelease.findFirst({ where: { id: session.assessmentReleaseId, tryoutId: session.tryoutId } })
      : await createOrReuseAssessmentRelease(tx, session.tryoutId, actorId, session.tryout.publishedAt ?? new Date());
    if (!release) throw new TryoutDeliveryValidationError("Sesi tidak memiliki AssessmentRelease yang valid dan tidak dapat dibuka.");
    const opened = await tx.tryoutDeliverySession.update({ where: { id: deliverySessionId }, data: { assessmentReleaseId: release.id, status: TryoutDeliverySessionStatus.active, updatedByUserId: actorId } });
    await audit(tx, { action: "delivery_session.opened", actorId, after: { status: opened.status }, before: { status: session.status }, deliverySessionId, reason: auditReason, tryoutId: session.tryoutId });
    return opened;
  });
}

async function registerForTryout(
  tryoutId: string,
  studentId: string,
  target?: { majorId: string; universityId: string },
) {
  return prisma.$transaction(async (tx) => {
    // Access-transition lock order is always student -> admission/assignment
    // -> overlapping sessions -> Tryout. This matches participant start and
    // revoke, then every decision is re-read while those locks are held.
    await lockStudent(tx, studentId);
    await lockAdmissionForParticipant(tx, tryoutId, studentId);
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
      for (const assignment of existing.assignments.filter((item) => item.status === TryoutAssignmentStatus.active).sort((left, right) => left.id.localeCompare(right.id))) {
        await lockAssignment(tx, assignment.id);
        await lockOverlappingDeliverySessions(tx, assignment.deliverySessionId, assignment.deliverySession.availableFrom, assignment.deliverySession.availableUntil);
      }
      existing = await tx.tryoutAdmission.findUnique({
        where: { id: existing.id },
        include: {
          assignments: {
            where: { status: TryoutAssignmentStatus.active },
            include: { deliverySession: true },
          },
        },
      });
      if (!existing) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak ditemukan setelah penguncian.");
      if (target) {
        await tx.studentProfile.update({ data: { targetMajorId: target.majorId, targetUniversityId: target.universityId }, where: { userId: studentId } });
      }
      return { admissionId: existing.id, assignmentId: existing.assignments[0]?.id ?? null, state: "existing" as const, status: existing.status };
    }
    const tryout = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { admissionMode: true, id: true, status: true } });
    if (!tryout || tryout.status !== ContentStatus.published) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak tersedia.");
    if (tryout.admissionMode === TryoutAdmissionMode.invitation_only) throw new TryoutDeliveryValidationError("Tryout ini hanya menerima undangan.");
    const status = tryout.admissionMode === TryoutAdmissionMode.open ? TryoutAdmissionStatus.active : TryoutAdmissionStatus.pending;
    const now = new Date();
    let defaultSession: EligibleSession | null = null;
    if (status === TryoutAdmissionStatus.active) {
      try {
        defaultSession = await findDefaultSession(tx, tryoutId, now);
      } catch (error) {
        if (error instanceof TryoutDeliveryValidationError) {
          return { admissionId: null, assignmentId: null, state: "unavailable" as const, status: null };
        }
        throw error;
      }
    }
    if (status === TryoutAdmissionStatus.active && !defaultSession) return { admissionId: null, assignmentId: null, state: "unavailable" as const, status: null };
    if (defaultSession) await lockSessionScope(tx, defaultSession);
    await lockTryout(tx, tryoutId);
    const lockedDefaultSession = defaultSession
      ? await findSelectedSession(tx, tryoutId, defaultSession.id, now)
      : null;
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
      if (target) await tx.studentProfile.update({ data: { targetMajorId: target.majorId, targetUniversityId: target.universityId }, where: { userId: studentId } });
      return { admissionId: existing.id, assignmentId: existing.assignments[0]?.id ?? null, state: "existing" as const, status: existing.status };
    }
    const lockedTryout = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { admissionMode: true, id: true, status: true } });
    if (!lockedTryout || lockedTryout.status !== ContentStatus.published) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak tersedia.");
    if (lockedTryout.admissionMode === TryoutAdmissionMode.invitation_only) throw new TryoutDeliveryValidationError("Tryout ini hanya menerima undangan.");
    const lockedStatus = lockedTryout.admissionMode === TryoutAdmissionMode.open ? TryoutAdmissionStatus.active : TryoutAdmissionStatus.pending;
    if (lockedStatus === TryoutAdmissionStatus.active && !lockedDefaultSession) throw new TryoutDeliveryValidationError("Sesi default Tryout tidak tersedia untuk pendaftaran terbuka.");
    if (target) {
      await tx.studentProfile.update({ data: { targetMajorId: target.majorId, targetUniversityId: target.universityId }, where: { userId: studentId } });
    }
    const admission = await tx.tryoutAdmission.create({ data: { status: lockedStatus, studentId, tryoutId } });
    if (lockedStatus === TryoutAdmissionStatus.pending) return { admissionId: admission.id, assignmentId: null, state: "pending_approval" as const, status: lockedStatus };
    const assignment = await tx.tryoutDeliveryAssignment.create({ data: { admissionId: admission.id, assignedByUserId: studentId, deliverySessionId: lockedDefaultSession!.id } });
    return { admissionId: admission.id, assignmentId: assignment.id, state: "assigned" as const, status: lockedStatus };
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
    const candidate = await tx.tryoutAdmission.findUnique({ where: { id: admissionId }, select: { studentId: true, tryoutId: true } });
    if (!candidate) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak ditemukan.");
    // Authorize from the non-PII candidate before loading the admission graph.
    await assertTryoutOwnership(tx, candidate.tryoutId, actorId, allowCrossOwner);
    await lockStudent(tx, candidate.studentId);
    await lockAdmission(tx, admissionId);
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
        await lockAssignment(tx, replayAssignment.id);
        await lockSessionScope(tx, replayAssignment.deliverySession);
        await lockTryout(tx, admission.tryoutId);
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
      for (const assignment of assignmentsToLock) await lockAssignment(tx, assignment.id);
      const lockedSessionIds = new Set<string>();
      for (const assignment of admission.assignments
        .filter((item) => item.status === TryoutAssignmentStatus.active)
        .sort((left, right) => left.deliverySessionId.localeCompare(right.deliverySessionId))) {
        if (lockedSessionIds.has(assignment.deliverySessionId)) continue;
        await lockOverlappingDeliverySessions(tx, assignment.deliverySessionId, assignment.deliverySession.availableFrom, assignment.deliverySession.availableUntil);
        lockedSessionIds.add(assignment.deliverySessionId);
      }
      if (!lockedSessionIds.has(selected.id)) await lockSessionScope(tx, selected);
      await lockTryout(tx, admission.tryoutId);
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

    await lockTryout(tx, admission.tryoutId);
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
    // Check ownership before reading the participant profile or admission
    // graph; the actor cannot use an arbitrary Tryout id as a PII probe.
    await assertTryoutOwnership(tx, tryoutId, actorId, allowCrossOwner);
    await lockStudent(tx, studentId);
    await lockAdmissionForParticipant(tx, tryoutId, studentId);
    await assertStudent(tx, studentId);
    let admission = await tx.tryoutAdmission.findUnique({
      where: { tryoutId_studentId: { studentId, tryoutId } },
      include: {
        assignments: {
          include: { deliverySession: true },
          orderBy: { assignedAt: "desc" },
        },
      },
    });
    const tryout = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { id: true } });
    if (!tryout) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan.");
    const replayAssignment = admission?.status === TryoutAdmissionStatus.active
      ? admission.assignments.find((assignment) => assignment.status === TryoutAssignmentStatus.active && (!selectedSessionId || assignment.deliverySessionId === selectedSessionId))
      : null;
    if (replayAssignment) {
      await lockAssignment(tx, replayAssignment.id);
      await lockSessionScope(tx, replayAssignment.deliverySession);
      await lockTryout(tx, tryoutId);
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
      for (const assignment of assignmentsToLock) await lockAssignment(tx, assignment.id);
      const lockedSessionIds = new Set<string>();
      for (const assignment of admission.assignments
        .filter((item) => item.status === TryoutAssignmentStatus.active)
        .sort((left, right) => left.deliverySessionId.localeCompare(right.deliverySessionId))) {
        if (lockedSessionIds.has(assignment.deliverySessionId)) continue;
        await lockOverlappingDeliverySessions(tx, assignment.deliverySessionId, assignment.deliverySession.availableFrom, assignment.deliverySession.availableUntil);
        lockedSessionIds.add(assignment.deliverySessionId);
      }
      if (!lockedSessionIds.has(selected.id)) await lockSessionScope(tx, selected);
    } else {
      await lockSessionScope(tx, selected);
    }
    await lockTryout(tx, tryoutId);
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
    await audit(tx, { action: "admission.invited", actorId, admissionId: restored.id, after: { assignmentId: assignment.id, sessionId: lockedSelected.id, status: restored.status, studentId }, reason: auditReason, deliverySessionId: lockedSelected.id, tryoutId });
    return { ...restored, assignmentId: assignment.id, deliverySessionId: lockedSelected.id };
  });
}

async function assignTryoutDeliverySession(input: AssignmentInput, actorId: string, reason: string, allowCrossOwner = false) {
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
    const candidate = await tx.tryoutAdmission.findUnique({ where: { id: input.admissionId }, select: { studentId: true, tryoutId: true } });
    const sessionCandidate = await tx.tryoutDeliverySession.findUnique({ where: { id: input.deliverySessionId }, select: { availableFrom: true, availableUntil: true, tryoutId: true } });
    if (!candidate || !sessionCandidate || candidate.tryoutId !== sessionCandidate.tryoutId) throw new TryoutDeliveryValidationError("Pendaftaran dan sesi Tryout tidak cocok.");
    await lockStudent(tx, candidate.studentId);
    await lockAdmission(tx, input.admissionId);
    const assignmentCandidate = await tx.tryoutDeliveryAssignment.findUnique({ where: { admissionId_deliverySessionId: { admissionId: input.admissionId, deliverySessionId: input.deliverySessionId } }, select: { id: true } });
    if (assignmentCandidate) await lockAssignment(tx, assignmentCandidate.id);
    await lockOverlappingDeliverySessions(tx, input.deliverySessionId, sessionCandidate.availableFrom, sessionCandidate.availableUntil);
    await lockTryout(tx, candidate.tryoutId);
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
    const candidate = await tx.tryoutDeliveryAssignment.findUnique({
      where: { id: assignmentId },
      select: { admission: { select: { id: true, studentId: true } }, id: true },
    });
    if (!candidate) throw new TryoutDeliveryValidationError("Penugasan sesi Tryout tidak ditemukan.");
    // Match participant start's lock order: student -> admission -> assignment -> all
    // overlapping sessions. The active assignment is re-read only after all
    // locks are held, making revoke/start mutually serializable.
    await lockStudent(tx, candidate.admission.studentId);
    await lockAdmission(tx, candidate.admission.id);
    await lockAssignment(tx, assignmentId);
    let assignment = await tx.tryoutDeliveryAssignment.findUnique({
      where: { id: assignmentId },
      include: { admission: true, deliverySession: true },
    });
    if (!assignment) throw new TryoutDeliveryValidationError("Penugasan sesi Tryout tidak ditemukan.");
    await assertAdmissionStudentIsNotManagedPreview(tx, assignment.admissionId);
    await lockOverlappingDeliverySessions(tx, assignment.deliverySessionId, assignment.deliverySession.availableFrom, assignment.deliverySession.availableUntil);
    await lockTryout(tx, assignment.admission.tryoutId);
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
    const admission = await tx.tryoutAdmission.findUnique({ where: { id: input.admissionId } });
    if (!admission || admission.status !== TryoutAdmissionStatus.active) throw new TryoutDeliveryValidationError("Peserta aktif diperlukan untuk membuat retake.");
    await assertTryoutOwnership(tx, admission.tryoutId, actorId, allowCrossOwner);
    await assertAdmissionStudentIsNotManagedPreview(tx, admission.id);
    await tx.$queryRaw`SELECT id FROM tryout_packages WHERE id = ${admission.tryoutId}::uuid FOR UPDATE`;
    try {
      await assertTryoutReleaseEligibility(tx, admission.tryoutId);
    } catch (error) {
      throw new TryoutDeliveryValidationError(error instanceof Error ? error.message : "Tryout belum memenuhi syarat AssessmentRelease.");
    }
    const release = await createOrReuseAssessmentRelease(tx, admission.tryoutId, actorId);
    const existing = await tx.tryoutDeliverySession.findFirst({ where: { name, tryoutId: admission.tryoutId }, select: { id: true } });
    if (existing) throw new TryoutDeliveryValidationError("Nama sesi retake sudah digunakan pada Tryout ini.");
    const session = await tx.tryoutDeliverySession.create({ data: { assessmentReleaseId: release.id, availableFrom, availableUntil, createdByUserId: actorId, fullscreenPrompt: Boolean(input.fullscreenPrompt), isDefaultOpenRegistration: false, name, rankingRule: (input.rankingRule ?? "none") as TryoutRankingRule, resultReleasePolicy: resultReleasePolicy as TryoutResultReleasePolicy, scheduledReleaseAt, status: TryoutDeliverySessionStatus.active, tryoutId: admission.tryoutId, updatedByUserId: actorId } });
    const assignment = await tx.tryoutDeliveryAssignment.create({ data: { admissionId: admission.id, assignedByUserId: actorId, deliverySessionId: session.id } });
    await audit(tx, { action: "delivery_session.retake_created", actorId, admissionId: admission.id, after: { assignmentId: assignment.id, sessionId: session.id, window: { availableFrom, availableUntil } }, deliverySessionId: session.id, reason: auditReason, tryoutId: admission.tryoutId });
    return { assignment, session };
  });
}

async function getTryoutDeliveryOperations(tryoutId: string, actorId: string) {
  // Resolve ownership in a narrow query before the graph query can touch
  // student identities or attempt payloads. Keep the predicate on the graph
  // query too so a concurrent ownership change cannot widen the read.
  const ownedTryout = await prisma.tryoutPackage.findFirst({
    select: { id: true },
    where: { createdByUserId: actorId, id: tryoutId },
  });
  if (!ownedTryout) return null;
  const tryout = await prisma.tryoutPackage.findFirst({
    where: { createdByUserId: actorId, id: ownedTryout.id },
    include: {
      assessmentReleases: { orderBy: { releaseNumber: "desc" }, take: 1 },
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
              runs: { include: { assessmentRelease: true, integrityEvents: { orderBy: { serverSequence: "asc" } }, catResolutionAudits: { orderBy: { createdAt: "desc" } } }, orderBy: { sequenceNo: "asc" } },
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
}

export { assignTryoutDeliverySession, configureTryoutAdmission, configureTryoutDefaultResultRelease, createTryoutDeliverySession, createTryoutRetake, decideTryoutAdmission, getTryoutDeliveryOperations, inviteTryoutParticipant, openTryoutDeliverySession, registerForTryout, revokeTryoutDeliveryAssignment, TryoutDeliveryValidationError };
export type { AssignmentInput, DeliverySessionInput, RetakeInput };
