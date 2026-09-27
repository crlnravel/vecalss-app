import "server-only";

import { randomUUID } from "node:crypto";

import {
  ContentStatus,
  DifficultyLevel,
  MediaAssetState,
  MediaLibraryScope,
  Prisma,
  QuestionBankPurpose,
  QuestionRevisionStatus,
  QuestionType,
  TryoutDeliverySessionStatus,
  TryoutTestType,
} from "@/generated/prisma/client";
import {
  ManagedImageAssetConflictError,
  ManagedImageAssetValidationError,
  lockAndValidateKaptenBankImages,
} from "@/lib/question-bank/media-validator";
import { validateAnswerKey, type QuestionAnswerMode } from "@/lib/question-bank/answer-contract";
import { prisma } from "@/lib/prisma";
import {
  assertAuthoringEditLease,
  type AuthoringEditLease,
} from "@/lib/serialization/authoring-lease";
import { LOCK_LEVEL, lockOrderedRows } from "@/lib/serialization/locks";
import {
  acquireTryoutIdentityMutex,
  assertTryoutIdentityStable,
  lockTryoutAggregate,
  prepareTryoutTransaction,
} from "@/lib/tryout/locks";

const SUBJECT_CODES = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"] as const;
type SubjectCode = (typeof SUBJECT_CODES)[number];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ExpectedReadyRevision = {
  contentDigest: string;
  questionId: string;
  revisionId: string;
};

type ImportTryoutBankQuestionSnapshotsInput = {
  allInBank?: boolean;
  bankId: string;
  editLease?: AuthoringEditLease;
  expectedSourceRevisions?: readonly ExpectedReadyRevision[];
  questionIds?: readonly string[];
  sectionSubjectCode: SubjectCode;
  tryoutId?: string;
};

type TryoutQuestionSnapshotOption = {
  assetId: string | null;
  choiceKey: string;
  content: string;
  isCorrect: boolean;
  snapshotOptionId: string;
  sortOrder: number;
};

type TryoutQuestionSnapshot = {
  difficulty: DifficultyLevel;
  explanation: string | null;
  explanationAssetId: string | null;
  options: TryoutQuestionSnapshotOption[];
  prompt: string;
  promptAssetId: string | null;
  questionType: "single_choice" | "multiple_choice";
  snapshotId: string;
};

type ImportTryoutBankQuestionSnapshotsResult = {
  importedCount: number;
  snapshots: TryoutQuestionSnapshot[];
};

class TryoutQuestionImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TryoutQuestionImportError";
  }
}

const sourceQuestionInclude = {
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
  questionBank: { select: { id: true, purpose: true, status: true } },
  subtest: { select: { code: true } },
} satisfies Prisma.QuestionInclude;

type SourceQuestion = Prisma.QuestionGetPayload<{
  include: typeof sourceQuestionInclude;
}>;

type ParsedSelection =
  | { allInBank: true; expectedByQuestionId: null; questionIds: null }
  | {
      allInBank: false;
      expectedByQuestionId: Map<string, ExpectedReadyRevision>;
      questionIds: string[];
    };

