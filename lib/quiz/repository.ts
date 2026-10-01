import "server-only";

import {
  AssessmentAttemptState,
  AssessmentResultReleaseState,
  AssessmentScoringProvenance,
  AssessmentScoringState,
  ContentStatus,
  DifficultyLevel,
  MediaAssetState,
  MediaLibraryScope,
  Prisma,
  QuestionBankPurpose,
  QuestionRevisionProvenance,
  QuestionRevisionStatus,
  QuestionType,
  ReusableQuestionPackageMode,
  StandaloneQuizAnswerFormat,
  StandaloneQuizVersionProvenance,
  StandaloneQuizVersionState,
} from "@/generated/prisma/client";
import {
  decodeLegacyAnswerSelection,
  evaluateExactAnswer,
  validateAnswerKey,
  validateSelectedOptionIds,
  type QuestionAnswerMode,
} from "@/lib/question-bank/answer-contract";
import { prisma } from "@/lib/prisma";
import { asQuizOwnedQuestion } from "@/lib/quiz/question-ownership";
import {
  draftRevisionMatches,
  isStandaloneQuizVersioningCutoverEnabled,
  nextStandaloneQuizVersionNo,
  versionedAssessmentDigest,
  versionedDefinitionDigest,
} from "@/lib/quiz/versioning-runtime";
import {
  resolveReadyAssemblyForKuis,
  type KuisAssemblyMaterialization,
} from "@/lib/tryout/assembly-repository";
import { AssemblyValidationError } from "@/lib/tryout/assembly-validation";
import {
  assertAuthoringEditLease,
  type AuthoringEditLease,
} from "@/lib/serialization/authoring-lease";
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
  {
    code: "PU",
    description: "Penalaran umum dan logika argumen.",
    name: "Penalaran Umum",
    slug: "penalaran-umum",
  },
  {
    code: "PPU",
    description: "Pengetahuan dan pemahaman umum.",
    name: "Pengetahuan dan Pemahaman Umum",
    slug: "pengetahuan-pemahaman-umum",
  },
  {
    code: "PBM",
    description: "Pemahaman bacaan dan menulis.",
    name: "Pemahaman Bacaan dan Menulis",
    slug: "pemahaman-bacaan-menulis",
  },
  {
    code: "PK",
    description: "Pengetahuan kuantitatif dan numerasi.",
    name: "Pengetahuan Kuantitatif",
    slug: "pengetahuan-kuantitatif",
  },
  {
    code: "LBI",
    description: "Literasi dalam Bahasa Indonesia.",
    name: "Literasi Bahasa Indonesia",
    slug: "literasi-bahasa-indonesia",
  },
  {
    code: "LBE",
    description: "Literasi dalam Bahasa Inggris.",
    name: "Literasi Bahasa Inggris",
    slug: "literasi-bahasa-inggris",
  },
  {
    code: "PM",
    description: "Penalaran matematika dan pemecahan masalah.",
    name: "Penalaran Matematika",
    slug: "penalaran-matematika",
  },
] as const;

type SaveStandaloneQuizInput = {
  assemblyVersionId?: string | null;
  attemptsAllowed?: number | null;
  closesAt: string;
  correctAnswerVisibility?: QuizCorrectAnswerVisibility;
  description: string;
  durationSeconds?: number | null;
  editLease?: AuthoringEditLease;
  expectedDraftRevision?: number | null;
  formBehavior?: QuizFormBehavior;
  id?: string;
  opensAt: string;
  publishRequestId?: string | null;
  questions: QuizQuestionSnapshot[];
  /** Persist independent quiz copies, atomically detaching any existing bank/assembly binding. */
  questionOwnership?: "quiz";
  retryDelaySeconds?: number | null;
  reviewTiming?: QuizReviewTiming;
  scorePolicy?: QuizScorePolicy;
  /** The source mode is a command discriminator. Lineage is always read from the database. */
  sourceMode?: "local" | "bank";
  sourceBankId?: string | null;
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
  rule: {
    easyCount: number;
    hardCount: number;
    mediumCount: number;
    requestedCount: number;
  } | null;
  subtestCode: string;
  versionId: string;
  versionNo: number;
};
class QuizValidationError extends Error {}
const KUIS_SCORING_VERSION = "kuis-frozen-form-v1";
const quizInclude = {
  assemblyPackageVersion: {
    include: {
      bankScopes: {
        include: {
          questionBank: { select: { id: true, name: true, purpose: true } },
        },
        orderBy: { questionBankId: "asc" as const },
      },
      categoryScopes: {
        include: { category: { select: { id: true, name: true } } },
        orderBy: { categoryId: "asc" as const },
      },
      folderScopes: {
        include: { folder: { select: { id: true, name: true } } },
        orderBy: { folderId: "asc" as const },
      },
      package: { select: { id: true, title: true } },
      rule: true,
      subtest: { select: { code: true, id: true } },
    },
  },
  items: {
    include: { options: { orderBy: { sortOrder: "asc" as const } } },
    orderBy: { sortOrder: "asc" as const },
  },
  sourceBank: { select: { id: true, name: true, purpose: true, status: true } },
  subtest: true,
} satisfies Prisma.StandaloneQuizInclude;
const quizContentInclude = {
  items: {
    include: { options: { orderBy: { sortOrder: "asc" as const } } },
    orderBy: { sortOrder: "asc" as const },
  },
  subtest: true,
} satisfies Prisma.StandaloneQuizInclude;
const quizVersionItemsInclude = {
  items: {
    include: { options: { orderBy: { sortOrder: "asc" as const } } },
    orderBy: { sortOrder: "asc" as const },
  },
} satisfies Prisma.StandaloneQuizVersionInclude;
const versionedQuizInclude = {
  ...quizInclude,
  versions: {
    include: quizVersionItemsInclude,
    orderBy: { updatedAt: "desc" as const },
  },
} satisfies Prisma.StandaloneQuizInclude;

const scorePolicies = ["highest", "latest", "first", "average"] as const;
const formBehaviors = ["same", "fresh_randomized"] as const;
const reviewTimings = ["immediate", "after_close", "never"] as const;
const correctAnswerVisibilities = ["show", "hide"] as const;

type VersionedQuizRecord = Prisma.StandaloneQuizGetPayload<{
  include: typeof versionedQuizInclude;
}>;
type VersionedQuizVersionRecord = VersionedQuizRecord["versions"][number];
type StableQuizRecord = Prisma.StandaloneQuizGetPayload<{
  include: typeof quizInclude;
}>;

function activeVersionFor(record: VersionedQuizRecord) {
  return (
    record.versions.find(
      (version) => version.state === StandaloneQuizVersionState.active,
    ) ?? null
  );
}

function draftVersionFor(record: VersionedQuizRecord) {
  return (
    record.versions.find(
      (version) => version.state === StandaloneQuizVersionState.draft,
    ) ?? null
  );
}

function projectStandaloneQuizVersion(
  record: VersionedQuizRecord,
  version: VersionedQuizVersionRecord,
): StableQuizRecord {
  return {
    ...record,
    assemblyDefinitionDigest: version.assemblyDefinitionDigest,
    assemblyMode: version.assemblyMode,
    assemblyPackageVersionId: version.assemblyPackageVersionId,
    assemblySeed: version.assemblySeed,
    attemptsAllowed: version.attemptsAllowed,
    correctAnswerVisibility: version.correctAnswerVisibility,
    // Editorial copy belongs to the stable quiz identity. It can change
    // immediately without changing the assessment snapshot used for answers
    // or scoring.
    description: record.description,
    durationSeconds: version.durationSeconds,
    formBehavior: version.formBehavior,
    items: version.items,
    // Schedule/visibility is operational state on the stable quiz identity.
    // It must not move an in-progress attempt or activate a new assessment
    // snapshot when a mentor only changes availability.
    closesAt: record.closesAt,
    opensAt: record.opensAt,
    retryDelaySeconds: version.retryDelaySeconds,
    reviewTiming: version.reviewTiming,
    scorePolicy: version.scorePolicy,
    sourceBankId: version.sourceBankId,
    title: record.title,
  } as unknown as StableQuizRecord;
}

function isOneOf<T extends string>(
  value: string,
  values: readonly T[],
): value is T {
  return values.includes(value as T);
}

function normalizeQuizPolicy(
  input: Pick<
    SaveStandaloneQuizInput,
    | "attemptsAllowed"
    | "correctAnswerVisibility"
    | "durationSeconds"
    | "formBehavior"
    | "retryDelaySeconds"
    | "reviewTiming"
    | "scorePolicy"
  >,
) {
  if (
    input.attemptsAllowed !== undefined &&
    input.attemptsAllowed !== null &&
    (!Number.isInteger(input.attemptsAllowed) || input.attemptsAllowed < 1)
  ) {
    throw new QuizValidationError(
      "Jumlah percobaan harus bilangan bulat positif atau dikosongkan untuk tanpa batas.",
    );
  }
  if (
    input.retryDelaySeconds !== undefined &&
    input.retryDelaySeconds !== null &&
    (!Number.isInteger(input.retryDelaySeconds) || input.retryDelaySeconds < 0)
  ) {
    throw new QuizValidationError("Jeda percobaan tidak valid.");
  }
  if (
    input.durationSeconds !== undefined &&
    input.durationSeconds !== null &&
    (!Number.isInteger(input.durationSeconds) || input.durationSeconds < 1)
  ) {
    throw new QuizValidationError(
      "Durasi pengerjaan harus bilangan bulat positif atau dikosongkan untuk tanpa batas.",
    );
  }
  if (
    input.scorePolicy !== undefined &&
    !isOneOf(input.scorePolicy, scorePolicies)
  )
    throw new QuizValidationError("Kebijakan skor tidak valid.");
  if (
    input.formBehavior !== undefined &&
    !isOneOf(input.formBehavior, formBehaviors)
  )
    throw new QuizValidationError("Bentuk soal percobaan tidak valid.");
  if (
    input.reviewTiming !== undefined &&
    !isOneOf(input.reviewTiming, reviewTimings)
  )
    throw new QuizValidationError("Waktu review tidak valid.");
  if (
    input.correctAnswerVisibility !== undefined &&
    !isOneOf(input.correctAnswerVisibility, correctAnswerVisibilities)
  )
    throw new QuizValidationError("Visibilitas jawaban benar tidak valid.");

  return {
    attemptsAllowed: input.attemptsAllowed,
    correctAnswerVisibility: input.correctAnswerVisibility,
    durationSeconds: input.durationSeconds,
    formBehavior: input.formBehavior,
    retryDelaySeconds: input.retryDelaySeconds,
    reviewTiming: input.reviewTiming,
    scorePolicy: input.scorePolicy,
  };
}

function getSubjectMetadata(code: string) {
  return subjectMetadata.find((subject) => subject.code === code) ?? null;
}
function getSubjectMetadataBySlug(slug: string) {
  return subjectMetadata.find((subject) => subject.slug === slug) ?? null;
}
function getStandaloneQuizSubjects() {
  return subjectMetadata;
}
function parseOptionalDate(value: string, name: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new QuizValidationError(`${name} tidak valid.`);
  return date;
}
function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "quiz"
  );
}
function isReadyAsset(asset: { state: string } | null) {
  return !asset || asset.state === "ready";
}

function answerModeForQuestionType(
  value: QuestionType | string | null | undefined,
): QuestionAnswerMode | null {
  if (value === QuestionType.multiple_choice || value === "multiple_choice")
    return "multiple_choice";
  if (
    value === QuestionType.single_choice ||
    value === "single_choice" ||
    value === null ||
    value === undefined
  )
    return "single_choice";
  return null;
}

function correctChoiceIdsFromOptions(
  options: readonly { choiceKey: string; isCorrect: boolean }[],
) {
  return options
    .filter((option) => option.isCorrect)
    .map((option) => option.choiceKey);
}

function jsonStringArray(
  value: Prisma.JsonValue | null | undefined,
): string[] | null {
  return Array.isArray(value) &&
    value.every((item): item is string => typeof item === "string")
    ? [...value]
    : null;
}

function storedAnswerSelectionIds(answer: {
  selectedOptionId: string | null;
  selectedOptionIds: Prisma.JsonValue | null;
}) {
  const decoded = decodeLegacyAnswerSelection({
    selectedOptionId: answer.selectedOptionId,
    selectedOptionIds: jsonStringArray(answer.selectedOptionIds),
  });
  return decoded.ok ? decoded.selectedOptionIds : null;
}

const quizSourceInclude = {
  currentRevision: {
    include: {
      explanationAsset: true,
      options: {
        include: { asset: true },
        orderBy: { sortOrder: "asc" as const },
      },
      promptAsset: true,
    },
  },
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
  if (
    !sources.length ||
    sources.some((source) => {
      const revision = source.currentRevision;
      const options = revision?.options ?? source.options;
      const answerMode = answerModeForQuestionType(
        revision?.questionType ?? source.questionType,
      );
      const answerKey = answerMode
        ? validateAnswerKey(
            answerMode,
            options.map((option) => ({
              id: option.label,
              isCorrect: option.isCorrect,
            })),
          )
        : null;
      return (
        source.questionBankId !== sourceBankId ||
        source.questionBank?.purpose !== expectedPurpose ||
        source.questionBank?.status === ContentStatus.archived ||
        source.status === ContentStatus.archived ||
        source.status !== ContentStatus.published ||
        revision?.status !== QuestionRevisionStatus.ready ||
        source.subtest?.code !== subtestCode ||
        options.length < 2 ||
        options.length > 5 ||
        !answerKey?.ok ||
        options.some(
          (option) => !option.content.trim() || !isReadyAsset(option.asset),
        ) ||
        !revision?.stem.trim() ||
        !isReadyAsset(revision?.promptAsset ?? null) ||
        !isReadyAsset(revision?.explanationAsset ?? null)
      );
    })
  ) {
    throw new QuizValidationError(
      "Kuis hanya dapat menggunakan soal siap dari satu Bank aktif, dengan media dan subtes yang sama.",
    );
  }
}

function toSnapshot(
  item: Prisma.StandaloneQuizItemGetPayload<{ include: { options: true } }>,
): QuizQuestionSnapshot {
  const correctChoiceIds = correctChoiceIdsFromOptions(item.options);
  return {
    choices: item.options.map((option) => ({
      id: option.choiceKey,
      mediaAssetId: option.assetId ?? undefined,
      text: option.content,
    })),
    correctChoiceId: correctChoiceIds[0] ?? "",
    correctChoiceIds,
    difficulty: item.difficulty,
    explanation: item.explanation ?? "",
    explanationMediaAssetId: item.explanationAssetId ?? undefined,
    id: item.id,
    origin: item.sourceQuestionId ? "bank" : "local",
    prompt: item.prompt,
    promptMediaAssetId: item.promptAssetId ?? undefined,
    questionType:
      answerModeForQuestionType(item.questionType) ?? "single_choice",
    sourceContentDigest: item.sourceContentDigest ?? undefined,
    sourceQuestionId: item.sourceQuestionId ?? undefined,
    sourceQuestionRevisionId: item.sourceQuestionRevisionId ?? undefined,
    sourceRevisionProvenance: item.sourceRevisionProvenance ?? undefined,
  };
}

type QuizBankImportSelection = {
  contentDigest?: string | null;
  questionId: string;
  revisionId?: string | null;
};

type StandaloneQuizBankSnapshotExpectedRevision = {
  contentDigest?: string | null;
  questionId: string;
  revisionId: string;
};

type StandaloneQuizBankSnapshotImportBase = {
  bankId: string;
  editLease: AuthoringEditLease;
  expectedDraftRevision: number;
  quizId: string;
};

type ImportStandaloneQuizBankQuestionSnapshotsInput =
  | (StandaloneQuizBankSnapshotImportBase & {
      allInBank: true;
      expectedSourceRevisions?: never;
      questionIds?: never;
    })
  | (StandaloneQuizBankSnapshotImportBase & {
      allInBank?: false;
      expectedSourceRevisions: readonly StandaloneQuizBankSnapshotExpectedRevision[];
      questionIds: readonly string[];
    });

type QuizBankSourceRecord = Prisma.QuestionGetPayload<{
  include: typeof quizSourceInclude;
}>;

function materializedQuizQuestion(source: QuizBankSourceRecord) {
  const revision = source.currentRevision;
  if (!revision)
    throw new QuizValidationError("Soal Bank tidak memiliki revisi aktif.");
  if (!source.subtestId)
    throw new QuizValidationError("Soal Bank tidak memiliki subtes.");
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
  if (
    !revision ||
    source.questionBank?.purpose !== QuestionBankPurpose.quiz ||
    source.questionBank.status === ContentStatus.archived ||
    source.status !== ContentStatus.published ||
    source.subtest?.code !== expectedSubtestCode ||
    revision.status !== QuestionRevisionStatus.ready ||
    !revision.stem.trim() ||
    revision.options.length < 2 ||
    revision.options.length > 5 ||
    revision.options.some(
      (option) => !option.content.trim() || !isReadyAsset(option.asset),
    ) ||
    !isReadyAsset(revision.promptAsset) ||
    !isReadyAsset(revision.explanationAsset)
  ) {
    return null;
  }
  const answerMode = answerModeForQuestionType(revision.questionType);
  if (!answerMode) return null;
  const choices = revision.options.map((option, index) => ({
    id: option.label || String.fromCharCode(65 + index),
    mediaAssetId: option.assetId ?? undefined,
    text: option.content,
  }));
  const correctChoiceIds = choices
    .filter((_, index) => revision.options[index]?.isCorrect)
    .map((choice) => choice.id);
  const correctChoiceIdSet = new Set(correctChoiceIds);
  const answerKey = validateAnswerKey(
    answerMode,
    choices.map((choice) => ({
      id: choice.id,
      isCorrect: correctChoiceIdSet.has(choice.id),
    })),
  );
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
    sourceRevisionProvenance:
      revision.provenance as QuizQuestionSourceUpdate["sourceRevisionProvenance"],
  };
}

