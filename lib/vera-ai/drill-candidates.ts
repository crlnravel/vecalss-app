import "server-only";

import { Prisma, QuestionRevisionStatus, QuestionType } from "@/generated/prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

import { canonicalJson, sha256Hex } from "./contracts";

export type FrozenDrillCandidate = {
  sourceKind: "standalone_quiz" | "tryout";
  attemptId: string;
  assessmentItemId: string;
  assessmentReleaseDigest: string;
  questionId: string;
  questionRevisionId: string;
  questionRevisionDigest: string;
  topicId: string;
  difficulty: "easy" | "medium" | "hard";
  prompt: string;
  options: Array<{ key: string; content: string }>;
  answerReleaseState: "released";
  explanationReleaseState: "released" | "unavailable";
};

export type FrozenDrillAuthority = {
  version: "vera-drill-candidates-v1";
  candidates: FrozenDrillCandidate[];
  candidateSetDigest: string;
};

type StandaloneFormItem = {
  id: string;
  prompt: string;
  explanation: string | null;
  options: Array<{ key: string; content: string; isCorrect: boolean }>;
};

type TryoutFormItem = StandaloneFormItem & {
  sourceQuestionId: string;
  sourceQuestionRevisionId: string;
  sourceContentDigest: string;
  difficulty: "easy" | "medium" | "hard";
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseOptions(value: unknown): Array<{ key: string; content: string; isCorrect: boolean }> | null {
  if (!Array.isArray(value)) return null;
  const options = value.flatMap((entry) => {
    const row = record(entry);
    const key = typeof row?.choiceKey === "string" ? row.choiceKey : typeof row?.label === "string" ? row.label : null;
    if (!row || !key || typeof row.content !== "string" || typeof row.isCorrect !== "boolean") return [];
    return [{ key, content: row.content, isCorrect: row.isCorrect }];
  });
  if (options.length !== value.length || options.length < 2 || options.filter((option) => option.isCorrect).length !== 1) return null;
  return options;
}

function parseStandaloneSnapshot(value: Prisma.JsonValue | null): StandaloneFormItem[] | null {
  const root = record(value);
  if (root?.version !== 1 || !Array.isArray(root.items)) return null;
  const items = root.items.flatMap((entry) => {
    const row = record(entry);
    const options = parseOptions(row?.options);
    if (!row || typeof row.id !== "string" || typeof row.prompt !== "string" || (row.explanation !== null && typeof row.explanation !== "string") || !options) return [];
    return [{ id: row.id, prompt: row.prompt, explanation: row.explanation as string | null, options }];
  });
  return items.length === root.items.length && items.length > 0 ? items : null;
}

function parseTryoutItems(value: Prisma.JsonValue): TryoutFormItem[] | null {
  const root = record(value);
  if (!Array.isArray(root?.items)) return null;
  const items = root.items.flatMap((entry) => {
    const row = record(entry);
    const options = parseOptions(row?.options);
    if (!row || typeof row.id !== "string" || typeof row.prompt !== "string" || (row.explanation !== null && typeof row.explanation !== "string")
      || typeof row.sourceQuestionId !== "string" || typeof row.sourceQuestionRevisionId !== "string" || typeof row.sourceContentDigest !== "string"
      || !(["easy", "medium", "hard"] as unknown[]).includes(row.difficulty) || !options) return [{ invalid: true } as never];
    return [{
      id: row.id,
      prompt: row.prompt,
      explanation: row.explanation as string | null,
      options,
      sourceQuestionId: row.sourceQuestionId,
      sourceQuestionRevisionId: row.sourceQuestionRevisionId,
      sourceContentDigest: row.sourceContentDigest,
      difficulty: row.difficulty as "easy" | "medium" | "hard",
    }];
  });
  if (items.some((item) => !("sourceQuestionId" in item))) return null;
  return items;
}

async function standaloneCandidates(tx: Prisma.TransactionClient, studentId: string, attemptId: string): Promise<FrozenDrillCandidate[]> {
  const attempt = await tx.standaloneQuizAttempt.findFirst({
    where: { id: attemptId, status: "scored", scoringState: "scored", releaseState: "released", participation: { studentId } },
    include: {
      participation: {
        include: {
          quiz: {
            select: {
              id: true,
              status: true,
              items: {
                select: {
                  id: true,
                  difficulty: true,
                  sourceQuestionId: true,
                  sourceQuestionRevisionId: true,
                  sourceContentDigest: true,
                  sourceQuestionRevision: { select: { id: true, questionId: true, status: true, questionType: true, contentDigest: true, question: { select: { topicId: true } } } },
                },
              },
            },
          },
        },
      },
    },
  });
  const policy = record(attempt?.policySnapshot);
  const snapshot = attempt ? parseStandaloneSnapshot(attempt.formSnapshot) : null;
  if (!attempt || attempt.participation.quiz.status !== "published" || policy?.correctAnswerVisibility !== "show" || !snapshot) return [];
  const itemById = new Map(attempt.participation.quiz.items.map((item) => [item.id, item]));
  const assessmentReleaseDigest = sha256Hex(canonicalJson({ attemptId: attempt.id, formSnapshot: attempt.formSnapshot, policySnapshot: attempt.policySnapshot }));
  return snapshot.flatMap((frozen) => {
    const item = itemById.get(frozen.id);
    const revision = item?.sourceQuestionRevision;
    if (!item || !revision || !item.sourceQuestionId || !item.sourceQuestionRevisionId || !item.sourceContentDigest || !revision.question.topicId
      || !(["easy", "medium", "hard"] as unknown[]).includes(item.difficulty)
      || revision.status !== QuestionRevisionStatus.ready || revision.questionType !== QuestionType.single_choice
      || revision.questionId !== item.sourceQuestionId || revision.id !== item.sourceQuestionRevisionId || revision.contentDigest !== item.sourceContentDigest) return [];
    return [{
      sourceKind: "standalone_quiz" as const,
      attemptId: attempt.id,
      assessmentItemId: item.id,
      assessmentReleaseDigest,
      questionId: revision.questionId,
      questionRevisionId: revision.id,
      questionRevisionDigest: revision.contentDigest,
      topicId: revision.question.topicId,
      difficulty: item.difficulty as "easy" | "medium" | "hard",
      prompt: frozen.prompt,
      options: frozen.options.map(({ key, content }) => ({ key, content })),
      answerReleaseState: "released" as const,
      explanationReleaseState: policy.reviewTiming === "immediate" && Boolean(frozen.explanation?.trim()) ? "released" as const : "unavailable" as const,
    }];
  });
}

async function tryoutCandidates(tx: Prisma.TransactionClient, studentId: string, attemptId: string): Promise<FrozenDrillCandidate[]> {
  const attempt = await tx.tryoutAttempt.findFirst({
    where: { id: attemptId, studentId, status: "scored", scoringState: "scored", releaseState: "released", assessmentReleaseId: { not: null }, assessmentReleaseNumber: { not: null }, assessmentReleaseDigest: { not: null } },
    include: { runs: { where: { status: "sealed", scoringState: "scored", calculationReleaseable: true }, orderBy: { sequenceNo: "asc" } } },
  });
  if (!attempt || !attempt.assessmentReleaseId || attempt.assessmentReleaseNumber === null || !attempt.assessmentReleaseDigest || !attempt.runs.length) return [];
  const parsed = attempt.runs.flatMap((run) => {
    if (run.assessmentReleaseId !== attempt.assessmentReleaseId || run.assessmentReleaseNumber !== attempt.assessmentReleaseNumber || run.assessmentReleaseDigest !== attempt.assessmentReleaseDigest) return [];
    const items = parseTryoutItems(run.contentSnapshot);
    return items ? items.map((item) => ({ runId: run.id, item })) : [];
  });
  const itemIds = parsed.map(({ item }) => item.id);
  const rows = itemIds.length ? await tx.tryoutItem.findMany({
    where: { id: { in: itemIds }, tryoutId: attempt.tryoutId },
    select: {
      id: true,
      sourceQuestionId: true,
      sourceQuestionRevisionId: true,
      sourceContentDigest: true,
      sourceQuestionRevision: { select: { id: true, questionId: true, status: true, questionType: true, contentDigest: true, question: { select: { topicId: true } } } },
    },
  }) : [];
  const byId = new Map(rows.map((item) => [item.id, item]));
  return parsed.flatMap(({ item }) => {
    const row = byId.get(item.id);
    const revision = row?.sourceQuestionRevision;
    if (!row || !revision || !revision.question.topicId || row.sourceQuestionId !== item.sourceQuestionId || row.sourceQuestionRevisionId !== item.sourceQuestionRevisionId
      || row.sourceContentDigest !== item.sourceContentDigest || revision.id !== item.sourceQuestionRevisionId || revision.questionId !== item.sourceQuestionId
      || revision.contentDigest !== item.sourceContentDigest || revision.status !== QuestionRevisionStatus.ready || revision.questionType !== QuestionType.single_choice) return [];
    return [{
      sourceKind: "tryout" as const,
      attemptId: attempt.id,
      assessmentItemId: item.id,
      assessmentReleaseDigest: attempt.assessmentReleaseDigest!,
      questionId: revision.questionId,
      questionRevisionId: revision.id,
      questionRevisionDigest: revision.contentDigest,
      topicId: revision.question.topicId,
      difficulty: item.difficulty,
      prompt: item.prompt,
      options: item.options.map(({ key, content }) => ({ key, content })),
      answerReleaseState: "released" as const,
      explanationReleaseState: item.explanation?.trim() ? "released" as const : "unavailable" as const,
    }];
  });
}

async function candidatesForSource(tx: Prisma.TransactionClient, studentId: string, sourceId: string) {
  const standalone = await standaloneCandidates(tx, studentId, sourceId);
  return standalone.length ? standalone : tryoutCandidates(tx, studentId, sourceId);
}

export async function prepareFrozenDrillAuthority(
  db: typeof defaultPrisma,
  studentId: string,
  sourceIds: string[],
): Promise<FrozenDrillAuthority> {
  const uniqueSources = [...new Set(sourceIds)].sort();
  const candidates = await db.$transaction(async (tx) => {
    const resolved = (await Promise.all(uniqueSources.map((sourceId) => candidatesForSource(tx, studentId, sourceId)))).flat();
    return resolved
      .sort((left, right) => left.questionRevisionId.localeCompare(right.questionRevisionId) || left.attemptId.localeCompare(right.attemptId))
      .filter((candidate, index, all) => all.findIndex((other) => other.questionRevisionId === candidate.questionRevisionId) === index)
      .slice(0, 100);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  if (!candidates.length) throw new Error("drill_candidate_unavailable");
  return { version: "vera-drill-candidates-v1", candidates, candidateSetDigest: sha256Hex(canonicalJson(candidates)) };
}

export async function lockAndRevalidateDrillCandidates(
  tx: Prisma.TransactionClient,
  studentId: string,
  authority: FrozenDrillAuthority,
): Promise<Map<string, FrozenDrillCandidate & { correctOptionKey: string; explanation: string | null }>> {
  if (authority.version !== "vera-drill-candidates-v1" || authority.candidateSetDigest !== sha256Hex(canonicalJson(authority.candidates))) return new Map();
  const standaloneAttemptSet = new Set<string>();
  const tryoutAttemptSet = new Set<string>();
  const standaloneItemSet = new Set<string>();
  const tryoutItemSet = new Set<string>();
  const revisionSet = new Set<string>();
  for (const item of authority.candidates) {
    revisionSet.add(item.questionRevisionId);
    if (item.sourceKind === "standalone_quiz") {
      standaloneAttemptSet.add(item.attemptId);
      standaloneItemSet.add(item.assessmentItemId);
    } else if (item.sourceKind === "tryout") {
      tryoutAttemptSet.add(item.attemptId);
      tryoutItemSet.add(item.assessmentItemId);
    }
  }
  const standaloneAttemptIds = [...standaloneAttemptSet].sort();
  const tryoutAttemptIds = [...tryoutAttemptSet].sort();
  const standaloneItemIds = [...standaloneItemSet].sort();
  const tryoutItemIds = [...tryoutItemSet].sort();
  const revisionIds = [...revisionSet].sort();
  if (standaloneAttemptIds.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM standalone_quiz_attempts WHERE id IN (${Prisma.join(standaloneAttemptIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`);
  if (tryoutAttemptIds.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM tryout_attempts WHERE id IN (${Prisma.join(tryoutAttemptIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`);
  if (tryoutAttemptIds.length) await tx.$queryRaw(Prisma.sql`SELECT ar.id FROM assessment_releases ar JOIN tryout_attempts ta ON ta.assessment_release_id = ar.id WHERE ta.id IN (${Prisma.join(tryoutAttemptIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY ar.id FOR SHARE OF ar`);
  if (tryoutAttemptIds.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM tryout_attempt_test_runs WHERE attempt_id IN (${Prisma.join(tryoutAttemptIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`);
  if (standaloneItemIds.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM standalone_quiz_items WHERE id IN (${Prisma.join(standaloneItemIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`);
  if (tryoutItemIds.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM tryout_items WHERE id IN (${Prisma.join(tryoutItemIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`);
  if (revisionIds.length) await tx.$queryRaw(Prisma.sql`SELECT id FROM question_revisions WHERE id IN (${Prisma.join(revisionIds.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`);

  const sources = [...new Set(authority.candidates.map((item) => item.attemptId))].sort();
  const current = (await Promise.all(sources.map((sourceId) => candidatesForSource(tx, studentId, sourceId)))).flat();
  const currentByRevision = new Map(current.map((item) => [item.questionRevisionId, item]));
  const result = new Map<string, FrozenDrillCandidate & { correctOptionKey: string; explanation: string | null }>();
  const candidateResults = await Promise.all(
    authority.candidates.map(async (frozen) => {
      const resolved = currentByRevision.get(frozen.questionRevisionId);
      if (!resolved || sha256Hex(canonicalJson(resolved)) !== sha256Hex(canonicalJson(frozen))) {
        return null;
      }
      const source = frozen.sourceKind === "standalone_quiz"
        ? await tx.standaloneQuizAttempt.findUnique({ where: { id: frozen.attemptId }, select: { formSnapshot: true, policySnapshot: true } })
        : null;
      let correctOptionKey: string | null = null;
      let explanation: string | null = null;
      if (source) {
        const item = parseStandaloneSnapshot(source.formSnapshot)?.find((candidate) => candidate.id === frozen.assessmentItemId);
        correctOptionKey = item?.options.find((option) => option.isCorrect)?.key ?? null;
        explanation = frozen.explanationReleaseState === "released" ? item?.explanation ?? null : null;
      } else {
        const runs = await tx.tryoutAttemptTestRun.findMany({ where: { attemptId: frozen.attemptId }, orderBy: { sequenceNo: "asc" }, select: { contentSnapshot: true } });
        const item = runs.flatMap((run) => parseTryoutItems(run.contentSnapshot) ?? []).find((candidate) => candidate.id === frozen.assessmentItemId);
        correctOptionKey = item?.options.find((option) => option.isCorrect)?.key ?? null;
        explanation = frozen.explanationReleaseState === "released" ? item?.explanation ?? null : null;
      }
      if (correctOptionKey) {
        return { questionRevisionId: frozen.questionRevisionId, value: { ...frozen, correctOptionKey, explanation } };
      }
      return null;
    }),
  );

  for (const entry of candidateResults) {
    if (entry) {
      result.set(entry.questionRevisionId, entry.value);
    }
  }
  return result;
}
