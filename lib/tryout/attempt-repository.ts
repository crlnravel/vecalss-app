import "server-only";

import { AssessmentAttemptState, AssessmentScoringProvenance, AssessmentScoringState, AttemptStatus, Prisma, QuestionRevisionProvenance, QuestionRevisionStatus, TryoutAttemptTestRunStatus, TryoutAssignmentStatus, TryoutCatRunState, TryoutDeliverySessionStatus, TryoutIntegrityEventType, TryoutTestType } from "@/generated/prisma/client";
import { CANONICAL_2PL_MODEL_VERSION } from "@/lib/tryout/cat-profile";
import { isManagedPreviewPurpose } from "@/lib/admin/student-preview-contract";
import { materializeFrozenAnswers, normalizeCatAbility, normalizeCbtScore, TRYOUT_CAT_SCORING_VERSION, TRYOUT_CBT_SCORING_VERSION, TRYOUT_SCORE_AGGREGATION_VERSION } from "@/lib/tryout/scoring";
import { prisma } from "@/lib/prisma";

class TryoutAttemptValidationError extends Error {}

const json = (value: unknown) => value as Prisma.InputJsonValue;
const activeAttemptStatuses = [AttemptStatus.in_progress] as const;

type ItemSnapshot = {
  difficulty: string;
  id: string;
  options: Array<{ choiceKey: string; content: string; id: string; isCorrect: boolean; sortOrder: number }>;
  points: string;
  prompt: string;
  sortOrder: number;
  sourceContentDigest?: string | null;
  sourceQuestionId?: string | null;
  sourceQuestionRevisionId?: string | null;
  sourceRevisionProvenance?: string | null;
};
type CatParameter = { calibrationDigest: string; calibrationId: string; discrimination: number; difficulty: number; itemId: string; sortOrder: number; sourceContentDigest: string; sourceQuestionId: string; sourceQuestionRevisionId: string };
type CatSnapshot = { currentAbility: number; initialAbility: number; modelVersion: string; parameters: CatParameter[]; selectedItemIds: string[]; updates: Array<{ abilityAfter: number; abilityBefore: number; itemId: string; probability: number; selectedOptionId: string | null }> };

function remainingSeconds(deadline: Date | null, now: Date) {
  return deadline ? Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 1000)) : 0;
}

async function lockStudent(tx: Prisma.TransactionClient, studentId: string) {
  // A stable participant lock serializes starts before overlapping-session rows exist.
  // pg_advisory_xact_lock returns PostgreSQL `void`; executeRaw consumes the
  // command result without asking Prisma to deserialize that value.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${studentId}, 0))`;
}

async function markAttemptSubmittedIfComplete(tx: Prisma.TransactionClient, attemptId: string, now: Date) {
  const [remaining, reviewRequired] = await Promise.all([
    tx.tryoutAttemptTestRun.count({ where: { attemptId, status: { in: [TryoutAttemptTestRunStatus.pending, TryoutAttemptTestRunStatus.active] } } }),
    tx.tryoutAttemptTestRun.count({ where: { attemptId, scoringState: AssessmentScoringState.review_required } }),
  ]);
  if (remaining) return;
  await tx.tryoutAttempt.update({ where: { id: attemptId }, data: { attemptState: AssessmentAttemptState.submitted, scoringState: reviewRequired ? AssessmentScoringState.review_required : AssessmentScoringState.pending, status: AttemptStatus.submitted, submittedAt: now } });
}

async function calculateAndSealRun(tx: Prisma.TransactionClient, runId: string, now: Date, expired = false) {
  const run = await tx.tryoutAttemptTestRun.findUnique({
    where: { id: runId },
    include: { answers: { select: { id: true, selectedOptionId: true, tryoutItemId: true } }, section: { select: { scoringConfig: true, testType: true } } },
  });
  if (!run || run.status !== TryoutAttemptTestRunStatus.active) return run;
  if (run.section.testType === TryoutTestType.cat) return calculateAndSealCatRun(tx, run, now, expired);
  const content = run.contentSnapshot as unknown as { items?: ItemSnapshot[] };
  const items = content.items ?? [];
  const scored = materializeFrozenAnswers(items, run.answers.map((answer) => ({ itemId: answer.tryoutItemId, selectedOptionId: answer.selectedOptionId })));
  if (scored.invalid || scored.normalizedScore === null) {
    const failed = await tx.tryoutAttemptTestRun.update({
      where: { id: run.id },
      data: {
        calculationReleaseable: false,
        catFailureReason: "Jawaban tidak dapat dicocokkan dengan snapshot Test yang dibekukan.",
        scoringProvenance: AssessmentScoringProvenance.runtime,
        scoringReviewReason: "One or more answers are absent from the frozen CBT snapshot.",
        scoringState: AssessmentScoringState.review_required,
        sealedAt: now,
        status: expired ? TryoutAttemptTestRunStatus.expired : TryoutAttemptTestRunStatus.sealed,
      },
    });
    await markAttemptSubmittedIfComplete(tx, failed.attemptId, now);
    return failed;
  }
  for (const answer of run.answers) {
    const materialized = scored.materializedAnswers.find((candidate) => candidate.itemId === answer.tryoutItemId);
    if (!materialized) continue;
    await tx.tryoutAnswer.update({ where: { id: answer.id }, data: { isCorrect: materialized.isCorrect, pointsAwarded: materialized.pointsAwarded, scoringVersion: TRYOUT_CBT_SCORING_VERSION } });
  }
  const result = { answeredCount: scored.answeredCount, correctCount: scored.correctCount, maxScore: scored.maxScore, normalizedScore: scored.normalizedScore, score: scored.rawScore, unansweredCount: scored.unansweredCount, wrongCount: scored.wrongCount };
  const sealed = await tx.tryoutAttemptTestRun.update({
    where: { id: run.id },
    data: {
      calculationInput: json({ answersAcknowledged: scored.answeredCount, scoringConfig: run.section.scoringConfig, totalItems: items.length }),
      calculationResult: json(result),
      calculationVersion: TRYOUT_CBT_SCORING_VERSION,
      calculationReleaseable: true,
      correctCount: scored.correctCount,
      maxScore: scored.maxScore,
      normalizedScore: scored.normalizedScore,
      rawScore: scored.rawScore,
      scaledScore: scored.normalizedScore,
      scoringProvenance: AssessmentScoringProvenance.runtime,
      scoringReviewReason: null,
      scoringState: AssessmentScoringState.scored,
      scoringVersion: TRYOUT_CBT_SCORING_VERSION,
      sealedAt: now,
      status: expired ? TryoutAttemptTestRunStatus.expired : TryoutAttemptTestRunStatus.sealed,
      unansweredCount: scored.unansweredCount,
      wrongCount: scored.wrongCount,
    },
  });
  await markAttemptSubmittedIfComplete(tx, sealed.attemptId, now);
  return sealed;
}

