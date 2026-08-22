import "server-only";

import {
  findAssessmentReleaseSectionForRun,
} from "@/lib/tryout/assessment-release";
import { synchronizeTryoutOperations } from "@/lib/tryout/attempt-repository";
import { getTryoutDeliveryOperations } from "@/lib/tryout/delivery-repository";
import {
  deriveTryoutLiveProjection,
  deriveTryoutResultProjection,
  sanitizeTryoutWorkspaceParticipant,
} from "@/lib/tryout/operations-projections";
import {
  safeParticipantIdentity,
  toParticipantViews,
} from "@/lib/tryout/participant-view";

type TryoutOperationsRecord = NonNullable<
  Awaited<ReturnType<typeof getTryoutDeliveryOperations>>
>;

type TryoutOperationsView = ReturnType<typeof serializeTryoutOperations>;
type TryoutDeliverySessionRecord = TryoutOperationsRecord["deliverySessions"][number];
type TryoutAttemptRecord = TryoutDeliverySessionRecord["attempts"][number];

function snapshotFor(run: { contentSnapshot: unknown }) {
  return run.contentSnapshot as {
    durationSeconds?: number;
    items?: unknown[];
    sequenceNo?: number;
    subtestId?: string;
    subtestName?: string;
    subtestCode?: string;
    testType?: string;
    title?: string;
  };
}

function explanationsCompleteForRelease(run: TryoutAttemptRecord["runs"][number]) {
  const snapshot = snapshotFor(run) as {
    items?: Array<{
      explanation?: string | null;
      explanationAssetId?: string | null;
      id: string;
    }>;
  };
  const adaptive = run.catSnapshot as { selectedItemIds?: unknown } | null;
  if (run.catSnapshot !== null && (!adaptive || !Array.isArray(adaptive.selectedItemIds))) return false;
  const selectedItemIds = Array.isArray(adaptive?.selectedItemIds)
    && adaptive.selectedItemIds.every((itemId): itemId is string => typeof itemId === "string")
    ? new Set(adaptive.selectedItemIds)
    : null;
  if (Array.isArray(adaptive?.selectedItemIds)
    && (!selectedItemIds || selectedItemIds.size !== adaptive.selectedItemIds.length || selectedItemIds.size === 0)) return false;
  const items = selectedItemIds
    ? (snapshot.items ?? []).filter((item) => selectedItemIds.has(item.id))
    : snapshot.items ?? [];
  return items.length > 0
    && (!selectedItemIds || items.length === selectedItemIds.size)
    && items.every((item) => Boolean(item.explanation?.trim() || item.explanationAssetId));
}

function resultReleaseReady(
  operations: TryoutOperationsRecord,
  session: TryoutDeliverySessionRecord,
  attempt: TryoutAttemptRecord,
) {
  const sections = operations.sections;
  const runs = attempt.runs;
  const sessionRelease = session.assessmentRelease;
  const terminalAttempt = !["in_progress", "abandoned", "void"].includes(attempt.attemptState)
    && !["in_progress", "abandoned"].includes(attempt.status);
  const breakdowns = attempt.scoreBreakdowns;
  if (!sessionRelease || !attempt.assessmentRelease || !terminalAttempt || sections.length !== 7 || runs.length !== 7 || breakdowns.length !== 7) return false;
  if (attempt.assessmentRelease.id !== sessionRelease.id
    || attempt.assessmentRelease.releaseNumber !== sessionRelease.releaseNumber
    || attempt.assessmentRelease.contentDigest !== sessionRelease.contentDigest) return false;
  const sectionIds = new Set(sections.map((section) => section.id));
  const sequenceNos = new Set(sections.map((section) => section.sequenceNo));
  const subtestIds = new Set(sections.map((section) => section.subtestId));
  const seenSectionIds = new Set<string>();
  const seenSequenceNos = new Set<number>();
  const seenBreakdownSubtestIds = new Set<string>();
  if (sectionIds.size !== 7 || sequenceNos.size !== 7 || subtestIds.size !== 7) return false;
  if (!breakdowns.every((breakdown) => subtestIds.has(breakdown.subtestId)
    && !seenBreakdownSubtestIds.has(breakdown.subtestId)
    && breakdown.normalizedScore !== null
    && breakdown.rawScore !== null
    && breakdown.scaledScore !== null
    && Boolean(breakdown.scoringVersion)
    && breakdown.scoringProvenance !== "legacy_unknown")) return false;
  breakdowns.forEach((breakdown) => seenBreakdownSubtestIds.add(breakdown.subtestId));
  if (seenBreakdownSubtestIds.size !== 7) return false;
  return runs.every((run) => {
    if (!sectionIds.has(run.tryoutSectionId)
      || seenSectionIds.has(run.tryoutSectionId)
      || !sequenceNos.has(run.sequenceNo)
      || seenSequenceNos.has(run.sequenceNo)
      || run.assessmentReleaseId !== sessionRelease.id
      || run.assessmentReleaseNumber !== sessionRelease.releaseNumber
      || run.assessmentReleaseDigest !== sessionRelease.contentDigest
      || !["sealed", "expired"].includes(run.status)
      || run.scoringState !== "scored"
      || !run.calculationReleaseable
      || run.catState === "voided"
      || run.normalizedScore === null
      || !explanationsCompleteForRelease(run)) return false;
    seenSectionIds.add(run.tryoutSectionId);
    seenSequenceNos.add(run.sequenceNo);
    return true;
  }) && seenSectionIds.size === 7 && seenSequenceNos.size === 7;
}