function answerModeForQuestionType(value: QuestionType | string | null | undefined): QuestionAnswerMode | null {
  if (value === QuestionType.single_choice || value === "single_choice") return "single_choice";
  if (value === QuestionType.multiple_choice || value === "multiple_choice") return "multiple_choice";
  return null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function parseSelection(
  input: ImportTryoutBankQuestionSnapshotsInput,
): ParsedSelection {
  if (input.allInBank === true) {
    if (input.questionIds !== undefined || input.expectedSourceRevisions !== undefined) {
      throw new TryoutQuestionImportError("Permintaan impor soal tidak valid.");
    }
    return { allInBank: true, expectedByQuestionId: null, questionIds: null };
  }

  if (input.allInBank !== undefined && input.allInBank !== false) {
    throw new TryoutQuestionImportError("Permintaan impor soal tidak valid.");
  }
  if (
    !Array.isArray(input.questionIds) ||
    input.questionIds.length === 0 ||
    input.questionIds.some((questionId) => !isUuid(questionId)) ||
    new Set(input.questionIds).size !== input.questionIds.length ||
    !Array.isArray(input.expectedSourceRevisions)
  ) {
    throw new TryoutQuestionImportError("Pilih soal yang akan ditambahkan.");
  }

  const questionIds = [...input.questionIds];
  const expectedByQuestionId = new Map<string, ExpectedReadyRevision>();
  for (const expected of input.expectedSourceRevisions) {
    if (
      !expected ||
      typeof expected !== "object" ||
      !isUuid(expected.questionId) ||
      !isUuid(expected.revisionId) ||
      typeof expected.contentDigest !== "string" ||
      !expected.contentDigest.trim() ||
      expectedByQuestionId.has(expected.questionId)
    ) {
      throw new TryoutQuestionImportError(
        "Daftar soal sudah berubah. Muat ulang daftar soal, lalu pilih lagi.",
      );
    }
    expectedByQuestionId.set(expected.questionId, expected);
  }

  if (
    expectedByQuestionId.size !== questionIds.length ||
    questionIds.some((questionId) => !expectedByQuestionId.has(questionId))
  ) {
    throw new TryoutQuestionImportError(
      "Daftar soal yang dipilih belum lengkap. Muat ulang daftar soal, lalu pilih lagi.",
    );
  }

  return { allInBank: false, expectedByQuestionId, questionIds };
}

function assetIsAvailable(
  assetId: string | null,
  asset: {
    id: string;
    libraryScope: MediaLibraryScope;
    state: MediaAssetState;
    trashedAt: Date | null;
  } | null,
) {
  if (!assetId) return asset === null;
  return Boolean(
    asset &&
      asset.id === assetId &&
      asset.libraryScope === MediaLibraryScope.kapten &&
      asset.state === MediaAssetState.ready &&
      asset.trashedAt === null,
  );
}

function isEligibleTryoutSource(
  source: SourceQuestion,
  bankId: string,
  subjectCode: SubjectCode,
): boolean {
  const revision = source.currentRevision;
  if (
    source.questionBankId !== bankId ||
    source.questionBank?.id !== bankId ||
    source.questionBank?.purpose !== QuestionBankPurpose.tryout ||
    source.questionBank?.status === ContentStatus.archived ||
    source.status !== ContentStatus.published ||
    source.subtest?.code !== subjectCode ||
    !revision ||
    revision.status !== QuestionRevisionStatus.ready ||
    !revision.contentDigest.trim() ||
    !revision.stem.trim() ||
    revision.options.length < 2 ||
    revision.options.length > 5 ||
    !assetIsAvailable(revision.promptAssetId, revision.promptAsset) ||
    !assetIsAvailable(revision.explanationAssetId, revision.explanationAsset) ||
    revision.options.some(
      (option) =>
        !option.content.trim() ||
        !assetIsAvailable(option.assetId, option.asset),
    )
  ) {
    return false;
  }

  const answerMode = answerModeForQuestionType(revision.questionType);
  return Boolean(
    answerMode &&
      validateAnswerKey(
        answerMode,
        revision.options.map((option) => ({ id: option.id, isCorrect: option.isCorrect })),
      ).ok,
  );
}

function sourceMediaAssetIds(sources: readonly SourceQuestion[]) {
  return sources.flatMap((source) => {
    const revision = source.currentRevision;
    if (!revision) return [];
    return [
      revision.promptAssetId,
      revision.explanationAssetId,
      ...revision.options.map((option) => option.assetId),
    ];
  });
}

function detachedTryoutQuestionSnapshot(source: SourceQuestion): TryoutQuestionSnapshot {
  const revision = source.currentRevision;
  if (!revision) {
    throw new TryoutQuestionImportError(
      "Soal Bank Soal tidak lagi tersedia. Muat ulang daftar soal, lalu pilih lagi.",
    );
  }
  const questionType = answerModeForQuestionType(revision.questionType);
  if (!questionType) {
    throw new TryoutQuestionImportError("Jenis soal ini belum dapat ditambahkan ke Tryout.");
  }

  return {
    difficulty: revision.difficulty,
    explanation: revision.explanation,
    explanationAssetId: revision.explanationAssetId,
    options: revision.options.map((option, index) => ({
      assetId: option.assetId,
      choiceKey: option.label || String.fromCharCode(65 + index),
      content: option.content,
      isCorrect: option.isCorrect,
      snapshotOptionId: randomUUID(),
      sortOrder: index,
    })),
    prompt: revision.stem,
    promptAssetId: revision.promptAssetId,
    questionType,
    snapshotId: randomUUID(),
  };
}

async function lockQuestionBankForSnapshot(
  tx: Prisma.TransactionClient,
  bankId: string,
) {
  await lockOrderedRows(tx, LOCK_LEVEL.child, [`bank:${bankId}`], async (client, key) => {
    const id = key.slice("bank:".length);
    await client.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM question_banks WHERE id = ${id}::uuid FOR SHARE
    `;
  });
}

async function lockQuestionSnapshotRows(
  tx: Prisma.TransactionClient,
  questionIds: readonly string[],
  currentRevisionIds: readonly (string | null)[],
) {
  const keys = [
    ...questionIds.map((id) => `question:${id}`),
    ...currentRevisionIds.flatMap((id) => id ? [`revision:${id}`] : []),
  ];
  await lockOrderedRows(tx, LOCK_LEVEL.child, keys, async (client, key) => {
    const separator = key.indexOf(":");
    const kind = key.slice(0, separator);
    const id = key.slice(separator + 1);
    if (kind === "question") {
      await client.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM questions WHERE id = ${id}::uuid FOR SHARE
      `;
      return;
    }
    if (kind === "revision") {
      await client.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM question_revisions WHERE id = ${id}::uuid FOR SHARE
      `;
      return;
    }
    throw new Error("Unexpected question snapshot lock key.");
  });
}

async function validateSavedTryoutTarget(
  tx: Prisma.TransactionClient,
  input: ImportTryoutBankQuestionSnapshotsInput,
  actorId: string,
) {
  const tryoutId = input.tryoutId;
  if (!tryoutId) return;

  const identity = await acquireTryoutIdentityMutex(tx, { id: tryoutId, kind: "tryout" });
  if (!identity) {
    throw new TryoutQuestionImportError("Tryout tidak ditemukan atau tidak dapat diakses.");
  }
  await assertAuthoringEditLease(
    tx,
    { resourceId: tryoutId, resourceType: "tryout" },
    actorId,
    input.editLease,
  );
  await lockTryoutAggregate(tx, identity.tryoutId);
  await assertTryoutIdentityStable(tx, { id: tryoutId, kind: "tryout" }, identity.tryoutId);

  const tryout = await tx.tryoutPackage.findFirst({
    where: { createdByUserId: actorId, id: tryoutId },
    select: {
      attempts: { select: { id: true }, take: 1 },
      sections: {
        select: {
          items: { select: { packageVersionId: true } },
          packageVersionId: true,
        },
      },
      status: true,
    },
  });
  if (!tryout) {
    throw new TryoutQuestionImportError("Tryout tidak ditemukan atau tidak dapat diakses.");
  }
  if (tryout.status !== ContentStatus.draft) {
    throw new TryoutQuestionImportError("Tryout yang sudah terbit atau diarsipkan tidak dapat menerima soal baru.");
  }
  if (tryout.attempts.length) {
    throw new TryoutQuestionImportError("Tryout yang sudah dimulai peserta tidak dapat diubah.");
  }
  if (
    tryout.sections.some(
      (section) =>
        section.packageVersionId !== null ||
        section.items.some((item) => item.packageVersionId !== null),
    )
  ) {
    throw new TryoutQuestionImportError(
      "Tryout yang terikat ke Paket Soal tidak dapat menerima impor soal langsung.",
    );
  }

  const activeReleaseSession = await tx.tryoutDeliverySession.findFirst({
    where: {
      assessmentReleaseId: { not: null },
      status: TryoutDeliverySessionStatus.active,
      tryoutId,
    },
    select: { id: true },
  });
  if (activeReleaseSession) {
    throw new TryoutQuestionImportError(
      "Tryout memiliki sesi aktif yang sudah memakai materi terbit. Tutup atau arsipkan sesi sebelum mengubah bagian ini.",
    );
  }

  const section = await tx.tryoutSection.findFirst({
    where: { subtest: { code: input.sectionSubjectCode }, tryoutId },
    select: {
      id: true,
      items: { select: { packageVersionId: true } },
      packageVersionId: true,
      testType: true,
    },
  });
  if (
    !section ||
    section.testType !== TryoutTestType.cbt ||
    section.packageVersionId !== null ||
    section.items.some((item) => item.packageVersionId !== null)
  ) {
    throw new TryoutQuestionImportError(
      "Bagian Tryout ini tidak memakai soal langsung dan tidak dapat menerima impor.",
    );
  }
}

async function importTryoutBankQuestionSnapshots(
  input: ImportTryoutBankQuestionSnapshotsInput,
  actorId: string,
): Promise<ImportTryoutBankQuestionSnapshotsResult> {
  if (
    !input ||
    typeof input !== "object" ||
    !isUuid(input.bankId) ||
    !SUBJECT_CODES.includes(input.sectionSubjectCode) ||
    (input.tryoutId !== undefined && !isUuid(input.tryoutId)) ||
    (input.tryoutId === undefined && input.editLease !== undefined)
  ) {
    throw new TryoutQuestionImportError("Permintaan impor soal tidak valid.");
  }

  const selection = parseSelection(input);
  return prisma.$transaction(
    async (tx) => {
      await prepareTryoutTransaction(tx);
      await validateSavedTryoutTarget(tx, input, actorId);

      await lockQuestionBankForSnapshot(tx, input.bankId);
      const bank = await tx.questionBank.findUnique({
        where: { id: input.bankId },
        select: { purpose: true, status: true },
      });
      if (
        !bank ||
        bank.purpose !== QuestionBankPurpose.tryout ||
        bank.status === ContentStatus.archived
      ) {
        throw new TryoutQuestionImportError(
          "Bank Soal Tryout tidak tersedia. Pilih Bank Soal yang masih aktif.",
        );
      }

      const identityRows = await tx.question.findMany({
        where: selection.allInBank
          ? { questionBankId: input.bankId }
          : { id: { in: selection.questionIds } },
        select: { currentRevisionId: true, id: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      await lockQuestionSnapshotRows(
        tx,
        identityRows.map((row) => row.id),
        identityRows.map((row) => row.currentRevisionId),
      );

      const sources = await tx.question.findMany({
        where: selection.allInBank
          ? { questionBankId: input.bankId }
          : { id: { in: selection.questionIds } },
        include: sourceQuestionInclude,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });

      if (!selection.allInBank) {
        const expectedByQuestionId = selection.expectedByQuestionId;
        const sourceById = new Map(sources.map((source) => [source.id, source]));
        const selectionIsCurrent =
          sources.length === selection.questionIds.length &&
          selection.questionIds.every((questionId) => {
            const source = sourceById.get(questionId);
            const revision = source?.currentRevision;
            const expected = expectedByQuestionId.get(questionId);
            return Boolean(
              source &&
                expected &&
                revision &&
                revision.id === expected.revisionId &&
                revision.contentDigest === expected.contentDigest &&
                revision.status === QuestionRevisionStatus.ready,
            );
          });
        if (!selectionIsCurrent) {
          throw new TryoutQuestionImportError(
            "Bank Soal berubah sejak soal dipilih. Muat ulang daftar soal, lalu pilih lagi.",
          );
        }
      }

      const eligibleSources = selection.allInBank
        ? sources.filter((source) =>
            isEligibleTryoutSource(source, input.bankId, input.sectionSubjectCode),
          )
        : sources;
      if (
        !selection.allInBank &&
        (eligibleSources.length !== selection.questionIds.length ||
          eligibleSources.some(
            (source) =>
              !isEligibleTryoutSource(source, input.bankId, input.sectionSubjectCode),
          ))
      ) {
        throw new TryoutQuestionImportError(
          "Sebagian soal tidak lagi siap atau tidak cocok dengan bagian Tryout ini. Muat ulang daftar soal, lalu pilih lagi.",
        );
      }

      try {
        await lockAndValidateKaptenBankImages(tx, {
          assetIds: sourceMediaAssetIds(eligibleSources),
        });
      } catch (error) {
        if (
          error instanceof ManagedImageAssetValidationError ||
          error instanceof ManagedImageAssetConflictError
        ) {
          throw new TryoutQuestionImportError(
            "Sebagian media soal tidak lagi tersedia. Ganti medianya atau muat ulang daftar soal, lalu coba lagi.",
          );
        }
        throw error;
      }

      const snapshots = eligibleSources.map(detachedTryoutQuestionSnapshot);
      return { importedCount: snapshots.length, snapshots };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
      maxWait: 5_000,
      timeout: 30_000,
    },
  );
}

export {
  importTryoutBankQuestionSnapshots,
  TryoutQuestionImportError,
};

export type {
  ImportTryoutBankQuestionSnapshotsInput,
  ImportTryoutBankQuestionSnapshotsResult,
  TryoutQuestionSnapshot,
  TryoutQuestionSnapshotOption,
};
