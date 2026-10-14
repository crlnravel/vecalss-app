import "server-only";

import { prisma } from "@/lib/prisma";
import { canRequestNewTryoutAdmission } from "@/lib/tryout/registration-availability";
import type { ParticipantRecoveryScope, ParticipantRecoverySnapshot } from "@/lib/tryout/participant-action-recovery";

/** Read only the signed-in student's receipt. Absence is a snapshot, not rollback proof. */
export async function participantActionRecoveryState(intent: ParticipantRecoveryScope, studentId: string): Promise<ParticipantRecoverySnapshot> {
  const tryout = await prisma.tryoutPackage.findFirst({
    where: { id: intent.tryoutId, OR: [{ admissions: { some: { studentId } } }, { status: "published", isHidden: false }] },
    select: {
      status: true, isHidden: true, admissionMode: true,
      admissions: {
        where: { studentId },
        select: { id: true, status: true, assignments: { orderBy: { assignedAt: "desc" }, select: { id: true, deliverySessionId: true, status: true } } },
      },
      deliverySessions: {
        select: {
          id: true, status: true, availableFrom: true, availableUntil: true, isDefaultOpenRegistration: true, assessmentReleaseId: true,
          attempts: { where: { studentId }, select: { id: true, status: true, serverDeadlineAt: true, assessmentReleaseId: true, assessmentReleaseNumber: true, assessmentReleaseDigest: true } },
        },
      },
    },
  });
  const empty: ParticipantRecoverySnapshot = { admission: null, assignment: null, attempt: null, canRetry: false, destination: null, message: "Tryout ini tidak tersedia. Kembali ke daftar Tryout untuk melihat pilihan lain." };
  if (!tryout) return empty;

  const admission = tryout.admissions[0] ?? null;
  const assignment = admission?.assignments.find((item) => intent.sessionId ? item.deliverySessionId === intent.sessionId : item.status === "active") ?? null;
  const session = tryout.deliverySessions.find((item) => item.id === (intent.sessionId ?? assignment?.deliverySessionId));
  const attempt = session?.attempts[0] ?? null;
  const now = new Date();
  const snapshot: ParticipantRecoverySnapshot = {
    ...empty,
    admission: admission ? { id: admission.id, status: admission.status } : null,
    assignment: assignment && session ? { id: assignment.id, sessionId: session.id, status: assignment.status, availableFrom: session.availableFrom.toISOString(), availableUntil: session.availableUntil.toISOString() } : null,
    attempt: attempt ? { ...attempt, serverDeadlineAt: attempt.serverDeadlineAt.toISOString() } : null,
  };
  if (attempt && session) {
    return { ...snapshot, destination: { kind: "attempt", attemptId: attempt.id, sessionId: session.id, result: attempt.status !== "in_progress" }, message: "Pengerjaanmu sudah tercatat. Lanjutkan untuk melihat keadaan terakhirnya." };
  }
  if (intent.kind === "register" && admission) {
    const waiting = admission.status === "active" && assignment?.status === "active" && session;
    return { ...snapshot, destination: waiting ? { kind: "waiting", sessionId: session.id } : { kind: "detail" }, message: admission.status === "pending" ? "Pendaftaranmu sudah tercatat dan sedang menunggu persetujuan Kapten." : "Pendaftaranmu sudah tercatat. Lanjutkan untuk melihat statusnya." };
  }
  if (intent.kind === "register") {
    const canRetry = tryout.status === "published" && !tryout.isHidden && canRequestNewTryoutAdmission(tryout.admissionMode, tryout.deliverySessions, now, intent.sessionId);
    return { ...snapshot, canRetry, message: canRetry ? "Belum ada pendaftaran yang tercatat saat diperiksa. Kamu dapat mencoba lagi dengan pilihan yang sama." : "Pendaftaran belum tercatat dan sesi ini tidak menerima pendaftaran baru." };
  }
  const canRetry = tryout.status === "published" && admission?.status === "active" && assignment?.status === "active" && session?.status === "active" && Boolean(session.assessmentReleaseId) && session.availableFrom <= now && session.availableUntil > now;
  return { ...snapshot, canRetry: Boolean(canRetry), message: canRetry ? "Belum ada pengerjaan yang tercatat saat diperiksa. Kamu dapat mencoba memulai sesi yang sama lagi." : "Belum ada pengerjaan yang tercatat dan sesi ini belum bisa dimulai atau sudah berakhir." };
}