function toIso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

function toOperationsReleaseMetadata(release: {
  contentDigest: string;
  id: string;
  publishedAt: Date;
  releaseNumber: number;
}) {
  // The immutable payload is used above to resolve safe run labels, but it is
  // never part of the mentor operations client DTO.  Sending it would expose
  // the full question bundle (including answer-key material) to every client
  // surface, including Results while its release gate is closed.
  return {
    digest: release.contentDigest,
    id: release.id,
    number: release.releaseNumber,
    publishedAt: release.publishedAt.toISOString(),
  };
}

function serializeRun(
  run: TryoutOperationsRecord["deliverySessions"][number]["attempts"][number]["runs"][number],
  now: Date,
) {
  const snapshot = snapshotFor(run);
  const releaseSection = run.assessmentRelease
    ? findAssessmentReleaseSectionForRun(run.assessmentRelease.payload, run)
    : null;
  const answeredAt = run.answers.reduce<Date | null>((latest, answer) => {
    const candidate = answer.answeredAt ?? answer.syncedAt;
    return candidate && (!latest || candidate > latest) ? candidate : latest;
  }, null);
  const answeredCount = run.answers.filter((answer) =>
    Boolean(answer.selectedOptionId || answer.answerText?.trim()),
  ).length;
  const serverDeadlineAt = toIso(run.serverDeadlineAt);
  const serverStartedAt = toIso(run.serverStartedAt);
  const remainingSeconds = run.status === "active" && run.serverDeadlineAt
    ? Math.max(0, Math.ceil((run.serverDeadlineAt.getTime() - now.getTime()) / 1000))
    : null;

  return {
    answerCount: run.answers.length,
    answeredAt: toIso(answeredAt),
    answeredCount,
    assessmentRelease: run.assessmentRelease
      ? toOperationsReleaseMetadata(run.assessmentRelease)
      : null,
    calculationReleaseable: run.calculationReleaseable,
    catFailureReason: run.catFailureReason,
    catResolutionAudits: run.catResolutionAudits.map((audit) => ({
      action: audit.action,
      createdAt: audit.createdAt.toISOString(),
      reason: audit.reason,
    })),
    catState: run.catState,
    id: run.id,
    integrityEventTrail: run.integrityEvents.map((event) => ({
      createdAt: event.createdAt.toISOString(),
      eventType: event.eventType,
      serverSequence: event.serverSequence,
    })),
    integrityEvents: run.integrityEvents.length,
    normalizedScore: run.normalizedScore?.toString() ?? null,
    questionCount: Array.isArray(snapshot.items) ? snapshot.items.length : 0,
    remainingSeconds,
    scoringReviewReason: run.scoringReviewReason,
    scoringState: run.scoringState,
    scoringVersion: run.scoringVersion,
    sequenceNo: run.sequenceNo,
    serverDeadlineAt,
    serverStartedAt,
    status: run.status,
    subtestCode: releaseSection?.subtestCode ?? snapshot.subtestCode ?? null,
    subtestName: releaseSection?.subtestName ?? snapshot.subtestName ?? null,
    testType: snapshot.testType ?? null,
    title: releaseSection?.title ?? snapshot.title ?? null,
  };
}