async function getQuizQuestionsWithSourceUpdates(
  items: Array<
    Prisma.StandaloneQuizItemGetPayload<{ include: { options: true } }>
  >,
  subtestCode: string,
) {
  const sourceQuestionIds = [
    ...new Set(
      items
        .map((item) => item.sourceQuestionId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!sourceQuestionIds.length) return items.map(toSnapshot);
  const sources = await prisma.question.findMany({
    where: { id: { in: sourceQuestionIds } },
    include: quizSourceInclude,
  });
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return items.map((item) => {
    const snapshot = toSnapshot(item);
    if (
      !item.sourceQuestionId ||
      !item.sourceQuestionRevisionId ||
      !item.sourceContentDigest ||
      item.sourceRevisionProvenance === "legacy_unknown"
    ) {
      return snapshot;
    }
    const source = sourceById.get(item.sourceQuestionId);
    const revision = source?.currentRevision;
    if (
      !revision ||
      (revision.id === item.sourceQuestionRevisionId &&
        revision.contentDigest === item.sourceContentDigest)
    ) {
      return snapshot;
    }
    const sourceUpdate = source
      ? latestReadySourceUpdate(source, subtestCode)
      : null;
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
  if (!questionIds.length)
    throw new QuizValidationError(
      "Pilih minimal satu soal dari Bank Soal Kuis.",
    );
  if (questionIds.some((questionId) => !questionId.trim()))
    throw new QuizValidationError("Identitas soal Bank tidak valid.");

  // Lock the source identity and its current revision while the snapshot is
  // assembled. The copied rows below are authoritative even if the Bank is
  // subsequently edited, archived, or removed from the picker.
  await tx.$queryRaw`
    SELECT q.id
    FROM questions q
    JOIN question_banks b ON b.id = q.question_bank_id
    JOIN question_revisions r ON r.id = q.current_revision_id
    WHERE q.id IN (${Prisma.join(questionIds)})
      AND q.question_bank_id = ${input.bankId}::uuid
      AND b.purpose = 'quiz'
      AND b.status <> 'archived'
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
  if (sources.length !== questionIds.length)
    throw new QuizValidationError(
      "Sebagian soal Kuis tidak lagi tersedia atau belum siap.",
    );
  assertReadyBankSources(
    sources,
    input.subtestCode,
    input.bankId,
    QuestionBankPurpose.quiz,
  );

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  if (input.expectedSources) {
    const expectedById = new Map(
      input.expectedSources.map((expected) => [expected.questionId, expected]),
    );
    if (
      expectedById.size !== questionIds.length ||
      expectedById.size !== input.expectedSources.length
    ) {
      throw new QuizValidationError(
        "Daftar ekspektasi revisi soal tidak lengkap. Muat ulang Bank Soal lalu coba lagi.",
      );
    }
    for (const questionId of questionIds) {
      const expected = expectedById.get(questionId);
      const source = sourceById.get(questionId);
      if (
        !expected ||
        !source?.currentRevision ||
        (expected.revisionId &&
          expected.revisionId !== source.currentRevision.id) ||
        (expected.contentDigest &&
          expected.contentDigest !== source.currentRevision.contentDigest)
      ) {
        throw new QuizValidationError(
          "Bank Soal Kuis telah berubah. Muat ulang soal sebelum mengimpornya.",
        );
      }
    }
  }
  return questionIds.map((questionId) => {
    const source = sourceById.get(questionId);
    if (!source) throw new QuizValidationError("Soal Bank tidak ditemukan.");
    return materializedQuizQuestion(source);
  });
}

function isAvailableQuizBankSnapshotAsset(
  assetId: string | null,
  asset: {
    libraryScope: MediaLibraryScope;
    state: MediaAssetState;
    trashedAt: Date | null;
  } | null,
) {
  return (
    !assetId ||
    (asset?.libraryScope === MediaLibraryScope.kapten &&
      asset.state === MediaAssetState.ready &&
      asset.trashedAt === null)
  );
}

function isEligibleQuizBankSnapshotSource(
  source: QuizBankSourceRecord,
  bankId: string,
  subtestCode: string,
) {
  const revision = source.currentRevision;
  const questionBank = source.questionBank;
  if (!revision || !questionBank) return false;
  const options = revision.options;
  const answerMode = answerModeForQuestionType(revision.questionType);
  const answerKey = answerMode
    ? validateAnswerKey(
        answerMode,
        options.map((option) => ({
          id: option.label,
          isCorrect: option.isCorrect,
        })),
      )
    : null;

  return (
    source.questionBankId === bankId &&
    questionBank.purpose === QuestionBankPurpose.quiz &&
    questionBank.status !== ContentStatus.archived &&
    source.status === ContentStatus.published &&
    revision.status === QuestionRevisionStatus.ready &&
    source.subtest?.code === subtestCode &&
    revision.stem.trim().length > 0 &&
    options.length >= 2 &&
    options.length <= 5 &&
    answerKey?.ok === true &&
    isAvailableQuizBankSnapshotAsset(
      revision.promptAssetId,
      revision.promptAsset,
    ) &&
    isAvailableQuizBankSnapshotAsset(
      revision.explanationAssetId,
      revision.explanationAsset,
    ) &&
    options.every(
      (option) =>
        option.content.trim().length > 0 &&
        isAvailableQuizBankSnapshotAsset(option.assetId, option.asset),
    )
  );
}

function detachedQuizBankQuestionSnapshot(
  source: QuizBankSourceRecord,
): QuizQuestionSnapshot {
  const revision = source.currentRevision;
  if (!revision)
    throw new QuizValidationError("Soal Bank Soal tidak lagi tersedia.");

  const choices = revision.options.map((option) => ({
    id: crypto.randomUUID(),
    mediaAssetId: option.assetId ?? undefined,
    text: option.content,
  }));
  const correctChoiceIds = choices.flatMap((choice, index) =>
    revision.options[index]?.isCorrect ? [choice.id] : [],
  );
  const answerMode = answerModeForQuestionType(revision.questionType);
  if (!answerMode || !correctChoiceIds.length)
    throw new QuizValidationError("Kunci jawaban soal Bank Soal tidak valid.");

  return {
    choices,
    correctChoiceId: correctChoiceIds[0] ?? "",
    correctChoiceIds,
    difficulty: revision.difficulty,
    explanation: revision.explanation ?? "",
    explanationMediaAssetId: revision.explanationAssetId ?? undefined,
    id: crypto.randomUUID(),
    origin: "local",
    prompt: revision.stem,
    promptMediaAssetId: revision.promptAssetId ?? undefined,
    questionType: answerMode,
  };
}

function snapshotsFromAssembly(
  materialization: KuisAssemblyMaterialization,
): QuizQuestionSnapshot[] {
  return materialization.items.map((item, index) => ({
    choices: item.options.map((option) => ({
      id: option.choiceKey,
      mediaAssetId: option.assetId ?? undefined,
      text: option.content,
    })),
    correctChoiceId:
      item.options.find((option) => option.isCorrect)?.choiceKey ?? "",
    correctChoiceIds: correctChoiceIdsFromOptions(item.options),
    difficulty: item.difficulty,
    explanation: item.explanation ?? "",
    explanationMediaAssetId: item.explanationAssetId ?? undefined,
    id: `assembly-${materialization.assemblyPackageVersionId}-${index + 1}`,
    origin: "bank",
    prompt: item.prompt,
    promptMediaAssetId: item.promptAssetId ?? undefined,
    questionType:
      answerModeForQuestionType(item.questionType) ?? "single_choice",
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
    throw new QuizValidationError(
      "Snapshot Kuis tidak lagi cocok dengan assembly Ready. Muat ulang sebelum melanjutkan.",
    );
  }
  for (const [index, item] of items.entries()) {
    const expected = materialization.items[index];
    if (
      !expected ||
      item.difficulty !== expected.difficulty ||
      item.sourceQuestionId !== expected.sourceQuestionId ||
      item.sourceQuestionRevisionId !== expected.sourceQuestionRevisionId ||
      item.sourceContentDigest !== expected.sourceContentDigest ||
      item.sourceRevisionProvenance !== expected.sourceRevisionProvenance ||
      item.subtestId !== expected.subtestId ||
      answerModeForQuestionType(item.questionType) !==
        answerModeForQuestionType(expected.questionType) ||
      item.prompt !== expected.prompt ||
      item.promptAssetId !== expected.promptAssetId ||
      item.explanation !== expected.explanation ||
      item.explanationAssetId !== expected.explanationAssetId ||
      item.options.length !== expected.options.length ||
      item.options.some((option, optionIndex) => {
        const expectedOption = expected.options[optionIndex];
        return (
          !expectedOption ||
          option.choiceKey !== expectedOption.choiceKey ||
          option.content !== expectedOption.content ||
          option.isCorrect !== expectedOption.isCorrect ||
          option.assetId !== expectedOption.assetId ||
          option.sortOrder !== expectedOption.sortOrder ||
          option.sourceQuestionRevisionOptionId !==
            expectedOption.sourceQuestionRevisionOptionId
        );
      })
    ) {
      throw new QuizValidationError(
        "Snapshot Kuis tidak lagi cocok dengan assembly Ready. Muat ulang sebelum melanjutkan.",
      );
    }
  }
}

function toKaptenQuiz(
  record:
    | Prisma.StandaloneQuizGetPayload<{ include: typeof quizInclude }>
    | Prisma.StandaloneQuizGetPayload<{ include: typeof quizContentInclude }>,
): KaptenQuiz {
  // The mentor detail/editor path intentionally reads only Kuis-owned content.
  // Full relation data remains available to legacy lifecycle/release helpers.
  const relationRecord = record as Prisma.StandaloneQuizGetPayload<{
    include: typeof quizInclude;
  }>;
  const subject = getSubjectMetadata(record.subtest.code);
  const assemblyVersion = relationRecord.assemblyPackageVersion;
  const assembly =
    assemblyVersion &&
    relationRecord.assemblyMode &&
    relationRecord.assemblyDefinitionDigest
      ? {
          bankId:
            assemblyVersion.bankScopes[0]?.questionBank.id ??
            relationRecord.sourceBankId ??
            "",
          bankName:
            assemblyVersion.bankScopes[0]?.questionBank.name ??
            relationRecord.sourceBank?.name ??
            "",
          categoryIds: assemblyVersion.categoryScopes.map(
            (scope) => scope.categoryId,
          ),
          categoryNames: assemblyVersion.categoryScopes.map(
            (scope) => scope.category.name,
          ),
          definitionDigest: relationRecord.assemblyDefinitionDigest,
          folderIds: assemblyVersion.folderScopes.map(
            (scope) => scope.folderId,
          ),
          folderNames: assemblyVersion.folderScopes.map(
            (scope) => scope.folder.name,
          ),
          mode: relationRecord.assemblyMode as
            | "fixed_set"
            | "random_pool"
            | "blueprint",
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
  return {
    assembly,
    attemptsAllowed: record.attemptsAllowed,
    closesAt: record.closesAt?.toISOString().slice(0, 16),
    correctAnswerVisibility: record.correctAnswerVisibility,
    description: record.description ?? "",
    durationSeconds: record.durationSeconds,
    formBehavior: record.formBehavior,
    href: `/mentor/quiz/${record.id}`,
    id: record.id,
    isHidden: record.isHidden,
    opensAt: record.opensAt?.toISOString().slice(0, 16),
    primaryMetric: `${record.items.length} soal`,
    progress: record.items.length ? 100 : 0,
    questionCount: record.items.length,
    resourceType: "quiz",
    retryDelaySeconds: record.retryDelaySeconds,
    reviewTiming: record.reviewTiming,
    scorePolicy: record.scorePolicy,
    sourceBank:
      relationRecord.sourceBank?.name ??
      (relationRecord.sourceBankId ? "Bank Soal Kuis" : "Soal lokal"),
    sourceBankId: relationRecord.sourceBankId ?? undefined,
    sourceMode: sourceModeForQuiz(record),
    status:
      record.status === ContentStatus.archived
        ? "archived"
        : "published",
    subjectCode: record.subtest.code,
    subjectName: subject?.name ?? record.subtest.code,
    title: record.title,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toKaptenQuizVersion(
  record: VersionedQuizRecord,
  version: VersionedQuizVersionRecord,
  activeVersion: VersionedQuizVersionRecord | null = activeVersionFor(record),
  draftVersion: VersionedQuizVersionRecord | null = draftVersionFor(record),
) {
  const quiz = toKaptenQuiz(projectStandaloneQuizVersion(record, version));
  return {
    ...quiz,
    activeVersionId: activeVersion?.id,
    activeVersionNo: activeVersion?.versionNo ?? undefined,
    draftRevision: draftVersion?.draftRevision ?? null,
    draftVersionId: draftVersion?.id,
    hasUnpublishedChanges: Boolean(
      activeVersion &&
      draftVersion &&
      assessmentVersionChanged(activeVersion, draftVersion),
    ),
    versionId: version.id,
    versionNo: version.versionNo,
  } satisfies KaptenQuiz;
}

type QuizReadClient = typeof prisma | Prisma.TransactionClient;

async function findStandaloneQuizForRuntime(
  client: QuizReadClient,
  where: Prisma.StandaloneQuizWhereInput,
  preferredVersionId?: string | null,
) {
  if (!isStandaloneQuizVersioningCutoverEnabled()) {
    return client.standaloneQuiz.findFirst({ where, include: quizInclude });
  }
  const record = await client.standaloneQuiz.findFirst({
    where,
    include: versionedQuizInclude,
  });
  if (!record) return null;
  const version = preferredVersionId
    ? record.versions.find((candidate) => candidate.id === preferredVersionId)
    : activeVersionFor(record);
  return version ? projectStandaloneQuizVersion(record, version) : null;
}

async function findManyStandaloneQuizzesForRuntime(
  client: QuizReadClient,
  where: Prisma.StandaloneQuizWhereInput,
  orderBy:
    | Prisma.StandaloneQuizOrderByWithRelationInput
    | Prisma.StandaloneQuizOrderByWithRelationInput[],
) {
  if (!isStandaloneQuizVersioningCutoverEnabled()) {
    return client.standaloneQuiz.findMany({
      where,
      include: quizInclude,
      orderBy,
    });
  }
  const records = await client.standaloneQuiz.findMany({
    where,
    include: versionedQuizInclude,
    orderBy,
  });
  return records.flatMap((record) => {
    const active = activeVersionFor(record);
    return active ? [projectStandaloneQuizVersion(record, active)] : [];
  });
}

function validateForPublication(
  input: Pick<SaveStandaloneQuizInput, "questions" | "reviewTiming" | "title"> & {
    assemblyVersionId?: string | null;
  },
  opensAt: Date | null,
  closesAt: Date | null,
  options: { materializedAssembly?: boolean } = {},
) {
  if (!input.title.trim())
    throw new QuizValidationError("Isi judul Kuis sebelum menyimpan versi aktif.");
  if (!input.questions.length && !input.assemblyVersionId)
    throw new QuizValidationError(
      "Tambahkan minimal satu soal agar siswa bisa mulai mengerjakan.",
    );
  if (
    input.assemblyVersionId &&
    input.questions.length &&
    !options.materializedAssembly
  )
    throw new QuizValidationError(
      "Soal langsung dan assembly tidak dapat dipakai bersamaan.",
    );
  if (
    input.questions.some((question) => {
      const answerMode = answerModeForQuestionType(question.questionType);
      const correctChoiceIds =
        question.correctChoiceIds ??
        (question.correctChoiceId ? [question.correctChoiceId] : []);
      const correctChoiceIdSet = new Set(correctChoiceIds);
      const answerKey = answerMode
        ? validateAnswerKey(
            answerMode,
            question.choices.map((choice) => ({
              id: choice.id,
              isCorrect: correctChoiceIdSet.has(choice.id),
            })),
          )
        : null;
      return (
        !question.prompt.trim() ||
        question.choices.length < 2 ||
        question.choices.length > 5 ||
        question.choices.some((choice) => !choice.text.trim()) ||
        !answerKey?.ok
      );
    })
  )
    throw new QuizValidationError("Lengkapi semua soal agar Kuis bisa dikerjakan.");
  validateQuizSchedule(input.reviewTiming, opensAt, closesAt);
}

function validateQuizSchedule(
  reviewTiming: QuizReviewTiming | undefined,
  opensAt: Date | null,
  closesAt: Date | null,
) {
  if (opensAt && closesAt && closesAt <= opensAt)
    throw new QuizValidationError("Waktu tutup harus setelah waktu buka.");
  if (reviewTiming === "after_close" && !closesAt)
    throw new QuizValidationError(
      "Review setelah quiz ditutup memerlukan waktu tutup.",
    );
}

function assertStandaloneQuizNotArchived(quiz: { status: ContentStatus }) {
  if (quiz.status === ContentStatus.archived) {
    throw new QuizValidationError("Kuis yang diarsipkan tidak dapat diubah.");
  }
}

function sourceModeForQuiz(record: {
  assemblyPackageVersionId?: string | null;
  sourceBankId?: string | null;
}): "local" | "bank" | "assembly" {
  if (record.assemblyPackageVersionId) return "assembly";
  return record.sourceBankId ? "bank" : "local";
}

function hasSubmittedSourceFields(question: QuizQuestionSnapshot) {
  return (
    question.origin === "bank" ||
    Boolean(question.sourceUpdate) ||
    Boolean(
      question.sourceContentDigest ||
      question.sourceQuestionId ||
      question.sourceQuestionRevisionId ||
      question.sourceRevisionProvenance,
    )
  );
}

function correctChoiceIdsForSnapshot(question: QuizQuestionSnapshot) {
  const ids =
    question.correctChoiceIds ??
    (question.correctChoiceId ? [question.correctChoiceId] : []);
  return [...new Set(ids)];
}

function snapshotChoiceIsCorrect(
  correctChoiceIds: readonly string[],
  choiceId: string,
  storedChoiceKey: string,
) {
  return (
    correctChoiceIds.includes(choiceId) ||
    correctChoiceIds.includes(storedChoiceKey)
  );
}

function answerModeForSnapshot(question: QuizQuestionSnapshot) {
  return answerModeForQuestionType(question.questionType) ?? "single_choice";
}

function difficultyForSnapshot(question: QuizQuestionSnapshot) {
  const difficulty = question.difficulty ?? DifficultyLevel.medium;
  if (Object.values(DifficultyLevel).includes(difficulty as DifficultyLevel)) {
    return difficulty as DifficultyLevel;
  }
  throw new QuizValidationError("Pilih tingkat kesulitan untuk setiap soal.");
}

function quizQuestionMediaAssetIds(
  questions: readonly QuizQuestionSnapshot[],
) {
  return [
    ...new Set(
      questions
        .flatMap((question) => [
          question.promptMediaAssetId,
          question.explanationMediaAssetId,
          ...question.choices.map((choice) => choice.mediaAssetId),
        ])
        .filter((assetId): assetId is string => Boolean(assetId)),
    ),
  ].sort();
}

async function lockAndValidateQuizQuestionMedia(
  tx: Prisma.TransactionClient,
  questions: readonly QuizQuestionSnapshot[],
) {
  const assetIds = quizQuestionMediaAssetIds(questions);
  if (!assetIds.length) return;
  if (assetIds.some((assetId) => !isUuid(assetId))) {
    throw new QuizValidationError(
      "Ada gambar yang tidak lagi tersedia. Ganti atau lepaskan gambar tersebut, lalu simpan lagi.",
    );
  }

  // Media trash takes FOR UPDATE on these same rows. Taking shared locks in
  // stable order serializes save/publish against trash through transaction end.
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM assets
    WHERE id = ANY(${assetIds}::uuid[])
      AND library_scope = ${MediaLibraryScope.kapten}
    ORDER BY id
    FOR SHARE
  `;
  const readyAssets = await tx.asset.findMany({
    where: {
      id: { in: assetIds },
      libraryScope: MediaLibraryScope.kapten,
      state: MediaAssetState.ready,
      trashedAt: null,
    },
    select: { id: true },
  });
  if (readyAssets.length !== assetIds.length) {
    throw new QuizValidationError(
      "Ada gambar yang sudah tidak tersedia. Ganti atau lepaskan gambar tersebut, lalu simpan lagi.",
    );
  }
}

function snapshotMatchesStoredBankItem(
  submitted: QuizQuestionSnapshot,
  persisted: Prisma.StandaloneQuizItemGetPayload<{
    include: { options: true };
  }>,
) {
  const persistedSnapshot = toSnapshot(persisted);
  const submittedCorrectIds = correctChoiceIdsForSnapshot(submitted);
  const persistedCorrectIds = correctChoiceIdsForSnapshot(persistedSnapshot);
  const persistedCorrectIdSet = new Set(persistedCorrectIds);
  return (
    submitted.prompt === persistedSnapshot.prompt &&
    submitted.promptMediaAssetId === persistedSnapshot.promptMediaAssetId &&
    submitted.explanation === persistedSnapshot.explanation &&
    submitted.explanationMediaAssetId ===
      persistedSnapshot.explanationMediaAssetId &&
    (submitted.difficulty === undefined ||
      difficultyForSnapshot(submitted) === persistedSnapshot.difficulty) &&
    answerModeForSnapshot(submitted) ===
      answerModeForSnapshot(persistedSnapshot) &&
    submitted.choices.length === persistedSnapshot.choices.length &&
    submitted.choices.every((choice, index) => {
      const persistedChoice = persistedSnapshot.choices[index];
      return (
        persistedChoice &&
        choice.id === persistedChoice.id &&
        choice.text === persistedChoice.text &&
        choice.mediaAssetId === persistedChoice.mediaAssetId
      );
    }) &&
    submittedCorrectIds.length === persistedCorrectIds.length &&
    submittedCorrectIds.every((choiceId) => persistedCorrectIdSet.has(choiceId))
  );
}

async function assertStoredBankItemLineage(
  tx: Prisma.TransactionClient,
  sourceBankId: string,
  items: Array<
    Prisma.StandaloneQuizItemGetPayload<{ include: { options: true } }>
  >,
) {
  const sourceQuestionIds = [
    ...new Set(
      items
        .map((item) => item.sourceQuestionId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!sourceQuestionIds.length || sourceQuestionIds.length !== items.length) {
    throw new QuizValidationError(
      "Snapshot Kuis Bank memiliki atribusi soal yang tidak lengkap.",
    );
  }
  const sources = await tx.question.findMany({
    where: { id: { in: sourceQuestionIds } },
    select: {
      id: true,
      questionBankId: true,
      questionBank: { select: { purpose: true } },
    },
  });
  if (
    sources.length !== sourceQuestionIds.length ||
    sources.some(
      (source) =>
        source.questionBankId !== sourceBankId ||
        source.questionBank?.purpose !== QuestionBankPurpose.quiz,
    )
  ) {
    throw new QuizValidationError(
      "Snapshot Kuis Bank tidak lagi memiliki sumber Bank Soal Kuis yang valid.",
    );
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
    existingItems: Array<
      Prisma.StandaloneQuizItemGetPayload<{ include: { options: true } }>
    >;
  },
) {
  if (input.mode === "local") {
    if (input.sourceBankId || input.questions.some(hasSubmittedSourceFields)) {
      throw new QuizValidationError(
        "Kuis lokal tidak boleh menyimpan atribusi Bank Soal.",
      );
    }
    await tx.standaloneQuizItem.deleteMany({ where: { quizId: input.quizId } });
    for (const [index, submitted] of input.questions.entries()) {
        const choices = submitted.choices.map((choice, choiceIndex) => ({
          ...choice,
          id: choice.id || String.fromCharCode(97 + choiceIndex),
        }));
        const correctChoiceIds = correctChoiceIdsForSnapshot({
          ...submitted,
          choices,
        });
        const correctChoiceIdSet = new Set(correctChoiceIds);
        const answerMode = answerModeForSnapshot(submitted);
        const answerKey = validateAnswerKey(
          answerMode,
          choices.map((choice) => ({
            id: choice.id,
            isCorrect: correctChoiceIdSet.has(choice.id),
          })),
        );
        if (!answerKey.ok)
          throw new QuizValidationError(
            "Kunci jawaban Kuis lokal tidak valid.",
          );
        // react-doctor-disable-next-line async-await-in-loop -- persist the submitted questions in their displayed order within one transaction.
        const item = await tx.standaloneQuizItem.create({
          data: {
            difficulty: difficultyForSnapshot(submitted),
            explanation: submitted.explanation || null,
            explanationAssetId: submitted.explanationMediaAssetId || null,
            prompt: submitted.prompt,
            promptAssetId: submitted.promptMediaAssetId || null,
            questionType: answerMode,
            quizId: input.quizId,
            sortOrder: index + 1,
            sourceContentDigest: null,
            sourceQuestionId: null,
            sourceQuestionRevisionId: null,
            sourceRevisionProvenance: null,
            subtestId: input.requestedSubtestId,
          },
        });
        await tx.standaloneQuizItemOption.createMany({
          data: choices.map((choice, optionIndex) => ({
            assetId: choice.mediaAssetId || null,
            choiceKey: String.fromCharCode(65 + optionIndex),
            content: choice.text,
            isCorrect: snapshotChoiceIsCorrect(
              correctChoiceIds,
              choice.id,
              String.fromCharCode(65 + optionIndex),
            ),
            quizItemId: item.id,
            sortOrder: optionIndex,
            sourceQuestionOptionId: null,
            sourceQuestionRevisionOptionId: null,
          })),
        });
    }
    return;
  }

  if (!input.sourceBankId)
    throw new QuizValidationError(
      "Kuis Bank Soal memerlukan satu Bank sumber.",
    );
  if (!input.questions.length)
    throw new QuizValidationError(
      "Pilih minimal satu soal dari Bank Soal Kuis.",
    );
  if (
    new Set(input.questions.map((question) => question.id)).size !==
    input.questions.length
  )
    throw new QuizValidationError(
      "Setiap soal Bank hanya boleh muncul satu kali.",
    );
  const existingById = new Map(
    input.existingItems.map((item) => [item.id, item]),
  );
  const selectedItems = input.questions.map((submitted) => {
    const existing = existingById.get(submitted.id);
    if (
      !existing ||
      existing.sourceQuestionId === null ||
      existing.sourceQuestionRevisionId === null ||
      existing.sourceContentDigest === null ||
      existing.sourceRevisionProvenance === null
    ) {
      throw new QuizValidationError(
        "Terdapat kesalahan ketika menyimpan kuis.",
      );
    }
    if (existing.subtestId !== input.requestedSubtestId)
      throw new QuizValidationError(
        "Semua soal Bank dalam Kuis harus memakai subtes yang sama.",
      );
    if (!snapshotMatchesStoredBankItem(submitted, existing))
      throw new QuizValidationError(
        "Konten soal Bank Soal hanya dapat diubah dari editor Bank Soal.",
      );
    return { existing, submitted };
  });
  await assertStoredBankItemLineage(
    tx,
    input.sourceBankId,
    selectedItems.map(({ existing }) => existing),
  );
  await tx.standaloneQuizItem.deleteMany({ where: { quizId: input.quizId } });
  for (const [index, { existing }] of selectedItems.entries()) {
      const persistedSnapshot = toSnapshot(existing);
      const correctChoiceIds = correctChoiceIdsForSnapshot(persistedSnapshot);
      // react-doctor-disable-next-line async-await-in-loop -- stable sortOrder and source lineage are written in one transaction.
      const item = await tx.standaloneQuizItem.create({
        data: {
          difficulty: existing.difficulty,
          explanation: existing.explanation,
          explanationAssetId: existing.explanationAssetId,
          prompt: existing.prompt,
          promptAssetId: existing.promptAssetId,
          questionType:
            answerModeForQuestionType(existing.questionType) ?? "single_choice",
          quizId: input.quizId,
          sortOrder: index + 1,
          sourceContentDigest: existing.sourceContentDigest,
          sourceQuestionId: existing.sourceQuestionId,
          sourceQuestionRevisionId: existing.sourceQuestionRevisionId,
          sourceRevisionProvenance: existing.sourceRevisionProvenance,
          subtestId: existing.subtestId,
        },
      });
      const existingOptions = existing.options
        .slice()
        .sort(
          (left, right) =>
            left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
        );
      await tx.standaloneQuizItemOption.createMany({
        data: persistedSnapshot.choices.map((choice, optionIndex) => {
          const old = existingOptions[optionIndex];
          return {
            assetId: choice.mediaAssetId || null,
            choiceKey: String.fromCharCode(65 + optionIndex),
            content: choice.text,
            isCorrect: snapshotChoiceIsCorrect(
              correctChoiceIds,
              choice.id,
              String.fromCharCode(65 + optionIndex),
            ),
            quizItemId: item.id,
            sortOrder: optionIndex,
            sourceQuestionOptionId: old?.sourceQuestionOptionId ?? null,
            sourceQuestionRevisionOptionId:
              old?.sourceQuestionRevisionOptionId ?? null,
          };
        }),
      });
  }
}

type VersionedQuizItemInput = {
  existingItems: Array<
    Prisma.StandaloneQuizItemGetPayload<{ include: { options: true } }>
  >;
  mode: "local" | "bank";
  questions: readonly QuizQuestionSnapshot[];
  quizId: string;
  quizVersionId: string;
  requestedSubtestId: string;
  sourceBankId: string | null;
};

async function writeStandaloneQuizVersionItems(
  tx: Prisma.TransactionClient,
  input: VersionedQuizItemInput,
) {
  await tx.standaloneQuizItem.deleteMany({
    where: { quizVersionId: input.quizVersionId },
  });

  if (input.mode === "local") {
    if (input.sourceBankId || input.questions.some(hasSubmittedSourceFields)) {
      throw new QuizValidationError(
        "Kuis lokal tidak boleh menyimpan atribusi Bank Soal.",
      );
    }
    for (const [index, submitted] of input.questions.entries()) {
        const choices = submitted.choices.map((choice, choiceIndex) => ({
          ...choice,
          id: choice.id || String.fromCharCode(97 + choiceIndex),
        }));
        const correctChoiceIds = correctChoiceIdsForSnapshot({
          ...submitted,
          choices,
        });
        const correctChoiceIdSet = new Set(correctChoiceIds);
        const answerMode = answerModeForSnapshot(submitted);
        const answerKey = validateAnswerKey(
          answerMode,
          choices.map((choice) => ({
            id: choice.id,
            isCorrect: correctChoiceIdSet.has(choice.id),
          })),
        );
        if (!answerKey.ok)
          throw new QuizValidationError(
            "Kunci jawaban Kuis lokal tidak valid.",
          );
        // react-doctor-disable-next-line async-await-in-loop -- preserve the submitted order when rebuilding the local question set.
        const item = await tx.standaloneQuizItem.create({
          data: {
            difficulty: difficultyForSnapshot(submitted),
            explanation: submitted.explanation || null,
            explanationAssetId: submitted.explanationMediaAssetId || null,
            prompt: submitted.prompt,
            promptAssetId: submitted.promptMediaAssetId || null,
            questionType: answerMode,
            quizId: input.quizId,
            quizVersionId: input.quizVersionId,
            sortOrder: index + 1,
            sourceContentDigest: null,
            sourceQuestionId: null,
            sourceQuestionRevisionId: null,
            sourceRevisionProvenance: null,
            subtestId: input.requestedSubtestId,
          },
        });
        await tx.standaloneQuizItemOption.createMany({
          data: choices.map((choice, optionIndex) => ({
            assetId: choice.mediaAssetId || null,
            choiceKey: String.fromCharCode(65 + optionIndex),
            content: choice.text,
            isCorrect: snapshotChoiceIsCorrect(
              correctChoiceIds,
              choice.id,
              String.fromCharCode(65 + optionIndex),
            ),
            quizItemId: item.id,
            sortOrder: optionIndex,
            sourceQuestionOptionId: null,
            sourceQuestionRevisionOptionId: null,
          })),
        });
    }
  } else {
    if (!input.sourceBankId)
      throw new QuizValidationError(
        "Kuis Bank Soal memerlukan satu Bank sumber.",
      );
    if (!input.questions.length)
      throw new QuizValidationError(
        "Pilih minimal satu soal dari Bank Soal Kuis.",
      );
    if (
      new Set(input.questions.map((question) => question.id)).size !==
      input.questions.length
    )
      throw new QuizValidationError(
        "Setiap soal Bank hanya boleh muncul satu kali.",
      );
    const existingById = new Map(
      input.existingItems.map((item) => [item.id, item]),
    );
    const selectedItems = input.questions.map((submitted) => {
      const existing = existingById.get(submitted.id);
      if (
        !existing ||
        existing.sourceQuestionId === null ||
        existing.sourceQuestionRevisionId === null ||
        existing.sourceContentDigest === null ||
        existing.sourceRevisionProvenance === null
      ) {
        throw new QuizValidationError("Terdapat kesalahan ketika menyimpan.");
      }
      if (existing.subtestId !== input.requestedSubtestId)
        throw new QuizValidationError(
          "Semua soal Bank dalam Kuis harus memakai subtes yang sama.",
        );
      if (!snapshotMatchesStoredBankItem(submitted, existing))
        throw new QuizValidationError(
          "Konten soal Bank Soal hanya dapat diubah dari editor Bank Soal.",
        );
      return { existing, submitted };
    });
    await assertStoredBankItemLineage(
      tx,
      input.sourceBankId,
      selectedItems.map(({ existing }) => existing),
    );
    for (const [index, { existing }] of selectedItems.entries()) {
        const persistedSnapshot = toSnapshot(existing);
        const correctChoiceIds = correctChoiceIdsForSnapshot(persistedSnapshot);
        // react-doctor-disable-next-line async-await-in-loop -- preserve the source question order in the transaction.
        const item = await tx.standaloneQuizItem.create({
          data: {
            difficulty: existing.difficulty,
            explanation: existing.explanation,
            explanationAssetId: existing.explanationAssetId,
            prompt: existing.prompt,
            promptAssetId: existing.promptAssetId,
            questionType:
              answerModeForQuestionType(existing.questionType) ??
              "single_choice",
            quizId: input.quizId,
            quizVersionId: input.quizVersionId,
            sortOrder: index + 1,
            sourceContentDigest: existing.sourceContentDigest,
            sourceQuestionId: existing.sourceQuestionId,
            sourceQuestionRevisionId: existing.sourceQuestionRevisionId,
            sourceRevisionProvenance: existing.sourceRevisionProvenance,
            subtestId: existing.subtestId,
          },
        });
        const existingOptions = existing.options
          .slice()
          .sort(
            (left, right) =>
              left.sortOrder - right.sortOrder ||
              left.id.localeCompare(right.id),
          );
        await tx.standaloneQuizItemOption.createMany({
          data: persistedSnapshot.choices.map((choice, optionIndex) => {
            const old = existingOptions[optionIndex];
            return {
              assetId: choice.mediaAssetId || null,
              choiceKey: String.fromCharCode(65 + optionIndex),
              content: choice.text,
              isCorrect: snapshotChoiceIsCorrect(
                correctChoiceIds,
                choice.id,
                String.fromCharCode(65 + optionIndex),
              ),
              quizItemId: item.id,
              sortOrder: optionIndex,
              sourceQuestionOptionId: old?.sourceQuestionOptionId ?? null,
              sourceQuestionRevisionOptionId:
                old?.sourceQuestionRevisionOptionId ?? null,
            };
          }),
        });
    }
  }

  const savedItems = await tx.standaloneQuizItem.findMany({
    where: { quizVersionId: input.quizVersionId },
    include: { options: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });
  return savedItems.map(toSnapshot);
}

type VersionedMaterializedQuizQuestion = {
  difficulty: DifficultyLevel;
  explanation: string | null;
  explanationAssetId: string | null;
  options: readonly {
    assetId: string | null;
    choiceKey: string;
    content: string;
    isCorrect: boolean;
    sortOrder: number;
    sourceQuestionRevisionOptionId: string | null;
  }[];
  prompt: string;
  promptAssetId: string | null;
  questionType: QuestionType;
  sourceContentDigest: string;
  sourceQuestionId: string;
  sourceQuestionRevisionId: string;
  sourceRevisionProvenance: QuestionRevisionProvenance;
  subtestId: string;
};

async function writeStandaloneQuizVersionMaterializedItems(
  tx: Prisma.TransactionClient,
  input: {
    quizId: string;
    quizVersionId: string;
    questions: readonly VersionedMaterializedQuizQuestion[];
  },
) {
  await tx.standaloneQuizItem.deleteMany({
    where: { quizVersionId: input.quizVersionId },
  });
  for (const [index, question] of input.questions.entries()) {
      // react-doctor-disable-next-line async-await-in-loop -- materialized questions are persisted in their versioned order.
      const item = await tx.standaloneQuizItem.create({
        data: {
          difficulty: question.difficulty,
          explanation: question.explanation,
          explanationAssetId: question.explanationAssetId,
          prompt: question.prompt,
          promptAssetId: question.promptAssetId,
          questionType:
            answerModeForQuestionType(question.questionType) ?? "single_choice",
          quizId: input.quizId,
          quizVersionId: input.quizVersionId,
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
  }
  const savedItems = await tx.standaloneQuizItem.findMany({
    where: { quizVersionId: input.quizVersionId },
    include: { options: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });
  return savedItems.map(toSnapshot);
}

function versionFieldsFrom(source: {
  assemblyDefinitionDigest?: string | null;
  assemblyMode?: ReusableQuestionPackageMode | null;
  assemblyPackageVersionId?: string | null;
  assemblySeed?: string | null;
  attemptsAllowed?: number | null;
  closesAt?: Date | null;
  correctAnswerVisibility?: QuizCorrectAnswerVisibility;
  description?: string | null;
  durationSeconds?: number | null;
  formBehavior?: QuizFormBehavior;
  retryDelaySeconds?: number | null;
  reviewTiming?: QuizReviewTiming;
  scorePolicy?: QuizScorePolicy;
  sourceBankId?: string | null;
  title: string;
  opensAt?: Date | null;
}) {
  return {
    assemblyDefinitionDigest: source.assemblyDefinitionDigest ?? null,
    assemblyMode: source.assemblyMode ?? null,
    assemblyPackageVersionId: source.assemblyPackageVersionId ?? null,
    assemblySeed: source.assemblySeed ?? null,
    attemptsAllowed:
      source.attemptsAllowed === undefined ? 1 : source.attemptsAllowed,
    closesAt: source.closesAt ?? null,
    correctAnswerVisibility: source.correctAnswerVisibility ?? "show",
    description: source.description ?? null,
    durationSeconds: source.durationSeconds ?? null,
    formBehavior: source.formBehavior ?? "same",
    retryDelaySeconds: source.retryDelaySeconds ?? null,
    reviewTiming: source.reviewTiming ?? "immediate",
    scorePolicy: source.scorePolicy ?? "latest",
    sourceBankId: source.sourceBankId ?? null,
    title: source.title,
    opensAt: source.opensAt ?? null,
  } as const;
}

async function cloneStandaloneQuizVersionItems(
  tx: Prisma.TransactionClient,
  input: {
    quizId: string;
    quizVersionId: string;
    sourceItems: readonly Prisma.StandaloneQuizItemGetPayload<{
      include: { options: true };
    }>[];
  },
) {
  await tx.standaloneQuizItem.deleteMany({
    where: { quizVersionId: input.quizVersionId },
  });
  for (const [index, source] of input.sourceItems.entries()) {
      // react-doctor-disable-next-line async-await-in-loop -- copied questions and options retain their source order.
      const item = await tx.standaloneQuizItem.create({
        data: {
          difficulty: source.difficulty,
          explanation: source.explanation,
          explanationAssetId: source.explanationAssetId,
          prompt: source.prompt,
          promptAssetId: source.promptAssetId,
          questionType: source.questionType,
          quizId: input.quizId,
          quizVersionId: input.quizVersionId,
          sortOrder: index + 1,
          sourceContentDigest: source.sourceContentDigest,
          sourceQuestionId: source.sourceQuestionId,
          sourceQuestionRevisionId: source.sourceQuestionRevisionId,
          sourceRevisionProvenance: source.sourceRevisionProvenance,
          subtestId: source.subtestId,
        },
      });
      await tx.standaloneQuizItemOption.createMany({
        data: source.options.map((option, optionIndex) => ({
          assetId: option.assetId,
          choiceKey: option.choiceKey,
          content: option.content,
          isCorrect: option.isCorrect,
          quizItemId: item.id,
          sortOrder: optionIndex,
          sourceQuestionOptionId: option.sourceQuestionOptionId,
          sourceQuestionRevisionOptionId: option.sourceQuestionRevisionOptionId,
        })),
      });
  }
  return tx.standaloneQuizItem.findMany({
    where: { quizVersionId: input.quizVersionId },
    include: { options: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });
}

async function ensureStandaloneQuizDraft(
  tx: Prisma.TransactionClient,
  record: VersionedQuizRecord,
) {
  const existingDraft = draftVersionFor(record);
  if (existingDraft) return existingDraft;
  const base = activeVersionFor(record);
  const source = base ?? record;
  const created = await tx.standaloneQuizVersion.create({
    data: {
      ...versionFieldsFrom(source),
      baseVersionId: base?.id ?? null,
      definitionDigest: base?.definitionDigest ?? null,
      draftRevision: 0,
      provenance: StandaloneQuizVersionProvenance.runtime,
      publishRequestId: null,
      publishedAt: null,
      publishedByUserId: null,
      state: StandaloneQuizVersionState.draft,
      quizId: record.id,
    },
    include: quizVersionItemsInclude,
  });
  return created;
}

async function ensureStandaloneQuizDraftItems(
  tx: Prisma.TransactionClient,
  record: VersionedQuizRecord,
  draft: VersionedQuizVersionRecord,
) {
  // A draft created by the versioning bootstrap has revision 0 and no items;
  // clone the active snapshot only in that uninitialised state. An author may
  // intentionally save an empty draft (revision > 0), which must stay empty
  // so lazy activation can reject it rather than silently restoring questions.
  if (draft.items.length || (draft.draftRevision ?? 0) > 0) return draft;
  const active = activeVersionFor(record);
  if (!active?.items.length) return draft;
  await cloneStandaloneQuizVersionItems(tx, {
    quizId: record.id,
    quizVersionId: draft.id,
    sourceItems: active.items,
  });
  return tx.standaloneQuizVersion.findUniqueOrThrow({
    where: { id: draft.id },
    include: quizVersionItemsInclude,
  });
}

function localSnapshotsFromVersion(
  version: VersionedQuizVersionRecord,
  fallback: readonly QuizQuestionSnapshot[],
) {
  const source = version.items.length
    ? version.items.map(toSnapshot)
    : fallback;
  return source.map((question) => ({
    ...question,
    id: question.id,
    origin: "local" as const,
    sourceUpdate: undefined,
    sourceContentDigest: undefined,
    sourceQuestionId: undefined,
    sourceQuestionRevisionId: undefined,
    sourceRevisionProvenance: undefined,
  }));
}

function versionedDefinitionInputFromVersion(
  version: VersionedQuizVersionRecord,
  questions: readonly QuizQuestionSnapshot[],
) {
  return {
    assemblyDefinitionDigest: version.assemblyDefinitionDigest,
    assemblyMode: version.assemblyMode as
      | "fixed_set"
      | "random_pool"
      | "blueprint"
      | null,
    assemblyPackageVersionId: version.assemblyPackageVersionId,
    assemblySeed: version.assemblySeed,
    attemptsAllowed: version.attemptsAllowed,
    correctAnswerVisibility: version.correctAnswerVisibility,
    description: version.description ?? "",
    durationSeconds: version.durationSeconds,
    formBehavior: version.formBehavior,
    questions,
    retryDelaySeconds: version.retryDelaySeconds,
    reviewTiming: version.reviewTiming,
    scorePolicy: version.scorePolicy,
    sourceBankId: version.sourceBankId,
    title: version.title,
  };
}

function versionedAssessmentDigestFromVersion(
  version: VersionedQuizVersionRecord,
  questions: readonly QuizQuestionSnapshot[] = version.items.map(toSnapshot),
) {
  return versionedAssessmentDigest(
    versionedDefinitionInputFromVersion(version, questions),
  );
}

function assessmentVersionChanged(
  activeVersion: VersionedQuizVersionRecord,
  draftVersion: VersionedQuizVersionRecord,
) {
  return (
    versionedAssessmentDigestFromVersion(activeVersion) !==
    versionedAssessmentDigestFromVersion(draftVersion)
  );
}

function versionedQuizPolicyData(
  input: SaveStandaloneQuizInput,
  policy: ReturnType<typeof normalizeQuizPolicy>,
) {
  return {
    attemptsAllowed:
      policy.attemptsAllowed === undefined ? 1 : policy.attemptsAllowed,
    correctAnswerVisibility: policy.correctAnswerVisibility ?? "show",
    description: input.description.trim() || null,
    durationSeconds: policy.durationSeconds ?? null,
    formBehavior: policy.formBehavior ?? "same",
    retryDelaySeconds: policy.retryDelaySeconds ?? null,
    reviewTiming: policy.reviewTiming ?? "immediate",
    scorePolicy: policy.scorePolicy ?? "latest",
    title: input.title.trim() || "Kuis Baru",
  } as const;
}

async function saveStandaloneQuizVersioned(
  input: SaveStandaloneQuizInput,
  tutorId: string,
) {
  const opensAt = parseOptionalDate(input.opensAt, "Waktu buka");
  const closesAt = parseOptionalDate(input.closesAt, "Waktu tutup");
  const policy = normalizeQuizPolicy(input);
  validateQuizSchedule(policy.reviewTiming, opensAt, closesAt);
  if (
    input.publishRequestId !== undefined &&
    input.publishRequestId !== null &&
    !isUuid(input.publishRequestId)
  ) {
    throw new QuizValidationError("Kuis belum dapat diaktifkan. Muat ulang halaman lalu coba lagi.");
  }
  return prisma.$transaction(async (tx) => {
    let record: VersionedQuizRecord | null = null;
    if (input.id) {
      const ownedQuiz = await tx.standaloneQuiz.findFirst({
        where: { id: input.id, createdByUserId: tutorId },
        select: { id: true },
      });
      if (ownedQuiz) {
        await assertAuthoringEditLease(
          tx,
          { resourceId: input.id, resourceType: "quiz" },
          tutorId,
          input.editLease,
        );
      }
      await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${input.id}::uuid FOR UPDATE`;
      record = await tx.standaloneQuiz.findFirst({
        where: { id: input.id, createdByUserId: tutorId },
        include: versionedQuizInclude,
      });
      if (!record)
        throw new QuizValidationError(
          "Quiz tidak ditemukan atau Anda tidak memiliki akses.",
        );
      assertStandaloneQuizNotArchived(record);
    }

    const requestedSubtest = await tx.subtest.findUnique({
      where: { code: input.subjectCode },
    });
    if (!requestedSubtest)
      throw new QuizValidationError("Subtes Kuis tidak valid.");
    if (input.assemblyVersionId)
      throw new QuizValidationError(
        "Gunakan perintah attachment khusus untuk mengikat assembly Kuis.",
      );

    const requestedMode =
      input.sourceMode ??
      (input.sourceBankId ? "bank" : sourceModeForQuiz(record ?? {}));
    if (requestedMode !== "local" && requestedMode !== "bank")
      throw new QuizValidationError("Mode sumber Kuis tidak valid.");
    const active = record ? activeVersionFor(record) : null;
    const draft = record ? draftVersionFor(record) : null;
    // The stable quiz is always published. An initial assessment becomes
    // student-ready once it has a complete version; incomplete work remains
    // in an internal version draft. After the first active version, edits are
    // automatically versioned and become active at the next student start.
    let shouldPublishImmediately = false;
    const currentVersion = draft ?? active;
    const currentMode = sourceModeForQuiz(currentVersion ?? record ?? {});
    if (record) {
      if (currentMode === "assembly" && input.questionOwnership !== "quiz")
        throw new QuizValidationError(
          "Kuis yang terikat assembly harus diubah melalui perintah attachment atau pelepasan khusus.",
        );
      if (requestedMode !== currentMode && input.questionOwnership !== "quiz")
        throw new QuizValidationError(
          "Perubahan mode sumber Kuis harus memakai perintah transisi khusus.",
        );
      if (
        requestedMode === "bank" &&
        input.sourceBankId &&
        input.sourceBankId !==
          (currentVersion?.sourceBankId ?? record.sourceBankId)
      )
        throw new QuizValidationError(
          "Pergantian Bank Soal harus memakai perintah transisi khusus.",
        );
      if (requestedMode === "local" && input.sourceBankId)
        throw new QuizValidationError(
          "Kuis lokal tidak boleh memiliki Bank sumber.",
        );
      if (requestedMode === "bank" && record.subtestId !== requestedSubtest.id)
        throw new QuizValidationError(
          "Subtes Kuis pada Bank Soal tidak dapat diubah tanpa mengimpor ulang soal.",
        );
    } else if (requestedMode === "bank" || input.sourceBankId) {
      throw new QuizValidationError(
        "Buat Kuis terlebih dahulu, lalu impor soal dari Bank Soal Kuis.",
      );
    }

    const sourceBankId =
      requestedMode === "bank"
        ? (input.sourceBankId ??
          currentVersion?.sourceBankId ??
          record?.sourceBankId ??
          null)
        : null;
    await lockAndValidateQuizQuestionMedia(tx, input.questions);
    if (!active && input.questions.length > 0) {
      try {
        validateForPublication(
          { ...input, assemblyVersionId: undefined, questions: input.questions },
          opensAt,
          closesAt,
        );
        shouldPublishImmediately = true;
      } catch (error) {
        if (!(error instanceof QuizValidationError)) throw error;
      }
    }

    const durationSeconds =
      input.durationSeconds === undefined
        ? (currentVersion?.durationSeconds ?? record?.durationSeconds ?? null)
        : input.durationSeconds;
    const metadata = {
      ...versionedQuizPolicyData(input, policy),
      closesAt,
      durationSeconds,
      opensAt,
    };
    if (!record) {
      record = await tx.standaloneQuiz.create({
        data: {
          ...policy,
          assemblyDefinitionDigest: null,
          assemblyMode: null,
          assemblyPackageVersionId: null,
          assemblySeed: null,
          closesAt,
          createdByUserId: tutorId,
          description: metadata.description,
          durationSeconds: metadata.durationSeconds,
          opensAt,
          slug: `${slugify(metadata.title)}-${crypto.randomUUID().slice(0, 8)}`,
          sourceBankId: null,
          status: ContentStatus.published,
          subtestId: requestedSubtest.id,
          title: metadata.title,
        },
        include: versionedQuizInclude,
      });
    }

    const stableRecord = record;
    const existingDraft = draftVersionFor(stableRecord);
    if (
      existingDraft &&
      !draftRevisionMatches(
        input.expectedDraftRevision,
        existingDraft.draftRevision,
      )
    ) {
      throw new QuizValidationError(
        "Versi Kuis telah berubah di tab lain. Muat ulang sebelum menyimpan.",
      );
    }
    const shouldPublish = shouldPublishImmediately;
    const replayedPublication =
      shouldPublish && input.publishRequestId && record
        ? (record.versions.find(
            (candidate) =>
              candidate.publishRequestId === input.publishRequestId,
          ) ?? null)
        : null;
    if (replayedPublication && record)
      return toKaptenQuizVersion(record, replayedPublication);
    const baseVersion = activeVersionFor(stableRecord);
    let version = existingDraft;
    if (!version) {
      version = await tx.standaloneQuizVersion.create({
        data: {
          assemblyDefinitionDigest: null,
          assemblyMode: null,
          assemblyPackageVersionId: null,
          assemblySeed: null,
          baseVersionId: baseVersion?.id ?? null,
          definitionDigest: null,
          draftRevision: 0,
          formBehavior: metadata.formBehavior,
          attemptsAllowed: metadata.attemptsAllowed,
          correctAnswerVisibility: metadata.correctAnswerVisibility,
          description: metadata.description,
          durationSeconds: metadata.durationSeconds,
          provenance: StandaloneQuizVersionProvenance.runtime,
          opensAt,
          retryDelaySeconds: metadata.retryDelaySeconds,
          reviewTiming: metadata.reviewTiming,
          scorePolicy: metadata.scorePolicy,
          sourceBankId,
          state: StandaloneQuizVersionState.draft,
          title: metadata.title,
          quizId: stableRecord.id,
        },
        include: quizVersionItemsInclude,
      });
    }

    const existingItems = version.items.length
      ? version.items
      : (baseVersion?.items ?? stableRecord.items);
    const persistedQuestions = await writeStandaloneQuizVersionItems(tx, {
      existingItems,
      mode: requestedMode,
      questions: input.questions,
      quizId: stableRecord.id,
      quizVersionId: version.id,
      requestedSubtestId: requestedSubtest.id,
      sourceBankId,
    });
    const definitionDigest = versionedDefinitionDigest({
      attemptsAllowed: metadata.attemptsAllowed,
      correctAnswerVisibility: metadata.correctAnswerVisibility,
      description: metadata.description ?? "",
      durationSeconds: metadata.durationSeconds,
      formBehavior: metadata.formBehavior,
      questions: persistedQuestions,
      retryDelaySeconds: metadata.retryDelaySeconds,
      reviewTiming: metadata.reviewTiming,
      scorePolicy: metadata.scorePolicy,
      sourceBankId,
      title: metadata.title,
    });
    const nextDraftRevision = (version.draftRevision ?? 0) + 1;
    const updatedDraft = await tx.standaloneQuizVersion.update({
      where: { id: version.id },
      data: {
        attemptsAllowed: metadata.attemptsAllowed,
        closesAt: metadata.closesAt,
        correctAnswerVisibility: metadata.correctAnswerVisibility,
        description: metadata.description,
        durationSeconds: metadata.durationSeconds,
        draftRevision: nextDraftRevision,
        formBehavior: metadata.formBehavior,
        definitionDigest,
        retryDelaySeconds: metadata.retryDelaySeconds,
        reviewTiming: metadata.reviewTiming,
        opensAt: metadata.opensAt,
        scorePolicy: metadata.scorePolicy,
        sourceBankId,
        state: StandaloneQuizVersionState.draft,
        title: metadata.title,
        ...(input.questionOwnership === "quiz" ? {
          assemblyDefinitionDigest: null,
          assemblyMode: null,
          assemblyPackageVersionId: null,
          assemblySeed: null,
        } : {}),
      },
      include: quizVersionItemsInclude,
    });

    if (shouldPublish) {
      const nextVersionNo =
        updatedDraft.versionNo ??
        nextStandaloneQuizVersionNo(
          stableRecord.versions.map((candidate) => candidate.versionNo),
        );
      if (baseVersion) {
        await tx.standaloneQuizVersion.update({
          where: { id: baseVersion.id },
          data: { state: StandaloneQuizVersionState.superseded },
        });
      }
      await tx.standaloneQuizVersion.update({
        where: { id: updatedDraft.id },
        data: {
          baseVersionId: baseVersion?.id ?? updatedDraft.baseVersionId,
          closesAt: metadata.closesAt,
          definitionDigest,
          durationSeconds: metadata.durationSeconds,
          draftRevision: null,
          publishedAt: new Date(),
          publishedByUserId: tutorId,
          publishRequestId: input.publishRequestId ?? crypto.randomUUID(),
          opensAt: metadata.opensAt,
          state: StandaloneQuizVersionState.active,
          versionNo: nextVersionNo,
        },
      });
      await tx.standaloneQuiz.update({
        where: { id: stableRecord.id },
        data: {
          ...policy,
          assemblyDefinitionDigest: null,
          assemblyMode: null,
          assemblyPackageVersionId: null,
          assemblySeed: null,
          closesAt,
          description: metadata.description,
          durationSeconds: metadata.durationSeconds,
          opensAt,
          revision: { increment: 1 },
          sourceBankId,
          status: ContentStatus.published,
          subtestId: requestedSubtest.id,
          title: metadata.title,
        },
      });
    } else {
      // Keep the stable row's catalogue and operational fields current while
      // leaving the active assessment snapshot untouched. Availability changes
      // therefore take effect immediately without creating a new snapshot.
      await tx.standaloneQuiz.update({
        where: { id: stableRecord.id },
        data: {
          ...policy,
          closesAt,
          description: metadata.description,
          durationSeconds: metadata.durationSeconds,
          opensAt,
          revision: { increment: 1 },
          sourceBankId,
          status: ContentStatus.published,
          subtestId: requestedSubtest.id,
          title: metadata.title,
        },
      });
    }

    const saved = await tx.standaloneQuiz.findUniqueOrThrow({
      where: { id: stableRecord.id },
      include: versionedQuizInclude,
    });
    const selectedVersion = shouldPublish
      ? activeVersionFor(saved)
      : (draftVersionFor(saved) ?? activeVersionFor(saved));
    if (!selectedVersion)
      throw new QuizValidationError("Versi Kuis tidak dapat dibentuk.");
    return toKaptenQuizVersion(saved, selectedVersion);
  });
}

async function saveStandaloneQuiz(
  input: SaveStandaloneQuizInput,
  tutorId: string,
) {
  if (input.questionOwnership !== undefined && input.questionOwnership !== "quiz")
    throw new QuizValidationError("Soal Kuis belum dapat disimpan. Muat ulang halaman lalu coba lagi.");
  if (input.questionOwnership === "quiz") {
    input = { ...input, sourceMode: "local", sourceBankId: null, questions: input.questions.map(asQuizOwnedQuestion) };
  }
  if (isStandaloneQuizVersioningCutoverEnabled())
    return saveStandaloneQuizVersioned(input, tutorId);
  const opensAt = parseOptionalDate(input.opensAt, "Waktu buka");
  const closesAt = parseOptionalDate(input.closesAt, "Waktu tutup");
  const policy = normalizeQuizPolicy(input);
  validateQuizSchedule(policy.reviewTiming, opensAt, closesAt);
  return prisma.$transaction(async (tx) => {
    let id = input.id;
    let current: Prisma.StandaloneQuizGetPayload<{
      include: {
        participations: { select: { id: true }; take: 1 };
        items: { include: { options: true } };
        subtest: true;
      };
    }> | null = null;
    if (id) {
      const ownedQuiz = await tx.standaloneQuiz.findFirst({
        where: { id, createdByUserId: tutorId },
        select: { id: true },
      });
      if (ownedQuiz) {
        await assertAuthoringEditLease(
          tx,
          { resourceId: id, resourceType: "quiz" },
          tutorId,
          input.editLease,
        );
      }
      await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${id}::uuid FOR UPDATE`;
      current = await tx.standaloneQuiz.findFirst({
        where: { id, createdByUserId: tutorId },
        include: {
          participations: { select: { id: true }, take: 1 },
          items: { include: { options: true }, orderBy: { sortOrder: "asc" } },
          subtest: true,
        },
      });
      if (!current)
        throw new QuizValidationError(
          "Quiz tidak ditemukan atau Anda tidak memiliki akses.",
        );
      assertStandaloneQuizNotArchived(current);
      if (current.participations.length)
        throw new QuizValidationError(
          "Quiz yang sudah dimulai siswa tidak dapat diubah. Gunakan Duplicate.",
        );
    }

    const requestedSubtest = await tx.subtest.findUnique({
      where: { code: input.subjectCode },
    });
    if (!requestedSubtest)
      throw new QuizValidationError("Subtes Kuis tidak valid.");
    const requestedMode =
      input.sourceMode ??
      (input.sourceBankId ? "bank" : sourceModeForQuiz(current ?? {}));
    if (requestedMode !== "local" && requestedMode !== "bank")
      throw new QuizValidationError("Mode sumber Kuis tidak valid.");
    if (input.assemblyVersionId)
      throw new QuizValidationError(
        "Gunakan perintah attachment khusus untuk mengikat assembly Kuis.",
      );
    if (current) {
      const currentMode = sourceModeForQuiz(current);
      if (currentMode === "assembly" && input.questionOwnership !== "quiz")
        throw new QuizValidationError(
          "Kuis yang terikat assembly harus diubah melalui perintah attachment atau pelepasan khusus.",
        );
      if (requestedMode !== currentMode && input.questionOwnership !== "quiz")
        throw new QuizValidationError(
          "Perubahan mode sumber Kuis harus memakai perintah transisi khusus.",
        );
      if (
        requestedMode === "bank" &&
        input.sourceBankId &&
        input.sourceBankId !== current.sourceBankId
      )
        throw new QuizValidationError(
          "Pergantian Bank Soal harus memakai perintah transisi khusus.",
        );
      if (requestedMode === "local" && input.sourceBankId)
        throw new QuizValidationError(
          "Kuis lokal tidak boleh memiliki Bank sumber.",
        );
      if (requestedMode === "bank" && current.subtestId !== requestedSubtest.id)
        throw new QuizValidationError(
          "Subtes Kuis pada Bank Soal tidak dapat diubah tanpa mengimpor ulang soal.",
        );
    } else if (requestedMode === "bank" || input.sourceBankId) {
      throw new QuizValidationError(
        "Buat Kuis terlebih dahulu, lalu impor soal dari Bank Soal Kuis.",
      );
    }
    await lockAndValidateQuizQuestionMedia(tx, input.questions);
    if (input.questions.length > 0) {
      validateForPublication(
        { ...input, assemblyVersionId: undefined, questions: input.questions },
        opensAt,
        closesAt,
      );
    }

    const durationSeconds =
      input.durationSeconds === undefined
        ? (current?.durationSeconds ?? null)
        : input.durationSeconds;

    if (!id) {
      const created = await tx.standaloneQuiz.create({
        data: {
          ...policy,
          assemblyDefinitionDigest: null,
          assemblyMode: null,
          assemblyPackageVersionId: null,
          assemblySeed: null,
          closesAt,
          createdByUserId: tutorId,
          description: input.description.trim() || null,
          durationSeconds,
          opensAt,
          slug: `${slugify(input.title)}-${crypto.randomUUID().slice(0, 8)}`,
          sourceBankId: null,
          status: ContentStatus.published,
          subtestId: requestedSubtest.id,
          title: input.title.trim() || "Kuis Baru",
        },
      });
      id = created.id;
    } else {
      await tx.standaloneQuiz.update({
        where: { id },
        data: {
          ...policy,
          closesAt,
          description: input.description.trim() || null,
          durationSeconds,
          opensAt,
          sourceBankId: input.questionOwnership === "quiz" ? null : current?.sourceBankId ?? null,
          ...(input.questionOwnership === "quiz" ? {
            assemblyDefinitionDigest: null,
            assemblyMode: null,
            assemblyPackageVersionId: null,
            assemblySeed: null,
          } : {}),
          status: ContentStatus.published,
          subtestId: requestedSubtest.id,
          title: input.title.trim() || "Kuis Baru",
          revision: { increment: 1 },
        },
      });
    }
    await writeStandaloneQuizItems(tx, {
      existingItems: current?.items ?? [],
      mode: requestedMode,
      questions: input.questions,
      quizId: id!,
      requestedSubtestId: requestedSubtest.id,
      sourceBankId: input.questionOwnership === "quiz" ? null : current?.sourceBankId ?? null,
    });
    const saved = await tx.standaloneQuiz.findUniqueOrThrow({
      where: { id },
      include: quizInclude,
    });
    return toKaptenQuiz(saved);
  });
}

type TransitionStandaloneQuizSourceModeInput = {
  bankId?: string | null;
  expectedSources?: readonly QuizBankImportSelection[];
  expectedDraftRevision?: number | null;
  editLease?: AuthoringEditLease;
  mode: "local" | "bank";
  questionIds?: readonly string[];
  quizId: string;
  subtestCode?: string;
};

async function transitionStandaloneQuizSourceModeVersioned(
  input: TransitionStandaloneQuizSourceModeInput,
  tutorId: string,
) {
  return prisma.$transaction(async (tx) => {
    await assertAuthoringEditLease(
      tx,
      { resourceId: input.quizId, resourceType: "quiz" },
      tutorId,
      input.editLease,
    );
    await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${input.quizId}::uuid FOR UPDATE`;
    const record = await tx.standaloneQuiz.findFirst({
      where: { id: input.quizId, createdByUserId: tutorId },
      include: versionedQuizInclude,
    });
    if (!record)
      throw new QuizValidationError(
        "Quiz tidak ditemukan atau Anda tidak memiliki akses.",
      );
    assertStandaloneQuizNotArchived(record);

    const active = activeVersionFor(record);
    const current = draftVersionFor(record) ?? active;
    if (record.assemblyPackageVersionId || current?.assemblyPackageVersionId) {
      throw new QuizValidationError(
        "Kuis yang terikat assembly harus dilepas melalui perintah khusus sebelum mengganti sumber.",
      );
    }

    const draft = await ensureStandaloneQuizDraft(tx, record);
    if (
      !draftRevisionMatches(input.expectedDraftRevision, draft.draftRevision)
    ) {
      throw new QuizValidationError(
        "Versi Kuis telah berubah di tab lain. Muat ulang sebelum mengganti sumber.",
      );
    }
    const requestedSubtest = input.subtestCode ?? record.subtest.code;
    let sourceBankId: string | null = null;
    let questions: QuizQuestionSnapshot[];

    if (input.mode === "local") {
      questions = localSnapshotsFromVersion(
        draft,
        record.items.map(toSnapshot),
      );
      const savedItems = await writeStandaloneQuizVersionItems(tx, {
        existingItems: draft.items.length
          ? draft.items
          : (active?.items ?? record.items),
        mode: "local",
        questions,
        quizId: record.id,
        quizVersionId: draft.id,
        requestedSubtestId: record.subtestId,
        sourceBankId: null,
      });
      questions = savedItems;
    } else {
      if (!input.bankId)
        throw new QuizValidationError("Pilih satu Bank Soal Kuis.");
      const materialized = await readReadyQuizBankSources(tx, {
        bankId: input.bankId,
        expectedSources: input.expectedSources,
        questionIds: input.questionIds ?? [],
        subtestCode: requestedSubtest,
      });
      questions = await writeStandaloneQuizVersionMaterializedItems(tx, {
        questions: materialized,
        quizId: record.id,
        quizVersionId: draft.id,
      });
      sourceBankId = input.bankId;
    }

    const definitionDigest = versionedDefinitionDigest(
      versionedDefinitionInputFromVersion(
        { ...draft, sourceBankId } as VersionedQuizVersionRecord,
        questions,
      ),
    );
    const updatedDraft = await tx.standaloneQuizVersion.update({
      where: { id: draft.id },
      data: {
        assemblyDefinitionDigest: null,
        assemblyMode: null,
        assemblyPackageVersionId: null,
        assemblySeed: null,
        definitionDigest,
        draftRevision: (draft.draftRevision ?? 0) + 1,
        sourceBankId,
        state: StandaloneQuizVersionState.draft,
      },
      include: quizVersionItemsInclude,
    });

    if (!active) {
      await tx.standaloneQuiz.update({
        where: { id: record.id },
        data: { revision: { increment: 1 }, sourceBankId },
      });
    } else {
      await tx.standaloneQuiz.update({
        where: { id: record.id },
        data: { revision: { increment: 1 } },
      });
    }

    const saved = await tx.standaloneQuiz.findUniqueOrThrow({
      where: { id: record.id },
      include: versionedQuizInclude,
    });
    const returnedDraft = draftVersionFor(saved) ?? updatedDraft;
    return {
      quiz: toKaptenQuizVersion(saved, returnedDraft),
      questions: returnedDraft.items.map(toSnapshot),
    };
  });
}

async function transitionStandaloneQuizSourceMode(
  input: TransitionStandaloneQuizSourceModeInput,
  tutorId: string,
) {
  if (isStandaloneQuizVersioningCutoverEnabled())
    return transitionStandaloneQuizSourceModeVersioned(input, tutorId);
  return prisma.$transaction(async (tx) => {
    await assertAuthoringEditLease(
      tx,
      { resourceId: input.quizId, resourceType: "quiz" },
      tutorId,
      input.editLease,
    );
    await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${input.quizId}::uuid FOR UPDATE`;
    const record = await tx.standaloneQuiz.findFirst({
      where: { id: input.quizId, createdByUserId: tutorId },
      include: {
        items: { include: { options: true }, orderBy: { sortOrder: "asc" } },
        participations: { select: { id: true }, take: 1 },
        subtest: true,
      },
    });
    if (!record)
      throw new QuizValidationError(
        "Quiz tidak ditemukan atau Anda tidak memiliki akses.",
      );
    assertStandaloneQuizNotArchived(record);
    if (record.participations.length)
      throw new QuizValidationError(
        "Quiz yang sudah dimulai siswa tidak dapat diubah. Gunakan Duplicate.",
      );
    if (record.assemblyPackageVersionId)
      throw new QuizValidationError(
        "Kuis yang terikat assembly harus dilepas melalui perintah khusus sebelum mengganti sumber.",
      );

    if (input.mode === "local") {
      // This is the only command allowed to clear lineage. The copied prompt,
      // options, order, and media remain exactly where the author placed them.
      for (const item of record.items) {
        // react-doctor-disable-next-line async-await-in-loop -- update the parent item before clearing lineage on its options.
        await tx.standaloneQuizItem.update({
          where: { id: item.id },
          data: {
            sourceContentDigest: null,
            sourceQuestionId: null,
            sourceQuestionRevisionId: null,
            sourceRevisionProvenance: null,
          },
        });
        for (const option of item.options) {
          // react-doctor-disable-next-line async-await-in-loop -- update each option after its parent, preserving transaction order.
          await tx.standaloneQuizItemOption.update({
            where: { id: option.id },
            data: {
              sourceQuestionOptionId: null,
              sourceQuestionRevisionOptionId: null,
            },
          });
        }
      }
      const saved = await tx.standaloneQuiz.update({
        where: { id: input.quizId },
        data: { sourceBankId: null, revision: { increment: 1 } },
        include: quizInclude,
      });
      return {
        quiz: toKaptenQuiz(saved),
        questions: saved.items.map(toSnapshot),
      };
    }

    if (!input.bankId)
      throw new QuizValidationError("Pilih satu Bank Soal Kuis.");
    const questionIds = input.questionIds ?? [];
    const materialized = await readReadyQuizBankSources(tx, {
      bankId: input.bankId,
      expectedSources: input.expectedSources,
      questionIds,
      subtestCode: input.subtestCode ?? record.subtest.code,
    });
    await tx.standaloneQuizItem.deleteMany({ where: { quizId: input.quizId } });
    for (const [index, question] of materialized.entries()) {
        // react-doctor-disable-next-line async-await-in-loop -- preserve stable assessment item ordering during transactional writes.
        const item = await tx.standaloneQuizItem.create({
          data: {
            difficulty: question.difficulty,
            explanation: question.explanation,
            explanationAssetId: question.explanationAssetId,
            prompt: question.prompt,
            promptAssetId: question.promptAssetId,
            questionType:
              answerModeForQuestionType(question.questionType) ??
              "single_choice",
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
            sourceQuestionRevisionOptionId:
              option.sourceQuestionRevisionOptionId,
          })),
        });
    }
    const saved = await tx.standaloneQuiz.update({
      where: { id: input.quizId },
      data: {
        sourceBankId: input.bankId,
        subtestId: record.subtestId,
        revision: { increment: 1 },
      },
      include: quizInclude,
    });
    return {
      quiz: toKaptenQuiz(saved),
      questions: saved.items.map(toSnapshot),
    };
  });
}

async function importStandaloneQuizBankQuestions(
  input: Omit<TransitionStandaloneQuizSourceModeInput, "mode">,
  tutorId: string,
) {
  return transitionStandaloneQuizSourceMode(
    { ...input, mode: "bank" },
    tutorId,
  );
}

/** Read and detach source content without persisting quiz or bank changes. */
async function importStandaloneQuizBankQuestionSnapshots(
  input: ImportStandaloneQuizBankQuestionSnapshotsInput,
  tutorId: string,
) {
  if (
    !input ||
    typeof input !== "object" ||
    !isUuid(input.quizId) ||
    !isUuid(input.bankId) ||
    !Number.isSafeInteger(input.expectedDraftRevision) ||
    input.expectedDraftRevision < 0
  ) {
    throw new QuizValidationError("Permintaan impor soal tidak valid.");
  }
  if (!isStandaloneQuizVersioningCutoverEnabled()) {
    throw new QuizValidationError(
      "Impor soal belum tersedia untuk Kuis ini. Muat ulang halaman lalu coba lagi.",
    );
  }

  let questionIds: string[] | null = null;
  const expectedSourceRevisions = new Map<
    string,
    StandaloneQuizBankSnapshotExpectedRevision
  >();

  if (input.allInBank === true) {
    if (
      input.questionIds !== undefined ||
      input.expectedSourceRevisions !== undefined
    ) {
      throw new QuizValidationError("Permintaan impor soal tidak valid.");
    }
  } else {
    if (
      input.allInBank !== undefined &&
      input.allInBank !== false
    ) {
      throw new QuizValidationError("Permintaan impor soal tidak valid.");
    }
    if (
      !Array.isArray(input.questionIds) ||
      !Array.isArray(input.expectedSourceRevisions) ||
      input.questionIds.length === 0 ||
      input.questionIds.some((questionId) => !isUuid(questionId)) ||
      new Set(input.questionIds).size !== input.questionIds.length
    ) {
      throw new QuizValidationError("Pilih soal yang akan ditambahkan.");
    }

    questionIds = [...input.questionIds];
    for (const expected of input.expectedSourceRevisions) {
      if (
        !expected ||
        typeof expected !== "object" ||
        !isUuid(expected.questionId) ||
        !isUuid(expected.revisionId) ||
        (expected.contentDigest !== undefined &&
          expected.contentDigest !== null &&
          (typeof expected.contentDigest !== "string" ||
            !expected.contentDigest.trim())) ||
        expectedSourceRevisions.has(expected.questionId)
      ) {
        throw new QuizValidationError(
          "Daftar soal yang dipilih tidak valid. Muat ulang Bank Soal lalu coba lagi.",
        );
      }
      expectedSourceRevisions.set(expected.questionId, expected);
    }
    if (
      expectedSourceRevisions.size !== questionIds.length ||
      questionIds.some((questionId) => !expectedSourceRevisions.has(questionId))
    ) {
      throw new QuizValidationError(
        "Daftar soal yang dipilih tidak lengkap. Muat ulang Bank Soal lalu coba lagi.",
      );
    }
  }

  return prisma.$transaction(
    async (tx) => {
      // The quiz draft, bank eligibility, question membership, revisions,
      // options, and media below all share this transaction snapshot.
      await assertAuthoringEditLease(
        tx,
        { resourceId: input.quizId, resourceType: "quiz" },
        tutorId,
        input.editLease,
      );

      const quiz = await tx.standaloneQuiz.findFirst({
        where: { id: input.quizId, createdByUserId: tutorId },
        select: {
          assemblyPackageVersionId: true,
          status: true,
          subtest: { select: { code: true } },
          versions: {
            select: {
              assemblyPackageVersionId: true,
              draftRevision: true,
              state: true,
            },
          },
        },
      });
      if (!quiz)
        throw new QuizValidationError(
          "Kuis tidak ditemukan atau Anda tidak memiliki akses.",
        );
      if (quiz.status === ContentStatus.archived)
        throw new QuizValidationError("Kuis yang diarsipkan tidak dapat diubah.");

      const draftVersion = quiz.versions.find(
        (version) => version.state === StandaloneQuizVersionState.draft,
      );
      const activeVersion = quiz.versions.find(
        (version) => version.state === StandaloneQuizVersionState.active,
      );
      if (
        !draftVersion ||
        draftVersion.draftRevision === null ||
        draftVersion.draftRevision !== input.expectedDraftRevision
      ) {
        throw new QuizValidationError(
          "Versi Kuis sudah berubah. Muat ulang Kuis sebelum mengimpor soal.",
        );
      }
      if (
        quiz.assemblyPackageVersionId ||
        draftVersion.assemblyPackageVersionId ||
        activeVersion?.assemblyPackageVersionId
      ) {
        throw new QuizValidationError(
          "Kuis yang terikat paket soal tidak dapat menerima impor langsung.",
        );
      }

      const bank = await tx.questionBank.findUnique({
        where: { id: input.bankId },
        select: { purpose: true, status: true },
      });
      if (
        !bank ||
        bank.purpose !== QuestionBankPurpose.quiz ||
        bank.status === ContentStatus.archived
      ) {
        throw new QuizValidationError(
          "Bank Soal Kuis tidak tersedia. Pilih Bank Soal yang masih aktif.",
        );
      }

      const sources = await tx.question.findMany({
        where: {
          questionBankId: input.bankId,
          ...(questionIds ? { id: { in: questionIds } } : {}),
          subtest: { code: quiz.subtest.code },
        },
        include: quizSourceInclude,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

      let eligibleSources: QuizBankSourceRecord[];
      if (questionIds) {
        if (sources.length !== questionIds.length) {
          throw new QuizValidationError(
            "Sebagian soal tidak lagi tersedia atau tidak cocok dengan Kuis.",
          );
        }

        const sourceById = new Map(
          sources.map((source) => [source.id, source]),
        );
        for (const questionId of questionIds) {
          const expected = expectedSourceRevisions.get(questionId);
          const source = sourceById.get(questionId);
          if (
            !expected ||
            !source?.currentRevision ||
            expected.revisionId !== source.currentRevision.id ||
            (expected.contentDigest != null &&
              expected.contentDigest !== source.currentRevision.contentDigest)
          ) {
            throw new QuizValidationError(
              "Bank Soal sudah berubah. Muat ulang daftar soal sebelum mengimpornya.",
            );
          }
        }

        if (
          sources.some(
            (source) =>
              !isEligibleQuizBankSnapshotSource(
                source,
                input.bankId,
                quiz.subtest.code,
              ),
          )
        ) {
          throw new QuizValidationError(
            "Sebagian soal tidak lagi tersedia atau belum siap.",
          );
        }
        eligibleSources = sources;
      } else {
        eligibleSources = sources.filter((source) =>
          isEligibleQuizBankSnapshotSource(
            source,
            input.bankId,
            quiz.subtest.code,
          ),
        );
      }

      const snapshots = eligibleSources.map(
        detachedQuizBankQuestionSnapshot,
      );
      return { importedCount: snapshots.length, snapshots };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 5_000,
      timeout: 30_000,
    },
  );
}

type AcceptStandaloneQuizQuestionUpdateInput = {
  editLease?: AuthoringEditLease;
  expectedCurrentContentDigest: string;
  expectedCurrentRevisionId: string;
  quizId: string;
  quizItemId: string;
  targetContentDigest: string;
  targetRevisionId: string;
};

async function acceptStandaloneQuizQuestionUpdateVersioned(
  input: AcceptStandaloneQuizQuestionUpdateInput,
  tutorId: string,
) {
  if (
    !input.expectedCurrentContentDigest.trim() ||
    !input.expectedCurrentRevisionId.trim() ||
    !input.targetContentDigest.trim() ||
    !input.targetRevisionId.trim()
  ) {
    throw new QuizValidationError(
      "Identitas revisi Bank Soal tidak lengkap. Muat ulang Kuis lalu coba lagi.",
    );
  }

  return prisma.$transaction(async (tx) => {
    await assertAuthoringEditLease(
      tx,
      { resourceId: input.quizId, resourceType: "quiz" },
      tutorId,
      input.editLease,
    );
    await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${input.quizId}::uuid FOR UPDATE`;
    const record = await tx.standaloneQuiz.findFirst({
      where: { id: input.quizId, createdByUserId: tutorId },
      include: versionedQuizInclude,
    });
    if (!record)
      throw new QuizValidationError(
        "Quiz tidak ditemukan atau Anda tidak memiliki akses.",
      );
    assertStandaloneQuizNotArchived(record);
    // Revisions are written to the mutable draft. An active version remains
    // immutable and is only replaced by lazy activation at the next student
    // start, so a published quiz can be edited without duplicating it.
    const active = activeVersionFor(record);
    const draft = await ensureStandaloneQuizDraftItems(
      tx,
      record,
      await ensureStandaloneQuizDraft(tx, record),
    );
    const item =
      draft.items.find((candidate) => candidate.id === input.quizItemId) ??
      (active?.items.find((candidate) => candidate.id === input.quizItemId)
        ? draft.items.find(
            (candidate) =>
              candidate.sourceQuestionId ===
              active.items.find(
                (activeItem) => activeItem.id === input.quizItemId,
              )?.sourceQuestionId,
          )
        : null);
    if (!item) throw new QuizValidationError("Soal Kuis tidak ditemukan.");
    if (
      item.sourceQuestionId === null ||
      item.sourceQuestionRevisionId === null ||
      item.sourceContentDigest === null ||
      item.sourceRevisionProvenance === "legacy_unknown"
    ) {
      throw new QuizValidationError(
        "Soal ini tidak memiliki atribusi revisi Bank Soal yang dapat ditinjau.",
      );
    }
    if (
      item.sourceQuestionRevisionId !== input.expectedCurrentRevisionId ||
      item.sourceContentDigest !== input.expectedCurrentContentDigest
    ) {
      throw new QuizValidationError(
        "Kuis telah berubah sejak tinjauan dibuka. Muat ulang lalu tinjau kembali.",
      );
    }

    await tx.$queryRaw`
      SELECT q.id
      FROM questions q
      JOIN question_banks b ON b.id = q.question_bank_id
      JOIN question_revisions r ON r.id = q.current_revision_id
      WHERE q.id = ${item.sourceQuestionId}::uuid
      FOR SHARE OF q, b, r
    `;
    const source = await tx.question.findFirst({
      where: { id: item.sourceQuestionId },
      include: quizSourceInclude,
    });
    if (
      !source?.currentRevision ||
      source.currentRevision.id !== input.targetRevisionId ||
      source.currentRevision.contentDigest !== input.targetContentDigest
    ) {
      throw new QuizValidationError(
        "Revisi Bank Soal berubah. Muat ulang lalu tinjau kembali.",
      );
    }
    if (
      source.currentRevision.id === item.sourceQuestionRevisionId &&
      source.currentRevision.contentDigest === item.sourceContentDigest
    ) {
      throw new QuizValidationError(
        "Revisi Bank Soal sudah diterapkan pada Kuis ini.",
      );
    }
    assertReadyBankSources(
      [source],
      record.subtest.code,
      draft.sourceBankId ?? record.sourceBankId ?? "",
      QuestionBankPurpose.quiz,
    );
    const materialized = materializedQuizQuestion(source);
    await tx.standaloneQuizItem.update({
      where: { id: item.id },
      data: {
        difficulty: materialized.difficulty,
        explanation: materialized.explanation,
        explanationAssetId: materialized.explanationAssetId,
        prompt: materialized.prompt,
        promptAssetId: materialized.promptAssetId,
        questionType:
          answerModeForQuestionType(materialized.questionType) ??
          "single_choice",
        sourceContentDigest: materialized.sourceContentDigest,
        sourceQuestionId: materialized.sourceQuestionId,
        sourceQuestionRevisionId: materialized.sourceQuestionRevisionId,
        sourceRevisionProvenance: materialized.sourceRevisionProvenance,
        subtestId: materialized.subtestId,
      },
    });
    await tx.standaloneQuizItemOption.deleteMany({
      where: { quizItemId: item.id },
    });
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
    const updatedItems = await tx.standaloneQuizItem.findMany({
      where: { quizVersionId: draft.id },
      include: { options: { orderBy: { sortOrder: "asc" } } },
      orderBy: { sortOrder: "asc" },
    });
    const questions = updatedItems.map(toSnapshot);
    const definitionDigest = versionedDefinitionDigest(
      versionedDefinitionInputFromVersion(draft, questions),
    );
    await tx.standaloneQuizVersion.update({
      where: { id: draft.id },
      data: {
        definitionDigest,
        draftRevision: (draft.draftRevision ?? 0) + 1,
        state: StandaloneQuizVersionState.draft,
      },
    });
    await tx.standaloneQuiz.update({
      where: { id: record.id },
      data: { revision: { increment: 1 } },
    });
    const saved = await tx.standaloneQuiz.findUniqueOrThrow({
      where: { id: record.id },
      include: versionedQuizInclude,
    });
    const savedDraft = draftVersionFor(saved);
    if (!savedDraft)
      throw new QuizValidationError("Versi Kuis tidak dapat dimuat ulang.");
    return {
      quiz: toKaptenQuizVersion(saved, savedDraft),
      questions: savedDraft.items.map(toSnapshot),
    };
  });
}

async function acceptStandaloneQuizQuestionUpdate(
  input: AcceptStandaloneQuizQuestionUpdateInput,
  tutorId: string,
) {
  if (isStandaloneQuizVersioningCutoverEnabled())
    return acceptStandaloneQuizQuestionUpdateVersioned(input, tutorId);
  if (
    !input.expectedCurrentContentDigest.trim() ||
    !input.expectedCurrentRevisionId.trim() ||
    !input.targetContentDigest.trim() ||
    !input.targetRevisionId.trim()
  ) {
    throw new QuizValidationError(
      "Identitas revisi Bank Soal tidak lengkap. Muat ulang Kuis lalu coba lagi.",
    );
  }

  return prisma.$transaction(async (tx) => {
    await assertAuthoringEditLease(
      tx,
      { resourceId: input.quizId, resourceType: "quiz" },
      tutorId,
      input.editLease,
    );
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
    if (!record)
      throw new QuizValidationError(
        "Quiz tidak ditemukan atau Anda tidak memiliki akses.",
      );
    assertStandaloneQuizNotArchived(record);
    if (record.participations.length)
      throw new QuizValidationError(
        "Quiz yang sudah dimulai siswa tidak dapat diubah. Gunakan Duplicate.",
      );
    if (record.assemblyPackageVersionId)
      throw new QuizValidationError(
        "Kuis yang terikat assembly harus diperbarui melalui versi draf assembly.",
      );
    if (
      !record.sourceBankId ||
      record.sourceBank?.purpose !== QuestionBankPurpose.quiz
    ) {
      throw new QuizValidationError(
        "Kuis ini tidak terikat ke Bank Soal Kuis.",
      );
    }

    const item = record.items.find(
      (candidate) => candidate.id === input.quizItemId,
    );
    if (!item) throw new QuizValidationError("Soal Kuis tidak ditemukan.");
    if (item.quizVersionId)
      throw new QuizValidationError(
        "Soal terikat ke versi Kuis. Perbarui melalui versi draf yang aktif.",
      );
    const sourceQuestionId = item.sourceQuestionId;
    const currentRevisionId = item.sourceQuestionRevisionId;
    const currentContentDigest = item.sourceContentDigest;
    if (
      !sourceQuestionId ||
      !currentRevisionId ||
      !currentContentDigest ||
      item.sourceRevisionProvenance === "legacy_unknown"
    ) {
      throw new QuizValidationError(
        "Soal ini tidak memiliki atribusi revisi Bank Soal yang dapat ditinjau.",
      );
    }
    if (
      currentRevisionId !== input.expectedCurrentRevisionId ||
      currentContentDigest !== input.expectedCurrentContentDigest
    ) {
      throw new QuizValidationError(
        "Kuis telah berubah sejak tinjauan dibuka. Muat ulang lalu tinjau kembali.",
      );
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
    if (
      !source?.currentRevision ||
      source.currentRevision.id !== input.targetRevisionId ||
      source.currentRevision.contentDigest !== input.targetContentDigest
    ) {
      throw new QuizValidationError(
        "Revisi Bank Soal berubah. Muat ulang lalu tinjau kembali.",
      );
    }
    if (
      source.currentRevision.id === currentRevisionId &&
      source.currentRevision.contentDigest === currentContentDigest
    ) {
      throw new QuizValidationError(
        "Revisi Bank Soal sudah diterapkan pada Kuis ini.",
      );
    }
    assertReadyBankSources(
      [source],
      record.subtest.code,
      record.sourceBankId,
      QuestionBankPurpose.quiz,
    );
    const materialized = materializedQuizQuestion(source);
    await tx.standaloneQuizItem.update({
      where: { id: item.id },
      data: {
        difficulty: materialized.difficulty,
        explanation: materialized.explanation,
        explanationAssetId: materialized.explanationAssetId,
        prompt: materialized.prompt,
        promptAssetId: materialized.promptAssetId,
        questionType:
          answerModeForQuestionType(materialized.questionType) ??
          "single_choice",
        sourceContentDigest: materialized.sourceContentDigest,
        sourceQuestionId: materialized.sourceQuestionId,
        sourceQuestionRevisionId: materialized.sourceQuestionRevisionId,
        sourceRevisionProvenance: materialized.sourceRevisionProvenance,
        subtestId: materialized.subtestId,
      },
    });
    await tx.standaloneQuizItemOption.deleteMany({
      where: { quizItemId: item.id },
    });
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
    return {
      quiz: toKaptenQuiz(saved),
      questions: saved.items.map(toSnapshot),
    };
  });
}

async function getMentorStandaloneQuiz(id: string, tutorId: string) {
  if (isStandaloneQuizVersioningCutoverEnabled()) {
    const record = await prisma.standaloneQuiz.findFirst({
      where: { id, createdByUserId: tutorId },
      include: versionedQuizInclude,
    });
    if (!record) return null;
    const version = draftVersionFor(record) ?? activeVersionFor(record);
    if (!version)
      return {
        questions: [],
        quiz: toKaptenQuiz(record as unknown as StableQuizRecord),
      };
    const questions = await getQuizQuestionsWithSourceUpdates(
      version.items,
      record.subtest.code,
    );
    return { questions, quiz: toKaptenQuizVersion(record, version) };
  }
  const record = await prisma.standaloneQuiz.findFirst({
    where: { id, createdByUserId: tutorId },
    include: quizContentInclude,
  });
  if (!record) return null;
  // Kuis-owned snapshots remain editable without traversing or revalidating the
  // live Bank Soal. Source attribution is returned for the editor, but the
  // server remains the authority for every lineage field on save.
  const questions = await getQuizQuestionsWithSourceUpdates(
    record.items,
    record.subtest.code,
  );
  return { questions, quiz: toKaptenQuiz(record) };
}

async function attachStandaloneQuizAssemblyVersioned(
  quizId: string,
  versionId: string,
  tutorId: string,
  editLease?: AuthoringEditLease,
) {
  return prisma.$transaction(async (tx) => {
    await assertAuthoringEditLease(
      tx,
      { resourceId: quizId, resourceType: "quiz" },
      tutorId,
      editLease,
    );
    await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${quizId}::uuid FOR UPDATE`;
    const record = await tx.standaloneQuiz.findFirst({
      where: { id: quizId, createdByUserId: tutorId },
      include: versionedQuizInclude,
    });
    if (!record)
      throw new QuizValidationError(
        "Quiz tidak ditemukan atau Anda tidak memiliki akses.",
      );
    assertStandaloneQuizNotArchived(record);
    const materialization = await resolveReadyAssemblyForKuis(
      tx,
      versionId,
      record.subtestId,
    );
    const active = activeVersionFor(record);
    const draft = await ensureStandaloneQuizDraft(tx, record);
    const questions = await writeStandaloneQuizVersionMaterializedItems(tx, {
      questions: materialization.items.map((item) => ({
        difficulty: item.difficulty,
        explanation: item.explanation,
        explanationAssetId: item.explanationAssetId,
        options: item.options.map((option) => ({
          assetId: option.assetId,
          choiceKey: option.choiceKey,
          content: option.content,
          isCorrect: option.isCorrect,
          sortOrder: option.sortOrder,
          sourceQuestionRevisionOptionId: option.sourceQuestionRevisionOptionId,
        })),
        prompt: item.prompt,
        promptAssetId: item.promptAssetId,
        questionType: item.questionType,
        sourceContentDigest: item.sourceContentDigest,
        sourceQuestionId: item.sourceQuestionId,
        sourceQuestionRevisionId: item.sourceQuestionRevisionId,
        sourceRevisionProvenance: item.sourceRevisionProvenance,
        subtestId: item.subtestId,
      })),
      quizId: record.id,
      quizVersionId: draft.id,
    });
    const versionIdentity = {
      ...draft,
      assemblyDefinitionDigest: materialization.assemblyDefinitionDigest,
      assemblyMode: materialization.assemblyMode,
      assemblyPackageVersionId: materialization.assemblyPackageVersionId,
      assemblySeed: materialization.assemblySeed,
      sourceBankId: materialization.sourceBankId,
    } as VersionedQuizVersionRecord;
    const definitionDigest = versionedDefinitionDigest(
      versionedDefinitionInputFromVersion(versionIdentity, questions),
    );
    const updatedDraft = await tx.standaloneQuizVersion.update({
      where: { id: draft.id },
      data: {
        assemblyDefinitionDigest: materialization.assemblyDefinitionDigest,
        assemblyMode: materialization.assemblyMode,
        assemblyPackageVersionId: materialization.assemblyPackageVersionId,
        assemblySeed: materialization.assemblySeed,
        definitionDigest,
        draftRevision: (draft.draftRevision ?? 0) + 1,
        sourceBankId: materialization.sourceBankId,
        state: StandaloneQuizVersionState.draft,
      },
      include: quizVersionItemsInclude,
    });
    if (!active) {
      await tx.standaloneQuiz.update({
        where: { id: record.id },
        data: {
          assemblyDefinitionDigest: materialization.assemblyDefinitionDigest,
          assemblyMode: materialization.assemblyMode,
          assemblyPackageVersionId: materialization.assemblyPackageVersionId,
          assemblySeed: materialization.assemblySeed,
          revision: { increment: 1 },
          sourceBankId: materialization.sourceBankId,
        },
      });
    } else {
      await tx.standaloneQuiz.update({
        where: { id: record.id },
        data: { revision: { increment: 1 } },
      });
    }
    const saved = await tx.standaloneQuiz.findUniqueOrThrow({
      where: { id: record.id },
      include: versionedQuizInclude,
    });
    const returnedDraft = draftVersionFor(saved) ?? updatedDraft;
    return toKaptenQuizVersion(saved, returnedDraft);
  });
}

async function attachStandaloneQuizAssembly(
  quizId: string,
  versionId: string,
  tutorId: string,
  editLease?: AuthoringEditLease,
) {
  if (isStandaloneQuizVersioningCutoverEnabled())
    return attachStandaloneQuizAssemblyVersioned(quizId, versionId, tutorId, editLease);
  return prisma.$transaction(async (tx) => {
    await assertAuthoringEditLease(
      tx,
      { resourceId: quizId, resourceType: "quiz" },
      tutorId,
      editLease,
    );
    await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${quizId}::uuid FOR UPDATE`;
    const record = await tx.standaloneQuiz.findFirst({
      where: { id: quizId, createdByUserId: tutorId },
      include: {
        participations: { select: { id: true }, take: 1 },
        subtest: true,
      },
    });
    if (!record)
      throw new QuizValidationError(
        "Quiz tidak ditemukan atau Anda tidak memiliki akses.",
      );
    assertStandaloneQuizNotArchived(record);
    if (record.participations.length)
      throw new QuizValidationError(
        "Quiz yang sudah dimulai siswa tidak dapat diubah. Gunakan Duplicate.",
      );
    const materialization = await resolveReadyAssemblyForKuis(
      tx,
      versionId,
      record.subtestId,
    );
    await tx.standaloneQuizItem.deleteMany({ where: { quizId } });
    for (const [index, question] of materialization.items.entries()) {
        // react-doctor-disable-next-line async-await-in-loop -- preserve the assembly's canonical question order in the transaction.
        const item = await tx.standaloneQuizItem.create({
          data: {
            difficulty: question.difficulty,
            explanation: question.explanation,
            explanationAssetId: question.explanationAssetId,
            prompt: question.prompt,
            promptAssetId: question.promptAssetId,
            questionType:
              answerModeForQuestionType(question.questionType) ??
              "single_choice",
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
            sourceQuestionRevisionOptionId:
              option.sourceQuestionRevisionOptionId,
          })),
        });
    }
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

async function detachStandaloneQuizAssemblyVersioned(
  quizId: string,
  tutorId: string,
  editLease?: AuthoringEditLease,
) {
  return prisma.$transaction(async (tx) => {
    await assertAuthoringEditLease(
      tx,
      { resourceId: quizId, resourceType: "quiz" },
      tutorId,
      editLease,
    );
    await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${quizId}::uuid FOR UPDATE`;
    const record = await tx.standaloneQuiz.findFirst({
      where: { id: quizId, createdByUserId: tutorId },
      include: versionedQuizInclude,
    });
    if (!record)
      throw new QuizValidationError(
        "Quiz tidak ditemukan atau Anda tidak memiliki akses.",
      );
    assertStandaloneQuizNotArchived(record);
    const active = activeVersionFor(record);
    const draft = await ensureStandaloneQuizDraftItems(
      tx,
      record,
      await ensureStandaloneQuizDraft(tx, record),
    );
    if (draft.assemblyPackageVersionId) {
      try {
        const materialization = await resolveReadyAssemblyForKuis(
          tx,
          draft.assemblyPackageVersionId,
          record.subtestId,
          {
            expectedDefinitionDigest: draft.assemblyDefinitionDigest,
            expectedMode: draft.assemblyMode as
              | "fixed_set"
              | "random_pool"
              | "blueprint"
              | null,
            seed: draft.assemblySeed,
          },
        );
        assertAssemblyItemsMatch(draft.items, materialization);
      } catch (error) {
        if (error instanceof AssemblyValidationError)
          throw new QuizValidationError(error.message);
        throw error;
      }
    }
    const questions = draft.items.map(toSnapshot);
    const versionIdentity = {
      ...draft,
      assemblyDefinitionDigest: null,
      assemblyMode: null,
      assemblyPackageVersionId: null,
      assemblySeed: null,
    } as VersionedQuizVersionRecord;
    const definitionDigest = versionedDefinitionDigest(
      versionedDefinitionInputFromVersion(versionIdentity, questions),
    );
    const updatedDraft = await tx.standaloneQuizVersion.update({
      where: { id: draft.id },
      data: {
        assemblyDefinitionDigest: null,
        assemblyMode: null,
        assemblyPackageVersionId: null,
        assemblySeed: null,
        definitionDigest,
        draftRevision: (draft.draftRevision ?? 0) + 1,
        state: StandaloneQuizVersionState.draft,
      },
      include: quizVersionItemsInclude,
    });
    if (!active) {
      await tx.standaloneQuiz.update({
        where: { id: record.id },
        data: {
          assemblyDefinitionDigest: null,
          assemblyMode: null,
          assemblyPackageVersionId: null,
          assemblySeed: null,
          revision: { increment: 1 },
        },
      });
    } else {
      await tx.standaloneQuiz.update({
        where: { id: record.id },
        data: { revision: { increment: 1 } },
      });
    }
    const saved = await tx.standaloneQuiz.findUniqueOrThrow({
      where: { id: record.id },
      include: versionedQuizInclude,
    });
    const returnedDraft = draftVersionFor(saved) ?? updatedDraft;
    return toKaptenQuizVersion(saved, returnedDraft);
  });
}

async function detachStandaloneQuizAssembly(
  quizId: string,
  tutorId: string,
  editLease?: AuthoringEditLease,
) {
  if (isStandaloneQuizVersioningCutoverEnabled())
    return detachStandaloneQuizAssemblyVersioned(quizId, tutorId, editLease);
  return prisma.$transaction(async (tx) => {
    await assertAuthoringEditLease(
      tx,
      { resourceId: quizId, resourceType: "quiz" },
      tutorId,
      editLease,
    );
    await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${quizId}::uuid FOR UPDATE`;
    const record = await tx.standaloneQuiz.findFirst({
      where: { id: quizId, createdByUserId: tutorId },
      include: quizInclude,
    });
    if (!record)
      throw new QuizValidationError(
        "Quiz tidak ditemukan atau Anda tidak memiliki akses.",
      );
    assertStandaloneQuizNotArchived(record);
    const participationCount = await tx.standaloneQuizParticipation.count({
      where: { quizId },
    });
    if (participationCount)
      throw new QuizValidationError(
        "Quiz yang sudah dimulai siswa tidak dapat diubah. Gunakan Duplicate.",
      );
    if (record.assemblyPackageVersionId) {
      try {
        const materialization = await resolveReadyAssemblyForKuis(
          tx,
          record.assemblyPackageVersionId,
          record.subtestId,
          {
            expectedDefinitionDigest: record.assemblyDefinitionDigest,
            expectedMode: record.assemblyMode as
              | "fixed_set"
              | "random_pool"
              | "blueprint"
              | null,
            seed: record.assemblySeed,
          },
        );
        assertAssemblyItemsMatch(record.items, materialization);
      } catch (error) {
        if (error instanceof AssemblyValidationError)
          throw new QuizValidationError(error.message);
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
/** Lightweight catalogue metadata; only compare content for quizzes with both a live and editing definition. */
export async function getMentorQuizCatalogueRecords(tutorId: string, client: Prisma.TransactionClient = prisma) {
  const records = await client.standaloneQuiz.findMany({
    where: { createdByUserId: tutorId },
    select: {
      id: true, title: true, status: true, isHidden: true, updatedAt: true,
      subtest: { select: { code: true, name: true } },
      _count: { select: { items: { where: { quizVersionId: null } } } },
      versions: { where: { state: { in: ["active", "draft"] } }, select: {
        id: true, state: true, title: true, _count: { select: { items: true } },
      } },
    },
  });
  const versioning = isStandaloneQuizVersioningCutoverEnabled();
  const comparisonIds = versioning ? records.filter(record => record.versions.some(v => v.state === "active") && record.versions.some(v => v.state === "draft")).flatMap(record => record.versions.map(v => v.id)) : [];
  const versions = comparisonIds.length ? await client.standaloneQuizVersion.findMany({
    where: { id: { in: comparisonIds } }, include: quizVersionItemsInclude,
  }) : [];
  const definitions = new Map(versions.map(version => [version.id, version]));
  return records.map(record => {
    const active = record.versions.find(v => v.state === "active");
    const draft = record.versions.find(v => v.state === "draft");
    const activeDefinition = active && definitions.get(active.id);
    const draftDefinition = draft && definitions.get(draft.id);
    return {
      id: record.id, title: record.title, editingTitle: draft?.title ?? record.title,
      subjectCode: record.subtest.code, subjectName: record.subtest.name,
      questionCount: versioning ? (active ?? draft)?._count.items ?? record._count.items : record._count.items,
      publication: record.status === "archived" ? "archived" as const : "published" as const,
      isHidden: record.isHidden,
      hasUnpublishedChanges: Boolean(activeDefinition && draftDefinition && assessmentVersionChanged(activeDefinition, draftDefinition)),
      updatedAt: record.updatedAt.toISOString(),
    };
  });
}

async function getMentorStandaloneQuizzes(tutorId: string) {
  if (isStandaloneQuizVersioningCutoverEnabled()) {
    const records = await prisma.standaloneQuiz.findMany({
      where: { createdByUserId: tutorId },
      include: versionedQuizInclude,
      orderBy: { updatedAt: "desc" },
    });
    return records.map((record) => {
      const version = draftVersionFor(record) ?? activeVersionFor(record);
      return version
        ? toKaptenQuizVersion(record, version)
        : toKaptenQuiz(record as unknown as StableQuizRecord);
    });
  }
  return (
    await prisma.standaloneQuiz.findMany({
      where: { createdByUserId: tutorId },
      include: quizInclude,
      orderBy: { updatedAt: "desc" },
    })
  ).map(toKaptenQuiz);
}
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
  const runtimeQuiz = isStandaloneQuizVersioningCutoverEnabled()
    ? await findStandaloneQuizForRuntime(prisma, { id: quiz.id })
    : null;
  const quizDefinition = runtimeQuiz ?? quiz;
  return {
    attempts: quiz.participations.flatMap((participation) => {
      const visibleAttempts = participation.attempts.filter(
        (attempt) =>
          attempt.status === "in_progress" ||
          isReviewableStandaloneQuizAttemptStatus(attempt.status),
      );
      const participationPolicy = policyFromAttemptSnapshot(
        participation.policySnapshot,
        toQuizAttemptPolicy(quizDefinition),
      );
      const finalScore = aggregateStandaloneQuizScore(
        visibleAttempts,
        participationPolicy.scorePolicy,
      );
      return visibleAttempts.map((attempt) => ({
        attemptNo: attempt.attemptNo,
        correctCount: attempt.correctCount,
        createdAt: attempt.createdAt.toISOString(),
        aggregateScore: finalScore,
        finalScore,
        earnedPoints:
          attempt.earnedPoints === null ? null : Number(attempt.earnedPoints),
        id: attempt.id,
        participationId: participation.id,
        releaseAt: attempt.releaseAt?.toISOString() ?? null,
        releaseState: attempt.releaseState,
        score: attempt.score,
        scoringProvenance: attempt.scoringProvenance,
        scoringState: attempt.scoringState,
        scoringVersion: attempt.scoringVersion,
        status: attempt.status,
        student: {
          name: participation.student.fullName?.trim() || "Siswa tanpa nama",
        },
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
      questionCount: quizDefinition.items.length,
      retryDelaySeconds: quizDefinition.retryDelaySeconds,
      reviewTiming: quizDefinition.reviewTiming,
      scorePolicy: quizDefinition.scorePolicy,
      subject: quizDefinition.subtest.code,
      title: quizDefinition.title,
    },
  };
}

async function getMentorStandaloneQuizSubmission(
  quizId: string,
  attemptId: string,
  tutorId: string,
) {
  if (!isUuid(attemptId)) return null;
  const attempt = await prisma.standaloneQuizAttempt.findFirst({
    where: {
      id: attemptId,
      participation: { quizId, quiz: { createdByUserId: tutorId } },
    },
    include: {
      answers: true,
      participation: {
        select: {
          policySnapshot: true,
          quizVersionId: true,
          student: { select: { fullName: true } },
          quiz: {
            include: quizInclude,
          },
        },
      },
    },
  });
  if (!attempt) return null;
  if (
    attempt.status !== "in_progress" &&
    !isReviewableStandaloneQuizAttemptStatus(attempt.status)
  )
    return null;
  const versionedQuiz = await resolveStandaloneQuizForAttempt(
    prisma,
    attempt.participation.quiz,
    attempt.participation.quizVersionId,
  );
  const quiz = buildAttemptQuiz(versionedQuiz, attempt);
  const policy = policyFromAttemptSnapshot(
    attempt.participation.policySnapshot,
    toQuizAttemptPolicy(quiz),
  );
  const selectedOptionIdsByItem = new Map(
    attempt.answers.map((answer) => [
      answer.quizItemId,
      storedAnswerSelectionIds(answer) ?? [],
    ]),
  );
  return {
    attemptNo: attempt.attemptNo,
    answeredCount: attempt.answers.length,
    correctCount: attempt.correctCount,
    createdAt: attempt.createdAt.toISOString(),
    id: attempt.id,
    questions: quiz.items.map((item) => ({
      explanation: item.explanation,
      options: item.options.map((option) => ({
        correct: option.isCorrect,
        id: option.id,
        key: option.choiceKey,
        text: option.content,
      })),
      prompt: item.prompt,
      questionType:
        answerModeForQuestionType(item.questionType) ?? "single_choice",
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
    student: {
      name:
        attempt.participation.student.fullName?.trim() || "Siswa tanpa nama",
    },
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

async function updateStandaloneQuizLifecycle(
  id: string,
  tutorId: string,
  editLease?: AuthoringEditLease,
) {
  return prisma.$transaction(async (tx) => {
    await assertAuthoringEditLease(
      tx,
      { resourceId: id, resourceType: "quiz" },
      tutorId,
      editLease,
    );
    await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${id}::uuid FOR UPDATE`;
    const record = await tx.standaloneQuiz.findFirst({
      where: { id, createdByUserId: tutorId },
      include: quizInclude,
    });
    if (!record)
      throw new QuizValidationError(
        "Quiz tidak ditemukan atau Anda tidak memiliki akses.",
      );
    if (record.status !== ContentStatus.published)
      throw new QuizValidationError(
        "Hanya Kuis yang diterbitkan yang dapat diarsipkan.",
      );
    const saved = await tx.standaloneQuiz.update({
      where: { id },
      data: {
        status: ContentStatus.archived,
        revision: { increment: 1 },
      },
      include: quizInclude,
    });
    return toKaptenQuiz(saved);
  });
}
async function setStandaloneQuizHidden(
  id: string,
  isHidden: boolean,
  tutorId: string,
  editLease?: AuthoringEditLease,
) {
  return prisma.$transaction(async (tx) => {
    await assertAuthoringEditLease(
      tx,
      { resourceId: id, resourceType: "quiz" },
      tutorId,
      editLease,
    );
    await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${id}::uuid FOR UPDATE`;
    const record = await tx.standaloneQuiz.findFirst({
      where: { id, createdByUserId: tutorId },
      include: quizInclude,
    });
    if (!record)
      throw new QuizValidationError(
        "Quiz tidak ditemukan atau Anda tidak memiliki akses.",
      );
    if (record.status !== ContentStatus.published)
      throw new QuizValidationError(
        "Kuis harus diterbitkan sebelum dapat disembunyikan atau ditampilkan kembali.",
      );
    if (record.isHidden === isHidden) return toKaptenQuiz(record);

    const updated = await tx.standaloneQuiz.update({
      where: { id },
      data: { isHidden },
      include: quizInclude,
    });
    return toKaptenQuiz(updated);
  });
}
function studentAvailabilityWhere(now = new Date()) {
  return {
    isHidden: false,
    status: ContentStatus.published,
    AND: [
      { OR: [{ opensAt: null }, { opensAt: { lte: now } }] },
      { OR: [{ closesAt: null }, { closesAt: { gt: now } }] },
    ],
  } satisfies Prisma.StandaloneQuizWhereInput;
}
function isStandaloneQuizAvailableAt(
  quiz: { closesAt: Date | null; opensAt: Date | null; status: ContentStatus },
  now: Date,
) {
  return (
    quiz.status === ContentStatus.published &&
    (quiz.opensAt === null || quiz.opensAt <= now) &&
    (quiz.closesAt === null || quiz.closesAt > now)
  );
}
async function getAvailableStandaloneQuiz(
  subjectCode: string,
  slug: string,
  now = new Date(),
) {
  const quiz = await findStandaloneQuizForRuntime(prisma, {
    ...studentAvailabilityWhere(now),
    slug,
    subtest: { code: subjectCode },
  });
  return quiz?.items.length ? quiz : null;
}
class QuizAttemptValidationError extends Error {}

const terminalStandaloneQuizAttemptStatuses = [
  "submitted",
  "auto_submitted",
  "expired",
  "abandoned",
  "scored",
] as const;
const reviewableStandaloneQuizAttemptStatuses = [
  "submitted",
  "auto_submitted",
  "scored",
] as const;

function isTerminalStandaloneQuizAttemptStatus(status: string) {
  return terminalStandaloneQuizAttemptStatuses.includes(
    status as (typeof terminalStandaloneQuizAttemptStatuses)[number],
  );
}

function isReviewableStandaloneQuizAttemptStatus(status: string) {
  return reviewableStandaloneQuizAttemptStatuses.includes(
    status as (typeof reviewableStandaloneQuizAttemptStatuses)[number],
  );
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

type QuizRecord = Prisma.StandaloneQuizGetPayload<{
  include: typeof quizInclude;
}>;
type QuizItemRecord = QuizRecord["items"][number];

async function resolveStandaloneQuizForAttempt(
  client: QuizReadClient,
  quiz: QuizRecord,
  preferredVersionId: string | null | undefined,
) {
  if (!isStandaloneQuizVersioningCutoverEnabled() || !preferredVersionId)
    return quiz;
  return (
    (await findStandaloneQuizForRuntime(
      client,
      { id: quiz.id },
      preferredVersionId,
    )) ?? quiz
  );
}

function toQuizAttemptPolicy(quiz: {
  attemptsAllowed: number | null;
  correctAnswerVisibility: QuizCorrectAnswerVisibility;
  formBehavior: QuizFormBehavior;
  retryDelaySeconds: number | null;
  reviewTiming: QuizReviewTiming;
  scorePolicy: QuizScorePolicy;
}): QuizAttemptPolicy {
  return {
    attemptsAllowed: quiz.attemptsAllowed,
    correctAnswerVisibility: quiz.correctAnswerVisibility,
    formBehavior: quiz.formBehavior,
    retryDelaySeconds: quiz.retryDelaySeconds,
    reviewTiming: quiz.reviewTiming,
    scorePolicy: quiz.scorePolicy,
  };
}

function policyFromAttemptSnapshot(
  snapshot: unknown,
  fallback: QuizAttemptPolicy,
): QuizAttemptPolicy {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    return fallback;
  const value = snapshot as Record<string, unknown>;
  const attemptsAllowed =
    value.attemptsAllowed === null
      ? null
      : typeof value.attemptsAllowed === "number" &&
          Number.isInteger(value.attemptsAllowed) &&
          value.attemptsAllowed > 0
        ? value.attemptsAllowed
        : fallback.attemptsAllowed;
  const retryDelaySeconds =
    value.retryDelaySeconds === null
      ? null
      : typeof value.retryDelaySeconds === "number" &&
          Number.isInteger(value.retryDelaySeconds) &&
          value.retryDelaySeconds >= 0
        ? value.retryDelaySeconds
        : fallback.retryDelaySeconds;
  return {
    attemptsAllowed,
    correctAnswerVisibility:
      typeof value.correctAnswerVisibility === "string" &&
      isOneOf(value.correctAnswerVisibility, correctAnswerVisibilities)
        ? value.correctAnswerVisibility
        : fallback.correctAnswerVisibility,
    formBehavior:
      typeof value.formBehavior === "string" &&
      isOneOf(value.formBehavior, formBehaviors)
        ? value.formBehavior
        : fallback.formBehavior,
    retryDelaySeconds,
    reviewTiming:
      typeof value.reviewTiming === "string" &&
      isOneOf(value.reviewTiming, reviewTimings)
        ? value.reviewTiming
        : fallback.reviewTiming,
    scorePolicy:
      typeof value.scorePolicy === "string" &&
      isOneOf(value.scorePolicy, scorePolicies)
        ? value.scorePolicy
        : fallback.scorePolicy,
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
      questionType:
        answerModeForQuestionType(item.questionType) ?? "single_choice",
      sortOrder: item.sortOrder,
    })),
    version: 1,
  };
}

function parseAttemptFormSnapshot(
  snapshot: unknown,
): AttemptFormSnapshot | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    return null;
  const value = snapshot as Record<string, unknown>;
  if (value.version !== 1 || !Array.isArray(value.items)) return null;
  const items = value.items.flatMap((rawItem) => {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem))
      return [];
    const item = rawItem as Record<string, unknown>;
    const questionType =
      item.questionType === undefined
        ? "single_choice"
        : answerModeForQuestionType(item.questionType as string | null);
    if (
      typeof item.id !== "string" ||
      typeof item.prompt !== "string" ||
      (item.explanation !== null && typeof item.explanation !== "string") ||
      (item.promptAssetId !== null && typeof item.promptAssetId !== "string") ||
      (item.explanationAssetId !== null &&
        typeof item.explanationAssetId !== "string") ||
      typeof item.sortOrder !== "number" ||
      !Array.isArray(item.options) ||
      !questionType
    )
      return [];
    const options = item.options.flatMap((rawOption) => {
      if (
        !rawOption ||
        typeof rawOption !== "object" ||
        Array.isArray(rawOption)
      )
        return [];
      const option = rawOption as Record<string, unknown>;
      if (
        typeof option.id !== "string" ||
        typeof option.choiceKey !== "string" ||
        typeof option.content !== "string" ||
        typeof option.isCorrect !== "boolean" ||
        typeof option.sortOrder !== "number" ||
        (option.assetId !== null && typeof option.assetId !== "string")
      )
        return [];
      return [
        {
          assetId: option.assetId,
          choiceKey: option.choiceKey,
          content: option.content,
          id: option.id,
          isCorrect: option.isCorrect,
          sortOrder: option.sortOrder,
        } satisfies AttemptFormSnapshotOption,
      ];
    });
    if (options.length !== item.options.length) return [];
    return [
      {
        explanation: item.explanation,
        explanationAssetId: item.explanationAssetId,
        id: item.id,
        options,
        prompt: item.prompt,
        promptAssetId: item.promptAssetId,
        questionType,
        sortOrder: item.sortOrder,
      } satisfies AttemptFormSnapshotItem,
    ];
  });
  if (items.length !== value.items.length) return null;
  return { items, version: 1 };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
    value,
  );
}

function attemptItemHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function orderStandaloneQuizItems<T extends { id: string }>(
  items: T[],
  attemptId: string,
  formBehavior: QuizFormBehavior,
) {
  if (formBehavior === "same") return items;
  return [...items].sort((left, right) => {
    const difference =
      attemptItemHash(`${attemptId}:${left.id}`) -
      attemptItemHash(`${attemptId}:${right.id}`);
    return difference || left.id.localeCompare(right.id);
  });
}

function orderItemsFromAttemptSnapshot<T extends { id: string }>(
  items: T[],
  attemptId: string,
  formBehavior: QuizFormBehavior,
  snapshot: unknown,
) {
  if (
    Array.isArray(snapshot) &&
    snapshot.every((itemId): itemId is string => typeof itemId === "string")
  ) {
    const positions = new Map(snapshot.map((itemId, index) => [itemId, index]));
    return [...items].sort((left, right) => {
      const leftPosition = positions.get(left.id) ?? items.length;
      const rightPosition = positions.get(right.id) ?? items.length;
      return leftPosition - rightPosition || left.id.localeCompare(right.id);
    });
  }
  return orderStandaloneQuizItems(items, attemptId, formBehavior);
}

function buildAttemptQuiz(
  quiz: QuizRecord,
  attempt: {
    formItemOrder: unknown;
    formSnapshot?: unknown;
    id: string;
    policySnapshot: unknown;
  },
) {
  const policy = policyFromAttemptSnapshot(
    attempt.policySnapshot,
    toQuizAttemptPolicy(quiz),
  );
  const snapshot = parseAttemptFormSnapshot(attempt.formSnapshot);
  if (!snapshot) {
    return {
      ...quiz,
      ...policy,
      items: orderItemsFromAttemptSnapshot(
        quiz.items,
        attempt.id,
        policy.formBehavior,
        attempt.formItemOrder,
      ),
    };
  }

  const items = snapshot.items.map((snapshotItem) => {
    const liveItem = quiz.items.find((item) => item.id === snapshotItem.id);
    const base =
      liveItem ??
      ({
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
      const liveOption = base.options.find(
        (option) => option.id === snapshotOption.id,
      );
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

function aggregateStandaloneQuizScore(
  attempts: Array<{
    attemptNo: number;
    releaseState?: string;
    score: number | null;
    scoringState?: string;
    status: string;
  }>,
  scorePolicy: QuizScorePolicy,
  requireReleased = false,
) {
  const scoredAttempts = attempts
    .filter(
      (attempt) =>
        isReviewableStandaloneQuizAttemptStatus(attempt.status) &&
        (attempt.scoringState === undefined ||
          attempt.scoringState === AssessmentScoringState.scored) &&
        (!requireReleased ||
          attempt.releaseState === AssessmentResultReleaseState.released) &&
        attempt.score !== null,
    )
    .sort((left, right) => left.attemptNo - right.attemptNo);
  if (!scoredAttempts.length) return null;
  if (scorePolicy === "highest")
    return Math.max(...scoredAttempts.map((attempt) => attempt.score ?? 0));
  if (scorePolicy === "first") return scoredAttempts[0]?.score ?? null;
  if (scorePolicy === "average")
    return Math.round(
      scoredAttempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) /
        scoredAttempts.length,
    );
  return scoredAttempts.at(-1)?.score ?? null;
}

async function activateStandaloneQuizDraftAtStart(
  tx: Prisma.TransactionClient,
  record: VersionedQuizRecord,
) {
  const active = activeVersionFor(record);
  let draft = draftVersionFor(record);
  if (!draft || record.status !== ContentStatus.published)
    return { active, record };

  draft = await ensureStandaloneQuizDraftItems(tx, record, draft);
  if (active && !assessmentVersionChanged(active, draft))
    return { active, record };

  let publicationQuestions = draft.items.map(toSnapshot);
  try {
    if (draft.assemblyPackageVersionId) {
      const materialization = await resolveReadyAssemblyForKuis(
        tx,
        draft.assemblyPackageVersionId,
        record.subtestId,
        {
          expectedDefinitionDigest: draft.assemblyDefinitionDigest,
          expectedMode: draft.assemblyMode as
            | "fixed_set"
            | "random_pool"
            | "blueprint"
            | null,
          seed: draft.assemblySeed,
        },
      );
      assertAssemblyItemsMatch(draft.items, materialization);
      publicationQuestions = snapshotsFromAssembly(materialization);
    }

    await lockAndValidateQuizQuestionMedia(tx, publicationQuestions);
    validateForPublication(
      {
        assemblyVersionId: draft.assemblyPackageVersionId ?? undefined,
        questions: publicationQuestions,
        reviewTiming: draft.reviewTiming,
        title: draft.title,
      },
      record.opensAt,
      record.closesAt,
      { materializedAssembly: Boolean(draft.assemblyPackageVersionId) },
    );
  } catch (error) {
    // A bad saved draft must never invalidate the last usable assessment. Keep
    // serving the active snapshot when one exists; a first publication has no
    // safe fallback and should explain why it cannot start.
    if (
      active &&
      (error instanceof QuizValidationError ||
        error instanceof AssemblyValidationError)
    ) {
      return { active, record };
    }
    if (
      error instanceof QuizValidationError ||
      error instanceof AssemblyValidationError
    ) {
      throw new QuizAttemptValidationError(error.message);
    }
    throw error;
  }

  const now = new Date();
  const nextVersionNo = nextStandaloneQuizVersionNo(
    record.versions.map((version) => version.versionNo),
  );
  const definitionDigest = versionedDefinitionDigest(
    versionedDefinitionInputFromVersion(draft, publicationQuestions),
  );
  if (active) {
    await tx.standaloneQuizVersion.update({
      where: { id: active.id },
      data: { state: StandaloneQuizVersionState.superseded },
    });
  }
  await tx.standaloneQuizVersion.update({
    where: { id: draft.id },
    data: {
      baseVersionId: active?.id ?? draft.baseVersionId,
      closesAt: record.closesAt,
      definitionDigest,
      draftRevision: null,
      opensAt: record.opensAt,
      publishedAt: now,
      publishedByUserId: null,
      publishRequestId: crypto.randomUUID(),
      state: StandaloneQuizVersionState.active,
      versionNo: nextVersionNo,
    },
  });
  await tx.standaloneQuiz.update({
    where: { id: record.id },
    data: {
      ...versionFieldsFrom({
        ...draft,
        closesAt: record.closesAt,
        opensAt: record.opensAt,
      }),
      revision: { increment: 1 },
      status: ContentStatus.published,
    },
  });

  const saved = await tx.standaloneQuiz.findUniqueOrThrow({
    where: { id: record.id },
    include: versionedQuizInclude,
  });
  return { active: activeVersionFor(saved), record: saved };
}

async function findStandaloneQuizStartCommand(
  tx: Prisma.TransactionClient,
  quizId: string,
  studentId: string,
  requestId: string,
) {
  return tx.standaloneQuizStartCommand.findUnique({
    where: { quizId_studentId_requestId: { quizId, studentId, requestId } },
    include: {
      attempt: {
        include: {
          answers: true,
          participation: true,
        },
      },
    },
  });
}

async function linkStandaloneQuizStartCommand(
  tx: Prisma.TransactionClient,
  input: {
    attemptId: string;
    quizId: string;
    quizVersionId: string | null;
    requestId: string;
    studentId: string;
  },
) {
  const existing = await tx.standaloneQuizStartCommand.findUnique({
    where: {
      quizId_studentId_requestId: {
        quizId: input.quizId,
        studentId: input.studentId,
        requestId: input.requestId,
      },
    },
  });
  if (existing) {
    if (!existing.attemptId) {
      return tx.standaloneQuizStartCommand.update({
        where: { id: existing.id },
        data: {
          attemptId: input.attemptId,
          quizVersionId: input.quizVersionId,
        },
      });
    }
    return existing;
  }
  return tx.standaloneQuizStartCommand.create({
    data: {
      attemptId: input.attemptId,
      quizId: input.quizId,
      quizVersionId: input.quizVersionId,
      requestId: input.requestId,
      studentId: input.studentId,
    },
  });
}

async function startStandaloneQuiz(
  subjectCode: string,
  slug: string,
  studentId: string,
  requestedNow?: Date,
  startRequestId?: string,
) {
  if (startRequestId !== undefined && !isUuid(startRequestId))
    throw new QuizAttemptValidationError("Permintaan mulai quiz tidak valid.");
  const effectiveStartRequestId = startRequestId ?? crypto.randomUUID();
  return prisma.$transaction(async (tx) => {
    const identity = await tx.standaloneQuiz.findFirst({
      where: { slug, subtest: { code: subjectCode } },
      select: { id: true },
    });
    if (!identity) return null;

    // The quiz row is the shared content/policy boundary. Lock it before
    // creating the first participation so concurrent Start calls cannot both
    // observe the same next attempt number or stale availability policy.
    await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${identity.id}::uuid FOR UPDATE`;
    let versionedQuizRecord = isStandaloneQuizVersioningCutoverEnabled()
      ? await tx.standaloneQuiz.findUnique({
          where: { id: identity.id },
          include: versionedQuizInclude,
        })
      : null;
    const loadedQuizRecord = versionedQuizRecord
      ? activeVersionFor(versionedQuizRecord)
        ? projectStandaloneQuizVersion(
            versionedQuizRecord,
            activeVersionFor(versionedQuizRecord)!,
          )
        : (versionedQuizRecord as unknown as StableQuizRecord)
      : await tx.standaloneQuiz.findUnique({
          where: { id: identity.id },
          include: quizInclude,
        });
    if (!loadedQuizRecord) return null;

    // Replay an accepted command before checking the current open window. The
    // command is the idempotency authority even after a later lazy snapshot
    // has become active for the same quiz.
    const replayedCommand = await findStandaloneQuizStartCommand(
      tx,
      identity.id,
      studentId,
      effectiveStartRequestId,
    );
    if (replayedCommand?.attempt) {
      const replayedQuiz = versionedQuizRecord
        ? await findStandaloneQuizForRuntime(
            tx,
            { id: identity.id },
            replayedCommand.attempt.participation.quizVersionId,
          )
        : loadedQuizRecord;
      if (replayedQuiz) {
        const replayedAttemptQuiz = buildAttemptQuiz(
          replayedQuiz,
          replayedCommand.attempt,
        );
        return {
          attempt: replayedCommand.attempt,
          policy: toQuizAttemptPolicy(replayedAttemptQuiz),
          quiz: replayedAttemptQuiz,
          state: "replayed" as const,
        };
      }
    }

    // A student who is already in progress must resume the participation that
    // owns that attempt. Do this before lazy activation so a mentor edit never
    // moves an existing session to a newer snapshot.
    const inProgressParticipation =
      await tx.standaloneQuizParticipation.findFirst({
        where: {
          quizId: identity.id,
          studentId,
          attempts: { some: { status: "in_progress" } },
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          quizVersionId: true,
          attempts: {
            where: { status: "in_progress" },
            orderBy: { attemptNo: "desc" },
            take: 1,
            select: { id: true },
          },
        },
      });
    if (inProgressParticipation?.attempts[0]) {
      await tx.$queryRaw`SELECT id FROM standalone_quiz_participations WHERE id = ${inProgressParticipation.id}::uuid FOR UPDATE`;
      const resumedAttempt = await tx.standaloneQuizAttempt.findUniqueOrThrow({
        where: { id: inProgressParticipation.attempts[0].id },
        include: { answers: true },
      });
      const resumedQuiz = versionedQuizRecord
        ? await findStandaloneQuizForRuntime(
            tx,
            { id: identity.id },
            inProgressParticipation.quizVersionId,
          )
        : loadedQuizRecord;
      const checkNow = requestedNow ?? new Date();
      if (!resumedQuiz || !isStandaloneQuizAvailableAt(resumedQuiz, checkNow)) {
        throw new QuizAttemptValidationError(
          "Quiz belum tersedia atau sudah ditutup.",
        );
      }
      let attempt = resumedAttempt;
      if (!attempt.startRequestId) {
        attempt = await tx.standaloneQuizAttempt.update({
          where: { id: attempt.id },
          data: { startRequestId: effectiveStartRequestId },
          include: { answers: true },
        });
        await linkStandaloneQuizStartCommand(tx, {
          attemptId: attempt.id,
          quizId: resumedQuiz.id,
          quizVersionId: inProgressParticipation.quizVersionId,
          requestId: effectiveStartRequestId,
          studentId,
        });
      }
      const resumedAttemptQuiz = buildAttemptQuiz(resumedQuiz, attempt);
      return {
        attempt,
        policy: toQuizAttemptPolicy(resumedAttemptQuiz),
        quiz: resumedAttemptQuiz,
        state: "resumed" as const,
      };
    }

    // A new attempt is the only event that turns a changed draft into an
    // immutable active snapshot. A title/description or schedule-only save
    // leaves the existing active version in place.
    const checkNow = requestedNow ?? new Date();
    // Validate the stable availability boundary while the quiz row is still
    // locked, before promoting a draft. A stale/direct start must not be able
    // to supersede the live snapshot when the start itself is ineligible.
    if (!isStandaloneQuizAvailableAt(loadedQuizRecord, checkNow)) {
      throw new QuizAttemptValidationError(
        "Quiz belum tersedia atau sudah ditutup.",
      );
    }
    if (loadedQuizRecord.isHidden) {
      throw new QuizAttemptValidationError(
        "Kuis ini disembunyikan dan tidak menerima pengerjaan baru.",
      );
    }
    if (versionedQuizRecord) {
      versionedQuizRecord = (
        await activateStandaloneQuizDraftAtStart(tx, versionedQuizRecord)
      ).record;
    }
    const activeVersion = versionedQuizRecord
      ? activeVersionFor(versionedQuizRecord)
      : null;
    const quiz = await findStandaloneQuizForRuntime(
      tx,
      { id: identity.id },
      activeVersion?.id,
    );
    if (!quiz || quiz.isHidden || !isStandaloneQuizAvailableAt(quiz, checkNow))
      throw new QuizAttemptValidationError(
        "Quiz belum tersedia atau sudah ditutup.",
      );
    if (versionedQuizRecord && !activeVersion)
      throw new QuizAttemptValidationError("Quiz belum siap digunakan.");

    // Participations are scoped to the active immutable version. A terminal
    // participation from an older version remains historical, while a new
    // version receives a fresh allowance/retry counter for this student.
    const existingParticipation =
      await tx.standaloneQuizParticipation.findFirst({
        where:
          versionedQuizRecord && activeVersion
            ? { quizVersionId: activeVersion.id, studentId }
            : { quizId: quiz.id, studentId },
        select: { id: true, policySnapshot: true, quizVersionId: true },
      });
    const participation =
      existingParticipation ??
      (await tx.standaloneQuizParticipation.create({
        data: {
          policySnapshot: toQuizAttemptPolicy(
            quiz,
          ) as unknown as Prisma.InputJsonObject,
          quizId: quiz.id,
          quizVersionId: versionedQuizRecord
            ? (activeVersion?.id ?? null)
            : undefined,
          studentId,
        },
        select: { id: true, policySnapshot: true, quizVersionId: true },
      }));
    await tx.$queryRaw`SELECT id FROM standalone_quiz_participations WHERE id = ${participation.id}::uuid FOR UPDATE`;
    const participationPolicy = policyFromAttemptSnapshot(
      participation.policySnapshot,
      toQuizAttemptPolicy(quiz),
    );

    // A legacy command row may have been recorded without its attempt link.
    // Re-check after participation selection and complete the same idempotent
    // response without allocating another attempt.
    const linkedCommand = await findStandaloneQuizStartCommand(
      tx,
      identity.id,
      studentId,
      effectiveStartRequestId,
    );
    if (linkedCommand?.attempt) {
      const replayedAttemptQuiz = buildAttemptQuiz(quiz, linkedCommand.attempt);
      return {
        attempt: linkedCommand.attempt,
        policy: toQuizAttemptPolicy(replayedAttemptQuiz),
        quiz: replayedAttemptQuiz,
        state: "replayed" as const,
      };
    }

    const replayedAttempt = await tx.standaloneQuizAttempt.findUnique({
      where: {
        participationId_startRequestId: {
          participationId: participation.id,
          startRequestId: effectiveStartRequestId,
        },
      },
      include: { answers: true },
    });
    if (replayedAttempt) {
      const replayedQuiz = buildAttemptQuiz(quiz, replayedAttempt);
      return {
        attempt: replayedAttempt,
        policy: toQuizAttemptPolicy(replayedQuiz),
        quiz: replayedQuiz,
        state: "replayed" as const,
      };
    }

    const attempts = await tx.standaloneQuizAttempt.findMany({
      where: { participationId: participation.id },
      orderBy: { attemptNo: "desc" },
      select: {
        attemptNo: true,
        createdAt: true,
        id: true,
        startRequestId: true,
        status: true,
        submittedAt: true,
        updatedAt: true,
      },
    });
    const current = attempts.find(
      (attempt) => attempt.status === "in_progress",
    );
    if (current) {
      let attempt = await tx.standaloneQuizAttempt.findUniqueOrThrow({
        where: { id: current.id },
        include: { answers: true },
      });
      // Legacy attempts may predate explicit Start keys. Bind the first
      // accepted retry key while the attempt is still active so a client
      // retry remains tied to the same attempt instead of allocating later.
      if (!attempt.startRequestId) {
        attempt = await tx.standaloneQuizAttempt.update({
          where: { id: current.id },
          data: { startRequestId: effectiveStartRequestId },
          include: { answers: true },
        });
        await linkStandaloneQuizStartCommand(tx, {
          attemptId: attempt.id,
          quizId: quiz.id,
          quizVersionId: participation.quizVersionId,
          requestId: effectiveStartRequestId,
          studentId,
        });
      }
      const resumedQuiz = buildAttemptQuiz(quiz, attempt);
      return {
        attempt,
        policy: toQuizAttemptPolicy(resumedQuiz),
        quiz: resumedQuiz,
        state: "resumed" as const,
      };
    }

    const terminalAttempts = attempts.filter((attempt) =>
      isTerminalStandaloneQuizAttemptStatus(attempt.status),
    );
    if (
      participationPolicy.attemptsAllowed !== null &&
      terminalAttempts.length >= participationPolicy.attemptsAllowed
    ) {
      throw new QuizAttemptValidationError(
        "Batas percobaan Kuis ini sudah tercapai.",
      );
    }
    const previous = terminalAttempts[0];
    if (previous && participationPolicy.retryDelaySeconds !== null) {
      const previousAt =
        previous.submittedAt ?? previous.updatedAt ?? previous.createdAt;
      const retryAt =
        previousAt.getTime() + participationPolicy.retryDelaySeconds * 1000;
      if (checkNow.getTime() < retryAt) {
        throw new QuizAttemptValidationError(
          `Percobaan berikutnya tersedia pada ${new Date(retryAt).toLocaleString("id-ID")}.`,
        );
      }
    }

    const attemptId = crypto.randomUUID();
    const policy = participationPolicy;
    const orderedItems = orderStandaloneQuizItems(
      quiz.items,
      attemptId,
      policy.formBehavior,
    );
    const attempt = await tx.standaloneQuizAttempt.create({
      data: {
        formItemOrder: orderedItems.map(
          (item) => item.id,
        ) as Prisma.InputJsonArray,
        formSnapshot: toAttemptFormSnapshot(
          orderedItems,
        ) as unknown as Prisma.InputJsonObject,
        id: attemptId,
        attemptNo: (attempts[0]?.attemptNo ?? 0) + 1,
        participationId: participation.id,
        policySnapshot: policy as unknown as Prisma.InputJsonObject,
        startRequestId: effectiveStartRequestId,
      },
      include: { answers: true },
    });
    await linkStandaloneQuizStartCommand(tx, {
      attemptId: attempt.id,
      quizId: quiz.id,
      quizVersionId: participation.quizVersionId,
      requestId: effectiveStartRequestId,
      studentId,
    });
    const startedQuiz = buildAttemptQuiz(quiz, attempt);
    return {
      attempt,
      policy: toQuizAttemptPolicy(startedQuiz),
      quiz: startedQuiz,
      state: "started" as const,
    };
  });
}

async function getStandaloneQuizAttempt(
  subjectCode: string,
  slug: string,
  studentId: string,
  attemptId?: string,
  now = new Date(),
) {
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
  if (
    attempt.status !== "in_progress" &&
    !isReviewableStandaloneQuizAttemptStatus(attempt.status)
  )
    return null;
  const versionedQuiz = await resolveStandaloneQuizForAttempt(
    prisma,
    attempt.participation.quiz,
    attempt.participation.quizVersionId,
  );
  const quiz = buildAttemptQuiz(versionedQuiz, attempt);
  const policy = policyFromAttemptSnapshot(
    attempt.participation.policySnapshot,
    toQuizAttemptPolicy(quiz),
  );
  return {
    attempt,
    attemptId: attempt.id,
    attemptNo: attempt.attemptNo,
    policy,
    quiz: { ...quiz, ...policy },
  };
}

async function saveStandaloneQuizAnswer(
  attemptId: string,
  quizItemId: string,
  selectedOptionIdsInput: readonly string[] | string,
  studentId: string,
) {
  if (!isUuid(attemptId))
    throw new QuizAttemptValidationError("Sesi quiz tidak valid.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM standalone_quiz_attempts WHERE id = ${attemptId}::uuid FOR UPDATE`;
    const attempt = await tx.standaloneQuizAttempt.findFirst({
      where: { id: attemptId, participation: { studentId } },
      select: {
        formSnapshot: true,
        id: true,
        participation: { select: { quizId: true, quizVersionId: true } },
        status: true,
      },
    });
    if (!attempt)
      throw new QuizAttemptValidationError(
        "Sesi quiz tidak ditemukan atau sudah ditutup.",
      );
    if (attempt.status !== "in_progress")
      throw new QuizAttemptValidationError(
        "Quiz ini sudah dikirim dan jawabannya tidak dapat diubah.",
      );
    const requestedOptionIds =
      typeof selectedOptionIdsInput === "string"
        ? [selectedOptionIdsInput]
        : [...selectedOptionIdsInput];
    const snapshot = parseAttemptFormSnapshot(attempt.formSnapshot);
    const snapshotItem = snapshot?.items.find((item) => item.id === quizItemId);
    const item = await tx.standaloneQuizItem.findFirst({
      where: { id: quizItemId, quizId: attempt.participation.quizId },
      select: {
        options: { select: { id: true } },
        questionType: true,
        quizVersionId: true,
      },
    });
    if (!item)
      throw new QuizAttemptValidationError("Soal quiz tidak ditemukan.");
    if (
      attempt.participation.quizVersionId &&
      item.quizVersionId !== attempt.participation.quizVersionId
    ) {
      throw new QuizAttemptValidationError(
        "Soal quiz tidak termasuk versi sesi ini.",
      );
    }
    const mode =
      snapshotItem?.questionType ??
      answerModeForQuestionType(item.questionType) ??
      "single_choice";
    const availableOptionIds =
      snapshotItem?.options.map((option) => option.id) ??
      item.options.map((option) => option.id);
    const validation = validateSelectedOptionIds(
      mode,
      requestedOptionIds,
      availableOptionIds,
    );
    if (!validation.ok)
      throw new QuizAttemptValidationError(
        validation.errors[0]?.message ??
          "Pilihan jawaban tidak valid untuk bentuk soal ini.",
      );
    const persistedOptionIds = new Set(item.options.map((option) => option.id));
    if (
      validation.selectedOptionIds.some(
        (optionId) => !persistedOptionIds.has(optionId),
      )
    ) {
      throw new QuizAttemptValidationError(
        "Pilihan jawaban tidak valid untuk soal ini.",
      );
    }
    if (!validation.selectedOptionIds.length) {
      await tx.standaloneQuizAnswer.deleteMany({
        where: { attemptId, quizItemId },
      });
      return { quizItemId, selectedOptionId: null, selectedOptionIds: [] };
    }
    const selectedOptionId = validation.selectedOptionIds[0]!;
    const selectedOptionIds =
      validation.selectedOptionIds as Prisma.InputJsonArray;
    const answerFormat =
      mode === "multiple_choice"
        ? StandaloneQuizAnswerFormat.multiple_options
        : StandaloneQuizAnswerFormat.single_option;
    await tx.standaloneQuizAnswer.upsert({
      where: { attemptId_quizItemId: { attemptId, quizItemId } },
      create: {
        answerFormat,
        attemptId,
        quizItemId,
        selectedOptionId,
        selectedOptionIds,
      },
      update: {
        answerFormat,
        isCorrect: null,
        pointsAwarded: null,
        scoringVersion: null,
        selectedOptionId,
        selectedOptionIds,
      },
    });
    return {
      quizItemId,
      selectedOptionId,
      selectedOptionIds: validation.selectedOptionIds,
    };
  });
}

async function submitStandaloneQuiz(attemptId: string, studentId: string) {
  if (!isUuid(attemptId))
    throw new QuizAttemptValidationError("Sesi quiz tidak valid.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM standalone_quiz_attempts WHERE id = ${attemptId}::uuid FOR UPDATE`;
    const attempt = await tx.standaloneQuizAttempt.findFirst({
      where: { id: attemptId, participation: { studentId } },
      include: {
        answers: true,
        participation: {
          include: {
            quiz: {
              select: {
                closesAt: true,
                id: true,
                items: { select: { id: true } },
                reviewTiming: true,
              },
            },
          },
        },
      },
    });
    if (!attempt)
      throw new QuizAttemptValidationError(
        "Sesi quiz tidak ditemukan atau sudah ditutup.",
      );
    if (attempt.status !== "in_progress")
      return {
        attemptId: attempt.id,
        scoringState: attempt.scoringState,
        state: "already_submitted" as const,
      };

    const submittedAt = new Date();
    const snapshot = parseAttemptFormSnapshot(attempt.formSnapshot);
    let fallbackQuestionCount = attempt.participation.quiz.items.length;
    let quizClosesAt = attempt.participation.quiz.closesAt;
    let quizReviewTiming = attempt.participation.quiz.reviewTiming;
    if (isStandaloneQuizVersioningCutoverEnabled()) {
      const versionedQuiz = await findStandaloneQuizForRuntime(
        tx,
        { id: attempt.participation.quiz.id },
        attempt.participation.quizVersionId,
      );
      if (versionedQuiz) {
        fallbackQuestionCount = versionedQuiz.items.length;
        quizClosesAt = versionedQuiz.closesAt;
        quizReviewTiming = versionedQuiz.reviewTiming;
      }
    }
    const totalQuestions = snapshot?.items.length ?? fallbackQuestionCount;
    const policy = policyFromAttemptSnapshot(attempt.policySnapshot, {
      attemptsAllowed: null,
      correctAnswerVisibility: "show",
      formBehavior: "same",
      retryDelaySeconds: null,
      reviewTiming: quizReviewTiming,
      scorePolicy: "latest",
    });

    if (!snapshot || !snapshot.items.length) {
      await tx.standaloneQuizAttempt.update({
        where: { id: attempt.id },
        data: {
          attemptState: AssessmentAttemptState.submitted,
          scoringProvenance: AssessmentScoringProvenance.legacy_unknown,
          scoringReviewReason:
            "Frozen Kuis form snapshot is missing or malformed.",
          scoringState: AssessmentScoringState.review_required,
          releaseState: AssessmentResultReleaseState.hidden,
          status: "submitted",
          submittedAt,
        },
      });
      return {
        attemptId: attempt.id,
        scoringState: AssessmentScoringState.review_required,
        state: "review_required" as const,
      };
    }

    const itemById = new Map(snapshot.items.map((item) => [item.id, item]));
    let invalidAnswer = false;
    let correctCount = 0;
    const updates: Array<{ id: string; isCorrect: boolean }> = [];
    for (const answer of attempt.answers) {
      const item = itemById.get(answer.quizItemId);
      const selectedOptionIds = storedAnswerSelectionIds(answer);
      const evaluation =
        item && selectedOptionIds
          ? evaluateExactAnswer({
              availableOptionIds: item.options.map((option) => option.id),
              correctOptionIds: item.options
                .filter((option) => option.isCorrect)
                .map((option) => option.id),
              mode: item.questionType,
              selectedOptionIds,
            })
          : null;
      if (
        !evaluation ||
        evaluation.status === "invalid" ||
        evaluation.status === "unanswered"
      ) {
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
          data: {
            isCorrect,
            pointsAwarded: isCorrect ? 1 : 0,
            scoringVersion: KUIS_SCORING_VERSION,
          },
        }),
      ),
    );

    if (invalidAnswer) {
      await tx.standaloneQuizAttempt.update({
        where: { id: attempt.id },
        data: {
          attemptState: AssessmentAttemptState.submitted,
          scoringProvenance: AssessmentScoringProvenance.legacy_unknown,
          scoringReviewReason:
            "One or more submitted answers are absent from the frozen Kuis form snapshot.",
          scoringState: AssessmentScoringState.review_required,
          releaseState: AssessmentResultReleaseState.hidden,
          status: "submitted",
          submittedAt,
        },
      });
      return {
        attemptId: attempt.id,
        scoringState: AssessmentScoringState.review_required,
        state: "review_required" as const,
      };
    }

    const answeredCount = attempt.answers.length;
    const unansweredCount = Math.max(0, totalQuestions - answeredCount);
    const wrongCount = Math.max(0, answeredCount - correctCount);
    const score = totalQuestions
      ? Math.round((correctCount / totalQuestions) * 100)
      : 0;
    let releaseState: AssessmentResultReleaseState =
      AssessmentResultReleaseState.hidden;
    let releaseAt: Date | null = null;
    if (policy.reviewTiming === "immediate")
      releaseState = AssessmentResultReleaseState.released;
    else if (policy.reviewTiming === "after_close" && quizClosesAt) {
      if (quizClosesAt <= submittedAt)
        releaseState = AssessmentResultReleaseState.released;
      else {
        releaseState = AssessmentResultReleaseState.scheduled;
        releaseAt = quizClosesAt;
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
    return {
      attemptId: attempt.id,
      releaseState,
      scoringState: AssessmentScoringState.scored,
      state: "submitted" as const,
    };
  });
}

async function synchronizeStandaloneQuizReleaseState(
  attemptId: string,
  studentId: string,
  now: Date,
) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM standalone_quiz_attempts WHERE id = ${attemptId}::uuid FOR UPDATE`;
    const attempt = await tx.standaloneQuizAttempt.findFirst({
      where: { id: attemptId, participation: { studentId } },
      select: { releaseAt: true, releaseState: true, scoringState: true },
    });
    if (
      !attempt ||
      attempt.releaseState !== AssessmentResultReleaseState.scheduled ||
      !attempt.releaseAt ||
      attempt.releaseAt > now ||
      attempt.scoringState !== AssessmentScoringState.scored
    )
      return;
    await tx.standaloneQuizAttempt.update({
      where: { id: attemptId },
      data: { releaseState: AssessmentResultReleaseState.released },
    });
  });
}

async function getStandaloneQuizResult(
  attemptId: string,
  studentId: string,
  subjectCode: string,
  slug: string,
  now = new Date(),
) {
  if (!isUuid(attemptId)) return null;
  await synchronizeStandaloneQuizReleaseState(attemptId, studentId, now);
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
  const reviewEligible = isReviewableStandaloneQuizAttemptStatus(
    attempt.status,
  );
  if (!reviewEligible) return null;
  const versionedQuiz = await resolveStandaloneQuizForAttempt(
    prisma,
    attempt.participation.quiz,
    attempt.participation.quizVersionId,
  );
  const quiz = buildAttemptQuiz(versionedQuiz, attempt);
  const totalQuestions = quiz.items.length;
  const selectedOptionIdsByItem = new Map(
    attempt.answers.map((answer) => [
      answer.quizItemId,
      storedAnswerSelectionIds(answer) ?? [],
    ]),
  );
  const policy = policyFromAttemptSnapshot(
    attempt.participation.policySnapshot,
    toQuizAttemptPolicy(quiz),
  );
  const isSubmitted = true;
  const releaseState = attempt.releaseState;
  const released =
    releaseState === AssessmentResultReleaseState.released &&
    attempt.scoringState === AssessmentScoringState.scored;
  const reviewAvailable =
    released &&
    (policy.reviewTiming === "immediate" ||
      (policy.reviewTiming === "after_close" &&
        quiz.closesAt !== null &&
        quiz.closesAt <= now));
  const correctnessAvailable =
    reviewAvailable && policy.correctAnswerVisibility === "show";
  const activeAttempt = attempt.participation.attempts.some(
    (candidate) => candidate.status === "in_progress",
  );
  const terminalAttempts = attempt.participation.attempts.filter((candidate) =>
    isTerminalStandaloneQuizAttemptStatus(candidate.status),
  );
  const latestTerminalAttempt = terminalAttempts.at(-1);
  const latestTerminalAt =
    latestTerminalAttempt?.submittedAt ??
    latestTerminalAttempt?.updatedAt ??
    latestTerminalAttempt?.createdAt;
  const attemptsRemain =
    policy.attemptsAllowed === null ||
    terminalAttempts.length < policy.attemptsAllowed;
  const retryDelayPassed =
    latestTerminalAt === undefined ||
    policy.retryDelaySeconds === null ||
    latestTerminalAt.getTime() + policy.retryDelaySeconds * 1000 <=
      now.getTime();
  const quizAvailable = isStandaloneQuizAvailableAt(quiz, now);
  const canRestart =
    quizAvailable && (activeAttempt || (attemptsRemain && retryDelayPassed));
  const releasedAttempts = attempt.participation.attempts.filter(
    (candidate) =>
      candidate.releaseState === AssessmentResultReleaseState.released,
  );
  return {
    answeredCount: attempt.answers.length,
    canRestart,
    correctCount: released ? attempt.correctCount : null,
    attemptId: attempt.id,
    attemptNo: attempt.attemptNo,
    attemptScore: released ? attempt.score : null,
    aggregateScore: aggregateStandaloneQuizScore(
      releasedAttempts,
      policy.scorePolicy,
      true,
    ),
    correctnessAvailable,
    isSubmitted,
    policy,
    questions: quiz.items.map((item) => {
      const selectedOptionIds = selectedOptionIdsByItem.get(item.id) ?? [];
      return {
        explanation: reviewAvailable ? item.explanation : null,
        id: item.id,
        options: item.options.map((option) => ({
          correct: correctnessAvailable && option.isCorrect,
          id: option.id,
          key: option.choiceKey,
          text: option.content,
        })),
        prompt: item.prompt,
        questionType:
          answerModeForQuestionType(item.questionType) ?? "single_choice",
        selectedOptionId: selectedOptionIds[0] ?? null,
        selectedOptionIds,
      };
    }),
    releaseAt: attempt.releaseAt?.toISOString() ?? null,
    releaseState,
    released,
    reviewAvailable,
    scoringState: attempt.scoringState,
    scoringVersion: attempt.scoringVersion,
    score: aggregateStandaloneQuizScore(
      releasedAttempts,
      policy.scorePolicy,
      true,
    ),
    title: quiz.title,
    totalQuestions,
  };
}

async function getStandaloneQuizAttemptId(
  subjectCode: string,
  slug: string,
  studentId: string,
) {
  const attempt = await prisma.standaloneQuizAttempt.findFirst({
    where: {
      participation: {
        quiz: { slug, subtest: { code: subjectCode } },
        studentId,
      },
      status: { in: [...reviewableStandaloneQuizAttemptStatuses] },
    },
    orderBy: [{ attemptNo: "desc" }, { submittedAt: "desc" }],
    select: { id: true },
  });
  return attempt?.id ?? null;
}

async function getStandaloneQuizAttemptStatuses(
  studentId: string,
  quizIds: string[],
) {
  if (!quizIds.length) return [];
  const activeVersions = await prisma.standaloneQuizVersion.findMany({
    where: {
      quizId: { in: quizIds },
      state: StandaloneQuizVersionState.active,
    },
    select: { id: true, quizId: true },
  });
  const activeVersionIds = activeVersions.map((version) => version.id);
  const activeQuizIds = activeVersions.map((version) => version.quizId);
  const participationVersions: Prisma.StandaloneQuizParticipationWhereInput[] =
    activeVersionIds.length
      ? [{ quizVersionId: { in: activeVersionIds } }]
      : [];
  // A NULL-version row is only a compatibility fallback for a quiz that has
  // no active immutable snapshot. Once a version is active, historical legacy
  // progress must not shadow the current version's empty/new participation.
  participationVersions.push({
    quizVersionId: null,
    ...(activeQuizIds.length ? { quizId: { notIn: activeQuizIds } } : {}),
  });
  return prisma.standaloneQuizParticipation.findMany({
    // Catalogue progress is scoped to the version currently available to the
    // student. Historical participations remain queryable for results, but an
    // exhausted old version must not make a newly activated version appear
    // completed.
    where: {
      quizId: { in: quizIds },
      studentId,
      OR: participationVersions,
    },
    orderBy: { createdAt: "desc" },
    select: {
      attempts: {
        orderBy: { attemptNo: "desc" },
        select: {
          attemptNo: true,
          createdAt: true,
          id: true,
          status: true,
          submittedAt: true,
          updatedAt: true,
        },
      },
      policySnapshot: true,
      quizId: true,
      quizVersionId: true,
    },
  });
}
async function getAvailableStandaloneQuizCatalogue(now = new Date()) {
  const quizzes = await findManyStandaloneQuizzesForRuntime(
    prisma,
    studentAvailabilityWhere(now),
    { updatedAt: "desc" },
  );
  return quizzes.filter((quiz) => quiz.items.length > 0);
}

export {
  acceptStandaloneQuizQuestionUpdate,
  attachStandaloneQuizAssembly,
  detachStandaloneQuizAssembly,
  getAvailableStandaloneQuiz,
  getAvailableStandaloneQuizCatalogue,
  getMentorStandaloneQuiz,
  getMentorStandaloneQuizResults,
  getMentorStandaloneQuizSubmission,
  getMentorStandaloneQuizzes,
  getStandaloneQuizAttempt,
  getStandaloneQuizAttemptId,
  getStandaloneQuizAttemptStatuses,
  getStandaloneQuizResult,
  getStandaloneQuizSubjects,
  getSubjectMetadata,
  getSubjectMetadataBySlug,
  importStandaloneQuizBankQuestions,
  importStandaloneQuizBankQuestionSnapshots,
  isReviewableStandaloneQuizAttemptStatus,
  isTerminalStandaloneQuizAttemptStatus,
  saveStandaloneQuiz,
  saveStandaloneQuizAnswer,
  setStandaloneQuizHidden,
  startStandaloneQuiz,
  studentAvailabilityWhere,
  submitStandaloneQuiz,
  terminalStandaloneQuizAttemptStatuses,
  transitionStandaloneQuizSourceMode,
  updateStandaloneQuizLifecycle,
  QuizAttemptValidationError,
  QuizValidationError,
};
export type {
  AcceptStandaloneQuizQuestionUpdateInput,
  ImportStandaloneQuizBankQuestionSnapshotsInput,
  SaveStandaloneQuizInput,
  StandaloneQuizAssemblySummary,
  TransitionStandaloneQuizSourceModeInput,
};
