import "server-only";

import { AttemptStatus, Prisma, TryoutAttemptTestRunStatus, TryoutAssignmentStatus, TryoutCatRunState, TryoutDeliverySessionStatus, TryoutIntegrityEventType, TryoutTestType } from "@/generated/prisma/client";
import { CANONICAL_2PL_MODEL_VERSION } from "@/lib/tryout/cat-profile";
import { normalizeCatAbility, normalizeCbtScore, TRYOUT_SCORE_AGGREGATION_VERSION } from "@/lib/tryout/scoring";
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
};
type CatParameter = { discrimination: number; difficulty: number; itemId: string; sortOrder: number };
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

async function calculateAndSealRun(tx: Prisma.TransactionClient, runId: string, now: Date, expired = false) {
  const run = await tx.tryoutAttemptTestRun.findUnique({
    where: { id: runId },
    include: { answers: { include: { selectedOption: { select: { isCorrect: true } } } }, section: { select: { scoringConfig: true, testType: true } } },
  });
  if (!run || run.status !== TryoutAttemptTestRunStatus.active) return run;
  if (run.section.testType === TryoutTestType.cat) return calculateAndSealCatRun(tx, run, now, expired);
  const content = run.contentSnapshot as unknown as { items?: ItemSnapshot[] };
  const items = content.items ?? [];
  const total = items.length;
  const pointsByItem = new Map(items.map((item) => [item.id, Number(item.points)]));
  const correctAnswers = run.answers.filter((answer) => answer.selectedOption?.isCorrect);
  const correct = correctAnswers.length;
  const score = correctAnswers.reduce((sum, answer) => sum + (pointsByItem.get(answer.tryoutItemId) ?? 0), 0);
  const maxScore = items.reduce((sum, item) => sum + Number(item.points), 0);
  const answered = run.answers.length;
  const result = { answeredCount: answered, correctCount: correct, maxScore, normalizedScore: normalizeCbtScore(score, maxScore), score, unansweredCount: total - answered, wrongCount: answered - correct };
  const sealed = await tx.tryoutAttemptTestRun.update({
    where: { id: run.id },
    data: {
      calculationInput: json({ answersAcknowledged: answered, scoringConfig: run.section.scoringConfig, totalItems: total }),
      calculationResult: json(result),
      calculationVersion: "cbt-frozen-item-points-v1",
      calculationReleaseable: true,
      sealedAt: now,
      status: expired ? TryoutAttemptTestRunStatus.expired : TryoutAttemptTestRunStatus.sealed,
    },
  });
  const remaining = await tx.tryoutAttemptTestRun.count({ where: { attemptId: sealed.attemptId, status: { in: [TryoutAttemptTestRunStatus.pending, TryoutAttemptTestRunStatus.active] } } });
  if (!remaining) await tx.tryoutAttempt.update({ where: { id: run.attemptId }, data: { status: AttemptStatus.submitted, submittedAt: now } });
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
  return tx.tryoutAttemptTestRun.update({ where: { id: runId }, data: { calculationReleaseable: false, catFailureReason: reason, catState: TryoutCatRunState.failed } });
}
async function calculateAndSealCatRun(tx: Prisma.TransactionClient, run: { id: string; attemptId: string; answers: Array<{ selectedOption: { isCorrect: boolean } | null }>; catSnapshot: Prisma.JsonValue | null; status: TryoutAttemptTestRunStatus }, now: Date, expired: boolean) {
  const snapshot = catSnapshot(run.catSnapshot);
  if (!snapshot || !Number.isFinite(snapshot.currentAbility)) {
    await failCatRun(tx, run.id, "Snapshot CAT tidak dapat dihitung ulang.");
    return tx.tryoutAttemptTestRun.update({ where: { id: run.id }, data: { sealedAt: now, status: expired ? TryoutAttemptTestRunStatus.expired : TryoutAttemptTestRunStatus.sealed } });
  }
  const current = catSnapshot(run.catSnapshot)!;
  const result = { answeredCount: run.answers.length, ability: current.currentAbility, deliveredCount: current.selectedItemIds.length, normalizedScore: normalizeCatAbility(current.currentAbility), score: current.currentAbility, unansweredCount: current.selectedItemIds.length - run.answers.length };
  const sealed = await tx.tryoutAttemptTestRun.update({ where: { id: run.id }, data: { calculationInput: json({ modelVersion: current.modelVersion, selectedItemIds: current.selectedItemIds, updates: current.updates }), calculationResult: json(result), calculationVersion: "2pl-map-v1", calculationReleaseable: true, catFailureReason: null, catState: TryoutCatRunState.ready, sealedAt: now, status: expired ? TryoutAttemptTestRunStatus.expired : TryoutAttemptTestRunStatus.sealed } });
  const remaining = await tx.tryoutAttemptTestRun.count({ where: { attemptId: sealed.attemptId, status: { in: [TryoutAttemptTestRunStatus.pending, TryoutAttemptTestRunStatus.active] } } });
  if (!remaining) await tx.tryoutAttempt.update({ where: { id: run.attemptId }, data: { status: AttemptStatus.submitted, submittedAt: now } });
  return sealed;
}

