import "server-only";

import type {
  AssessmentAttemptState,
  AssessmentResultReleaseState,
  AssessmentScoringState,
  AttemptStatus,
  TryoutAdmissionStatus,
  TryoutAssignmentStatus,
  TryoutDeliverySessionStatus,
} from "@/generated/prisma/client";

type ParticipantViewIdentity = {
  displayName: string;
  id: string;
  initials: string;
};

type ParticipantViewSessionState =
  | "assigned"
  | "available"
  | "completed"
  | "expired"
  | "in_progress"
  | "not_assigned"
  | "revoked"
  | "unavailable";

type ParticipantViewSession = {
  assignmentId: string;
  assignmentStatus: TryoutAssignmentStatus;
  availableFrom: string;
  availableUntil: string;
  id: string;
  isDefaultOpenRegistration: boolean;
  name: string;
  state: ParticipantViewSessionState;
  status: TryoutDeliverySessionStatus;
};

type ParticipantViewAttempt = {
  attemptState: AssessmentAttemptState;
  id: string;
  legacyStatus: AttemptStatus;
  normalizedScore: string | null;
  rawScore: string | null;
  releaseAt: string | null;
  releaseState: AssessmentResultReleaseState;
  scaledScore: string | null;
  score: string | null;
  scoringState: AssessmentScoringState;
  scoringVersion: string | null;
  status: AttemptStatus;
};

type ParticipantViewScore = {
  normalizedScore: string | null;
  rawScore: string | null;
  releaseState: AssessmentResultReleaseState | "not_started";
  scaledScore: string | null;
  score: string | null;
  scoringState: AssessmentScoringState | "not_started";
  scoringVersion: string | null;
};

type ParticipantViewAdmission = {
  decidedAt: string | null;
  id: string;
  requestedAt: string;
  status: TryoutAdmissionStatus;
};

type ParticipantView = {
  admission: ParticipantViewAdmission;
  admissionId: string;
  attempt: ParticipantViewAttempt | null;
  id: string;
  participant: ParticipantViewIdentity;
  score: ParticipantViewScore;
  session: ParticipantViewSession | null;
  sessions: ParticipantViewSession[];
  tryoutId: string;
};

type ParticipantViewAttemptInput = {
  attemptState: AssessmentAttemptState;
  id: string;
  normalizedScore: unknown;
  rawScore: unknown;
  releaseAt: Date | null;
  releaseState: AssessmentResultReleaseState;
  scaledScore: unknown;
  score: unknown;
  scoringState: AssessmentScoringState;
  scoringVersion: string | null;
  status: AttemptStatus;
};

type ParticipantViewAssignmentInput = {
  assignedAt: Date;
  deliverySession: {
    availableFrom: Date;
    availableUntil: Date;
    id: string;
    isDefaultOpenRegistration: boolean;
    name: string;
    status: TryoutDeliverySessionStatus;
  };
  id: string;
  status: TryoutAssignmentStatus;
  attempt?: ParticipantViewAttemptInput | null;
};

type ParticipantViewAdmissionInput = {
  assignments: ParticipantViewAssignmentInput[];
  decidedAt: Date | null;
  id: string;
  requestedAt: Date;
  status: TryoutAdmissionStatus;
  student: {
    email: string;
    fullName: string | null;
    id: string;
  };
  tryoutId: string;
};

function initialsFor(name: string) {
  const initials = name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("id-ID") ?? "")
    .join("");
  return initials || "P";
}

function maskEmail(email: string) {
  const [localPart, domain] = email.split("@", 2);
  if (!localPart || !domain) return "Peserta";
  const visible = localPart.slice(0, 1);
  return `${visible}${"•".repeat(Math.max(1, Math.min(4, localPart.length - 1)))}@${domain}`;
}

function safeParticipantIdentity(student: ParticipantViewAdmissionInput["student"]): ParticipantViewIdentity {
  const displayName = student.fullName?.trim() || maskEmail(student.email);
  return { displayName, id: student.id, initials: initialsFor(displayName) };
}

