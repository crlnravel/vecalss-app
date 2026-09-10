import "server-only";

import { AssessmentAttemptState, AssessmentResultReleaseState, AssessmentScoringProvenance, AssessmentScoringState, ContentStatus, DifficultyLevel, Prisma, QuestionBankPurpose, QuestionRevisionStatus, QuestionType, ReusableQuestionPackageMode, StandaloneQuizAnswerFormat } from "@/generated/prisma/client";
import { decodeLegacyAnswerSelection, evaluateExactAnswer, validateAnswerKey, validateSelectedOptionIds, type QuestionAnswerMode } from "@/lib/question-bank/answer-contract";
import { prisma } from "@/lib/prisma";
import { resolveReadyAssemblyForKuis, type KuisAssemblyMaterialization } from "@/lib/tryout/assembly-repository";
import { AssemblyValidationError } from "@/lib/tryout/assembly-validation";
import type { KaptenQuiz } from "@/modules/mentor/mock-data";
import type {
  QuizCorrectAnswerVisibility,
  QuizFormBehavior,
  QuizQuestionSnapshot,
  QuizQuestionSourceUpdate,
  QuizReviewTiming,
  QuizScorePolicy,
} from "@/modules/mentor/quiz-builder-types";

const subjectMetadata = [
  { code: "PU", description: "Penalaran umum dan logika argumen.", name: "Penalaran Umum", slug: "penalaran-umum" },
  { code: "PPU", description: "Pengetahuan dan pemahaman umum.", name: "Pengetahuan dan Pemahaman Umum", slug: "pengetahuan-pemahaman-umum" },
  { code: "PBM", description: "Pemahaman bacaan dan menulis.", name: "Pemahaman Bacaan dan Menulis", slug: "pemahaman-bacaan-menulis" },
  { code: "PK", description: "Pengetahuan kuantitatif dan numerasi.", name: "Pengetahuan Kuantitatif", slug: "pengetahuan-kuantitatif" },
  { code: "LBI", description: "Literasi dalam Bahasa Indonesia.", name: "Literasi Bahasa Indonesia", slug: "literasi-bahasa-indonesia" },
  { code: "LBE", description: "Literasi dalam Bahasa Inggris.", name: "Literasi Bahasa Inggris", slug: "literasi-bahasa-inggris" },
  { code: "PM", description: "Penalaran matematika dan pemecahan masalah.", name: "Penalaran Matematika", slug: "penalaran-matematika" },
] as const;

type SaveStandaloneQuizInput = {
  assemblyVersionId?: string | null;
  attemptsAllowed?: number | null;
  closesAt: string;
  correctAnswerVisibility?: QuizCorrectAnswerVisibility;
  description: string;
  formBehavior?: QuizFormBehavior;
  id?: string;
  opensAt: string;
  questions: QuizQuestionSnapshot[];
  retryDelaySeconds?: number | null;
  reviewTiming?: QuizReviewTiming;
  scorePolicy?: QuizScorePolicy;
  /** The source mode is a command discriminator. Lineage is always read from the database. */
  sourceMode?: "local" | "bank";
  sourceBankId?: string | null;
  status: "draft" | "published";
  subjectCode: string;
  title: string;
};
type StandaloneQuizAssemblySummary = {
  bankId: string;
  bankName: string;
  categoryIds: string[];
  categoryNames: string[];
  definitionDigest: string;
  folderIds: string[];
  folderNames: string[];
  mode: "fixed_set" | "random_pool" | "blueprint";
  packageId: string;
  packageTitle: string;
  readyAt: string | null;
  rule: { easyCount: number; hardCount: number; mediumCount: number; requestedCount: number } | null;
  subtestCode: string;
  versionId: string;
  versionNo: number;
};
class QuizValidationError extends Error {}
const KUIS_SCORING_VERSION = "kuis-frozen-form-v1";
const quizInclude = {
  assemblyPackageVersion: {
    include: {
      bankScopes: { include: { questionBank: { select: { id: true, name: true, purpose: true } } }, orderBy: { questionBankId: "asc" as const } },
      categoryScopes: { include: { category: { select: { id: true, name: true } } }, orderBy: { categoryId: "asc" as const } },
      folderScopes: { include: { folder: { select: { id: true, name: true } } }, orderBy: { folderId: "asc" as const } },
      package: { select: { id: true, title: true } },
      rule: true,
      subtest: { select: { code: true, id: true } },
    },
  },
  items: { include: { options: { orderBy: { sortOrder: "asc" as const } } }, orderBy: { sortOrder: "asc" as const } },
  sourceBank: { select: { id: true, name: true, purpose: true, status: true } },
  subtest: true,
} satisfies Prisma.StandaloneQuizInclude;
const quizContentInclude = {
  items: { include: { options: { orderBy: { sortOrder: "asc" as const } } }, orderBy: { sortOrder: "asc" as const } },
  subtest: true,
} satisfies Prisma.StandaloneQuizInclude;

const scorePolicies = ["highest", "latest", "first", "average"] as const;
const formBehaviors = ["same", "fresh_randomized"] as const;
const reviewTimings = ["immediate", "after_close", "never"] as const;
const correctAnswerVisibilities = ["show", "hide"] as const;

function isOneOf<T extends string>(value: string, values: readonly T[]): value is T {
  return values.includes(value as T);
}

function normalizeQuizPolicy(input: Pick<SaveStandaloneQuizInput, "attemptsAllowed" | "correctAnswerVisibility" | "formBehavior" | "retryDelaySeconds" | "reviewTiming" | "scorePolicy">) {
  if (input.attemptsAllowed !== undefined && input.attemptsAllowed !== null && (!Number.isInteger(input.attemptsAllowed) || input.attemptsAllowed < 1)) {
    throw new QuizValidationError("Jumlah percobaan harus bilangan bulat positif atau dikosongkan untuk tanpa batas.");
  }
  if (input.retryDelaySeconds !== undefined && input.retryDelaySeconds !== null && (!Number.isInteger(input.retryDelaySeconds) || input.retryDelaySeconds < 0)) {
    throw new QuizValidationError("Jeda percobaan tidak valid.");
  }
  if (input.scorePolicy !== undefined && !isOneOf(input.scorePolicy, scorePolicies)) throw new QuizValidationError("Kebijakan skor tidak valid.");
  if (input.formBehavior !== undefined && !isOneOf(input.formBehavior, formBehaviors)) throw new QuizValidationError("Bentuk soal percobaan tidak valid.");
  if (input.reviewTiming !== undefined && !isOneOf(input.reviewTiming, reviewTimings)) throw new QuizValidationError("Waktu review tidak valid.");
  if (input.correctAnswerVisibility !== undefined && !isOneOf(input.correctAnswerVisibility, correctAnswerVisibilities)) throw new QuizValidationError("Visibilitas jawaban benar tidak valid.");

  return {
    attemptsAllowed: input.attemptsAllowed,
    correctAnswerVisibility: input.correctAnswerVisibility,
    formBehavior: input.formBehavior,
    retryDelaySeconds: input.retryDelaySeconds,
    reviewTiming: input.reviewTiming,
    scorePolicy: input.scorePolicy,
  };
}

function getSubjectMetadata(code: string) { return subjectMetadata.find((subject) => subject.code === code) ?? null; }
function getSubjectMetadataBySlug(slug: string) { return subjectMetadata.find((subject) => subject.slug === slug) ?? null; }
function getStandaloneQuizSubjects() { return subjectMetadata; }
function parseOptionalDate(value: string, name: string) { if (!value) return null; const date = new Date(value); if (Number.isNaN(date.getTime())) throw new QuizValidationError(`${name} tidak valid.`); return date; }
function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "quiz"; }
function isReadyAsset(asset: { state: string } | null) { return !asset || asset.state === "ready"; }

function answerModeForQuestionType(value: QuestionType | string | null | undefined): QuestionAnswerMode | null {
  if (value === QuestionType.multiple_choice || value === "multiple_choice") return "multiple_choice";
  if (value === QuestionType.single_choice || value === "single_choice" || value === null || value === undefined) return "single_choice";
  return null;
}

function correctChoiceIdsFromOptions(options: readonly { choiceKey: string; isCorrect: boolean }[]) {
  return options.filter((option) => option.isCorrect).map((option) => option.choiceKey);
}

function jsonStringArray(value: Prisma.JsonValue | null | undefined): string[] | null {
  return Array.isArray(value) && value.every((item): item is string => typeof item === "string") ? [...value] : null;
}

function storedAnswerSelectionIds(answer: { selectedOptionId: string | null; selectedOptionIds: Prisma.JsonValue | null }) {
  const decoded = decodeLegacyAnswerSelection({
    selectedOptionId: answer.selectedOptionId,
    selectedOptionIds: jsonStringArray(answer.selectedOptionIds),
  });
  return decoded.ok ? decoded.selectedOptionIds : null;
}

const quizSourceInclude = {
  currentRevision: { include: { explanationAsset: true, options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } }, promptAsset: true } },
  explanationAsset: true,
  options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } },
  promptAsset: true,
  questionBank: { select: { purpose: true, status: true } },
  subtest: true,
} satisfies Prisma.QuestionInclude;

function assertReadyBankSources(
  sources: Prisma.QuestionGetPayload<{ include: typeof quizSourceInclude }>[],
  subtestCode: string,
  sourceBankId: string,
  expectedPurpose: QuestionBankPurpose = QuestionBankPurpose.quiz,
) {
  if (!sources.length || sources.some((source) => {
    const revision = source.currentRevision;
    const options = revision?.options ?? source.options;
    const answerMode = answerModeForQuestionType(revision?.questionType ?? source.questionType);
    const answerKey = answerMode
      ? validateAnswerKey(answerMode, options.map((option) => ({ id: option.label, isCorrect: option.isCorrect })))
      : null;
    return source.questionBankId !== sourceBankId
      || source.questionBank?.purpose !== expectedPurpose
      || source.questionBank?.status === ContentStatus.archived
      || source.questionBank?.status !== ContentStatus.published
      || source.status === ContentStatus.archived
      || source.status !== ContentStatus.published
      || revision?.status !== QuestionRevisionStatus.ready
      || source.subtest?.code !== subtestCode
      || options.length < 2
      || options.length > 5
      || !answerKey?.ok
      || options.some((option) => !option.content.trim() || !isReadyAsset(option.asset))
      || !revision?.stem.trim()
      || !isReadyAsset(revision?.promptAsset ?? null)
      || !isReadyAsset(revision?.explanationAsset ?? null);
  })) {
    throw new QuizValidationError("Quiz hanya dapat memakai soal siap dari satu Bank yang aktif, dengan media siap dan Subtest yang sama.");
  }
}

function toSnapshot(item: Prisma.StandaloneQuizItemGetPayload<{ include: { options: true } }>): QuizQuestionSnapshot {
  const correctChoiceIds = correctChoiceIdsFromOptions(item.options);
  return { choices: item.options.map((option) => ({ id: option.choiceKey, mediaAssetId: option.assetId ?? undefined, text: option.content })), correctChoiceId: correctChoiceIds[0] ?? "", correctChoiceIds, explanation: item.explanation ?? "", explanationMediaAssetId: item.explanationAssetId ?? undefined, id: item.id, origin: item.sourceQuestionId ? "bank" : "local", prompt: item.prompt, promptMediaAssetId: item.promptAssetId ?? undefined, questionType: answerModeForQuestionType(item.questionType) ?? "single_choice", sourceContentDigest: item.sourceContentDigest ?? undefined, sourceQuestionId: item.sourceQuestionId ?? undefined, sourceQuestionRevisionId: item.sourceQuestionRevisionId ?? undefined, sourceRevisionProvenance: item.sourceRevisionProvenance ?? undefined };
}

type QuizBankImportSelection = {
  contentDigest?: string | null;
  questionId: string;
  revisionId?: string | null;
};

type QuizBankSourceRecord = Prisma.QuestionGetPayload<{ include: typeof quizSourceInclude }>;

