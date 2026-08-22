import "server-only";

import { toAssessmentReleaseMetadata } from "@/lib/tryout/assessment-release";
import { getTryoutDeliveryOperations } from "@/lib/tryout/delivery-repository";
import {
  safeParticipantIdentity,
  toParticipantViews,
} from "@/lib/tryout/participant-view";

type TryoutOperationsRecord = NonNullable<
  Awaited<ReturnType<typeof getTryoutDeliveryOperations>>
>;

type TryoutOperationsView = ReturnType<typeof serializeTryoutOperations>;

function serializeTryoutOperations(operations: TryoutOperationsRecord) {
  const participantInputs = operations.admissions.map((admission) => ({
    assignments: admission.assignments.map((assignment) => ({
      assignedAt: assignment.assignedAt,
      deliverySession: {
        availableFrom: assignment.deliverySession.availableFrom,
        availableUntil: assignment.deliverySession.availableUntil,
        id: assignment.deliverySession.id,
        isDefaultOpenRegistration: assignment.deliverySession.isDefaultOpenRegistration,
        name: assignment.deliverySession.name,
        status: assignment.deliverySession.status,
      },
      id: assignment.id,
      status: assignment.status,
      attempt: assignment.deliverySession.attempts.find(
        (attempt) => attempt.studentId === admission.student.id,
      ) ?? null,
    })),
    decidedAt: admission.decidedAt,
    id: admission.id,
    requestedAt: admission.requestedAt,
    status: admission.status,
    student: admission.student,
    tryoutId: operations.id,
  }));

  return {
    assessmentRelease: operations.assessmentReleases[0]
      ? toAssessmentReleaseMetadata(operations.assessmentReleases[0])
      : null,
    admissionMode: operations.admissionMode,
    defaultReleasePolicy: operations.defaultResultReleasePolicy,
    description: operations.description,
    id: operations.id,
    participants: toParticipantViews(participantInputs),
    status: operations.status,
    title: operations.title,
    admissions: operations.admissions.map((admission) => ({
      assignments: admission.assignments.map((assignment) => ({
        deliverySessionId: assignment.deliverySessionId,
        id: assignment.id,
        name: assignment.deliverySession.name,
        status: assignment.status,
      })),
      id: admission.id,
      status: admission.status,
      student: safeParticipantIdentity(admission.student).displayName,
    })),
    sessions: operations.deliverySessions.map((deliverySession) => ({
      attempts: deliverySession.attempts.map((attempt) => ({
        assessmentRelease: attempt.assessmentRelease
          ? toAssessmentReleaseMetadata(attempt.assessmentRelease)
          : null,
        id: attempt.id,
        runs: attempt.runs.map((run) => ({
          assessmentRelease: run.assessmentRelease
            ? toAssessmentReleaseMetadata(run.assessmentRelease)
            : null,
          catState: run.catState,
          id: run.id,
          integrityEvents: run.integrityEvents.length,
          normalizedScore: run.normalizedScore?.toString() ?? null,
          scoringState: run.scoringState,
          scoringVersion: run.scoringVersion,
          sequenceNo: run.sequenceNo,
          status: run.status,
        })),
        releaseState: attempt.releaseState,
        score: attempt.score?.toString() ?? null,
        scoringState: attempt.scoringState,
        scoringVersion: attempt.scoringVersion,
        status: attempt.status,
        student: safeParticipantIdentity(attempt.student).displayName,
      })),
      availableFrom: deliverySession.availableFrom.toISOString(),
      availableUntil: deliverySession.availableUntil.toISOString(),
      assessmentRelease: deliverySession.assessmentRelease
        ? toAssessmentReleaseMetadata(deliverySession.assessmentRelease)
        : null,
      fullscreenPrompt: deliverySession.fullscreenPrompt,
      id: deliverySession.id,
      isDefaultOpenRegistration:
        deliverySession.isDefaultOpenRegistration,
      name: deliverySession.name,
      rankingRule: deliverySession.rankingRule,
      releasedAt: deliverySession.releasedAt?.toISOString() ?? null,
      releaseState: deliverySession.releaseState,
      releasePolicy: deliverySession.resultReleasePolicy,
      scheduledReleaseAt: deliverySession.scheduledReleaseAt?.toISOString() ?? null,
      status: deliverySession.status,
    })),
  };
}

async function getOwnedTryoutOperationsView(
  tryoutId: string,
  actorId: string,
) {
  // Scope in the database before loading admissions, student identities,
  // attempts, or release payloads.  The serializer is a presentation
  // boundary, not an ownership boundary.
  const operations = await getTryoutDeliveryOperations(tryoutId, actorId);
  if (!operations) return null;
  return serializeTryoutOperations(operations);
}

export { getOwnedTryoutOperationsView, serializeTryoutOperations };
export type { TryoutOperationsView };
