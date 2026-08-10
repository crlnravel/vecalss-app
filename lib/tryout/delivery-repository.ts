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
import { CANONICAL_2PL_MODEL_VERSION } from "@/lib/tryout/cat-profile";
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
  const profile = await tx.studentProfile.findUnique({ where: { userId: studentId }, select: { userId: true } });
  if (!profile) throw new TryoutDeliveryValidationError("Peserta harus merupakan akun student dengan StudentProfile.");
}

async function assertTryoutNotStarted(tx: Prisma.TransactionClient, tryoutId: string) {
  await tx.$queryRaw`SELECT id FROM tryout_packages WHERE id = ${tryoutId}::uuid FOR UPDATE`;
  const started = await tx.tryoutAttempt.findFirst({ where: { tryoutId }, select: { id: true } });
  if (started) throw new TryoutDeliveryValidationError("Tryout yang sudah dimulai peserta tidak dapat mengubah konfigurasi delivery.");
}

async function configureTryoutAdmission(tryoutId: string, mode: "open" | "approval_required" | "invitation_only", actorId: string, reason: string) {
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
    await assertTryoutNotStarted(tx, tryoutId);
    const record = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { admissionMode: true } });
    if (!record) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan.");
    await tx.tryoutPackage.update({ where: { id: tryoutId }, data: { admissionMode: mode as TryoutAdmissionMode } });
    await audit(tx, { action: "admission_mode.configured", actorId, after: { admissionMode: mode }, before: { admissionMode: record.admissionMode }, reason: auditReason, tryoutId });
    return { admissionMode: mode, tryoutId };
  });
}

async function configureTryoutDefaultResultRelease(tryoutId: string, policy: "immediate" | "manual" | "automatic_at_end", actorId: string, reason: string) {
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
    await assertTryoutNotStarted(tx, tryoutId);
    const record = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { defaultResultReleasePolicy: true } });
    if (!record) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan.");
    await tx.tryoutPackage.update({ where: { id: tryoutId }, data: { defaultResultReleasePolicy: policy as TryoutResultReleasePolicy } });
    await audit(tx, { action: "result_release.default_configured", actorId, after: { policy }, before: { policy: record.defaultResultReleasePolicy }, reason: auditReason, tryoutId });
    return { policy, tryoutId };
  });
}

async function createTryoutDeliverySession(input: DeliverySessionInput, actorId: string, reason: string) {
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
    const tryout = await tx.tryoutPackage.findUnique({ where: { id: input.tryoutId }, select: { id: true } });
    if (!tryout) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan.");
    const session = await tx.tryoutDeliverySession.create({ data: { availableFrom, availableUntil, createdByUserId: actorId, fullscreenPrompt: Boolean(input.fullscreenPrompt), isDefaultOpenRegistration: Boolean(input.isDefaultOpenRegistration), name, rankingRule: (input.rankingRule ?? "none") as TryoutRankingRule, resultReleasePolicy: resultReleasePolicy as TryoutResultReleasePolicy, scheduledReleaseAt, tryoutId: input.tryoutId, updatedByUserId: actorId } });
    await audit(tx, { action: "delivery_session.created", actorId, after: { availableFrom, availableUntil, fullscreenPrompt: session.fullscreenPrompt, isDefaultOpenRegistration: session.isDefaultOpenRegistration, name, resultReleasePolicy, scheduledReleaseAt, status: session.status }, deliverySessionId: session.id, reason: auditReason, tryoutId: input.tryoutId });
    return session;
  });
}