function logistic(value: number) { return value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value)); }
function catInformation(parameter: CatParameter, ability: number) { const p = logistic(parameter.discrimination * (ability - parameter.difficulty)); return parameter.discrimination * parameter.discrimination * p * (1 - p); }
function nextCatItem(snapshot: CatSnapshot) {
  const used = new Set(snapshot.selectedItemIds);
  return snapshot.parameters.filter((parameter) => !used.has(parameter.itemId)).sort((left, right) => {
    const delta = catInformation(right, snapshot.currentAbility) - catInformation(left, snapshot.currentAbility);
    return Math.abs(delta) > 1e-12 ? delta : left.sortOrder - right.sortOrder || left.itemId.localeCompare(right.itemId);
  })[0] ?? null;
}
function catSnapshot(value: Prisma.JsonValue | null) { return value as unknown as CatSnapshot | null; }
async function failCatRun(tx: Prisma.TransactionClient, runId: string, reason: string) {
  return tx.tryoutAttemptTestRun.update({ where: { id: runId }, data: { calculationReleaseable: false, catFailureReason: reason, catState: TryoutCatRunState.failed, scoringProvenance: AssessmentScoringProvenance.runtime, scoringReviewReason: reason, scoringState: AssessmentScoringState.review_required } });
}
async function calculateAndSealCatRun(tx: Prisma.TransactionClient, run: { id: string; attemptId: string; answers: Array<{ id: string; selectedOptionId: string | null; tryoutItemId: string }>; catSnapshot: Prisma.JsonValue | null; contentSnapshot: Prisma.JsonValue; status: TryoutAttemptTestRunStatus }, now: Date, expired: boolean) {
  const snapshot = catSnapshot(run.catSnapshot);
  if (!snapshot || !Number.isFinite(snapshot.currentAbility)) {
    await failCatRun(tx, run.id, "Snapshot CAT tidak dapat dihitung ulang.");
    const failed = await tx.tryoutAttemptTestRun.update({ where: { id: run.id }, data: { sealedAt: now, status: expired ? TryoutAttemptTestRunStatus.expired : TryoutAttemptTestRunStatus.sealed } });
    await markAttemptSubmittedIfComplete(tx, failed.attemptId, now);
    return failed;
  }
  const current = catSnapshot(run.catSnapshot)!;
  const content = run.contentSnapshot as unknown as { items?: ItemSnapshot[] };
  const scored = materializeFrozenAnswers(content.items ?? [], run.answers.map((answer) => ({ itemId: answer.tryoutItemId, selectedOptionId: answer.selectedOptionId })), current.selectedItemIds);
  if (scored.invalid || scored.normalizedScore === null) {
    const failed = await failCatRun(tx, run.id, "Jawaban CAT tidak dapat dicocokkan dengan snapshot item yang dibekukan.");
    const sealedFailed = await tx.tryoutAttemptTestRun.update({ where: { id: failed.id }, data: { sealedAt: now, status: expired ? TryoutAttemptTestRunStatus.expired : TryoutAttemptTestRunStatus.sealed } });
    await markAttemptSubmittedIfComplete(tx, sealedFailed.attemptId, now);
    return sealedFailed;
  }
  for (const answer of run.answers) {
    const materialized = scored.materializedAnswers.find((candidate) => candidate.itemId === answer.tryoutItemId);
    if (!materialized) continue;
    await tx.tryoutAnswer.update({ where: { id: answer.id }, data: { isCorrect: materialized.isCorrect, pointsAwarded: materialized.pointsAwarded, scoringVersion: TRYOUT_CAT_SCORING_VERSION } });
  }
  const normalizedScore = normalizeCatAbility(current.currentAbility);
  const result = { ability: current.currentAbility, answeredCount: scored.answeredCount, correctCount: scored.correctCount, deliveredCount: current.selectedItemIds.length, maxScore: scored.maxScore, normalizedScore, score: current.currentAbility, unansweredCount: scored.unansweredCount, wrongCount: scored.wrongCount };
  const sealed = await tx.tryoutAttemptTestRun.update({ where: { id: run.id }, data: { calculationInput: json({ modelVersion: current.modelVersion, parameters: current.parameters, selectedItemIds: current.selectedItemIds, updates: current.updates }), calculationResult: json(result), calculationVersion: TRYOUT_CAT_SCORING_VERSION, calculationReleaseable: true, catFailureReason: null, catState: TryoutCatRunState.ready, correctCount: scored.correctCount, maxScore: scored.maxScore, normalizedScore, rawScore: current.currentAbility, scaledScore: normalizedScore, scoringProvenance: AssessmentScoringProvenance.runtime, scoringReviewReason: null, scoringState: AssessmentScoringState.scored, scoringVersion: TRYOUT_CAT_SCORING_VERSION, sealedAt: now, status: expired ? TryoutAttemptTestRunStatus.expired : TryoutAttemptTestRunStatus.sealed, unansweredCount: scored.unansweredCount, wrongCount: scored.wrongCount } });
  await markAttemptSubmittedIfComplete(tx, sealed.attemptId, now);
  return sealed;
}

