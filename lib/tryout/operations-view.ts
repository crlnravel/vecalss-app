import "server-only";

import { getTryoutDeliveryOperations } from "@/lib/tryout/delivery-repository";

type TryoutOperationsRecord = NonNullable<
  Awaited<ReturnType<typeof getTryoutDeliveryOperations>>
>;

type TryoutOperationsView = ReturnType<typeof serializeTryoutOperations>;

function serializeTryoutOperations(operations: TryoutOperationsRecord) {
  return {
    admissionMode: operations.admissionMode,
    defaultReleasePolicy: operations.defaultResultReleasePolicy,
    description: operations.description,
    id: operations.id,
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
      student: admission.student.fullName ?? admission.student.email,
    })),
    sessions: operations.deliverySessions.map((deliverySession) => ({
      attempts: deliverySession.attempts.map((attempt) => ({
        id: attempt.id,
        runs: attempt.runs.map((run) => ({
          catState: run.catState,
          id: run.id,
          integrityEvents: run.integrityEvents.length,
          sequenceNo: run.sequenceNo,
          status: run.status,
        })),
        score: attempt.score?.toString() ?? null,
        status: attempt.status,
        student: attempt.student.fullName ?? attempt.student.email,
      })),
      availableFrom: deliverySession.availableFrom.toISOString(),
      availableUntil: deliverySession.availableUntil.toISOString(),
      fullscreenPrompt: deliverySession.fullscreenPrompt,
      id: deliverySession.id,
      isDefaultOpenRegistration:
        deliverySession.isDefaultOpenRegistration,
      name: deliverySession.name,
      rankingRule: deliverySession.rankingRule,
      releasedAt: deliverySession.releasedAt?.toISOString() ?? null,
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
  const operations = await getTryoutDeliveryOperations(tryoutId);
  if (!operations || operations.createdByUserId !== actorId) return null;
  return serializeTryoutOperations(operations);
}

export { getOwnedTryoutOperationsView, serializeTryoutOperations };
export type { TryoutOperationsView };
