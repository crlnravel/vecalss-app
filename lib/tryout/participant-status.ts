import type { TryoutOperationsView } from "@/lib/tryout/operations-view";

type ParticipantRow = Pick<TryoutOperationsView["participants"][number], "admission" | "attempt" | "session">;
type ParticipantAttemptState = NonNullable<ParticipantRow["attempt"]>["attemptState"];

/** Display order for the Peserta Status filter: waiting, then progress, then endings. */
export const PARTICIPANT_STATUSES = [
  "pending",
  "no_access",
  "not_started",
  "in_progress",
  "finished",
  "scored",
  "expired",
  "abandoned",
  "void",
  "rejected",
  "revoked",
] as const;

export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];
export type ParticipantStatusTone = "attention" | "danger" | "info" | "neutral" | "success";

export const participantStatusLabels: Record<ParticipantStatus, string> = {
  abandoned: "Ditinggalkan",
  expired: "Kedaluwarsa",
  finished: "Selesai",
  in_progress: "Mengerjakan",
  no_access: "Belum diberi akses",
  not_started: "Belum mulai",
  pending: "Menunggu persetujuan",
  rejected: "Ditolak",
  revoked: "Dicabut",
  scored: "Dinilai",
  void: "Dibatalkan",
};

/** Tones follow the shared Badge contract; the tone names carry meaning, not colour. */
export const participantStatusTones: Record<ParticipantStatus, ParticipantStatusTone> = {
  abandoned: "neutral",
  expired: "neutral",
  finished: "success",
  in_progress: "info",
  no_access: "attention",
  not_started: "neutral",
  pending: "attention",
  rejected: "danger",
  revoked: "danger",
  scored: "success",
  void: "neutral",
};

const attemptStatuses: Record<ParticipantAttemptState, ParticipantStatus> = {
  abandoned: "abandoned",
  auto_submitted: "finished",
  expired: "expired",
  in_progress: "in_progress",
  submitted: "finished",
  void: "void",
};

/**
 * One status for the Peserta list. The registration, session access and attempt
 * are a single progression, so the first matching stage wins: a registration that
 * is not approved outranks everything, an existing attempt outranks access, and
 * access only decides the state of a student who has not started yet. "Dinilai"
 * is a submitted attempt whose scoring has finished; scoring is a separate state
 * from the attempt, not an attempt state of its own.
 */
export function participantStatus(participant: ParticipantRow): ParticipantStatus {
  const { admission, attempt } = participant;
  if (admission.status === "pending") return "pending";
  if (admission.status === "rejected") return "rejected";
  if (admission.status === "revoked") return "revoked";
  if (attempt) {
    const status = attemptStatuses[attempt.attemptState];
    return status === "finished" && attempt.scoringState === "scored" ? "scored" : status;
  }
  const assignment = participant.session;
  if (!assignment) return "no_access";
  return assignment.assignmentStatus === "active" ? "not_started" : "revoked";
}