async function expireForSessionCap(tx: Prisma.TransactionClient, attemptId: string, now: Date) {
  const active = await tx.tryoutAttemptTestRun.findFirst({ where: { attemptId, status: TryoutAttemptTestRunStatus.active }, select: { id: true } });
  if (active) await calculateAndSealRun(tx, active.id, now, true);
  await tx.tryoutAttemptTestRun.updateMany({ where: { attemptId, status: TryoutAttemptTestRunStatus.pending }, data: { scoringProvenance: AssessmentScoringProvenance.runtime, scoringReviewReason: "Test tidak pernah dibuka sebelum batas waktu sesi.", scoringState: AssessmentScoringState.review_required, sealedAt: now, status: TryoutAttemptTestRunStatus.expired } });
  await tx.tryoutAttempt.update({ where: { id: attemptId }, data: { attemptState: AssessmentAttemptState.expired, autoSubmittedAt: now, scoringReviewReason: "Satu atau lebih Test tidak memiliki perhitungan sebelum batas waktu sesi.", scoringState: AssessmentScoringState.review_required, status: AttemptStatus.expired } });
}

async function synchronizeAttempt(tx: Prisma.TransactionClient, attemptId: string, now: Date) {
  const attempt = await tx.tryoutAttempt.findUnique({ where: { id: attemptId }, include: { deliverySession: { select: { availableUntil: true } } } });
  if (!attempt || attempt.status !== AttemptStatus.in_progress) return attempt;
  if (attempt.deliverySession.availableUntil <= now) {
    await expireForSessionCap(tx, attemptId, now);
    return tx.tryoutAttempt.findUnique({ where: { id: attemptId } });
  }
  const active = await tx.tryoutAttemptTestRun.findFirst({ where: { attemptId, status: TryoutAttemptTestRunStatus.active }, select: { id: true, serverDeadlineAt: true } });
  if (active?.serverDeadlineAt && active.serverDeadlineAt <= now) await calculateAndSealRun(tx, active.id, now, true);
  return attempt;
}

function snapshotSection(section: { id: string; durationSeconds: number; instructions: string | null; scoringConfig: Prisma.JsonValue | null; testType: string; items: Array<{ difficulty: string; id: string; prompt: string; points: Prisma.Decimal; sortOrder: number; sourceContentDigest: string | null; sourceQuestionId: string | null; sourceQuestionRevisionId: string | null; sourceRevisionProvenance: string | null; options: Array<{ id: string; choiceKey: string; content: string; isCorrect: boolean; sortOrder: number }> }> }) {
  return {
    durationSeconds: section.durationSeconds,
    instructions: section.instructions,
    items: section.items.map((item) => ({ difficulty: item.difficulty, id: item.id, options: item.options.map((option) => ({ choiceKey: option.choiceKey, content: option.content, id: option.id, isCorrect: option.isCorrect, sortOrder: option.sortOrder })), points: item.points.toString(), prompt: item.prompt, sortOrder: item.sortOrder, sourceContentDigest: item.sourceContentDigest, sourceQuestionId: item.sourceQuestionId, sourceQuestionRevisionId: item.sourceQuestionRevisionId, sourceRevisionProvenance: item.sourceRevisionProvenance })),
    scoringConfig: section.scoringConfig,
    sectionId: section.id,
    testType: section.testType,
  };
}