function sessionState(
  assignment: ParticipantViewAssignmentInput,
  now: Date,
): ParticipantViewSessionState {
  if (assignment.status !== "active") return "revoked";
  const attempt = assignment.attempt;
  if (attempt?.status === "in_progress") return "in_progress";
  if (attempt) return "completed";
  if (assignment.deliverySession.status !== "active") return "unavailable";
  if (assignment.deliverySession.availableUntil <= now) return "expired";
  if (assignment.deliverySession.availableFrom > now) return "assigned";
  return "available";
}

function decimalString(value: unknown) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function toAttemptView(attempt: ParticipantViewAttemptInput): ParticipantViewAttempt {
  return {
    attemptState: attempt.attemptState,
    id: attempt.id,
    normalizedScore: decimalString(attempt.normalizedScore),
    rawScore: decimalString(attempt.rawScore),
    legacyStatus: attempt.status,
    releaseAt: attempt.releaseAt?.toISOString() ?? null,
    releaseState: attempt.releaseState,
    scaledScore: decimalString(attempt.scaledScore),
    score: decimalString(attempt.score),
    scoringState: attempt.scoringState,
    scoringVersion: attempt.scoringVersion,
    status: attempt.status,
  };
}

function toSessionView(
  assignment: ParticipantViewAssignmentInput,
  now: Date,
): ParticipantViewSession {
  return {
    assignmentId: assignment.id,
    assignmentStatus: assignment.status,
    availableFrom: assignment.deliverySession.availableFrom.toISOString(),
    availableUntil: assignment.deliverySession.availableUntil.toISOString(),
    id: assignment.deliverySession.id,
    isDefaultOpenRegistration: assignment.deliverySession.isDefaultOpenRegistration,
    name: assignment.deliverySession.name,
    state: sessionState(assignment, now),
    status: assignment.deliverySession.status,
  };
}

function toParticipantView(
  admission: ParticipantViewAdmissionInput,
  now = new Date(),
): ParticipantView {
  const sortedAssignments = [...admission.assignments]
    .sort((left, right) => right.assignedAt.getTime() - left.assignedAt.getTime())
  const sessions = sortedAssignments.map((assignment) => toSessionView(assignment, now));
  const currentAssignment = sortedAssignments.find((assignment) => assignment.status === "active")
    ?? sortedAssignments[0]
    ?? null;
  const currentAttempt = currentAssignment?.attempt ? toAttemptView(currentAssignment.attempt) : null;
  return {
    admission: {
      decidedAt: admission.decidedAt?.toISOString() ?? null,
      id: admission.id,
      requestedAt: admission.requestedAt.toISOString(),
      status: admission.status,
    },
    admissionId: admission.id,
    attempt: currentAttempt,
    id: admission.id,
    participant: safeParticipantIdentity(admission.student),
    score: {
      normalizedScore: currentAttempt?.normalizedScore ?? null,
      rawScore: currentAttempt?.rawScore ?? null,
      releaseState: currentAttempt?.releaseState ?? "not_started",
      scaledScore: currentAttempt?.scaledScore ?? null,
      score: currentAttempt?.score ?? null,
      scoringState: currentAttempt?.scoringState ?? "not_started",
      scoringVersion: currentAttempt?.scoringVersion ?? null,
    },
    session: currentAssignment ? toSessionView(currentAssignment, now) : null,
    sessions,
    tryoutId: admission.tryoutId,
  };
}

function toParticipantViews(
  admissions: ParticipantViewAdmissionInput[],
  now = new Date(),
) {
  return admissions.map((admission) => toParticipantView(admission, now));
}

export {
  maskEmail,
  safeParticipantIdentity,
  toParticipantView,
  toParticipantViews,
};
export type {
  ParticipantView,
  ParticipantViewAdmission,
  ParticipantViewAttempt,
  ParticipantViewIdentity,
  ParticipantViewScore,
  ParticipantViewSession,
  ParticipantViewSessionState,
  ParticipantViewAdmissionInput,
  ParticipantViewAssignmentInput,
  ParticipantViewAttemptInput,
};