async function openTryoutDeliverySession(deliverySessionId: string, actorId: string, reason: string) {
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
    const session = await tx.tryoutDeliverySession.findUnique({
      where: { id: deliverySessionId },
      include: {
        tryout: {
          include: {
            sections: {
              include: {
                packageVersion: { include: { items: { select: { sourceQuestionId: true, subtestId: true } } } },
              },
            },
          },
        },
      },
    });
    if (!session) throw new TryoutDeliveryValidationError("Sesi Tryout tidak ditemukan.");
    await assertTryoutNotStarted(tx, session.tryoutId);
    if (session.status !== TryoutDeliverySessionStatus.draft) throw new TryoutDeliveryValidationError("Hanya sesi draft yang dapat dibuka.");
    const ready = session.tryout.status === ContentStatus.published && session.tryout.sections.length === 7 && session.tryout.sections.every((section) => section.packageVersion?.status === ContentStatus.published && section.packageVersion.items.length > 0);
    if (!ready) throw new TryoutDeliveryValidationError("Tryout belum siap dibuka: tujuh Test harus diterbitkan dan memiliki Paket Soal siap.");
    const calibrationChecks = session.tryout.sections.reduce<Promise<void>[]>((checks, section) => {
      if (section.testType === "cat") {
        checks.push((async () => {
          const items = section.packageVersion!.items;
          if (!section.catItemCount || section.catModelVersion !== CANONICAL_2PL_MODEL_VERSION || items.length < section.catItemCount || items.some((item) => item.subtestId !== section.subtestId)) throw new TryoutDeliveryValidationError("Pool CAT immutable harus memakai profil 2PL kanonis dan mencukupi jumlah soal.");
          const calibrated = await tx.twoPlQuestionCalibration.count({ where: { approvalState: "approved", modelVersion: CANONICAL_2PL_MODEL_VERSION, questionId: { in: items.map((item) => item.sourceQuestionId) } } });
          if (calibrated !== items.length) throw new TryoutDeliveryValidationError("Setiap kandidat pool CAT harus memiliki kalibrasi 2PL kanonis yang disetujui.");
        })());
      }
      return checks;
    }, []);
    await Promise.all(calibrationChecks);
    const opened = await tx.tryoutDeliverySession.update({ where: { id: deliverySessionId }, data: { status: TryoutDeliverySessionStatus.active, updatedByUserId: actorId } });
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
    // Serialize only one participant/tryout admission. This intentionally does not lock Tryout content.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${tryoutId}:${studentId}`}, 0))`;
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
    const existing = await tx.tryoutAdmission.findUnique({ where: { tryoutId_studentId: { studentId, tryoutId } }, include: { assignments: { where: { status: TryoutAssignmentStatus.active }, select: { deliverySessionId: true } } } });
    if (existing) {
      if (target) {
        await tx.studentProfile.update({ data: { targetMajorId: target.majorId, targetUniversityId: target.universityId }, where: { userId: studentId } });
      }
      return { admissionId: existing.id, assignmentId: existing.assignments[0]?.deliverySessionId ?? null, state: "existing" as const, status: existing.status };
    }
    const tryout = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { admissionMode: true, id: true, status: true } });
    if (!tryout || tryout.status !== ContentStatus.published) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak tersedia.");
    if (tryout.admissionMode === TryoutAdmissionMode.invitation_only) throw new TryoutDeliveryValidationError("Tryout ini hanya menerima undangan.");
    const status = tryout.admissionMode === TryoutAdmissionMode.open ? TryoutAdmissionStatus.active : TryoutAdmissionStatus.pending;
    const defaultSession = status === TryoutAdmissionStatus.active
      ? await tx.tryoutDeliverySession.findFirst({ where: { availableUntil: { gt: new Date() }, isDefaultOpenRegistration: true, status: TryoutDeliverySessionStatus.active, tryoutId }, select: { id: true } })
      : null;
    if (status === TryoutAdmissionStatus.active && !defaultSession) {
      return { admissionId: null, assignmentId: null, state: "unavailable" as const, status: null };
    }
    if (target) {
      await tx.studentProfile.update({ data: { targetMajorId: target.majorId, targetUniversityId: target.universityId }, where: { userId: studentId } });
    }
    const admission = await tx.tryoutAdmission.create({ data: { status, studentId, tryoutId } });
    if (status === TryoutAdmissionStatus.pending) return { admissionId: admission.id, assignmentId: null, state: "pending_approval" as const, status };
    const assignment = await tx.tryoutDeliveryAssignment.create({ data: { admissionId: admission.id, assignedByUserId: studentId, deliverySessionId: defaultSession!.id } });
    return { admissionId: admission.id, assignmentId: assignment.id, state: "assigned" as const, status };
  });
}

async function decideTryoutAdmission(admissionId: string, decision: "approve" | "reject", actorId: string, reason: string) {
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
    const admission = await tx.tryoutAdmission.findUnique({ where: { id: admissionId } });
    if (!admission) throw new TryoutDeliveryValidationError("Pendaftaran Tryout tidak ditemukan.");
    if (admission.status !== TryoutAdmissionStatus.pending) throw new TryoutDeliveryValidationError("Hanya pendaftaran menunggu persetujuan yang dapat diputuskan.");
    const status = decision === "approve" ? TryoutAdmissionStatus.active : TryoutAdmissionStatus.rejected;
    const updated = await tx.tryoutAdmission.update({ where: { id: admissionId }, data: { decidedAt: new Date(), decidedByUserId: actorId, status } });
    await audit(tx, { action: `admission.${decision}d`, actorId, admissionId, after: { status }, before: { status: admission.status }, reason: auditReason, tryoutId: admission.tryoutId });
    return updated;
  });
}

async function inviteTryoutParticipant(tryoutId: string, studentId: string, actorId: string, reason: string) {
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
    await assertStudent(tx, studentId);
    const tryout = await tx.tryoutPackage.findUnique({ where: { id: tryoutId }, select: { id: true } });
    if (!tryout) throw new TryoutDeliveryValidationError("Tryout tidak ditemukan.");
    const admission = await tx.tryoutAdmission.upsert({ where: { tryoutId_studentId: { studentId, tryoutId } }, create: { decidedAt: new Date(), decidedByUserId: actorId, status: TryoutAdmissionStatus.active, studentId, tryoutId }, update: { decidedAt: new Date(), decidedByUserId: actorId, revokeReason: null, status: TryoutAdmissionStatus.active } });
    await audit(tx, { action: "admission.invited", actorId, admissionId: admission.id, after: { status: admission.status, studentId }, reason: auditReason, tryoutId });
    return admission;
  });
}