async function catRunSnapshot(tx: Prisma.TransactionClient, section: { catItemCount: number | null; catModelVersion: string | null; id: string; items: Array<{ id: string; sourceContentDigest: string | null; sourceQuestionId: string | null; sourceQuestionRevisionId: string | null; sourceRevisionProvenance: QuestionRevisionProvenance | null; sortOrder: number }>; subtestId: string }) {
  if (!section.catItemCount || section.catModelVersion !== CANONICAL_2PL_MODEL_VERSION || section.items.length < section.catItemCount || section.items.some((item) => !item.sourceQuestionId || !item.sourceQuestionRevisionId || !item.sourceContentDigest || item.sourceRevisionProvenance === null || item.sourceRevisionProvenance === QuestionRevisionProvenance.legacy_unknown)) throw new TryoutAttemptValidationError("Pool CAT immutable tidak lengkap atau tidak memakai profil 2PL kanonis.");
  const revisionIds = section.items.map((item) => item.sourceQuestionRevisionId!);
  const [revisions, calibrations] = await Promise.all([
    tx.questionRevision.findMany({ where: { id: { in: revisionIds }, status: QuestionRevisionStatus.ready }, select: { contentDigest: true, id: true, questionId: true } }),
    tx.twoPlQuestionCalibration.findMany({ where: { approvalState: "approved", modelVersion: CANONICAL_2PL_MODEL_VERSION, questionRevisionId: { in: revisionIds } }, select: { contentDigest: true, difficulty: true, discrimination: true, id: true, questionId: true, questionRevisionId: true, sourceRevisionProvenance: true } }),
  ]);
  const revisionById = new Map(revisions.map((revision) => [revision.id, revision]));
  const calibrationByRevision = new Map(calibrations.map((calibration) => [calibration.questionRevisionId, calibration]));
  if (revisions.length !== new Set(revisionIds).size || calibrations.length !== new Set(revisionIds).size || section.items.some((item) => {
    const revision = revisionById.get(item.sourceQuestionRevisionId!);
    const calibration = calibrationByRevision.get(item.sourceQuestionRevisionId!);
    return !revision || !calibration
      || revision.questionId !== item.sourceQuestionId
      || revision.contentDigest !== item.sourceContentDigest
      || calibration.questionId !== item.sourceQuestionId
      || calibration.contentDigest !== item.sourceContentDigest
      || calibration.sourceRevisionProvenance === QuestionRevisionProvenance.legacy_unknown;
  })) throw new TryoutAttemptValidationError("Pool CAT memiliki parameter 2PL kanonis yang belum disetujui untuk QuestionRevision dan digest yang tepat.");
  const parameters = section.items.map((item) => {
    const calibration = calibrationByRevision.get(item.sourceQuestionRevisionId!);
    if (!calibration) throw new TryoutAttemptValidationError("Parameter CAT tidak ditemukan.");
    return { calibrationDigest: calibration.contentDigest, calibrationId: calibration.id, discrimination: Number(calibration.discrimination), difficulty: Number(calibration.difficulty), itemId: item.id, sortOrder: item.sortOrder, sourceContentDigest: item.sourceContentDigest!, sourceQuestionId: item.sourceQuestionId!, sourceQuestionRevisionId: item.sourceQuestionRevisionId! };
  });
  return { currentAbility: 0, initialAbility: 0, modelVersion: CANONICAL_2PL_MODEL_VERSION, parameters, selectedItemIds: [], updates: [] } satisfies CatSnapshot;
}