function serializeTryoutOperations(operations: TryoutOperationsRecord) {
  const now = new Date();
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

  // Keep the ParticipantView boundary explicit: participants: toParticipantViews(participantInputs).
  const participants = toParticipantViews(participantInputs);
  const sessions = operations.deliverySessions.map((deliverySession) => ({
    attempts: deliverySession.attempts.map((attempt) => ({
      admissionId: attempt.admissionId,
      assessmentRelease: attempt.assessmentRelease
        ? toOperationsReleaseMetadata(attempt.assessmentRelease)
        : null,
      attemptState: attempt.attemptState,
      autoSubmittedAt: toIso(attempt.autoSubmittedAt),
      correctCount: attempt.correctCount,
      disconnectStartedAt: toIso(attempt.disconnectStartedAt),
      id: attempt.id,
      normalizedScore: attempt.normalizedScore?.toString() ?? null,
      reconciledAt: toIso(attempt.reconciledAt),
      releaseAt: toIso(attempt.releaseAt),
      releaseState: attempt.releaseState,
      runs: attempt.runs.map((run) => serializeRun(run, now)),
      score: attempt.score?.toString() ?? null,
      scoringReviewReason: attempt.scoringReviewReason,
      scoringState: attempt.scoringState,
      scoringVersion: attempt.scoringVersion,
      serverDeadlineAt: toIso(attempt.serverDeadlineAt),
      serverStartedAt: toIso(attempt.serverStartedAt),
      status: attempt.status,
      student: safeParticipantIdentity(attempt.student).displayName,
      submittedAt: toIso(attempt.submittedAt),
      totalDisconnectSeconds: attempt.totalDisconnectSeconds,
      unansweredCount: attempt.unansweredCount,
      wrongCount: attempt.wrongCount,
      releaseReady: resultReleaseReady(operations, deliverySession, attempt),
    })),
    availableFrom: deliverySession.availableFrom.toISOString(),
    availableUntil: deliverySession.availableUntil.toISOString(),
    assessmentRelease: deliverySession.assessmentRelease
      ? toOperationsReleaseMetadata(deliverySession.assessmentRelease)
      : null,
    fullscreenPrompt: deliverySession.fullscreenPrompt,
    id: deliverySession.id,
    isDefaultOpenRegistration: deliverySession.isDefaultOpenRegistration,
    name: deliverySession.name,
    rankingRule: deliverySession.rankingRule,
    releasedAt: deliverySession.releasedAt?.toISOString() ?? null,
    releaseReason: deliverySession.releaseReason,
    releaseState: deliverySession.releaseState,
    releasePolicy: deliverySession.resultReleasePolicy,
    scheduledReleaseAt: deliverySession.scheduledReleaseAt?.toISOString() ?? null,
    status: deliverySession.status,
  }));
  const attemptRecords = sessions.flatMap((session) => session.attempts.map((attempt) => ({
    ...attempt,
    sessionId: session.id,
    sessionName: session.name,
  })));
  const attempts = attemptRecords.map((attempt) => ({
    admissionId: attempt.admissionId,
    attemptState: attempt.attemptState,
    autoSubmittedAt: attempt.autoSubmittedAt,
    disconnectStartedAt: attempt.disconnectStartedAt,
    id: attempt.id,
    releaseAt: attempt.releaseAt,
    releaseState: attempt.releaseState,
    runs: attempt.runs.map((run) => ({
      answerCount: run.answerCount,
      answeredAt: run.answeredAt,
      answeredCount: run.answeredCount,
      catFailureReason: run.catFailureReason,
      catResolutionAudits: run.catResolutionAudits,
      catState: run.catState,
      id: run.id,
      integrityEventTrail: run.integrityEventTrail,
      integrityEvents: run.integrityEvents,
      questionCount: run.questionCount,
      remainingSeconds: run.remainingSeconds,
      scoringReviewReason: run.scoringReviewReason,
      scoringState: run.scoringState,
      scoringVersion: run.scoringVersion,
      sequenceNo: run.sequenceNo,
      serverDeadlineAt: run.serverDeadlineAt,
      serverStartedAt: run.serverStartedAt,
      status: run.status,
      subtestCode: run.subtestCode,
      subtestName: run.subtestName,
      testType: run.testType,
      title: run.title,
    })),
    scoringReviewReason: attempt.scoringReviewReason,
    scoringState: attempt.scoringState,
    scoringVersion: attempt.scoringVersion,
    serverDeadlineAt: attempt.serverDeadlineAt,
    serverStartedAt: attempt.serverStartedAt,
    sessionId: attempt.sessionId,
    sessionName: attempt.sessionName,
    status: attempt.status,
    student: attempt.student,
    submittedAt: attempt.submittedAt,
    totalDisconnectSeconds: attempt.totalDisconnectSeconds,
  }));
  const attemptById = new Map(attemptRecords.map((attempt) => [attempt.id, attempt]));
  const live = participants
    .filter((participant) => !["rejected", "revoked"].includes(participant.admission.status))
    .map((participant) => {
      const currentAttempt = participant.attempt?.id
        ? attemptById.get(participant.attempt.id)
        : participant.session?.id
          ? attemptRecords.find((attempt) => attempt.admissionId === participant.admissionId && attempt.sessionId === participant.session?.id)
          : attemptRecords.find((attempt) => attempt.admissionId === participant.admissionId);
      const projection = deriveTryoutLiveProjection({
        admissionStatus: participant.admission.status,
        attempt: currentAttempt
          ? {
              attemptId: currentAttempt.id,
              attemptState: currentAttempt.attemptState,
              disconnectStartedAt: currentAttempt.disconnectStartedAt,
              reconciledAt: currentAttempt.reconciledAt,
              scoringReviewReason: currentAttempt.scoringReviewReason,
              scoringState: currentAttempt.scoringState,
              status: currentAttempt.status,
              runs: currentAttempt.runs,
            }
          : null,
        sessionState: participant.session?.state ?? null,
      });
      return {
        ...projection,
        admissionId: participant.admissionId,
        attemptId: currentAttempt?.id ?? null,
        participant: participant.participant,
        session: currentAttempt
          ? { id: currentAttempt.sessionId, name: currentAttempt.sessionName }
          : participant.session
            ? { id: participant.session.id, name: participant.session.name }
            : null,
      };
    });
  const results = attemptRecords.map((attempt) => {
    const session = sessions.find((candidate) => candidate.id === attempt.sessionId)!;
    const projection = deriveTryoutResultProjection({
      attempt: {
        attemptId: attempt.id,
        attemptState: attempt.attemptState,
        releaseState: attempt.releaseState,
        releaseReady: attempt.releaseReady,
        score: attempt.score,
        scoringReviewReason: attempt.scoringReviewReason,
        scoringState: attempt.scoringState,
        status: attempt.status,
        runs: attempt.runs,
      },
      session: {
        eligibleRankingAttempts: session.attempts.filter((candidate) =>
          candidate.score !== null
          && candidate.scoringState === "scored"
          && candidate.releaseState === "released",
        ).length,
        rankingRule: session.rankingRule,
        releaseState: session.releaseState,
      },
    });
    return {
      ...projection,
      admissionId: attempt.admissionId,
      attemptId: attempt.id,
      participant: attempt.student,
      sessionId: session.id,
      sessionName: session.name,
      scheduledReleaseAt: session.scheduledReleaseAt,
    };
  });

  return {
    assessmentRelease: operations.assessmentReleases[0]
      ? toOperationsReleaseMetadata(operations.assessmentReleases[0])
      : null,
    admissionMode: operations.admissionMode,
    defaultReleasePolicy: operations.defaultResultReleasePolicy,
    description: operations.description,
    id: operations.id,
    participants,
    live,
    attempts,
    results,
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
    sessions,
  };
}

function toTryoutWorkspaceView(view: TryoutOperationsView): TryoutOperationsView {
  return {
    ...view,
    participants: view.participants.map((participant) => {
      const scoreVisible = participant.attempt?.id
        ? view.results.some((result) =>
            result.admissionId === participant.admissionId
            && result.attemptId === participant.attempt?.id
            && result.scoreVisible,
          )
        : false;
      return sanitizeTryoutWorkspaceParticipant(participant, scoreVisible);
    }),
    sessions: view.sessions.map((session) => ({
      ...session,
      attempts: [],
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
  // Reconcile expired release-bound attempts before serializing the read. The
  // synchronizer is owner-scoped and uses the same deterministic row locks as
  // participant commands, so Live never presents a client-only timer state as
  // authoritative.
  const synchronized = await synchronizeTryoutOperations(tryoutId, actorId);
  if (!synchronized) return null;
  const operations = await getTryoutDeliveryOperations(tryoutId, actorId);
  if (!operations) return null;
  return serializeTryoutOperations(operations);
}

export { getOwnedTryoutOperationsView, serializeTryoutOperations, toTryoutWorkspaceView };
export type { TryoutOperationsView };