function materializedQuizQuestion(source: QuizBankSourceRecord) {
  const revision = source.currentRevision;
  if (!revision) throw new QuizValidationError("Soal Bank tidak memiliki revisi aktif.");
  if (!source.subtestId) throw new QuizValidationError("Soal Bank tidak memiliki Subtest.");
  return {
    difficulty: revision.difficulty,
    explanation: revision.explanation,
    explanationAssetId: revision.explanationAssetId,
    questionType: revision.questionType,
    options: revision.options.map((option, index) => ({
      assetId: option.assetId,
      choiceKey: option.label || String.fromCharCode(65 + index),
      content: option.content,
      isCorrect: option.isCorrect,
      sortOrder: index,
      sourceQuestionRevisionOptionId: option.id,
    })),
    prompt: revision.stem,
    promptAssetId: revision.promptAssetId,
    sourceContentDigest: revision.contentDigest,
    sourceQuestionId: source.id,
    sourceQuestionRevisionId: revision.id,
    sourceRevisionProvenance: revision.provenance,
    subtestId: source.subtestId,
  };
}

function latestReadySourceUpdate(
  source: QuizBankSourceRecord,
  expectedSubtestCode: string,
): QuizQuestionSourceUpdate | null {
  const revision = source.currentRevision;
  if (!revision
    || source.questionBank?.purpose !== QuestionBankPurpose.quiz
    || source.questionBank.status !== ContentStatus.published
    || source.status !== ContentStatus.published
    || source.subtest?.code !== expectedSubtestCode
    || revision.status !== QuestionRevisionStatus.ready
    || !revision.stem.trim()
    || revision.options.length < 2
    || revision.options.length > 5
    || revision.options.some((option) => !option.content.trim() || !isReadyAsset(option.asset))
    || !isReadyAsset(revision.promptAsset)
    || !isReadyAsset(revision.explanationAsset)) {
    return null;
  }
  const answerMode = answerModeForQuestionType(revision.questionType);
  if (!answerMode) return null;
  const choices = revision.options.map((option, index) => ({
    id: option.label || String.fromCharCode(65 + index),
    mediaAssetId: option.assetId ?? undefined,
    text: option.content,
  }));
  const correctChoiceIds = choices.filter((_, index) => revision.options[index]?.isCorrect).map((choice) => choice.id);
  const answerKey = validateAnswerKey(answerMode, choices.map((choice) => ({ id: choice.id, isCorrect: correctChoiceIds.includes(choice.id) })));
  if (!answerKey.ok) return null;
  return {
    choices,
    correctChoiceId: correctChoiceIds[0] ?? "",
    correctChoiceIds,
    explanation: revision.explanation ?? "",
    explanationMediaAssetId: revision.explanationAssetId ?? undefined,
    prompt: revision.stem,
    promptMediaAssetId: revision.promptAssetId ?? undefined,
    questionType: answerMode,
    revisionNo: revision.revisionNo,
    sourceContentDigest: revision.contentDigest,
    sourceQuestionRevisionId: revision.id,
    sourceRevisionProvenance: revision.provenance as QuizQuestionSourceUpdate["sourceRevisionProvenance"],
  };
}

async function getQuizQuestionsWithSourceUpdates(
  items: Array<Prisma.StandaloneQuizItemGetPayload<{ include: { options: true } }>>,
  subtestCode: string,
) {
  const sourceQuestionIds = [...new Set(items.map((item) => item.sourceQuestionId).filter((id): id is string => Boolean(id)))];
  if (!sourceQuestionIds.length) return items.map(toSnapshot);
  const sources = await prisma.question.findMany({
    where: { id: { in: sourceQuestionIds } },
    include: quizSourceInclude,
  });
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return items.map((item) => {
    const snapshot = toSnapshot(item);
    if (!item.sourceQuestionId
      || !item.sourceQuestionRevisionId
      || !item.sourceContentDigest
      || item.sourceRevisionProvenance === "legacy_unknown") {
      return snapshot;
    }
    const source = sourceById.get(item.sourceQuestionId);
    const revision = source?.currentRevision;
    if (!revision
      || (revision.id === item.sourceQuestionRevisionId && revision.contentDigest === item.sourceContentDigest)) {
      return snapshot;
    }
    const sourceUpdate = source ? latestReadySourceUpdate(source, subtestCode) : null;
    return sourceUpdate ? { ...snapshot, sourceUpdate } : snapshot;
  });
}

async function readReadyQuizBankSources(
  tx: Prisma.TransactionClient,
  input: {
    bankId: string;
    expectedSources?: readonly QuizBankImportSelection[];
    questionIds: readonly string[];
    subtestCode: string;
  },
) {
  const questionIds = [...new Set(input.questionIds)];
  if (!questionIds.length) throw new QuizValidationError("Pilih minimal satu soal dari Bank Soal Kuis.");
  if (questionIds.some((questionId) => !questionId.trim())) throw new QuizValidationError("Identitas soal Bank tidak valid.");

  // Lock the source identity and its current revision while the snapshot is
  // assembled. The copied rows below are authoritative even if the Bank is
  // subsequently edited, unpublished, archived, or removed from the picker.
  await tx.$queryRaw`
    SELECT q.id
    FROM questions q
    JOIN question_banks b ON b.id = q.question_bank_id
    JOIN question_revisions r ON r.id = q.current_revision_id
    WHERE q.id IN (${Prisma.join(questionIds)})
      AND q.question_bank_id = ${input.bankId}::uuid
      AND b.purpose = 'quiz'
      AND b.status = 'published'
      AND q.status = 'published'
      AND r.status = 'ready'
    ORDER BY q.id
    FOR SHARE OF q, b, r
  `;
  const sources = await tx.question.findMany({
    where: {
      id: { in: questionIds },
      questionBankId: input.bankId,
      subtest: { code: input.subtestCode },
    },
    include: quizSourceInclude,
  });
  if (sources.length !== questionIds.length) throw new QuizValidationError("Sebagian soal Kuis tidak lagi tersedia atau belum siap.");
  assertReadyBankSources(sources, input.subtestCode, input.bankId, QuestionBankPurpose.quiz);

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  if (input.expectedSources) {
    const expectedById = new Map(input.expectedSources.map((expected) => [expected.questionId, expected]));
    if (expectedById.size !== questionIds.length || expectedById.size !== input.expectedSources.length) {
      throw new QuizValidationError("Daftar ekspektasi revisi soal tidak lengkap. Muat ulang Bank Soal lalu coba lagi.");
    }
    for (const questionId of questionIds) {
      const expected = expectedById.get(questionId);
      const source = sourceById.get(questionId);
      if (!expected || !source?.currentRevision
        || (expected.revisionId && expected.revisionId !== source.currentRevision.id)
        || (expected.contentDigest && expected.contentDigest !== source.currentRevision.contentDigest)) {
        throw new QuizValidationError("Bank Soal Kuis telah berubah. Muat ulang soal sebelum mengimpornya.");
      }
    }
  }
  return questionIds.map((questionId) => {
    const source = sourceById.get(questionId);
    if (!source) throw new QuizValidationError("Soal Bank tidak ditemukan.");
    return materializedQuizQuestion(source);
  });
}

function snapshotsFromAssembly(materialization: KuisAssemblyMaterialization): QuizQuestionSnapshot[] {
  return materialization.items.map((item, index) => ({
    choices: item.options.map((option) => ({ assetId: option.assetId ?? undefined, id: option.choiceKey, text: option.content })),
    correctChoiceId: item.options.find((option) => option.isCorrect)?.choiceKey ?? "",
    correctChoiceIds: correctChoiceIdsFromOptions(item.options),
    explanation: item.explanation ?? "",
    explanationMediaAssetId: item.explanationAssetId ?? undefined,
    id: `assembly-${materialization.assemblyPackageVersionId}-${index + 1}`,
    origin: "bank",
    prompt: item.prompt,
    promptMediaAssetId: item.promptAssetId ?? undefined,
    questionType: answerModeForQuestionType(item.questionType) ?? "single_choice",
    sourceContentDigest: item.sourceContentDigest,
    sourceQuestionId: item.sourceQuestionId,
    sourceQuestionRevisionId: item.sourceQuestionRevisionId,
    sourceRevisionProvenance: item.sourceRevisionProvenance,
  }));
}

function assertAssemblyItemsMatch(
  items: Prisma.StandaloneQuizItemGetPayload<{ include: { options: true } }>[],
  materialization: KuisAssemblyMaterialization,
) {
  if (items.length !== materialization.items.length) {
    throw new QuizValidationError("Snapshot Kuis tidak lagi cocok dengan assembly Ready. Muat ulang sebelum melanjutkan.");
  }
  for (const [index, item] of items.entries()) {
    const expected = materialization.items[index];
    if (!expected
      || item.difficulty !== expected.difficulty
      || item.sourceQuestionId !== expected.sourceQuestionId
      || item.sourceQuestionRevisionId !== expected.sourceQuestionRevisionId
      || item.sourceContentDigest !== expected.sourceContentDigest
      || item.sourceRevisionProvenance !== expected.sourceRevisionProvenance
      || item.subtestId !== expected.subtestId
      || answerModeForQuestionType(item.questionType) !== answerModeForQuestionType(expected.questionType)
      || item.prompt !== expected.prompt
      || item.promptAssetId !== expected.promptAssetId
      || item.explanation !== expected.explanation
      || item.explanationAssetId !== expected.explanationAssetId
      || item.options.length !== expected.options.length
      || item.options.some((option, optionIndex) => {
        const expectedOption = expected.options[optionIndex];
        return !expectedOption
          || option.choiceKey !== expectedOption.choiceKey
          || option.content !== expectedOption.content
          || option.isCorrect !== expectedOption.isCorrect
          || option.assetId !== expectedOption.assetId
          || option.sortOrder !== expectedOption.sortOrder
          || option.sourceQuestionRevisionOptionId !== expectedOption.sourceQuestionRevisionOptionId;
      })) {
      throw new QuizValidationError("Snapshot Kuis tidak lagi cocok dengan assembly Ready. Muat ulang sebelum melanjutkan.");
    }
  }
}

function toKaptenQuiz(record: Prisma.StandaloneQuizGetPayload<{ include: typeof quizInclude }> | Prisma.StandaloneQuizGetPayload<{ include: typeof quizContentInclude }>): KaptenQuiz {
  // The mentor detail/editor path intentionally reads only Kuis-owned content.
  // Full relation data remains available to legacy lifecycle/release helpers.
  const relationRecord = record as Prisma.StandaloneQuizGetPayload<{ include: typeof quizInclude }>;
  const subject = getSubjectMetadata(record.subtest.code);
  const assemblyVersion = relationRecord.assemblyPackageVersion;
  const assembly = assemblyVersion && relationRecord.assemblyMode && relationRecord.assemblyMode !== ReusableQuestionPackageMode.cat_pool && relationRecord.assemblyDefinitionDigest
    ? {
      bankId: assemblyVersion.bankScopes[0]?.questionBank.id ?? relationRecord.sourceBankId ?? "",
      bankName: assemblyVersion.bankScopes[0]?.questionBank.name ?? relationRecord.sourceBank?.name ?? "",
      categoryIds: assemblyVersion.categoryScopes.map((scope) => scope.categoryId),
      categoryNames: assemblyVersion.categoryScopes.map((scope) => scope.category.name),
      definitionDigest: relationRecord.assemblyDefinitionDigest,
      folderIds: assemblyVersion.folderScopes.map((scope) => scope.folderId),
      folderNames: assemblyVersion.folderScopes.map((scope) => scope.folder.name),
      mode: relationRecord.assemblyMode as "fixed_set" | "random_pool" | "blueprint",
      packageId: assemblyVersion.package.id,
      packageTitle: assemblyVersion.package.title,
      readyAt: assemblyVersion.readyAt?.toISOString() ?? null,
      rule: assemblyVersion.rule
        ? {
          easyCount: assemblyVersion.rule.easyCount,
          hardCount: assemblyVersion.rule.hardCount,
          mediumCount: assemblyVersion.rule.mediumCount,
          requestedCount: assemblyVersion.rule.requestedCount,
        }
        : null,
      subtestCode: assemblyVersion.subtest?.code ?? record.subtest.code,
      versionId: assemblyVersion.id,
      versionNo: assemblyVersion.versionNo,
    }
    : null;
  return { assembly, attemptsAllowed: record.attemptsAllowed, closesAt: record.closesAt?.toISOString().slice(0, 16), correctAnswerVisibility: record.correctAnswerVisibility, description: record.description ?? "", formBehavior: record.formBehavior, href: `/mentor/quiz/${record.id}`, id: record.id, opensAt: record.opensAt?.toISOString().slice(0, 16), primaryMetric: `${record.items.length} soal`, progress: record.items.length ? 100 : 0, questionCount: record.items.length, resourceType: "quiz", retryDelaySeconds: record.retryDelaySeconds, reviewTiming: record.reviewTiming, scorePolicy: record.scorePolicy, sourceBank: relationRecord.sourceBank?.name ?? (relationRecord.sourceBankId ? "Bank Soal Kuis" : "Soal lokal"), sourceBankId: relationRecord.sourceBankId ?? undefined, sourceMode: sourceModeForQuiz(record), status: record.status === ContentStatus.published ? "published" : record.status === ContentStatus.archived ? "archived" : "draft", subjectCode: record.subtest.code, subjectName: subject?.name ?? record.subtest.code, title: record.title, updatedAt: record.updatedAt.toISOString() };
}