async function startTryoutAttempt(deliverySessionId: string, studentId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const student = await tx.user.findUnique({
      select: { previewPurpose: true },
      where: { id: studentId },
    });
    if (isManagedPreviewPurpose(student?.previewPurpose)) {
      throw new TryoutAttemptValidationError("Akun preview admin tidak dapat memulai attempt learner.");
    }
    await lockStudent(tx, studentId);
    const assignment = await tx.tryoutDeliveryAssignment.findFirst({
      where: { deliverySessionId, status: TryoutAssignmentStatus.active, admission: { status: "active", studentId } },
      include: {
        admission: true,
        deliverySession: {
          include: {
            tryout: {
              include: {
                sections: {
                  include: {
                    items: {
                      include: { options: { orderBy: { sortOrder: "asc" } } },
                      orderBy: { sortOrder: "asc" },
                    },
                  },
                  orderBy: { sequenceNo: "asc" },
                },
              },
            },
          },
        },
      },
    });
    if (!assignment || assignment.deliverySession.status !== TryoutDeliverySessionStatus.active) throw new TryoutAttemptValidationError("Sesi Tryout tidak tersedia untuk peserta ini.");
    const session = assignment.deliverySession;
    if (session.availableFrom > now || session.availableUntil <= now) throw new TryoutAttemptValidationError("Jendela sesi Tryout belum tersedia atau sudah berakhir.");

    // Lock every overlapping session in a deterministic order, after the stable student lock.
    await tx.$queryRaw`SELECT id FROM tryout_delivery_sessions WHERE id = ${deliverySessionId}::uuid OR (available_from < ${session.availableUntil} AND available_until > ${session.availableFrom}) ORDER BY id FOR UPDATE`;
    const existing = await tx.tryoutAttempt.findUnique({ where: { deliverySessionId_studentId: { deliverySessionId, studentId } }, select: { id: true } });
    if (existing) return { attemptId: existing.id, state: "existing" as const };
    const competing = await tx.tryoutAttempt.findFirst({ where: { studentId, status: { in: [...activeAttemptStatuses] }, deliverySession: { availableFrom: { lt: session.availableUntil }, availableUntil: { gt: session.availableFrom } } }, select: { id: true } });
    if (competing) throw new TryoutAttemptValidationError("Peserta masih memiliki Tryout aktif pada sesi yang waktunya bertumpang tindih.");

    // This is the single content-lock transition: same aggregate lock as authoring writes.
    await tx.$queryRaw`SELECT id FROM tryout_packages WHERE id = ${session.tryoutId}::uuid FOR UPDATE`;
    const lockedTryout = await tx.tryoutPackage.findUniqueOrThrow({
      where: { id: session.tryoutId },
      include: {
        sections: {
          include: {
            items: {
              include: { options: { orderBy: { sortOrder: "asc" } } },
              orderBy: { sortOrder: "asc" },
            },
          },
          orderBy: { sequenceNo: "asc" },
        },
      },
    });
    if (lockedTryout.sections.length !== 7 || lockedTryout.sections.some((section) => !section.items.length)) throw new TryoutAttemptValidationError("Konfigurasi tujuh Test Tryout belum lengkap.");
    const catSnapshotEntries = lockedTryout.sections.reduce<Promise<readonly [string, CatSnapshot]>[]>((entries, section) => {
      if (section.testType === TryoutTestType.cat) {
        entries.push(catRunSnapshot(tx, section).then((snapshot) => [section.id, snapshot] as const));
      }
      return entries;
    }, []);
    const catSnapshots = new Map(await Promise.all(catSnapshotEntries));
    const attempt = await tx.tryoutAttempt.create({
      data: {
        admissionId: assignment.admissionId,
        attemptState: AssessmentAttemptState.in_progress,
        contentSnapshot: json({ tryoutId: session.tryoutId, tryoutRevision: lockedTryout.revision }),
        deliverySessionId,
        releasePolicySnapshot: json({ aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION, rankingRule: session.rankingRule, resultReleasePolicy: session.resultReleasePolicy, scheduledReleaseAt: session.scheduledReleaseAt?.toISOString() ?? null }),
        scoringProvenance: AssessmentScoringProvenance.runtime,
        scoringState: AssessmentScoringState.pending,
        serverDeadlineAt: session.availableUntil,
        serverStartedAt: now,
        studentId,
        tryoutId: session.tryoutId,
      },
    });
    await tx.tryoutAttemptTestRun.createMany({ data: lockedTryout.sections.map((section) => ({
      attemptId: attempt.id,
      calculationReleaseable: false,
      catSnapshot: section.testType === TryoutTestType.cat ? json(catSnapshots.get(section.id)!) : undefined,
      catState: section.testType === TryoutTestType.cat ? TryoutCatRunState.ready : TryoutCatRunState.not_applicable,
      contentSnapshot: json(snapshotSection(section)),
      scoringProvenance: AssessmentScoringProvenance.runtime,
      scoringState: AssessmentScoringState.pending,
      sequenceNo: section.sequenceNo,
      tryoutSectionId: section.id,
    })) });
    return { attemptId: attempt.id, state: "started" as const };
  });
}

async function attemptState(attemptId: string, studentId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.tryoutAttempt.findFirst({
      where: { id: attemptId, studentId },
      include: {
        deliverySession: { select: { fullscreenPrompt: true } },
        tryout: {
          select: {
            createdBy: { select: { fullName: true } },
            description: true,
            examEvent: { select: { name: true } },
            title: true,
          },
        },
      },
    });
    if (!attempt) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    await synchronizeAttempt(tx, attemptId, now);
    const runs = await tx.tryoutAttemptTestRun.findMany({
      where: { attemptId },
      include: {
        section: {
          select: {
            durationSeconds: true,
            questionCount: true,
            subtest: { select: { code: true, name: true } },
            testType: true,
            title: true,
          },
        },
      },
      orderBy: { sequenceNo: "asc" },
    });
    const active = runs.find((run) => run.status === TryoutAttemptTestRunStatus.active);
    const exposed = active
      ? {
          answers: (await tx.tryoutAnswer.findMany({
            where: { attemptTestRunId: active.id },
            select: { selectedOptionId: true, tryoutItemId: true },
          })).map((answer) => ({ selectedOptionId: answer.selectedOptionId, tryoutItemId: answer.tryoutItemId })),
          contentSnapshot: redactRunSnapshot(active.contentSnapshot, active.catSnapshot),
          fullscreenPrompt: attempt.deliverySession.fullscreenPrompt,
          id: active.id,
          section: active.section,
          serverDeadlineAt: active.serverDeadlineAt,
          sequenceNo: active.sequenceNo,
          status: active.status,
        }
      : null;
    return {
      activeRun: exposed,
      attemptId,
      status: (await tx.tryoutAttempt.findUniqueOrThrow({ where: { id: attemptId }, select: { status: true } })).status,
      tryoutDescription: attempt.tryout.description,
      tryoutEventName: attempt.tryout.examEvent?.name ?? null,
      tryoutOrganizer: attempt.tryout.createdBy.fullName,
      tryoutTitle: attempt.tryout.title,
      runs: runs.map((run) => ({
        id: run.id,
        section: run.section,
        sequenceNo: run.sequenceNo,
        status: run.status,
      })),
    };
  });
}