async function assignTryoutDeliverySession(input: AssignmentInput, actorId: string, reason: string) {
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
    const [admission, session] = await Promise.all([
      tx.tryoutAdmission.findUnique({ where: { id: input.admissionId } }),
      tx.tryoutDeliverySession.findUnique({ where: { id: input.deliverySessionId } }),
    ]);
    if (!admission || !session || admission.tryoutId !== session.tryoutId) throw new TryoutDeliveryValidationError("Pendaftaran dan sesi Tryout tidak cocok.");
    if (admission.status !== TryoutAdmissionStatus.active || session.status !== TryoutDeliverySessionStatus.active) throw new TryoutDeliveryValidationError("Peserta aktif dan sesi aktif diperlukan untuk penugasan.");
    const assignment = await tx.tryoutDeliveryAssignment.upsert({ where: { admissionId_deliverySessionId: { admissionId: input.admissionId, deliverySessionId: input.deliverySessionId } }, create: { admissionId: input.admissionId, assignedByUserId: actorId, deliverySessionId: input.deliverySessionId }, update: { assignedByUserId: actorId, assignedAt: new Date(), revokeReason: null, revokedAt: null, status: TryoutAssignmentStatus.active } });
    await audit(tx, { action: "delivery_session.assigned", actorId, admissionId: admission.id, after: { assignmentId: assignment.id, status: assignment.status }, deliverySessionId: session.id, reason: auditReason, tryoutId: admission.tryoutId });
    return assignment;
  });
}

async function revokeTryoutDeliveryAssignment(assignmentId: string, actorId: string, reason: string) {
  const auditReason = reasonOrThrow(reason);
  return prisma.$transaction(async (tx) => {
    const assignment = await tx.tryoutDeliveryAssignment.findUnique({
      where: { id: assignmentId },
      include: { admission: true, deliverySession: true },
    });
    if (!assignment) throw new TryoutDeliveryValidationError("Penugasan sesi Tryout tidak ditemukan.");
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

async function createTryoutRetake(input: RetakeInput, actorId: string, reason: string) {
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
    const existing = await tx.tryoutDeliverySession.findFirst({ where: { name, tryoutId: admission.tryoutId }, select: { id: true } });
    if (existing) throw new TryoutDeliveryValidationError("Nama sesi retake sudah digunakan pada Tryout ini.");
    const session = await tx.tryoutDeliverySession.create({ data: { availableFrom, availableUntil, createdByUserId: actorId, fullscreenPrompt: Boolean(input.fullscreenPrompt), isDefaultOpenRegistration: false, name, rankingRule: (input.rankingRule ?? "none") as TryoutRankingRule, resultReleasePolicy: resultReleasePolicy as TryoutResultReleasePolicy, scheduledReleaseAt, status: TryoutDeliverySessionStatus.active, tryoutId: admission.tryoutId, updatedByUserId: actorId } });
    const assignment = await tx.tryoutDeliveryAssignment.create({ data: { admissionId: admission.id, assignedByUserId: actorId, deliverySessionId: session.id } });
    await audit(tx, { action: "delivery_session.retake_created", actorId, admissionId: admission.id, after: { assignmentId: assignment.id, sessionId: session.id, window: { availableFrom, availableUntil } }, deliverySessionId: session.id, reason: auditReason, tryoutId: admission.tryoutId });
    return { assignment, session };
  });
}

async function getTryoutDeliveryOperations(tryoutId: string) {
  const tryout = await prisma.tryoutPackage.findUnique({
    where: { id: tryoutId },
    include: {
      admissions: { include: { student: { select: { email: true, fullName: true } }, assignments: { include: { deliverySession: true }, orderBy: { assignedAt: "desc" } } }, orderBy: { requestedAt: "desc" } },
      deliverySessions: { include: { attempts: { include: { runs: { include: { integrityEvents: { orderBy: { serverSequence: "asc" } }, catResolutionAudits: { orderBy: { createdAt: "desc" } } }, orderBy: { sequenceNo: "asc" } }, student: { select: { email: true, fullName: true } } }, orderBy: { createdAt: "desc" } }, audits: { orderBy: { createdAt: "desc" }, take: 100 } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!tryout) return null;
  return tryout;
}

export { assignTryoutDeliverySession, configureTryoutAdmission, configureTryoutDefaultResultRelease, createTryoutDeliverySession, createTryoutRetake, decideTryoutAdmission, getTryoutDeliveryOperations, inviteTryoutParticipant, openTryoutDeliverySession, registerForTryout, revokeTryoutDeliveryAssignment, TryoutDeliveryValidationError };
export type { AssignmentInput, DeliverySessionInput, RetakeInput };