function validateForPublication(
  input: SaveStandaloneQuizInput,
  opensAt: Date | null,
  closesAt: Date | null,
  options: { materializedAssembly?: boolean } = {},
) {
  if (!input.title.trim()) throw new QuizValidationError("Isi judul quiz sebelum menerbitkan.");
  if (!input.questions.length && !input.assemblyVersionId) throw new QuizValidationError("Tambahkan minimal satu soal sebelum menerbitkan.");
  if (input.assemblyVersionId && input.questions.length && !options.materializedAssembly) throw new QuizValidationError("Soal langsung dan assembly tidak dapat dipakai bersamaan.");
  if (input.questions.some((question) => {
    const answerMode = answerModeForQuestionType(question.questionType);
    const correctChoiceIds = question.correctChoiceIds ?? (question.correctChoiceId ? [question.correctChoiceId] : []);
    const answerKey = answerMode
      ? validateAnswerKey(answerMode, question.choices.map((choice) => ({ id: choice.id, isCorrect: correctChoiceIds.includes(choice.id) })))
      : null;
    return !question.prompt.trim()
      || question.choices.length < 2
      || question.choices.length > 5
      || question.choices.some((choice) => !choice.text.trim())
      || !answerKey?.ok;
  })) throw new QuizValidationError("Lengkapi semua soal sebelum menerbitkan.");
  if (opensAt && closesAt && closesAt <= opensAt) throw new QuizValidationError("Waktu tutup harus setelah waktu buka.");
  if (input.reviewTiming === "after_close" && !closesAt) throw new QuizValidationError("Review setelah quiz ditutup memerlukan waktu tutup.");
}

function sourceModeForQuiz(record: { assemblyPackageVersionId?: string | null; sourceBankId?: string | null }): "local" | "bank" | "assembly" {
  if (record.assemblyPackageVersionId) return "assembly";
  return record.sourceBankId ? "bank" : "local";
}

function hasSubmittedSourceFields(question: QuizQuestionSnapshot) {
  return question.origin === "bank"
    || Boolean(question.sourceContentDigest || question.sourceQuestionId || question.sourceQuestionRevisionId || question.sourceRevisionProvenance);
}

function correctChoiceIdsForSnapshot(question: QuizQuestionSnapshot) {
  const ids = question.correctChoiceIds ?? (question.correctChoiceId ? [question.correctChoiceId] : []);
  return [...new Set(ids)];
}

function answerModeForSnapshot(question: QuizQuestionSnapshot) {
  return answerModeForQuestionType(question.questionType) ?? "single_choice";
}

function snapshotMatchesStoredBankItem(
  submitted: QuizQuestionSnapshot,
  persisted: Prisma.StandaloneQuizItemGetPayload<{ include: { options: true } }>,
) {
  const persistedSnapshot = toSnapshot(persisted);
  const submittedCorrectIds = correctChoiceIdsForSnapshot(submitted);
  const persistedCorrectIds = correctChoiceIdsForSnapshot(persistedSnapshot);
  return submitted.prompt === persistedSnapshot.prompt
    && submitted.promptMediaAssetId === persistedSnapshot.promptMediaAssetId
    && submitted.explanation === persistedSnapshot.explanation
    && submitted.explanationMediaAssetId === persistedSnapshot.explanationMediaAssetId
    && answerModeForSnapshot(submitted) === answerModeForSnapshot(persistedSnapshot)
    && submitted.choices.length === persistedSnapshot.choices.length
    && submitted.choices.every((choice, index) => {
      const persistedChoice = persistedSnapshot.choices[index];
      return persistedChoice
        && choice.id === persistedChoice.id
        && choice.text === persistedChoice.text
        && choice.mediaAssetId === persistedChoice.mediaAssetId;
    })
    && submittedCorrectIds.length === persistedCorrectIds.length
    && submittedCorrectIds.every((choiceId) => persistedCorrectIds.includes(choiceId));
}

async function assertStoredBankItemLineage(
  tx: Prisma.TransactionClient,
  sourceBankId: string,
  items: Array<Prisma.StandaloneQuizItemGetPayload<{ include: { options: true } }>>,
) {
  const sourceQuestionIds = [...new Set(items.map((item) => item.sourceQuestionId).filter((id): id is string => Boolean(id)))];
  if (!sourceQuestionIds.length || sourceQuestionIds.length !== items.length) {
    throw new QuizValidationError("Snapshot Kuis Bank memiliki atribusi soal yang tidak lengkap.");
  }
  const sources = await tx.question.findMany({
    where: { id: { in: sourceQuestionIds } },
    select: { id: true, questionBankId: true, questionBank: { select: { purpose: true } } },
  });
  if (sources.length !== sourceQuestionIds.length || sources.some((source) => source.questionBankId !== sourceBankId || source.questionBank?.purpose !== QuestionBankPurpose.quiz)) {
    throw new QuizValidationError("Snapshot Kuis Bank tidak lagi memiliki sumber Bank Soal Kuis yang valid.");
  }
}

async function writeStandaloneQuizItems(
  tx: Prisma.TransactionClient,
  input: {
    mode: "local" | "bank";
    quizId: string;
    questions: readonly QuizQuestionSnapshot[];
    requestedSubtestId: string;
    sourceBankId: string | null;
    existingItems: Array<Prisma.StandaloneQuizItemGetPayload<{ include: { options: true } }>>;
  },
) {
  if (input.mode === "local") {
    if (input.sourceBankId || input.questions.some(hasSubmittedSourceFields)) {
      throw new QuizValidationError("Kuis lokal tidak boleh menyimpan atribusi Bank Soal.");
    }
    await tx.standaloneQuizItem.deleteMany({ where: { quizId: input.quizId } });
    await Promise.all(input.questions.map(async (submitted, index) => {
      const choices = submitted.choices.map((choice, choiceIndex) => ({ ...choice, id: choice.id || String.fromCharCode(97 + choiceIndex) }));
      const correctChoiceIds = correctChoiceIdsForSnapshot({ ...submitted, choices });
      const answerMode = answerModeForSnapshot(submitted);
      const answerKey = validateAnswerKey(answerMode, choices.map((choice) => ({ id: choice.id, isCorrect: correctChoiceIds.includes(choice.id) })));
      if (!answerKey.ok) throw new QuizValidationError("Kunci jawaban Kuis lokal tidak valid.");
      const item = await tx.standaloneQuizItem.create({ data: { difficulty: DifficultyLevel.medium, explanation: submitted.explanation || null, explanationAssetId: submitted.explanationMediaAssetId || null, prompt: submitted.prompt, promptAssetId: submitted.promptMediaAssetId || null, questionType: answerMode, quizId: input.quizId, sortOrder: index + 1, sourceContentDigest: null, sourceQuestionId: null, sourceQuestionRevisionId: null, sourceRevisionProvenance: null, subtestId: input.requestedSubtestId } });
      await tx.standaloneQuizItemOption.createMany({ data: choices.map((choice, optionIndex) => ({ assetId: choice.mediaAssetId || null, choiceKey: String.fromCharCode(65 + optionIndex), content: choice.text, isCorrect: correctChoiceIds.includes(choice.id), quizItemId: item.id, sortOrder: optionIndex, sourceQuestionOptionId: null, sourceQuestionRevisionOptionId: null })) });
    }));
    return;
  }

  if (!input.sourceBankId) throw new QuizValidationError("Kuis Bank Soal memerlukan satu Bank sumber.");
  if (!input.questions.length) throw new QuizValidationError("Pilih minimal satu soal dari Bank Soal Kuis.");
  if (new Set(input.questions.map((question) => question.id)).size !== input.questions.length) throw new QuizValidationError("Setiap soal Bank hanya boleh muncul satu kali.");
  const existingById = new Map(input.existingItems.map((item) => [item.id, item]));
  const selectedItems = input.questions.map((submitted) => {
    const existing = existingById.get(submitted.id);
    if (!existing || existing.sourceQuestionId === null || existing.sourceQuestionRevisionId === null || existing.sourceContentDigest === null || existing.sourceRevisionProvenance === null) {
      throw new QuizValidationError("Soal baru pada Kuis Bank Soal harus diimpor melalui perintah Import.");
    }
    if (existing.subtestId !== input.requestedSubtestId) throw new QuizValidationError("Semua soal Bank dalam Kuis harus memakai Subtest yang sama.");
    if (!snapshotMatchesStoredBankItem(submitted, existing)) throw new QuizValidationError("Konten soal Bank Soal hanya dapat diubah dari editor Bank Soal.");
    return { existing, submitted };
  });
  await assertStoredBankItemLineage(tx, input.sourceBankId, selectedItems.map(({ existing }) => existing));
  await tx.standaloneQuizItem.deleteMany({ where: { quizId: input.quizId } });
  await Promise.all(selectedItems.map(async ({ existing }, index) => {
    const persistedSnapshot = toSnapshot(existing);
    const correctChoiceIds = correctChoiceIdsForSnapshot(persistedSnapshot);
    const item = await tx.standaloneQuizItem.create({
      data: {
        difficulty: existing.difficulty,
        explanation: existing.explanation,
        explanationAssetId: existing.explanationAssetId,
        prompt: existing.prompt,
        promptAssetId: existing.promptAssetId,
        questionType: answerModeForQuestionType(existing.questionType) ?? "single_choice",
        quizId: input.quizId,
        sortOrder: index + 1,
        sourceContentDigest: existing.sourceContentDigest,
        sourceQuestionId: existing.sourceQuestionId,
        sourceQuestionRevisionId: existing.sourceQuestionRevisionId,
        sourceRevisionProvenance: existing.sourceRevisionProvenance,
        subtestId: existing.subtestId,
      },
    });
    const existingOptions = existing.options.slice().sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
    await tx.standaloneQuizItemOption.createMany({
      data: persistedSnapshot.choices.map((choice, optionIndex) => {
        const old = existingOptions[optionIndex];
        return {
          assetId: choice.mediaAssetId || null,
          choiceKey: String.fromCharCode(65 + optionIndex),
          content: choice.text,
          isCorrect: correctChoiceIds.includes(choice.id),
          quizItemId: item.id,
          sortOrder: optionIndex,
          sourceQuestionOptionId: old?.sourceQuestionOptionId ?? null,
          sourceQuestionRevisionOptionId: old?.sourceQuestionRevisionOptionId ?? null,
        };
      }),
    });
  }));
}