async function recordTryoutIntegrityEvent(attemptId: string, runId: string, eventType: TryoutIntegrityEventType, studentId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.tryoutAttempt.findFirst({ where: { id: attemptId, studentId }, include: { deliverySession: { select: { fullscreenPrompt: true } } } });
    if (!attempt) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    await synchronizeAttempt(tx, attemptId, now);
    const run = await tx.tryoutAttemptTestRun.findFirst({ where: { attemptId, id: runId, status: TryoutAttemptTestRunStatus.active }, select: { id: true } });
    if (!run) throw new TryoutAttemptValidationError("Hanya Test aktif yang dapat mencatat peringatan Tryout.");
    if ((eventType === TryoutIntegrityEventType.fullscreen_entered || eventType === TryoutIntegrityEventType.fullscreen_exited) && !attempt.deliverySession.fullscreenPrompt) throw new TryoutAttemptValidationError("Pengingat layar penuh tidak diaktifkan untuk sesi ini.");
    if (eventType === TryoutIntegrityEventType.fullscreen_exited) {
      const entered = await tx.tryoutIntegrityEvent.findFirst({ where: { eventType: TryoutIntegrityEventType.fullscreen_entered, runId }, select: { id: true } });
      if (!entered) return { ignored: true, serverSequence: null };
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${runId}, 0))`;
    const previous = await tx.tryoutIntegrityEvent.aggregate({ _max: { serverSequence: true }, where: { runId } });
    const event = await tx.tryoutIntegrityEvent.create({ data: { eventType, runId, serverSequence: (previous._max.serverSequence ?? 0) + 1 } });
    return { ignored: false, serverSequence: event.serverSequence };
  });
}

function redactRunSnapshot(snapshot: Prisma.JsonValue, cat: Prisma.JsonValue | null = null) {
  const value = structuredClone(snapshot) as { items?: Array<{ options?: Array<{ isCorrect?: boolean }> }> };
  const adaptive = catSnapshot(cat);
  if (adaptive) {
    const selectedItemIds = new Set(adaptive.selectedItemIds);
    value.items = value.items?.filter((item) => selectedItemIds.has((item as { id: string }).id));
  }
  value.items?.forEach((item) => item.options?.forEach((option) => delete option.isCorrect));
  return value;
}

async function startActiveTestRun(attemptId: string, runId: string, studentId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.tryoutAttempt.findFirst({ where: { id: attemptId, studentId }, include: { deliverySession: true } });
    if (!attempt) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    await synchronizeAttempt(tx, attemptId, now);
    const run = await tx.tryoutAttemptTestRun.findFirst({ where: { id: runId, attemptId }, include: { section: true } });
    if (!run || run.status !== TryoutAttemptTestRunStatus.pending) throw new TryoutAttemptValidationError("Hanya Test berikutnya yang belum dimulai dapat dibuka.");
    const [predecessor, active] = await Promise.all([
      tx.tryoutAttemptTestRun.findFirst({ where: { attemptId, sequenceNo: { lt: run.sequenceNo }, status: { notIn: [TryoutAttemptTestRunStatus.sealed, TryoutAttemptTestRunStatus.expired] } }, select: { id: true } }),
      tx.tryoutAttemptTestRun.findFirst({ where: { attemptId, status: TryoutAttemptTestRunStatus.active }, select: { id: true } }),
    ]);
    if (predecessor || active) throw new TryoutAttemptValidationError("Test sebelumnya harus diselesaikan sebelum Test ini dimulai.");
    if (run.section.testType === TryoutTestType.cat) {
      const snapshot = catSnapshot(run.catSnapshot);
      if (!snapshot || run.catState !== TryoutCatRunState.ready) throw new TryoutAttemptValidationError("CAT gagal disiapkan dan tidak dapat dilanjutkan.");
      const first = nextCatItem(snapshot);
      if (!first) { await failCatRun(tx, run.id, "Pool CAT tidak memiliki item yang belum digunakan."); throw new TryoutAttemptValidationError("Pool CAT gagal dipilih."); }
      snapshot.selectedItemIds.push(first.itemId);
      await tx.tryoutAttemptTestRun.update({ where: { id: run.id }, data: { catSnapshot: json(snapshot) } });
    }
    const deadline = new Date(Math.min(now.getTime() + run.section.durationSeconds * 1000, attempt.deliverySession.availableUntil.getTime()));
    if (deadline <= now) { await expireForSessionCap(tx, attemptId, now); throw new TryoutAttemptValidationError("Waktu sesi Tryout sudah berakhir."); }
    const updated = await tx.tryoutAttemptTestRun.update({ where: { id: runId }, data: { serverDeadlineAt: deadline, serverStartedAt: now, status: TryoutAttemptTestRunStatus.active } });
    return { deadlineAt: deadline, remainingSeconds: remainingSeconds(deadline, now), run: { ...updated, contentSnapshot: redactRunSnapshot(updated.contentSnapshot, updated.catSnapshot) } };
  });
}

async function saveTryoutAnswer(attemptId: string, runId: string, tryoutItemId: string, selectedOptionId: string | null, studentId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.tryoutAttempt.findFirst({ where: { id: attemptId, studentId }, select: { id: true } });
    if (!attempt) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    await synchronizeAttempt(tx, attemptId, now);
    const run = await tx.tryoutAttemptTestRun.findFirst({ where: { id: runId, attemptId, status: TryoutAttemptTestRunStatus.active }, include: { section: { select: { catItemCount: true, testType: true, tryoutId: true } } } });
    if (!run) throw new TryoutAttemptValidationError("Hanya Test aktif yang dapat menyimpan jawaban.");
    const content = run.contentSnapshot as unknown as { items?: ItemSnapshot[] };
    const item = content.items?.find((candidate) => candidate.id === tryoutItemId);
    if (!item) throw new TryoutAttemptValidationError("Soal tidak termasuk dalam Test aktif.");
    const adaptive = catSnapshot(run.catSnapshot);
    if (run.section.testType === TryoutTestType.cat && (!adaptive || run.catState !== TryoutCatRunState.ready || adaptive.selectedItemIds.at(-1) !== tryoutItemId || adaptive.selectedItemIds.slice(0, -1).includes(tryoutItemId))) throw new TryoutAttemptValidationError("CAT hanya menerima jawaban untuk soal aktif berikutnya tanpa kembali ke soal sebelumnya.");
    if (selectedOptionId) {
      const option = item.options.find((candidate) => candidate.id === selectedOptionId);
      if (!option) throw new TryoutAttemptValidationError("Pilihan jawaban tidak termasuk dalam soal ini.");
    }
    const existingAnswer = await tx.tryoutAnswer.findUnique({ where: { attemptTestRunId_tryoutItemId: { attemptTestRunId: runId, tryoutItemId } } });
    if (existingAnswer && run.section.testType === TryoutTestType.cat) return { answerId: existingAnswer.id, remainingSeconds: remainingSeconds(run.serverDeadlineAt, now), savedAt: existingAnswer.answeredAt };
    const answer = await tx.tryoutAnswer.upsert({ where: { attemptTestRunId_tryoutItemId: { attemptTestRunId: runId, tryoutItemId } }, create: { answerText: null, answeredAt: now, attemptId, attemptTestRunId: runId, selectedOptionId, tryoutId: run.section.tryoutId, tryoutItemId }, update: { answeredAt: now, selectedOptionId } });
    if (run.section.testType === TryoutTestType.cat) {
      try {
        const parameter = adaptive!.parameters.find((candidate) => candidate.itemId === tryoutItemId);
        if (!parameter) throw new Error("Parameter item CAT hilang.");
        const correct = selectedOptionId ? item.options.find((option) => option.id === selectedOptionId)?.isCorrect === true : false;
        const abilityBefore = adaptive!.currentAbility;
        const probability = logistic(parameter.discrimination * (abilityBefore - parameter.difficulty));
        const abilityAfter = abilityBefore + (parameter.discrimination * ((correct ? 1 : 0) - probability)) / (1 + catInformation(parameter, abilityBefore));
        if (!Number.isFinite(abilityAfter)) throw new Error("Pembaruan kemampuan CAT tidak terbatas.");
        adaptive!.currentAbility = abilityAfter;
        adaptive!.updates.push({ abilityAfter, abilityBefore, itemId: tryoutItemId, probability, selectedOptionId });
        if (adaptive!.selectedItemIds.length < run.section.catItemCount!) {
          const next = nextCatItem(adaptive!);
          if (!next) throw new Error("Pool CAT habis sebelum jumlah item terpenuhi.");
          adaptive!.selectedItemIds.push(next.itemId);
        }
        await tx.tryoutAttemptTestRun.update({ where: { id: runId }, data: { catSnapshot: json(adaptive!) } });
        if (adaptive!.updates.length >= run.section.catItemCount!) await calculateAndSealRun(tx, runId, now);
      } catch (error) {
        await failCatRun(tx, runId, error instanceof Error ? error.message : "Perhitungan CAT gagal.");
        return { answerId: answer.id, calculationFailed: true, remainingSeconds: remainingSeconds(run.serverDeadlineAt, now), savedAt: answer.answeredAt };
      }
    }
    return { answerId: answer.id, remainingSeconds: remainingSeconds(run.serverDeadlineAt, now), savedAt: answer.answeredAt };
  });
}

async function sealTryoutTestRun(attemptId: string, runId: string, studentId: string) {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.tryoutAttempt.findFirst({ where: { id: attemptId, studentId }, select: { id: true } });
    if (!attempt) throw new TryoutAttemptValidationError("Attempt Tryout tidak ditemukan.");
    await synchronizeAttempt(tx, attemptId, new Date());
    const run = await tx.tryoutAttemptTestRun.findFirst({ where: { id: runId, attemptId }, select: { id: true, status: true } });
    if (!run) throw new TryoutAttemptValidationError("Test tidak ditemukan.");
    if (run.status === TryoutAttemptTestRunStatus.active) {
      const active = await tx.tryoutAttemptTestRun.findUniqueOrThrow({ where: { id: run.id }, include: { section: { select: { catItemCount: true, testType: true } } } });
      const snapshot = catSnapshot(active.catSnapshot);
      if (active.section.testType === TryoutTestType.cat && active.catState === TryoutCatRunState.ready && snapshot && snapshot.updates.length < (active.section.catItemCount ?? 0)) throw new TryoutAttemptValidationError("CAT hanya selesai setelah jumlah item tetap tercapai atau batas waktu server habis.");
      await calculateAndSealRun(tx, run.id, new Date());
    }
    const sealed = await tx.tryoutAttemptTestRun.findUniqueOrThrow({ where: { id: runId } });
    return { runId, status: sealed.status };
  });
}

function auditJson(value: unknown) { return value as Prisma.InputJsonValue; }
async function retryCatTestRun(runId: string, actorId: string, reason: string) {
  if (!reason.trim()) throw new TryoutAttemptValidationError("Alasan audit retry CAT wajib diisi.");
  return prisma.$transaction(async (tx) => {
    const run = await tx.tryoutAttemptTestRun.findUnique({ where: { id: runId }, include: { answers: { select: { id: true, selectedOptionId: true, tryoutItemId: true } }, section: { select: { testType: true } } } });
    if (!run || run.section.testType !== TryoutTestType.cat || run.catState === TryoutCatRunState.voided) throw new TryoutAttemptValidationError("Hanya run CAT gagal yang dapat dicoba ulang.");
    const before = { catFailureReason: run.catFailureReason, catState: run.catState };
    const snapshot = catSnapshot(run.catSnapshot);
    const content = run.contentSnapshot as unknown as { items?: ItemSnapshot[] };
    const scored = snapshot && Number.isFinite(snapshot.currentAbility)
      ? materializeFrozenAnswers(content.items ?? [], run.answers.map((answer) => ({ itemId: answer.tryoutItemId, selectedOptionId: answer.selectedOptionId })), snapshot.selectedItemIds)
      : null;
    if (!snapshot || !scored || scored.invalid || scored.normalizedScore === null) {
      await failCatRun(tx, runId, "Snapshot CAT tidak dapat dihitung ulang dari jawaban yang tersimpan.");
    } else {
      for (const answer of run.answers) {
        const materialized = scored.materializedAnswers.find((candidate) => candidate.itemId === answer.tryoutItemId);
        if (!materialized) continue;
        await tx.tryoutAnswer.update({ where: { id: answer.id }, data: { isCorrect: materialized.isCorrect, pointsAwarded: materialized.pointsAwarded, scoringVersion: TRYOUT_CAT_SCORING_VERSION } });
      }
      const normalizedScore = normalizeCatAbility(snapshot.currentAbility);
      await tx.tryoutAttemptTestRun.update({ where: { id: runId }, data: { calculationInput: json({ modelVersion: snapshot.modelVersion, parameters: snapshot.parameters, selectedItemIds: snapshot.selectedItemIds, updates: snapshot.updates }), calculationResult: json({ ability: snapshot.currentAbility, answeredCount: scored.answeredCount, correctCount: scored.correctCount, deliveredCount: snapshot.selectedItemIds.length, maxScore: scored.maxScore, normalizedScore, score: snapshot.currentAbility, unansweredCount: scored.unansweredCount, wrongCount: scored.wrongCount }), calculationVersion: TRYOUT_CAT_SCORING_VERSION, calculationReleaseable: true, catFailureReason: null, catState: TryoutCatRunState.ready, correctCount: scored.correctCount, maxScore: scored.maxScore, normalizedScore, rawScore: snapshot.currentAbility, scaledScore: normalizedScore, scoringProvenance: AssessmentScoringProvenance.runtime, scoringReviewReason: null, scoringState: AssessmentScoringState.scored, scoringVersion: TRYOUT_CAT_SCORING_VERSION, unansweredCount: scored.unansweredCount, wrongCount: scored.wrongCount } });
    }
    const updated = await tx.tryoutAttemptTestRun.findUniqueOrThrow({ where: { id: runId } });
    await markAttemptSubmittedIfComplete(tx, updated.attemptId, new Date());
    await tx.tryoutCatResolutionAudit.create({ data: { action: "retry", actorUserId: actorId, after: auditJson({ catFailureReason: updated.catFailureReason, catState: updated.catState }), before: auditJson(before), reason: reason.trim(), runId } });
    return { catState: updated.catState, releaseable: updated.calculationReleaseable, runId };
  });
}
async function voidCatTestRun(runId: string, actorId: string, reason: string) {
  if (!reason.trim()) throw new TryoutAttemptValidationError("Alasan audit void CAT wajib diisi.");
  return prisma.$transaction(async (tx) => {
    const run = await tx.tryoutAttemptTestRun.findUnique({ where: { id: runId }, include: { section: { select: { testType: true } } } });
    if (!run || run.section.testType !== TryoutTestType.cat) throw new TryoutAttemptValidationError("Hanya run CAT dapat divoid.");
    const updated = await tx.tryoutAttemptTestRun.update({ where: { id: runId }, data: { calculationReleaseable: false, catFailureReason: "Run CAT divoid oleh operator berwenang.", catState: TryoutCatRunState.voided, scoringProvenance: AssessmentScoringProvenance.runtime, scoringReviewReason: reason.trim(), scoringState: AssessmentScoringState.review_required } });
    await tx.tryoutAttempt.update({ where: { id: updated.attemptId }, data: { scoringProvenance: AssessmentScoringProvenance.runtime, scoringReviewReason: "Run CAT di-void oleh operator.", scoringState: AssessmentScoringState.review_required } });
    await tx.tryoutCatResolutionAudit.create({ data: { action: "void", actorUserId: actorId, after: auditJson({ catState: updated.catState }), before: auditJson({ catState: run.catState }), reason: reason.trim(), runId } });
    return { catState: updated.catState, releaseable: false, runId };
  });
}

export { attemptState, recordTryoutIntegrityEvent, retryCatTestRun, saveTryoutAnswer, sealTryoutTestRun, startActiveTestRun, startTryoutAttempt, TryoutAttemptValidationError, voidCatTestRun };