async function expireForSessionCap(tx: Prisma.TransactionClient, attemptId: string, now: Date) {
  const active = await tx.tryoutAttemptTestRun.findFirst({ where: { attemptId, status: TryoutAttemptTestRunStatus.active }, select: { id: true } });
  if (active) await calculateAndSealRun(tx, active.id, now, true);
  await tx.tryoutAttemptTestRun.updateMany({ where: { attemptId, status: TryoutAttemptTestRunStatus.pending }, data: { sealedAt: now, status: TryoutAttemptTestRunStatus.expired } });
  await tx.tryoutAttempt.update({ where: { id: attemptId }, data: { autoSubmittedAt: now, status: AttemptStatus.expired } });
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

function snapshotSection(section: { id: string; durationSeconds: number; instructions: string | null; scoringConfig: Prisma.JsonValue | null; testType: string; items: Array<{ difficulty: string; id: string; prompt: string; points: Prisma.Decimal; sortOrder: number; options: Array<{ id: string; choiceKey: string; content: string; isCorrect: boolean; sortOrder: number }> }> }) {
  return {
    durationSeconds: section.durationSeconds,
    instructions: section.instructions,
    items: section.items.map((item) => ({ difficulty: item.difficulty, id: item.id, options: item.options.map((option) => ({ choiceKey: option.choiceKey, content: option.content, id: option.id, isCorrect: option.isCorrect, sortOrder: option.sortOrder })), points: item.points.toString(), prompt: item.prompt, sortOrder: item.sortOrder })),
    scoringConfig: section.scoringConfig,
    sectionId: section.id,
    testType: section.testType,
  };
}

async function catRunSnapshot(tx: Prisma.TransactionClient, section: { catItemCount: number | null; catModelVersion: string | null; id: string; items: Array<{ id: string; sourceQuestionId: string | null; sortOrder: number }>; subtestId: string }) {
  if (!section.catItemCount || section.catModelVersion !== CANONICAL_2PL_MODEL_VERSION || section.items.length < section.catItemCount || section.items.some((item) => !item.sourceQuestionId)) throw new TryoutAttemptValidationError("Pool CAT immutable tidak lengkap atau tidak memakai profil 2PL kanonis.");
  const calibrations = await tx.twoPlQuestionCalibration.findMany({ where: { approvalState: "approved", modelVersion: CANONICAL_2PL_MODEL_VERSION, questionId: { in: section.items.map((item) => item.sourceQuestionId!) } }, select: { difficulty: true, discrimination: true, questionId: true } });
  if (calibrations.length !== section.items.length) throw new TryoutAttemptValidationError("Pool CAT memiliki parameter 2PL kanonis yang belum disetujui.");
  const calibrationByQuestion = new Map(calibrations.map((calibration) => [calibration.questionId, calibration]));
  const parameters = section.items.map((item) => { const calibration = calibrationByQuestion.get(item.sourceQuestionId!); if (!calibration) throw new TryoutAttemptValidationError("Parameter CAT tidak ditemukan."); return { discrimination: Number(calibration.discrimination), difficulty: Number(calibration.difficulty), itemId: item.id, sortOrder: item.sortOrder }; });
  return { currentAbility: 0, initialAbility: 0, modelVersion: CANONICAL_2PL_MODEL_VERSION, parameters, selectedItemIds: [], updates: [] } satisfies CatSnapshot;
}

async function startTryoutAttempt(deliverySessionId: string, studentId: string) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
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
        contentSnapshot: json({ tryoutId: session.tryoutId, tryoutRevision: lockedTryout.revision }),
        deliverySessionId,
        releasePolicySnapshot: json({ aggregationVersion: TRYOUT_SCORE_AGGREGATION_VERSION, rankingRule: session.rankingRule, resultReleasePolicy: session.resultReleasePolicy, scheduledReleaseAt: session.scheduledReleaseAt?.toISOString() ?? null }),
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
    const item = await tx.tryoutItem.findFirst({ where: { id: tryoutItemId, tryoutSectionId: run.tryoutSectionId }, select: { id: true } });
    if (!item) throw new TryoutAttemptValidationError("Soal tidak termasuk dalam Test aktif.");
    const adaptive = catSnapshot(run.catSnapshot);
    if (run.section.testType === TryoutTestType.cat && (!adaptive || run.catState !== TryoutCatRunState.ready || adaptive.selectedItemIds.at(-1) !== tryoutItemId || adaptive.selectedItemIds.slice(0, -1).includes(tryoutItemId))) throw new TryoutAttemptValidationError("CAT hanya menerima jawaban untuk soal aktif berikutnya tanpa kembali ke soal sebelumnya.");
    if (selectedOptionId) {
      const option = await tx.tryoutItemOption.findFirst({ where: { id: selectedOptionId, tryoutItemId }, select: { id: true } });
      if (!option) throw new TryoutAttemptValidationError("Pilihan jawaban tidak termasuk dalam soal ini.");
    }
    const existingAnswer = await tx.tryoutAnswer.findUnique({ where: { attemptTestRunId_tryoutItemId: { attemptTestRunId: runId, tryoutItemId } } });
    if (existingAnswer && run.section.testType === TryoutTestType.cat) return { answerId: existingAnswer.id, remainingSeconds: remainingSeconds(run.serverDeadlineAt, now), savedAt: existingAnswer.answeredAt };
    const answer = await tx.tryoutAnswer.upsert({ where: { attemptTestRunId_tryoutItemId: { attemptTestRunId: runId, tryoutItemId } }, create: { answerText: null, answeredAt: now, attemptId, attemptTestRunId: runId, selectedOptionId, tryoutId: run.section.tryoutId, tryoutItemId }, update: { answeredAt: now, selectedOptionId } });
    if (run.section.testType === TryoutTestType.cat) {
      try {
        const parameter = adaptive!.parameters.find((candidate) => candidate.itemId === tryoutItemId);
        if (!parameter) throw new Error("Parameter item CAT hilang.");
        const correct = selectedOptionId ? Boolean((await tx.tryoutItemOption.findUnique({ where: { id: selectedOptionId }, select: { isCorrect: true } }))?.isCorrect) : false;
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
    const run = await tx.tryoutAttemptTestRun.findUnique({ where: { id: runId }, include: { answers: { include: { selectedOption: { select: { isCorrect: true } } } }, section: { select: { testType: true } } } });
    if (!run || run.section.testType !== TryoutTestType.cat || run.catState === TryoutCatRunState.voided) throw new TryoutAttemptValidationError("Hanya run CAT gagal yang dapat dicoba ulang.");
    const before = { catFailureReason: run.catFailureReason, catState: run.catState };
    const snapshot = catSnapshot(run.catSnapshot);
    if (!snapshot || !Number.isFinite(snapshot.currentAbility)) { await failCatRun(tx, runId, "Snapshot CAT tidak dapat dihitung ulang."); }
    else await tx.tryoutAttemptTestRun.update({ where: { id: runId }, data: { calculationInput: json({ modelVersion: snapshot.modelVersion, selectedItemIds: snapshot.selectedItemIds, updates: snapshot.updates }), calculationResult: json({ ability: snapshot.currentAbility, answeredCount: run.answers.length, deliveredCount: snapshot.selectedItemIds.length, normalizedScore: normalizeCatAbility(snapshot.currentAbility), score: snapshot.currentAbility }), calculationVersion: "2pl-map-v1", calculationReleaseable: true, catFailureReason: null, catState: TryoutCatRunState.ready } });
    const updated = await tx.tryoutAttemptTestRun.findUniqueOrThrow({ where: { id: runId } });
    await tx.tryoutCatResolutionAudit.create({ data: { action: "retry", actorUserId: actorId, after: auditJson({ catFailureReason: updated.catFailureReason, catState: updated.catState }), before: auditJson(before), reason: reason.trim(), runId } });
    return { catState: updated.catState, releaseable: updated.calculationReleaseable, runId };
  });
}
async function voidCatTestRun(runId: string, actorId: string, reason: string) {
  if (!reason.trim()) throw new TryoutAttemptValidationError("Alasan audit void CAT wajib diisi.");
  return prisma.$transaction(async (tx) => {
    const run = await tx.tryoutAttemptTestRun.findUnique({ where: { id: runId }, include: { section: { select: { testType: true } } } });
    if (!run || run.section.testType !== TryoutTestType.cat) throw new TryoutAttemptValidationError("Hanya run CAT dapat divoid.");
    const updated = await tx.tryoutAttemptTestRun.update({ where: { id: runId }, data: { calculationReleaseable: false, catFailureReason: "Run CAT divoid oleh operator berwenang.", catState: TryoutCatRunState.voided } });
    await tx.tryoutCatResolutionAudit.create({ data: { action: "void", actorUserId: actorId, after: auditJson({ catState: updated.catState }), before: auditJson({ catState: run.catState }), reason: reason.trim(), runId } });
    return { catState: updated.catState, releaseable: false, runId };
  });
}

export { attemptState, recordTryoutIntegrityEvent, retryCatTestRun, saveTryoutAnswer, sealTryoutTestRun, startActiveTestRun, startTryoutAttempt, TryoutAttemptValidationError, voidCatTestRun };