async function saveStandaloneQuiz(input: SaveStandaloneQuizInput, tutorId: string) {
  const opensAt = parseOptionalDate(input.opensAt, "Waktu buka"); const closesAt = parseOptionalDate(input.closesAt, "Waktu tutup");
  const policy = normalizeQuizPolicy(input);
  return prisma.$transaction(async (tx) => {
    let id = input.id;
    let current: (Prisma.StandaloneQuizGetPayload<{ include: { participations: { select: { id: true }; take: 1 }; items: { include: { options: true } }; subtest: true } }>) | null = null;
    if (id) {
      await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${id}::uuid FOR UPDATE`;
      current = await tx.standaloneQuiz.findFirst({ where: { id, createdByUserId: tutorId }, include: { participations: { select: { id: true }, take: 1 }, items: { include: { options: true }, orderBy: { sortOrder: "asc" } }, subtest: true } });
      if (!current) throw new QuizValidationError("Quiz tidak ditemukan atau Anda tidak memiliki akses.");
      if (current.participations.length) throw new QuizValidationError("Quiz yang sudah dimulai siswa tidak dapat diubah. Gunakan Duplicate.");
    }

    const requestedSubtest = await tx.subtest.findUnique({ where: { code: input.subjectCode } });
    if (!requestedSubtest) throw new QuizValidationError("Subject quiz tidak valid.");
    const requestedMode = input.sourceMode ?? (input.sourceBankId ? "bank" : sourceModeForQuiz(current ?? {}));
    if (requestedMode !== "local" && requestedMode !== "bank") throw new QuizValidationError("Mode sumber Kuis tidak valid.");
    if (input.assemblyVersionId) throw new QuizValidationError("Gunakan perintah attachment khusus untuk mengikat assembly Kuis.");
    if (current) {
      const currentMode = sourceModeForQuiz(current);
      if (currentMode === "assembly") throw new QuizValidationError("Kuis yang terikat assembly harus diubah melalui perintah attachment atau pelepasan khusus.");
      if (requestedMode !== currentMode) throw new QuizValidationError("Perubahan mode sumber Kuis harus memakai perintah transisi khusus.");
      if (requestedMode === "bank" && input.sourceBankId && input.sourceBankId !== current.sourceBankId) throw new QuizValidationError("Pergantian Bank Soal harus memakai perintah transisi khusus.");
      if (requestedMode === "local" && input.sourceBankId) throw new QuizValidationError("Kuis lokal tidak boleh memiliki Bank sumber.");
      if (requestedMode === "bank" && current.subtestId !== requestedSubtest.id) throw new QuizValidationError("Subtest Kuis Bank Soal tidak dapat diubah tanpa mengimpor ulang soal.");
    } else if (requestedMode === "bank" || input.sourceBankId) {
      throw new QuizValidationError("Buat Kuis terlebih dahulu, lalu impor soal dari Bank Soal Kuis.");
    }
    if (input.status === "published") {
      validateForPublication({ ...input, assemblyVersionId: undefined, questions: input.questions }, opensAt, closesAt);
    }

    if (!id) {
      const created = await tx.standaloneQuiz.create({ data: { ...policy, assemblyDefinitionDigest: null, assemblyMode: null, assemblyPackageVersionId: null, assemblySeed: null, closesAt, createdByUserId: tutorId, description: input.description.trim() || null, opensAt, slug: `${slugify(input.title)}-${crypto.randomUUID().slice(0, 8)}`, sourceBankId: null, status: input.status === "published" ? ContentStatus.published : ContentStatus.draft, subtestId: requestedSubtest.id, title: input.title.trim() || "Draft Quiz Baru" } }); id = created.id;
    } else {
      await tx.standaloneQuiz.update({ where: { id }, data: { ...policy, closesAt, description: input.description.trim() || null, opensAt, sourceBankId: current?.sourceBankId ?? null, status: input.status === "published" ? ContentStatus.published : ContentStatus.draft, subtestId: requestedSubtest.id, title: input.title.trim() || "Draft Quiz Baru", revision: { increment: 1 } } });
    }
    await writeStandaloneQuizItems(tx, { existingItems: current?.items ?? [], mode: requestedMode, questions: input.questions, quizId: id!, requestedSubtestId: requestedSubtest.id, sourceBankId: current?.sourceBankId ?? null });
    const saved = await tx.standaloneQuiz.findUniqueOrThrow({ where: { id }, include: quizInclude });
    return toKaptenQuiz(saved);
  });
}

type TransitionStandaloneQuizSourceModeInput = {
  bankId?: string | null;
  expectedSources?: readonly QuizBankImportSelection[];
  mode: "local" | "bank";
  questionIds?: readonly string[];
  quizId: string;
  subtestCode?: string;
};

async function transitionStandaloneQuizSourceMode(input: TransitionStandaloneQuizSourceModeInput, tutorId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${input.quizId}::uuid FOR UPDATE`;
    const record = await tx.standaloneQuiz.findFirst({
      where: { id: input.quizId, createdByUserId: tutorId },
      include: {
        items: { include: { options: true }, orderBy: { sortOrder: "asc" } },
        participations: { select: { id: true }, take: 1 },
        subtest: true,
      },
    });
    if (!record) throw new QuizValidationError("Quiz tidak ditemukan atau Anda tidak memiliki akses.");
    if (record.participations.length) throw new QuizValidationError("Quiz yang sudah dimulai siswa tidak dapat diubah. Gunakan Duplicate.");
    if (record.assemblyPackageVersionId) throw new QuizValidationError("Kuis yang terikat assembly harus dilepas melalui perintah khusus sebelum mengganti sumber.");

    if (input.mode === "local") {
      // This is the only command allowed to clear lineage. The copied prompt,
      // options, order, and media remain exactly where the author placed them.
      await Promise.all(record.items.map((item) => tx.standaloneQuizItem.update({
        where: { id: item.id },
        data: {
          sourceContentDigest: null,
          sourceQuestionId: null,
          sourceQuestionRevisionId: null,
          sourceRevisionProvenance: null,
        },
      })));
      await Promise.all(record.items.flatMap((item) => item.options.map((option) => tx.standaloneQuizItemOption.update({
        where: { id: option.id },
        data: { sourceQuestionOptionId: null, sourceQuestionRevisionOptionId: null },
      }))));
      const saved = await tx.standaloneQuiz.update({
        where: { id: input.quizId },
        data: { sourceBankId: null, revision: { increment: 1 } },
        include: quizInclude,
      });
      return { quiz: toKaptenQuiz(saved), questions: saved.items.map(toSnapshot) };
    }

    if (!input.bankId) throw new QuizValidationError("Pilih satu Bank Soal Kuis.");
    const questionIds = input.questionIds ?? [];
    const materialized = await readReadyQuizBankSources(tx, {
      bankId: input.bankId,
      expectedSources: input.expectedSources,
      questionIds,
      subtestCode: input.subtestCode ?? record.subtest.code,
    });
    await tx.standaloneQuizItem.deleteMany({ where: { quizId: input.quizId } });
    await Promise.all(materialized.map(async (question, index) => {
      const item = await tx.standaloneQuizItem.create({
        data: {
          difficulty: question.difficulty,
          explanation: question.explanation,
          explanationAssetId: question.explanationAssetId,
          prompt: question.prompt,
          promptAssetId: question.promptAssetId,
          questionType: answerModeForQuestionType(question.questionType) ?? "single_choice",
          quizId: input.quizId,
          sortOrder: index + 1,
          sourceContentDigest: question.sourceContentDigest,
          sourceQuestionId: question.sourceQuestionId,
          sourceQuestionRevisionId: question.sourceQuestionRevisionId,
          sourceRevisionProvenance: question.sourceRevisionProvenance,
          subtestId: question.subtestId,
        },
      });
      await tx.standaloneQuizItemOption.createMany({
        data: question.options.map((option) => ({
          assetId: option.assetId,
          choiceKey: option.choiceKey,
          content: option.content,
          isCorrect: option.isCorrect,
          quizItemId: item.id,
          sortOrder: option.sortOrder,
          sourceQuestionOptionId: null,
          sourceQuestionRevisionOptionId: option.sourceQuestionRevisionOptionId,
        })),
      });
    }));
    const saved = await tx.standaloneQuiz.update({
      where: { id: input.quizId },
      data: { sourceBankId: input.bankId, subtestId: record.subtestId, revision: { increment: 1 } },
      include: quizInclude,
    });
    return { quiz: toKaptenQuiz(saved), questions: saved.items.map(toSnapshot) };
  });
}

async function importStandaloneQuizBankQuestions(input: Omit<TransitionStandaloneQuizSourceModeInput, "mode">, tutorId: string) {
  return transitionStandaloneQuizSourceMode({ ...input, mode: "bank" }, tutorId);
}

type AcceptStandaloneQuizQuestionUpdateInput = {
  expectedCurrentContentDigest: string;
  expectedCurrentRevisionId: string;
  quizId: string;
  quizItemId: string;
  targetContentDigest: string;
  targetRevisionId: string;
};

async function acceptStandaloneQuizQuestionUpdate(
  input: AcceptStandaloneQuizQuestionUpdateInput,
  tutorId: string,
) {
  if (!input.expectedCurrentContentDigest.trim()
    || !input.expectedCurrentRevisionId.trim()
    || !input.targetContentDigest.trim()
    || !input.targetRevisionId.trim()) {
    throw new QuizValidationError("Identitas revisi Bank Soal tidak lengkap. Muat ulang Kuis lalu coba lagi.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${input.quizId}::uuid FOR UPDATE`;
    const record = await tx.standaloneQuiz.findFirst({
      where: { id: input.quizId, createdByUserId: tutorId },
      include: {
        items: { include: { options: true }, orderBy: { sortOrder: "asc" } },
        participations: { select: { id: true }, take: 1 },
        sourceBank: { select: { id: true, purpose: true, status: true } },
        subtest: true,
      },
    });
    if (!record) throw new QuizValidationError("Quiz tidak ditemukan atau Anda tidak memiliki akses.");
    if (record.status !== ContentStatus.draft) {
      throw new QuizValidationError("Jadikan Kuis draf sebelum menerima revisi Bank Soal agar rilis yang sudah terbit tetap tidak berubah.");
    }
    if (record.participations.length) throw new QuizValidationError("Quiz yang sudah dimulai siswa tidak dapat diubah. Gunakan Duplicate.");
    if (record.assemblyPackageVersionId) throw new QuizValidationError("Kuis yang terikat assembly harus diperbarui melalui versi draf assembly.");
    if (!record.sourceBankId || record.sourceBank?.purpose !== QuestionBankPurpose.quiz) {
      throw new QuizValidationError("Kuis ini tidak terikat ke Bank Soal Kuis.");
    }

    const item = record.items.find((candidate) => candidate.id === input.quizItemId);
    if (!item) throw new QuizValidationError("Soal Kuis tidak ditemukan.");
    if (item.quizVersionId) throw new QuizValidationError("Soal terikat ke versi Kuis. Perbarui melalui versi draf yang aktif.");
    const sourceQuestionId = item.sourceQuestionId;
    const currentRevisionId = item.sourceQuestionRevisionId;
    const currentContentDigest = item.sourceContentDigest;
    if (!sourceQuestionId || !currentRevisionId || !currentContentDigest || item.sourceRevisionProvenance === "legacy_unknown") {
      throw new QuizValidationError("Soal ini tidak memiliki atribusi revisi Bank Soal yang dapat ditinjau.");
    }
    if (currentRevisionId !== input.expectedCurrentRevisionId || currentContentDigest !== input.expectedCurrentContentDigest) {
      throw new QuizValidationError("Kuis telah berubah sejak tinjauan dibuka. Muat ulang lalu tinjau kembali.");
    }

    // Lock the source identity and its current revision so accepting a review
    // cannot silently apply a revision different from the one the author saw.
    await tx.$queryRaw`
      SELECT q.id
      FROM questions q
      JOIN question_banks b ON b.id = q.question_bank_id
      JOIN question_revisions r ON r.id = q.current_revision_id
      WHERE q.id = ${sourceQuestionId}::uuid
      FOR SHARE OF q, b, r
    `;
    const source = await tx.question.findFirst({
      where: { id: sourceQuestionId },
      include: quizSourceInclude,
    });
    if (!source?.currentRevision
      || source.currentRevision.id !== input.targetRevisionId
      || source.currentRevision.contentDigest !== input.targetContentDigest) {
      throw new QuizValidationError("Revisi Bank Soal berubah. Muat ulang lalu tinjau kembali.");
    }
    if (source.currentRevision.id === currentRevisionId && source.currentRevision.contentDigest === currentContentDigest) {
      throw new QuizValidationError("Revisi Bank Soal sudah diterapkan pada Kuis ini.");
    }
    assertReadyBankSources([source], record.subtest.code, record.sourceBankId, QuestionBankPurpose.quiz);
    const materialized = materializedQuizQuestion(source);
    await tx.standaloneQuizItem.update({
      where: { id: item.id },
      data: {
        difficulty: materialized.difficulty,
        explanation: materialized.explanation,
        explanationAssetId: materialized.explanationAssetId,
        prompt: materialized.prompt,
        promptAssetId: materialized.promptAssetId,
        questionType: answerModeForQuestionType(materialized.questionType) ?? "single_choice",
        sourceContentDigest: materialized.sourceContentDigest,
        sourceQuestionId: materialized.sourceQuestionId,
        sourceQuestionRevisionId: materialized.sourceQuestionRevisionId,
        sourceRevisionProvenance: materialized.sourceRevisionProvenance,
        subtestId: materialized.subtestId,
      },
    });
    await tx.standaloneQuizItemOption.deleteMany({ where: { quizItemId: item.id } });
    await tx.standaloneQuizItemOption.createMany({
      data: materialized.options.map((option) => ({
        assetId: option.assetId,
        choiceKey: option.choiceKey,
        content: option.content,
        isCorrect: option.isCorrect,
        quizItemId: item.id,
        sortOrder: option.sortOrder,
        sourceQuestionOptionId: null,
        sourceQuestionRevisionOptionId: option.sourceQuestionRevisionOptionId,
      })),
    });
    const saved = await tx.standaloneQuiz.update({
      where: { id: input.quizId },
      data: { revision: { increment: 1 } },
      include: quizInclude,
    });
    return { quiz: toKaptenQuiz(saved), questions: saved.items.map(toSnapshot) };
  });
}

async function getMentorStandaloneQuiz(id: string, tutorId: string) {
  const record = await prisma.standaloneQuiz.findFirst({ where: { id, createdByUserId: tutorId }, include: quizContentInclude });
  if (!record) return null;
  // Kuis-owned snapshots remain editable without traversing or revalidating the
  // live Bank Soal. Source attribution is returned for the editor, but the
  // server remains the authority for every lineage field on save.
  const questions = await getQuizQuestionsWithSourceUpdates(record.items, record.subtest.code);
  return { questions, quiz: toKaptenQuiz(record) };
}

async function attachStandaloneQuizAssembly(quizId: string, versionId: string, tutorId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${quizId}::uuid FOR UPDATE`;
    const record = await tx.standaloneQuiz.findFirst({
      where: { id: quizId, createdByUserId: tutorId },
      include: {
        participations: { select: { id: true }, take: 1 },
        subtest: true,
      },
    });
    if (!record) throw new QuizValidationError("Quiz tidak ditemukan atau Anda tidak memiliki akses.");
    if (record.participations.length) throw new QuizValidationError("Quiz yang sudah dimulai siswa tidak dapat diubah. Gunakan Duplicate.");
    const materialization = await resolveReadyAssemblyForKuis(tx, versionId, record.subtestId);
    await tx.standaloneQuizItem.deleteMany({ where: { quizId } });
    await Promise.all(materialization.items.map(async (question, index) => {
      const item = await tx.standaloneQuizItem.create({
        data: {
          difficulty: question.difficulty,
          explanation: question.explanation,
          explanationAssetId: question.explanationAssetId,
          prompt: question.prompt,
          promptAssetId: question.promptAssetId,
          questionType: answerModeForQuestionType(question.questionType) ?? "single_choice",
          quizId,
          sortOrder: index + 1,
          sourceContentDigest: question.sourceContentDigest,
          sourceQuestionId: question.sourceQuestionId,
          sourceQuestionRevisionId: question.sourceQuestionRevisionId,
          sourceRevisionProvenance: question.sourceRevisionProvenance,
          subtestId: question.subtestId,
        },
      });
      await tx.standaloneQuizItemOption.createMany({
        data: question.options.map((option) => ({
          assetId: option.assetId,
          choiceKey: option.choiceKey,
          content: option.content,
          isCorrect: option.isCorrect,
          quizItemId: item.id,
          sortOrder: option.sortOrder,
          sourceQuestionOptionId: null,
          sourceQuestionRevisionOptionId: option.sourceQuestionRevisionOptionId,
        })),
      });
    }));
    const saved = await tx.standaloneQuiz.update({
      where: { id: quizId },
      data: {
        assemblyDefinitionDigest: materialization.assemblyDefinitionDigest,
        assemblyMode: materialization.assemblyMode,
        assemblyPackageVersionId: materialization.assemblyPackageVersionId,
        assemblySeed: materialization.assemblySeed,
        revision: { increment: 1 },
        sourceBankId: materialization.sourceBankId,
      },
      include: quizInclude,
    });
    return toKaptenQuiz(saved);
  });
}

async function detachStandaloneQuizAssembly(quizId: string, tutorId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${quizId}::uuid FOR UPDATE`;
    const record = await tx.standaloneQuiz.findFirst({ where: { id: quizId, createdByUserId: tutorId }, include: quizInclude });
    if (!record) throw new QuizValidationError("Quiz tidak ditemukan atau Anda tidak memiliki akses.");
    const participationCount = await tx.standaloneQuizParticipation.count({ where: { quizId } });
    if (participationCount) throw new QuizValidationError("Quiz yang sudah dimulai siswa tidak dapat diubah. Gunakan Duplicate.");
    if (record.assemblyPackageVersionId) {
      try {
        const materialization = await resolveReadyAssemblyForKuis(tx, record.assemblyPackageVersionId, record.subtestId, {
          expectedDefinitionDigest: record.assemblyDefinitionDigest,
          expectedMode: record.assemblyMode as "fixed_set" | "random_pool" | "blueprint" | null,
          seed: record.assemblySeed,
        });
        assertAssemblyItemsMatch(record.items, materialization);
      } catch (error) {
        if (error instanceof AssemblyValidationError) throw new QuizValidationError(error.message);
        throw error;
      }
    }
    const saved = await tx.standaloneQuiz.update({
      where: { id: quizId },
      data: {
        assemblyDefinitionDigest: null,
        assemblyMode: null,
        assemblyPackageVersionId: null,
        assemblySeed: null,
        revision: { increment: 1 },
      },
      include: quizInclude,
    });
    return toKaptenQuiz(saved);
  });
}
async function getMentorStandaloneQuizzes(tutorId: string) { return (await prisma.standaloneQuiz.findMany({ where: { createdByUserId: tutorId }, include: quizInclude, orderBy: { updatedAt: "desc" } })).map(toKaptenQuiz); }
async function getMentorStandaloneQuizResults(quizId: string, tutorId: string) {
  const quiz = await prisma.standaloneQuiz.findFirst({
    where: { id: quizId, createdByUserId: tutorId },
    include: {
      participations: {
        include: {
          attempts: {
            select: {
              attemptNo: true,
              correctCount: true,
              createdAt: true,
              earnedPoints: true,
              id: true,
              releaseAt: true,
              releaseState: true,
              score: true,
              scoringProvenance: true,
              scoringState: true,
              scoringVersion: true,
              status: true,
              submittedAt: true,
              unansweredCount: true,
              wrongCount: true,
            },
            orderBy: { attemptNo: "desc" },
          },
          student: { select: { fullName: true } },
        },
      },
      items: { select: { id: true } },
      subtest: { select: { code: true } },
    },
  });
  if (!quiz) return null;
  return {
    attempts: quiz.participations.flatMap((participation) => {
      const visibleAttempts = participation.attempts.filter((attempt) => attempt.status === "in_progress" || isReviewableStandaloneQuizAttemptStatus(attempt.status));
      const participationPolicy = policyFromAttemptSnapshot(participation.policySnapshot, toQuizAttemptPolicy(quiz));
      const finalScore = aggregateStandaloneQuizScore(visibleAttempts, participationPolicy.scorePolicy);
      return visibleAttempts.map((attempt) => ({
        attemptNo: attempt.attemptNo,
        correctCount: attempt.correctCount,
        createdAt: attempt.createdAt.toISOString(),
        aggregateScore: finalScore,
        finalScore,
        earnedPoints: attempt.earnedPoints === null ? null : Number(attempt.earnedPoints),
        id: attempt.id,
        participationId: participation.id,
        releaseAt: attempt.releaseAt?.toISOString() ?? null,
        releaseState: attempt.releaseState,
        score: attempt.score,
        scoringProvenance: attempt.scoringProvenance,
        scoringState: attempt.scoringState,
        scoringVersion: attempt.scoringVersion,
        status: attempt.status,
        student: { name: participation.student.fullName?.trim() || "Siswa tanpa nama" },
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
        unansweredCount: attempt.unansweredCount,
        wrongCount: attempt.wrongCount,
      }));
    }),
    quiz: {
      attemptsAllowed: quiz.attemptsAllowed,
      correctAnswerVisibility: quiz.correctAnswerVisibility,
      formBehavior: quiz.formBehavior,
      id: quiz.id,
      questionCount: quiz.items.length,
      retryDelaySeconds: quiz.retryDelaySeconds,
      reviewTiming: quiz.reviewTiming,
      scorePolicy: quiz.scorePolicy,
      subject: quiz.subtest.code,
      title: quiz.title,
    },
  };
}

async function getMentorStandaloneQuizSubmission(quizId: string, attemptId: string, tutorId: string) {
  if (!isUuid(attemptId)) return null;
  const attempt = await prisma.standaloneQuizAttempt.findFirst({
    where: { id: attemptId, participation: { quizId, quiz: { createdByUserId: tutorId } } },
    include: {
      answers: true,
      participation: {
        select: {
          policySnapshot: true,
          student: { select: { fullName: true } },
          quiz: {
            include: quizInclude,
          },
        },
      },
    },
  });
  if (!attempt) return null;
  if (attempt.status !== "in_progress" && !isReviewableStandaloneQuizAttemptStatus(attempt.status)) return null;
  const quiz = buildAttemptQuiz(attempt.participation.quiz, attempt);
  const policy = policyFromAttemptSnapshot(attempt.participation.policySnapshot, toQuizAttemptPolicy(quiz));
  const selectedOptionIdsByItem = new Map(attempt.answers.map((answer) => [answer.quizItemId, storedAnswerSelectionIds(answer) ?? []]));
  return {
    attemptNo: attempt.attemptNo,
    answeredCount: attempt.answers.length,
    correctCount: attempt.correctCount,
    createdAt: attempt.createdAt.toISOString(),
    id: attempt.id,
    questions: quiz.items.map((item) => ({
      explanation: item.explanation,
      options: item.options.map((option) => ({ correct: option.isCorrect, id: option.id, key: option.choiceKey, text: option.content })),
      prompt: item.prompt,
      questionType: answerModeForQuestionType(item.questionType) ?? "single_choice",
      selectedOptionId: selectedOptionIdsByItem.get(item.id)?.[0] ?? null,
      selectedOptionIds: selectedOptionIdsByItem.get(item.id) ?? [],
    })),
    releaseAt: attempt.releaseAt?.toISOString() ?? null,
    releaseState: attempt.releaseState,
    score: attempt.score,
    scoringProvenance: attempt.scoringProvenance,
    scoringState: attempt.scoringState,
    scoringVersion: attempt.scoringVersion,
    status: attempt.status,
    student: { name: attempt.participation.student.fullName?.trim() || "Siswa tanpa nama" },
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    quiz: {
      attemptsAllowed: policy.attemptsAllowed,
      correctAnswerVisibility: policy.correctAnswerVisibility,
      formBehavior: policy.formBehavior,
      id: quiz.id,
      questionCount: quiz.items.length,
      retryDelaySeconds: policy.retryDelaySeconds,
      reviewTiming: policy.reviewTiming,
      scorePolicy: policy.scorePolicy,
      subject: quiz.subtest.code,
      title: quiz.title,
    },
  };
}
async function bulkUpdateStandaloneQuizLifecycle(ids: string[], tutorId: string, operation: "publish" | "unpublish") {
  return prisma.$transaction(async (tx) => {
    const uniqueIds = [...new Set(ids)];
    const sortedIds = [...uniqueIds].sort();
    await Promise.all(
      sortedIds.map((id) => tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${id}::uuid FOR UPDATE`),
    );
    const records = await tx.standaloneQuiz.findMany({ where: { id: { in: uniqueIds }, createdByUserId: tutorId }, include: quizInclude });
    if (records.length !== uniqueIds.length) throw new QuizValidationError("Sebagian Quiz tidak ditemukan.");
    if (operation === "publish") {
      await Promise.all(
        records.map(async (record) => {
          let publicationQuestions = record.items.map(toSnapshot);
          if (record.assemblyPackageVersionId) {
            try {
              const materialization = await resolveReadyAssemblyForKuis(tx, record.assemblyPackageVersionId, record.subtestId, {
                expectedDefinitionDigest: record.assemblyDefinitionDigest,
                expectedMode: record.assemblyMode as "fixed_set" | "random_pool" | "blueprint" | null,
                seed: record.assemblySeed,
              });
              assertAssemblyItemsMatch(record.items, materialization);
              publicationQuestions = snapshotsFromAssembly(materialization);
          } catch (error) {
            if (error instanceof AssemblyValidationError) throw new QuizValidationError(error.message);
            throw error;
          }
          }
          validateForPublication({
            assemblyVersionId: record.assemblyPackageVersionId ?? undefined,
            closesAt: record.closesAt?.toISOString() ?? "",
            description: record.description ?? "",
            id: record.id,
            opensAt: record.opensAt?.toISOString() ?? "",
            questions: publicationQuestions,
            sourceBankId: record.sourceBankId ?? undefined,
            status: "published",
            subjectCode: record.subtest.code,
            title: record.title,
          }, record.opensAt, record.closesAt, { materializedAssembly: Boolean(record.assemblyPackageVersionId) });
        }),
      );
    }
    const status = operation === "publish" ? ContentStatus.published : ContentStatus.draft;
    await tx.standaloneQuiz.updateMany({ where: { id: { in: uniqueIds }, createdByUserId: tutorId }, data: { status } });
    return { ids, status: status === ContentStatus.published ? "published" as const : "draft" as const };
  });
}
async function bulkPublishStandaloneQuizzes(ids: string[], tutorId: string) { return bulkUpdateStandaloneQuizLifecycle(ids, tutorId, "publish"); }
async function bulkUnpublishStandaloneQuizzes(ids: string[], tutorId: string) { return bulkUpdateStandaloneQuizLifecycle(ids, tutorId, "unpublish"); }
async function updateStandaloneQuizLifecycle(id: string, tutorId: string, operation: "archive" | "restore") {
  const record = await prisma.standaloneQuiz.findFirst({ where: { id, createdByUserId: tutorId }, include: quizInclude });
  if (!record) throw new QuizValidationError("Quiz tidak ditemukan atau Anda tidak memiliki akses.");
  if (operation === "archive" && record.status === ContentStatus.archived) throw new QuizValidationError("Quiz sudah diarsipkan.");
  if (operation === "restore" && record.status !== ContentStatus.archived) throw new QuizValidationError("Hanya Quiz yang diarsipkan dapat dipulihkan.");
  const saved = await prisma.standaloneQuiz.update({ where: { id }, data: { status: operation === "archive" ? ContentStatus.archived : ContentStatus.draft, revision: { increment: 1 } }, include: quizInclude });
  return toKaptenQuiz(saved);
}
function studentAvailabilityWhere(now = new Date()) { return { status: ContentStatus.published, AND: [{ OR: [{ opensAt: null }, { opensAt: { lte: now } }] }, { OR: [{ closesAt: null }, { closesAt: { gt: now } }] }] } satisfies Prisma.StandaloneQuizWhereInput; }
async function getAvailableStandaloneQuiz(subjectCode: string, slug: string, now = new Date()) { return prisma.standaloneQuiz.findFirst({ where: { ...studentAvailabilityWhere(now), slug, subtest: { code: subjectCode } }, include: quizInclude }); }
class QuizAttemptValidationError extends Error {}

const terminalStandaloneQuizAttemptStatuses = ["submitted", "auto_submitted", "expired", "abandoned", "scored"] as const;
const reviewableStandaloneQuizAttemptStatuses = ["submitted", "auto_submitted", "scored"] as const;

function isTerminalStandaloneQuizAttemptStatus(status: string) {
  return terminalStandaloneQuizAttemptStatuses.includes(status as typeof terminalStandaloneQuizAttemptStatuses[number]);
}

function isReviewableStandaloneQuizAttemptStatus(status: string) {
  return reviewableStandaloneQuizAttemptStatuses.includes(status as typeof reviewableStandaloneQuizAttemptStatuses[number]);
}

type QuizAttemptPolicy = {
  attemptsAllowed: number | null;
  correctAnswerVisibility: QuizCorrectAnswerVisibility;
  formBehavior: QuizFormBehavior;
  retryDelaySeconds: number | null;
  reviewTiming: QuizReviewTiming;
  scorePolicy: QuizScorePolicy;
};

type AttemptFormSnapshotOption = {
  assetId: string | null;
  choiceKey: string;
  content: string;
  id: string;
  isCorrect: boolean;
  sortOrder: number;
};

type AttemptFormSnapshotItem = {
  explanation: string | null;
  explanationAssetId: string | null;
  id: string;
  options: AttemptFormSnapshotOption[];
  prompt: string;
  promptAssetId: string | null;
  questionType: QuestionAnswerMode;
  sortOrder: number;
};

type AttemptFormSnapshot = {
  items: AttemptFormSnapshotItem[];
  version: 1;
};

type QuizRecord = Prisma.StandaloneQuizGetPayload<{ include: typeof quizInclude }>;
type QuizItemRecord = QuizRecord["items"][number];

function toQuizAttemptPolicy(quiz: { attemptsAllowed: number | null; correctAnswerVisibility: QuizCorrectAnswerVisibility; formBehavior: QuizFormBehavior; retryDelaySeconds: number | null; reviewTiming: QuizReviewTiming; scorePolicy: QuizScorePolicy }): QuizAttemptPolicy {
  return {
    attemptsAllowed: quiz.attemptsAllowed,
    correctAnswerVisibility: quiz.correctAnswerVisibility,
    formBehavior: quiz.formBehavior,
    retryDelaySeconds: quiz.retryDelaySeconds,
    reviewTiming: quiz.reviewTiming,
    scorePolicy: quiz.scorePolicy,
  };
}

function policyFromAttemptSnapshot(snapshot: unknown, fallback: QuizAttemptPolicy): QuizAttemptPolicy {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return fallback;
  const value = snapshot as Record<string, unknown>;
  const attemptsAllowed = value.attemptsAllowed === null
    ? null
    : typeof value.attemptsAllowed === "number" && Number.isInteger(value.attemptsAllowed) && value.attemptsAllowed > 0
      ? value.attemptsAllowed
      : fallback.attemptsAllowed;
  const retryDelaySeconds = value.retryDelaySeconds === null
    ? null
    : typeof value.retryDelaySeconds === "number" && Number.isInteger(value.retryDelaySeconds) && value.retryDelaySeconds >= 0
      ? value.retryDelaySeconds
      : fallback.retryDelaySeconds;
  return {
    attemptsAllowed,
    correctAnswerVisibility: typeof value.correctAnswerVisibility === "string" && isOneOf(value.correctAnswerVisibility, correctAnswerVisibilities) ? value.correctAnswerVisibility : fallback.correctAnswerVisibility,
    formBehavior: typeof value.formBehavior === "string" && isOneOf(value.formBehavior, formBehaviors) ? value.formBehavior : fallback.formBehavior,
    retryDelaySeconds,
    reviewTiming: typeof value.reviewTiming === "string" && isOneOf(value.reviewTiming, reviewTimings) ? value.reviewTiming : fallback.reviewTiming,
    scorePolicy: typeof value.scorePolicy === "string" && isOneOf(value.scorePolicy, scorePolicies) ? value.scorePolicy : fallback.scorePolicy,
  };
}

function toAttemptFormSnapshot(items: QuizItemRecord[]): AttemptFormSnapshot {
  return {
    items: items.map((item) => ({
      explanation: item.explanation,
      explanationAssetId: item.explanationAssetId,
      id: item.id,
      options: item.options.map((option) => ({
        assetId: option.assetId,
        choiceKey: option.choiceKey,
        content: option.content,
        id: option.id,
        isCorrect: option.isCorrect,
        sortOrder: option.sortOrder,
      })),
      prompt: item.prompt,
      promptAssetId: item.promptAssetId,
      questionType: answerModeForQuestionType(item.questionType) ?? "single_choice",
      sortOrder: item.sortOrder,
    })),
    version: 1,
  };
}

function parseAttemptFormSnapshot(snapshot: unknown): AttemptFormSnapshot | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const value = snapshot as Record<string, unknown>;
  if (value.version !== 1 || !Array.isArray(value.items)) return null;
  const items = value.items.flatMap((rawItem) => {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) return [];
    const item = rawItem as Record<string, unknown>;
    const questionType = item.questionType === undefined ? "single_choice" : answerModeForQuestionType(item.questionType as string | null);
    if (
      typeof item.id !== "string"
      || typeof item.prompt !== "string"
      || (item.explanation !== null && typeof item.explanation !== "string")
      || (item.promptAssetId !== null && typeof item.promptAssetId !== "string")
      || (item.explanationAssetId !== null && typeof item.explanationAssetId !== "string")
      || typeof item.sortOrder !== "number"
      || !Array.isArray(item.options)
      || !questionType
    ) return [];
    const options = item.options.flatMap((rawOption) => {
      if (!rawOption || typeof rawOption !== "object" || Array.isArray(rawOption)) return [];
      const option = rawOption as Record<string, unknown>;
      if (
        typeof option.id !== "string"
        || typeof option.choiceKey !== "string"
        || typeof option.content !== "string"
        || typeof option.isCorrect !== "boolean"
        || typeof option.sortOrder !== "number"
        || (option.assetId !== null && typeof option.assetId !== "string")
      ) return [];
      return [{
        assetId: option.assetId,
        choiceKey: option.choiceKey,
        content: option.content,
        id: option.id,
        isCorrect: option.isCorrect,
        sortOrder: option.sortOrder,
      } satisfies AttemptFormSnapshotOption];
    });
    if (options.length !== item.options.length) return [];
    return [{
      explanation: item.explanation,
      explanationAssetId: item.explanationAssetId,
      id: item.id,
      options,
      prompt: item.prompt,
      promptAssetId: item.promptAssetId,
      questionType,
      sortOrder: item.sortOrder,
    } satisfies AttemptFormSnapshotItem];
  });
  if (items.length !== value.items.length) return null;
  return { items, version: 1 };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function attemptItemHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function orderStandaloneQuizItems<T extends { id: string }>(items: T[], attemptId: string, formBehavior: QuizFormBehavior) {
  if (formBehavior === "same") return items;
  return [...items].sort((left, right) => {
    const difference = attemptItemHash(`${attemptId}:${left.id}`) - attemptItemHash(`${attemptId}:${right.id}`);
    return difference || left.id.localeCompare(right.id);
  });
}

function orderItemsFromAttemptSnapshot<T extends { id: string }>(items: T[], attemptId: string, formBehavior: QuizFormBehavior, snapshot: unknown) {
  if (Array.isArray(snapshot) && snapshot.every((itemId): itemId is string => typeof itemId === "string")) {
    const positions = new Map(snapshot.map((itemId, index) => [itemId, index]));
    return [...items].sort((left, right) => {
      const leftPosition = positions.get(left.id) ?? items.length;
      const rightPosition = positions.get(right.id) ?? items.length;
      return leftPosition - rightPosition || left.id.localeCompare(right.id);
    });
  }
  return orderStandaloneQuizItems(items, attemptId, formBehavior);
}

function buildAttemptQuiz(quiz: QuizRecord, attempt: { formItemOrder: unknown; formSnapshot?: unknown; id: string; policySnapshot: unknown }) {
  const policy = policyFromAttemptSnapshot(attempt.policySnapshot, toQuizAttemptPolicy(quiz));
  const snapshot = parseAttemptFormSnapshot(attempt.formSnapshot);
  if (!snapshot) {
    return {
      ...quiz,
      ...policy,
      items: orderItemsFromAttemptSnapshot(quiz.items, attempt.id, policy.formBehavior, attempt.formItemOrder),
    };
  }

  const items = snapshot.items.map((snapshotItem) => {
    const liveItem = quiz.items.find((item) => item.id === snapshotItem.id);
    const base = liveItem ?? ({
      difficulty: DifficultyLevel.medium,
      explanation: snapshotItem.explanation,
      explanationAssetId: snapshotItem.explanationAssetId,
      id: snapshotItem.id,
      options: [],
      prompt: snapshotItem.prompt,
      promptAssetId: snapshotItem.promptAssetId,
      quizId: quiz.id,
      questionType: snapshotItem.questionType,
      sortOrder: snapshotItem.sortOrder,
      sourceQuestionId: null,
      subtestId: quiz.subtestId,
    } as unknown as QuizItemRecord);
    const options = snapshotItem.options.map((snapshotOption) => {
      const liveOption = base.options.find((option) => option.id === snapshotOption.id);
      return {
        ...(liveOption ?? ({} as QuizItemRecord["options"][number])),
        assetId: snapshotOption.assetId,
        choiceKey: snapshotOption.choiceKey,
        content: snapshotOption.content,
        id: snapshotOption.id,
        isCorrect: snapshotOption.isCorrect,
        quizItemId: snapshotItem.id,
        sortOrder: snapshotOption.sortOrder,
      };
    });
    return { ...base, ...snapshotItem, options };
  });
  return { ...quiz, ...policy, items };
}

function aggregateStandaloneQuizScore(attempts: Array<{ attemptNo: number; releaseState?: string; score: number | null; scoringState?: string; status: string }>, scorePolicy: QuizScorePolicy, requireReleased = false) {
  const scoredAttempts = attempts
    .filter((attempt) => isReviewableStandaloneQuizAttemptStatus(attempt.status)
      && (attempt.scoringState === undefined || attempt.scoringState === AssessmentScoringState.scored)
      && (!requireReleased || attempt.releaseState === AssessmentResultReleaseState.released)
      && attempt.score !== null)
    .sort((left, right) => left.attemptNo - right.attemptNo);
  if (!scoredAttempts.length) return null;
  if (scorePolicy === "highest") return Math.max(...scoredAttempts.map((attempt) => attempt.score ?? 0));
  if (scorePolicy === "first") return scoredAttempts[0]?.score ?? null;
  if (scorePolicy === "average") return Math.round(scoredAttempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) / scoredAttempts.length);
  return scoredAttempts.at(-1)?.score ?? null;
}

async function startStandaloneQuiz(subjectCode: string, slug: string, studentId: string, requestedNow?: Date, startRequestId?: string) {
  if (startRequestId !== undefined && !isUuid(startRequestId)) throw new QuizAttemptValidationError("Permintaan mulai quiz tidak valid.");
  const effectiveStartRequestId = startRequestId ?? crypto.randomUUID();
  return prisma.$transaction(async (tx) => {
    const identity = await tx.standaloneQuiz.findFirst({ where: { slug, subtest: { code: subjectCode } }, select: { id: true } });
    if (!identity) return null;

    // The quiz row is the shared content/policy boundary. Lock it before
    // creating the first participation so concurrent Start calls cannot both
    // observe the same next attempt number or stale availability policy.
    await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${identity.id}::uuid FOR UPDATE`;
    const quizRecord = await tx.standaloneQuiz.findUnique({ where: { id: identity.id }, include: quizInclude });
    if (!quizRecord) return null;

    // Replay an already accepted command before checking the current open
    // window. The request key identifies the original command, so a retry
    // after the window closes must not allocate a new attempt or lose the
    // original attempt ID.
    const existingParticipation = await tx.standaloneQuizParticipation.findUnique({
      where: { quizId_studentId: { quizId: quizRecord.id, studentId } },
      select: { id: true },
    });
    if (existingParticipation) {
      await tx.$queryRaw`SELECT id FROM standalone_quiz_participations WHERE id = ${existingParticipation.id}::uuid FOR UPDATE`;
      const replayedAttempt = await tx.standaloneQuizAttempt.findUnique({
        where: { participationId_startRequestId: { participationId: existingParticipation.id, startRequestId: effectiveStartRequestId } },
        include: { answers: true },
      });
      if (replayedAttempt) {
        const replayedQuiz = buildAttemptQuiz(quizRecord, replayedAttempt);
        return { attempt: replayedAttempt, policy: toQuizAttemptPolicy(replayedQuiz), quiz: replayedQuiz, state: "replayed" as const };
      }
    }

    const checkNow = requestedNow ?? new Date();
    const quiz = await tx.standaloneQuiz.findFirst({ where: { ...studentAvailabilityWhere(checkNow), id: identity.id }, include: quizInclude });
    if (!quiz) throw new QuizAttemptValidationError("Quiz belum tersedia atau sudah ditutup.");

    const participation = await tx.standaloneQuizParticipation.upsert({
      where: { quizId_studentId: { quizId: quiz.id, studentId } },
      create: { policySnapshot: toQuizAttemptPolicy(quiz) as unknown as Prisma.InputJsonObject, quizId: quiz.id, studentId },
      update: {},
      select: { id: true, policySnapshot: true },
    });
    await tx.$queryRaw`SELECT id FROM standalone_quiz_participations WHERE id = ${participation.id}::uuid FOR UPDATE`;
    const participationPolicy = policyFromAttemptSnapshot(participation.policySnapshot, toQuizAttemptPolicy(quiz));

    const replayedAttempt = await tx.standaloneQuizAttempt.findUnique({
      where: { participationId_startRequestId: { participationId: participation.id, startRequestId: effectiveStartRequestId } },
      include: { answers: true },
    });
    if (replayedAttempt) {
      const replayedQuiz = buildAttemptQuiz(quiz, replayedAttempt);
      return { attempt: replayedAttempt, policy: toQuizAttemptPolicy(replayedQuiz), quiz: replayedQuiz, state: "replayed" as const };
    }

    const attempts = await tx.standaloneQuizAttempt.findMany({
      where: { participationId: participation.id },
      orderBy: { attemptNo: "desc" },
      select: { attemptNo: true, createdAt: true, id: true, startRequestId: true, status: true, submittedAt: true, updatedAt: true },
    });
    const current = attempts.find((attempt) => attempt.status === "in_progress");
    if (current) {
      let attempt = await tx.standaloneQuizAttempt.findUniqueOrThrow({ where: { id: current.id }, include: { answers: true } });
      // Legacy attempts may predate explicit Start keys. Bind the first
      // accepted retry key while the attempt is still active so a client
      // retry remains tied to the same attempt instead of allocating later.
      if (!attempt.startRequestId) {
        attempt = await tx.standaloneQuizAttempt.update({
          where: { id: current.id },
          data: { startRequestId: effectiveStartRequestId },
          include: { answers: true },
        });
      }
      const resumedQuiz = buildAttemptQuiz(quiz, attempt);
      return { attempt, policy: toQuizAttemptPolicy(resumedQuiz), quiz: resumedQuiz, state: "resumed" as const };
    }

    const terminalAttempts = attempts.filter((attempt) => isTerminalStandaloneQuizAttemptStatus(attempt.status));
    if (participationPolicy.attemptsAllowed !== null && terminalAttempts.length >= participationPolicy.attemptsAllowed) {
      throw new QuizAttemptValidationError("Batas percobaan quiz ini sudah tercapai.");
    }
    const previous = terminalAttempts[0];
    if (previous && participationPolicy.retryDelaySeconds !== null) {
      const previousAt = previous.submittedAt ?? previous.updatedAt ?? previous.createdAt;
      const retryAt = previousAt.getTime() + participationPolicy.retryDelaySeconds * 1000;
      if (checkNow.getTime() < retryAt) {
        throw new QuizAttemptValidationError(`Percobaan berikutnya tersedia pada ${new Date(retryAt).toLocaleString("id-ID")}.`);
      }
    }

    const attemptId = crypto.randomUUID();
    const policy = participationPolicy;
    const orderedItems = orderStandaloneQuizItems(quiz.items, attemptId, policy.formBehavior);
    const attempt = await tx.standaloneQuizAttempt.create({
      data: {
        formItemOrder: orderedItems.map((item) => item.id) as Prisma.InputJsonArray,
        formSnapshot: toAttemptFormSnapshot(orderedItems) as unknown as Prisma.InputJsonObject,
        id: attemptId,
        attemptNo: (attempts[0]?.attemptNo ?? 0) + 1,
        participationId: participation.id,
        policySnapshot: policy as unknown as Prisma.InputJsonObject,
        startRequestId: effectiveStartRequestId,
      },
      include: { answers: true },
    });
    const startedQuiz = buildAttemptQuiz(quiz, attempt);
    return { attempt, policy: toQuizAttemptPolicy(startedQuiz), quiz: startedQuiz, state: "started" as const };
  });
}

async function getStandaloneQuizAttempt(subjectCode: string, slug: string, studentId: string, attemptId?: string, now = new Date()) {
  if (!attemptId || !isUuid(attemptId)) return null;
  void now;
  const attempt = await prisma.standaloneQuizAttempt.findFirst({
    where: {
      id: attemptId,
      participation: {
        quiz: { slug, subtest: { code: subjectCode } },
        studentId,
      },
    },
    include: {
      answers: true,
      participation: { include: { quiz: { include: quizInclude } } },
    },
  });
  if (!attempt) return null;
  if (attempt.status !== "in_progress" && !isReviewableStandaloneQuizAttemptStatus(attempt.status)) return null;
  const quiz = buildAttemptQuiz(attempt.participation.quiz, attempt);
  const policy = policyFromAttemptSnapshot(attempt.participation.policySnapshot, toQuizAttemptPolicy(quiz));
  return { attempt, attemptId: attempt.id, attemptNo: attempt.attemptNo, policy, quiz: { ...quiz, ...policy } };
}

async function saveStandaloneQuizAnswer(attemptId: string, quizItemId: string, selectedOptionIdsInput: readonly string[] | string, studentId: string) {
  if (!isUuid(attemptId)) throw new QuizAttemptValidationError("Sesi quiz tidak valid.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM standalone_quiz_attempts WHERE id = ${attemptId}::uuid FOR UPDATE`;
    const attempt = await tx.standaloneQuizAttempt.findFirst({
      where: { id: attemptId, participation: { studentId } },
      select: { formSnapshot: true, id: true, participation: { select: { quizId: true } }, status: true },
    });
    if (!attempt) throw new QuizAttemptValidationError("Sesi quiz tidak ditemukan atau sudah ditutup.");
    if (attempt.status !== "in_progress") throw new QuizAttemptValidationError("Quiz ini sudah dikirim dan jawabannya tidak dapat diubah.");
    const requestedOptionIds = typeof selectedOptionIdsInput === "string" ? [selectedOptionIdsInput] : [...selectedOptionIdsInput];
    const snapshot = parseAttemptFormSnapshot(attempt.formSnapshot);
    const snapshotItem = snapshot?.items.find((item) => item.id === quizItemId);
    const item = await tx.standaloneQuizItem.findFirst({
      where: { id: quizItemId, quizId: attempt.participation.quizId },
      select: { options: { select: { id: true } }, questionType: true },
    });
    if (!item) throw new QuizAttemptValidationError("Soal quiz tidak ditemukan.");
    const mode = snapshotItem?.questionType ?? answerModeForQuestionType(item.questionType) ?? "single_choice";
    const availableOptionIds = snapshotItem?.options.map((option) => option.id) ?? item.options.map((option) => option.id);
    const validation = validateSelectedOptionIds(mode, requestedOptionIds, availableOptionIds);
    if (!validation.ok) throw new QuizAttemptValidationError(validation.errors[0]?.message ?? "Pilihan jawaban tidak valid untuk bentuk soal ini.");
    const persistedOptionIds = new Set(item.options.map((option) => option.id));
    if (validation.selectedOptionIds.some((optionId) => !persistedOptionIds.has(optionId))) {
      throw new QuizAttemptValidationError("Pilihan jawaban tidak valid untuk soal ini.");
    }
    if (!validation.selectedOptionIds.length) {
      await tx.standaloneQuizAnswer.deleteMany({ where: { attemptId, quizItemId } });
      return { quizItemId, selectedOptionId: null, selectedOptionIds: [] };
    }
    const selectedOptionId = validation.selectedOptionIds[0]!;
    const selectedOptionIds = validation.selectedOptionIds as Prisma.InputJsonArray;
    const answerFormat = mode === "multiple_choice" ? StandaloneQuizAnswerFormat.multiple_options : StandaloneQuizAnswerFormat.single_option;
    await tx.standaloneQuizAnswer.upsert({
      where: { attemptId_quizItemId: { attemptId, quizItemId } },
      create: { answerFormat, attemptId, quizItemId, selectedOptionId, selectedOptionIds },
      update: { answerFormat, isCorrect: null, pointsAwarded: null, scoringVersion: null, selectedOptionId, selectedOptionIds },
    });
    return { quizItemId, selectedOptionId, selectedOptionIds: validation.selectedOptionIds };
  });
}

async function submitStandaloneQuiz(attemptId: string, studentId: string) {
  if (!isUuid(attemptId)) throw new QuizAttemptValidationError("Sesi quiz tidak valid.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM standalone_quiz_attempts WHERE id = ${attemptId}::uuid FOR UPDATE`;
    const attempt = await tx.standaloneQuizAttempt.findFirst({
      where: { id: attemptId, participation: { studentId } },
      include: {
        answers: true,
        participation: { include: { quiz: { select: { closesAt: true, items: { select: { id: true } }, reviewTiming: true } } } },
      },
    });
    if (!attempt) throw new QuizAttemptValidationError("Sesi quiz tidak ditemukan atau sudah ditutup.");
    if (attempt.status !== "in_progress") return { attemptId: attempt.id, scoringState: attempt.scoringState, state: "already_submitted" as const };

    const submittedAt = new Date();
    const snapshot = parseAttemptFormSnapshot(attempt.formSnapshot);
    const totalQuestions = snapshot?.items.length ?? attempt.participation.quiz.items.length;
    const policy = policyFromAttemptSnapshot(attempt.policySnapshot, {
      attemptsAllowed: null,
      correctAnswerVisibility: "show",
      formBehavior: "same",
      retryDelaySeconds: null,
      reviewTiming: attempt.participation.quiz.reviewTiming,
      scorePolicy: "latest",
    });

    if (!snapshot || !snapshot.items.length) {
      await tx.standaloneQuizAttempt.update({
        where: { id: attempt.id },
        data: {
          attemptState: AssessmentAttemptState.submitted,
          scoringProvenance: AssessmentScoringProvenance.legacy_unknown,
          scoringReviewReason: "Frozen Kuis form snapshot is missing or malformed.",
          scoringState: AssessmentScoringState.review_required,
          releaseState: AssessmentResultReleaseState.hidden,
          status: "submitted",
          submittedAt,
        },
      });
      return { attemptId: attempt.id, scoringState: AssessmentScoringState.review_required, state: "review_required" as const };
    }

    const itemById = new Map(snapshot.items.map((item) => [item.id, item]));
    let invalidAnswer = false;
    let correctCount = 0;
    const updates: Array<{ id: string; isCorrect: boolean }> = [];
    for (const answer of attempt.answers) {
      const item = itemById.get(answer.quizItemId);
      const selectedOptionIds = storedAnswerSelectionIds(answer);
      const evaluation = item && selectedOptionIds
        ? evaluateExactAnswer({
          availableOptionIds: item.options.map((option) => option.id),
          correctOptionIds: item.options.filter((option) => option.isCorrect).map((option) => option.id),
          mode: item.questionType,
          selectedOptionIds,
        })
        : null;
      if (!evaluation || evaluation.status === "invalid" || evaluation.status === "unanswered") {
        invalidAnswer = true;
        continue;
      }
      const isCorrect = evaluation.status === "correct";
      if (isCorrect) correctCount += 1;
      updates.push({ id: answer.id, isCorrect });
    }
    await Promise.all(
      updates.map(({ id, isCorrect }) =>
        tx.standaloneQuizAnswer.update({
          where: { id },
          data: { isCorrect, pointsAwarded: isCorrect ? 1 : 0, scoringVersion: KUIS_SCORING_VERSION },
        }),
      ),
    );

    if (invalidAnswer) {
      await tx.standaloneQuizAttempt.update({
        where: { id: attempt.id },
        data: {
          attemptState: AssessmentAttemptState.submitted,
          scoringProvenance: AssessmentScoringProvenance.legacy_unknown,
          scoringReviewReason: "One or more submitted answers are absent from the frozen Kuis form snapshot.",
          scoringState: AssessmentScoringState.review_required,
          releaseState: AssessmentResultReleaseState.hidden,
          status: "submitted",
          submittedAt,
        },
      });
      return { attemptId: attempt.id, scoringState: AssessmentScoringState.review_required, state: "review_required" as const };
    }

    const answeredCount = attempt.answers.length;
    const unansweredCount = Math.max(0, totalQuestions - answeredCount);
    const wrongCount = Math.max(0, answeredCount - correctCount);
    const score = totalQuestions ? Math.round((correctCount / totalQuestions) * 100) : 0;
    let releaseState: AssessmentResultReleaseState = AssessmentResultReleaseState.hidden;
    let releaseAt: Date | null = null;
    if (policy.reviewTiming === "immediate") releaseState = AssessmentResultReleaseState.released;
    else if (policy.reviewTiming === "after_close" && attempt.participation.quiz.closesAt) {
      if (attempt.participation.quiz.closesAt <= submittedAt) releaseState = AssessmentResultReleaseState.released;
      else {
        releaseState = AssessmentResultReleaseState.scheduled;
        releaseAt = attempt.participation.quiz.closesAt;
      }
    }
    await tx.standaloneQuizAttempt.update({
      where: { id: attempt.id },
      data: {
        attemptState: AssessmentAttemptState.submitted,
        correctCount,
        earnedPoints: correctCount,
        maxPoints: totalQuestions,
        releaseAt,
        releaseState,
        scoringProvenance: AssessmentScoringProvenance.runtime,
        scoringReviewReason: null,
        scoringState: AssessmentScoringState.scored,
        scoringVersion: KUIS_SCORING_VERSION,
        score,
        status: "submitted",
        submittedAt,
        unansweredCount,
        wrongCount,
      },
    });
    return { attemptId: attempt.id, releaseState, scoringState: AssessmentScoringState.scored, state: "submitted" as const };
  });
}

async function synchronizeStandaloneQuizReleaseState(attemptId: string, studentId: string, now: Date) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM standalone_quiz_attempts WHERE id = ${attemptId}::uuid FOR UPDATE`;
    const attempt = await tx.standaloneQuizAttempt.findFirst({
      where: { id: attemptId, participation: { studentId } },
      select: { releaseAt: true, releaseState: true, scoringState: true },
    });
    if (!attempt || attempt.releaseState !== AssessmentResultReleaseState.scheduled || !attempt.releaseAt || attempt.releaseAt > now || attempt.scoringState !== AssessmentScoringState.scored) return;
    await tx.standaloneQuizAttempt.update({ where: { id: attemptId }, data: { releaseState: AssessmentResultReleaseState.released } });
  });
}

async function getStandaloneQuizResult(attemptId: string, studentId: string, subjectCode: string, slug: string, now = new Date()) {
  if (!isUuid(attemptId)) return null;
  await synchronizeStandaloneQuizReleaseState(attemptId, studentId, now);
  const attempt = await prisma.standaloneQuizAttempt.findFirst({
    where: { id: attemptId, participation: { quiz: { slug, subtest: { code: subjectCode } }, studentId } },
    include: {
      answers: true,
      participation: {
      include: {
          attempts: {
            orderBy: { attemptNo: "asc" },
            select: {
              attemptNo: true,
              createdAt: true,
              releaseState: true,
              score: true,
              scoringState: true,
              status: true,
              submittedAt: true,
              updatedAt: true,
            },
          },
          quiz: { include: quizInclude },
        },
      },
    },
  });
  if (!attempt) return null;
  const reviewEligible = isReviewableStandaloneQuizAttemptStatus(attempt.status);
  if (!reviewEligible) return null;
  const quiz = buildAttemptQuiz(attempt.participation.quiz, attempt);
  const totalQuestions = quiz.items.length;
  const selectedOptionIdsByItem = new Map(attempt.answers.map((answer) => [answer.quizItemId, storedAnswerSelectionIds(answer) ?? []]));
  const policy = policyFromAttemptSnapshot(attempt.participation.policySnapshot, toQuizAttemptPolicy(quiz));
  const isSubmitted = true;
  const releaseState = attempt.releaseState;
  const released = releaseState === AssessmentResultReleaseState.released && attempt.scoringState === AssessmentScoringState.scored;
  const reviewAvailable = released && (policy.reviewTiming === "immediate"
    || (policy.reviewTiming === "after_close" && quiz.closesAt !== null && quiz.closesAt <= now));
  const correctnessAvailable = reviewAvailable && policy.correctAnswerVisibility === "show";
  const activeAttempt = attempt.participation.attempts.some((candidate) => candidate.status === "in_progress");
  const terminalAttempts = attempt.participation.attempts.filter((candidate) => isTerminalStandaloneQuizAttemptStatus(candidate.status));
  const latestTerminalAttempt = terminalAttempts.at(-1);
  const latestTerminalAt = latestTerminalAttempt?.submittedAt ?? latestTerminalAttempt?.updatedAt ?? latestTerminalAttempt?.createdAt;
  const attemptsRemain = policy.attemptsAllowed === null || terminalAttempts.length < policy.attemptsAllowed;
  const retryDelayPassed = latestTerminalAt === undefined
    || policy.retryDelaySeconds === null
    || latestTerminalAt.getTime() + policy.retryDelaySeconds * 1000 <= now.getTime();
  const quizAvailable = attempt.participation.quiz.status === ContentStatus.published
    && (attempt.participation.quiz.opensAt === null || attempt.participation.quiz.opensAt <= now)
    && (attempt.participation.quiz.closesAt === null || attempt.participation.quiz.closesAt > now);
  const canRestart = quizAvailable && (activeAttempt || (attemptsRemain && retryDelayPassed));
  const releasedAttempts = attempt.participation.attempts.filter((candidate) => candidate.releaseState === AssessmentResultReleaseState.released);
  return {
    answeredCount: attempt.answers.length,
    canRestart,
    correctCount: released ? attempt.correctCount : null,
    attemptId: attempt.id,
    attemptNo: attempt.attemptNo,
    attemptScore: released ? attempt.score : null,
    aggregateScore: aggregateStandaloneQuizScore(releasedAttempts, policy.scorePolicy, true),
    correctnessAvailable,
    isSubmitted,
    policy,
    questions: quiz.items.map((item) => {
      const selectedOptionIds = selectedOptionIdsByItem.get(item.id) ?? [];
      return { explanation: reviewAvailable ? item.explanation : null, id: item.id, options: item.options.map((option) => ({ correct: correctnessAvailable && option.isCorrect, id: option.id, key: option.choiceKey, text: option.content })), prompt: item.prompt, questionType: answerModeForQuestionType(item.questionType) ?? "single_choice", selectedOptionId: selectedOptionIds[0] ?? null, selectedOptionIds };
    }),
    releaseAt: attempt.releaseAt?.toISOString() ?? null,
    releaseState,
    released,
    reviewAvailable,
    scoringState: attempt.scoringState,
    scoringVersion: attempt.scoringVersion,
    score: aggregateStandaloneQuizScore(releasedAttempts, policy.scorePolicy, true),
    title: quiz.title,
    totalQuestions,
  };
}

async function getStandaloneQuizAttemptId(subjectCode: string, slug: string, studentId: string) {
  const attempt = await prisma.standaloneQuizAttempt.findFirst({
    where: { participation: { quiz: { slug, subtest: { code: subjectCode } }, studentId }, status: { in: [...reviewableStandaloneQuizAttemptStatuses] } },
    orderBy: [{ attemptNo: "desc" }, { submittedAt: "desc" }],
    select: { id: true },
  });
  return attempt?.id ?? null;
}

async function getStandaloneQuizAttemptStatuses(studentId: string, quizIds: string[]) {
  if (!quizIds.length) return [];
  return prisma.standaloneQuizParticipation.findMany({
    where: { quizId: { in: quizIds }, studentId },
    select: { attempts: { orderBy: { attemptNo: "desc" }, select: { attemptNo: true, id: true, status: true, submittedAt: true } }, policySnapshot: true, quizId: true },
  });
}
async function getAvailableStandaloneQuizCatalogue(now = new Date()) { return prisma.standaloneQuiz.findMany({ where: studentAvailabilityWhere(now), include: quizInclude, orderBy: { updatedAt: "desc" } }); }

export { acceptStandaloneQuizQuestionUpdate, attachStandaloneQuizAssembly, bulkPublishStandaloneQuizzes, bulkUnpublishStandaloneQuizzes, detachStandaloneQuizAssembly, getAvailableStandaloneQuiz, getAvailableStandaloneQuizCatalogue, getMentorStandaloneQuiz, getMentorStandaloneQuizResults, getMentorStandaloneQuizSubmission, getMentorStandaloneQuizzes, getStandaloneQuizAttempt, getStandaloneQuizAttemptId, getStandaloneQuizAttemptStatuses, getStandaloneQuizResult, getStandaloneQuizSubjects, getSubjectMetadata, getSubjectMetadataBySlug, importStandaloneQuizBankQuestions, isReviewableStandaloneQuizAttemptStatus, isTerminalStandaloneQuizAttemptStatus, saveStandaloneQuiz, saveStandaloneQuizAnswer, startStandaloneQuiz, studentAvailabilityWhere, submitStandaloneQuiz, terminalStandaloneQuizAttemptStatuses, transitionStandaloneQuizSourceMode, updateStandaloneQuizLifecycle, QuizAttemptValidationError, QuizValidationError };
export type { AcceptStandaloneQuizQuestionUpdateInput, SaveStandaloneQuizInput, StandaloneQuizAssemblySummary, TransitionStandaloneQuizSourceModeInput };
