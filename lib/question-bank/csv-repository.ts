import "server-only";

import { randomUUID } from "node:crypto";

import {
  ContentStatus,
  DifficultyLevel,
  Prisma,
  QuestionRevisionProvenance,
  QuestionRevisionStatus,
  QuestionType,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  assertReadyKaptenImageAssets,
  ManagedImageAssetValidationError,
} from "@/lib/question-bank/media-validator";
import { isQuestionBankMateri, normalizeQuestionBankMateri } from "@/lib/question-bank/materi";
import { questionRevisionContentDigest } from "@/lib/question-bank/revision";
import {
  assertAuthoringEditLease,
  type AuthoringEditLease,
} from "@/lib/serialization/authoring-lease";
import { setTransactionLockTimeout } from "@/lib/serialization/locks";
import { isUuid } from "@/lib/resource-edit-lock/canonical";

import {
  QUESTION_BANK_CSV_MAX_ROWS,
  serializeQuestionBankCsv,
  type QuestionBankCsvOption,
  type QuestionBankCsvRow,
  type QuestionBankCsvSerializableRow,
} from "./csv";

type QuestionBankCsvImportMode = "append" | "overwrite";

type QuestionBankCsvMutationCode =
  | "archived_locked"
  | "duplicate_question_id"
  | "invalid_input"
  | "invalid_media_asset"
  | "question_id_not_in_bank"
  | "question_retired"
  | "resource_inaccessible"
  | "stale_revision";

class QuestionBankCsvMutationError extends Error {
  readonly details: Record<string, unknown>;

  constructor(
    readonly code: QuestionBankCsvMutationCode,
    message = "CSV Bank Soal tidak dapat diterapkan.",
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "QuestionBankCsvMutationError";
    this.details = details;
  }
}

type ApplyQuestionBankCsvInput = {
  actorId: string;
  bankId: string;
  editLease: AuthoringEditLease;
  expectedRevision: number;
  mode: QuestionBankCsvImportMode;
  rows: readonly QuestionBankCsvRow[];
  /** Test-only late failure hook. It is never accepted by an HTTP route. */
  failureAfterRow?: number;
  /** Test-only callback used to prove rollback after prior row writes. */
  onRowApplied?: (rowNumber: number) => void | Promise<void>;
};

type QuestionBankCsvApplyResult = {
  bankId: string;
  createdQuestionIds: string[];
  importedCount: number;
  mode: QuestionBankCsvImportMode;
  preservedQuestionIds: string[];
  retiredCount: number;
  revision: number;
};

type QuestionWithCsvRelations = Prisma.QuestionGetPayload<{
  include: {
    currentRevision: { include: { options: true } };
    options: true;
    subtest: { select: { code: true } };
  };
}>;

const questionCsvInclude = {
  currentRevision: { include: { options: true } },
  options: true,
  subtest: { select: { code: true } },
} satisfies Prisma.QuestionInclude;

function rowOptions(row: QuestionBankCsvRow): QuestionBankCsvOption[] {
  return row.options.map((option) => ({ ...option }));
}

function rowMediaAssetIds(row: QuestionBankCsvRow) {
  return [
    row.promptMediaAssetId,
    row.explanationMediaAssetId,
    ...row.options.map((option) => option.assetId),
  ];
}

function rowDigest(row: QuestionBankCsvRow) {
  return questionRevisionContentDigest({
    difficulty: row.difficulty,
    explanation: row.explanation,
    explanationAssetId: row.explanationMediaAssetId,
    materi: row.materi,
    options: rowOptions(row),
    prompt: row.prompt,
    promptAssetId: row.promptMediaAssetId,
    questionType: row.questionType,
  });
}

function questionData(row: QuestionBankCsvRow, actorId: string, subtestId: string) {
  return {
    difficulty: row.difficulty as DifficultyLevel,
    explanation: row.explanation,
    explanationAssetId: row.explanationMediaAssetId,
    materi: normalizeQuestionBankMateri(row.subjectCode, row.materi),
    promptAssetId: row.promptMediaAssetId,
    questionType: row.questionType as QuestionType,
    status: ContentStatus.published,
    stem: row.prompt,
    subtestId,
    topicId: null,
    updatedByUserId: actorId,
  };
}

function revisionOptionData(row: QuestionBankCsvRow) {
  return rowOptions(row).map((option) => ({
    assetId: option.assetId,
    content: option.content,
    isCorrect: option.isCorrect,
    label: option.label,
    sortOrder: option.sortOrder,
  }));
}

type NewCsvQuestion = {
  code: string;
  data: ReturnType<typeof questionData>;
  options: ReturnType<typeof revisionOptionData>;
  questionId: string;
  revisionId: string;
  row: QuestionBankCsvRow;
};

type ExistingCsvChange = {
  currentRevision: NonNullable<QuestionWithCsvRelations["currentRevision"]>;
  data: ReturnType<typeof questionData>;
  kind: "draft" | "ready";
  nextRevisionId: string | null;
  nextRevisionNo: number;
  options: ReturnType<typeof revisionOptionData>;
  question: QuestionWithCsvRelations;
  row: QuestionBankCsvRow;
};

async function insertNewCsvQuestions(
  tx: Prisma.TransactionClient,
  planned: readonly NewCsvQuestion[],
  actorId: string,
  bankId: string,
) {
  if (!planned.length) return;

  // The composite current-revision FK is deferred by the schema, so the
  // question, revision, and both option projections can be inserted in four
  // set-based statements. This keeps a 500-row create/append inside the
  // transaction ceiling without a network round-trip per CSV row.
  await tx.question.createMany({
    data: planned.map(({ code, data, questionId, revisionId }) => ({
      ...data,
      code,
      createdByUserId: actorId,
      currentRevisionId: revisionId,
      id: questionId,
      questionBankId: bankId,
    })),
  });
  await tx.questionRevision.createMany({
    data: planned.map(({ data, questionId, revisionId, row }) => ({
      contentDigest: rowDigest(row),
      createdByUserId: actorId,
      difficulty: data.difficulty,
      explanation: data.explanation,
      explanationAssetId: data.explanationAssetId,
      id: revisionId,
      materi: data.materi,
      promptAssetId: data.promptAssetId,
      provenance: QuestionRevisionProvenance.authored,
      questionId,
      questionType: data.questionType,
      revisionNo: 1,
      status: QuestionRevisionStatus.draft,
      stem: data.stem,
      updatedByUserId: actorId,
    })),
  });
  await tx.questionRevisionOption.createMany({
    data: planned.flatMap(({ options, revisionId }) => options.map((option) => ({ ...option, questionRevisionId: revisionId }))),
  });
  await tx.questionOption.createMany({
    data: planned.flatMap(({ options, questionId }) => options.map((option) => ({ ...option, questionId }))),
  });
}

async function insertReadyCsvRevisions(tx: Prisma.TransactionClient, changes: readonly ExistingCsvChange[], actorId: string) {
  const ready = changes.filter((change) => change.kind === "ready" && change.nextRevisionId);
  if (!ready.length) return;
  await tx.questionRevision.createMany({
    data: ready.map(({ data, nextRevisionId, nextRevisionNo, question, row }) => ({
      contentDigest: rowDigest(row),
      createdByUserId: actorId,
      difficulty: data.difficulty,
      explanation: data.explanation,
      explanationAssetId: data.explanationAssetId,
      id: nextRevisionId!,
      materi: data.materi,
      promptAssetId: data.promptAssetId,
      provenance: QuestionRevisionProvenance.authored,
      questionId: question.id,
      questionType: data.questionType,
      revisionNo: nextRevisionNo,
      status: QuestionRevisionStatus.draft,
      stem: data.stem,
      updatedByUserId: actorId,
    })),
  });
  await tx.questionRevisionOption.createMany({
    data: ready.flatMap(({ nextRevisionId, options }) => options.map((option) => ({ ...option, questionRevisionId: nextRevisionId! }))),
  });
}

async function updateDraftCsvRevisions(tx: Prisma.TransactionClient, changes: readonly ExistingCsvChange[], actorId: string) {
  const draft = changes.filter((change) => change.kind === "draft");
  if (!draft.length) return;
  const values = draft.map(({ currentRevision, data, row }) => Prisma.sql`(
    ${currentRevision.id}::uuid,
    ${rowDigest(row)},
    ${data.difficulty},
    ${data.explanation},
    ${data.explanationAssetId}::uuid,
    ${data.materi},
    ${data.promptAssetId}::uuid,
    ${data.questionType},
    ${data.stem},
    ${actorId}::uuid
  )`);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "question_revisions" AS revision
       SET "content_digest" = incoming.content_digest,
           "difficulty" = incoming.difficulty::"difficulty_level",
           "explanation" = incoming.explanation,
           "explanation_asset_id" = incoming.explanation_asset_id::uuid,
           "materi" = incoming.materi,
           "prompt_asset_id" = incoming.prompt_asset_id::uuid,
           "question_type" = incoming.question_type::"question_type",
           "stem" = incoming.stem,
           "updated_by_user_id" = incoming.updated_by_user_id::uuid,
           "updated_at" = CURRENT_TIMESTAMP
      FROM (VALUES ${Prisma.join(values, ",")}) AS incoming(
        id, content_digest, difficulty, explanation, explanation_asset_id,
        materi, prompt_asset_id, question_type, stem, updated_by_user_id
      )
     WHERE revision.id = incoming.id::uuid
  `);
  const revisionIds = draft.map(({ currentRevision }) => currentRevision.id);
  await tx.questionRevisionOption.deleteMany({ where: { questionRevisionId: { in: revisionIds } } });
  await tx.questionRevisionOption.createMany({
    data: draft.flatMap(({ currentRevision, options }) => options.map((option) => ({ ...option, questionRevisionId: currentRevision.id }))),
  });
}

async function updateCsvQuestions(tx: Prisma.TransactionClient, changes: readonly ExistingCsvChange[]) {
  if (!changes.length) return;
  const values = changes.map(({ data, nextRevisionId, nextRevisionNo, question }) => Prisma.sql`(
    ${question.id}::uuid,
    ${data.materi},
    ${data.promptAssetId}::uuid,
    ${data.questionType},
    ${data.difficulty},
    ${data.explanation},
    ${data.explanationAssetId}::uuid,
    ${data.stem},
    ${data.subtestId}::uuid,
    ${data.topicId}::uuid,
    ${data.status},
    ${data.updatedByUserId}::uuid,
    ${(nextRevisionId ?? question.currentRevisionId)}::uuid,
    ${nextRevisionNo}
  )`);
  await tx.$executeRaw(Prisma.sql`
    UPDATE "questions" AS question
       SET "materi" = incoming.materi,
           "prompt_asset_id" = incoming.prompt_asset_id::uuid,
           "question_type" = incoming.question_type::"question_type",
           "difficulty" = incoming.difficulty::"difficulty_level",
           "explanation" = incoming.explanation,
           "explanation_asset_id" = incoming.explanation_asset_id::uuid,
           "stem" = incoming.stem,
           "subtest_id" = incoming.subtest_id::uuid,
           "topic_id" = incoming.topic_id::uuid,
           "status" = incoming.status::"content_status",
           "updated_by_user_id" = incoming.updated_by_user_id::uuid,
           "current_revision_id" = incoming.current_revision_id::uuid,
           "revision" = incoming.revision::integer,
           "updated_at" = CURRENT_TIMESTAMP
      FROM (VALUES ${Prisma.join(values, ",")}) AS incoming(
        id, materi, prompt_asset_id, question_type, difficulty, explanation,
        explanation_asset_id, stem, subtest_id, topic_id, status,
        updated_by_user_id, current_revision_id, revision
      )
     WHERE question.id = incoming.id::uuid
  `);
}

async function updateCsvLegacyOptions(tx: Prisma.TransactionClient, changes: readonly ExistingCsvChange[]) {
  const updates: Prisma.Sql[] = [];
  const creates: Array<ReturnType<typeof revisionOptionData>[number] & { questionId: string }> = [];
  const extras: string[] = [];
  for (const { options, question } of changes) {
    const existing = [...question.options].sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
    const retained = new Set<string>();
    for (const [index, option] of options.entries()) {
      const old = existing[index];
      if (old) {
        retained.add(old.id);
        updates.push(Prisma.sql`(
          ${old.id}::uuid,
          ${option.label},
          ${option.content},
          ${option.isCorrect},
          ${option.sortOrder},
          ${option.assetId}::uuid
        )`);
      } else {
        creates.push({ ...option, questionId: question.id });
      }
    }
    extras.push(...existing.filter((option) => !retained.has(option.id)).map((option) => option.id));
  }
  if (updates.length) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "question_options" AS option
         SET "label" = incoming.label,
             "content" = incoming.content,
             "is_correct" = incoming.is_correct::boolean,
             "sort_order" = incoming.sort_order::integer,
             "asset_id" = incoming.asset_id::uuid
        FROM (VALUES ${Prisma.join(updates, ",")}) AS incoming(
          id, label, content, is_correct, sort_order, asset_id
        )
       WHERE option.id = incoming.id::uuid
    `);
  }
  if (creates.length) await tx.questionOption.createMany({ data: creates });
  if (extras.length) {
    await tx.questionOption.deleteMany({
      where: {
        id: { in: extras },
        reusablePackageVersionOptions: { none: {} },
        standaloneQuizItemOptions: { none: {} },
        tryoutItemOptions: { none: {} },
      },
    });
  }
}

function sameQuestionContent(question: QuestionWithCsvRelations, row: QuestionBankCsvRow) {
  const revision = question.currentRevision;
  return Boolean(
    revision
      && revision.contentDigest === rowDigest(row)
      && (question.subtest?.code ?? "") === row.subjectCode
      && (revision.materi ?? question.materi ?? null) === row.materi,
  );
}

async function lockBankQuestionTree(tx: Prisma.TransactionClient, bankId: string) {
  await tx.$queryRaw`SELECT id FROM "questions" WHERE "question_bank_id" = ${bankId}::uuid ORDER BY id ASC FOR UPDATE`;
  await tx.$queryRaw`SELECT revision.id FROM "question_revisions" revision JOIN "questions" question ON question.id = revision.question_id WHERE question.question_bank_id = ${bankId}::uuid ORDER BY revision.id ASC FOR UPDATE`;
  await tx.$queryRaw`SELECT option.id FROM "question_revision_options" option JOIN "question_revisions" revision ON revision.id = option.question_revision_id JOIN "questions" question ON question.id = revision.question_id WHERE question.question_bank_id = ${bankId}::uuid ORDER BY option.id ASC FOR UPDATE`;
  await tx.$queryRaw`SELECT option.id FROM "question_options" option JOIN "questions" question ON question.id = option.question_id WHERE question.question_bank_id = ${bankId}::uuid ORDER BY option.id ASC FOR UPDATE`;
}

function validateCsvRows(mode: QuestionBankCsvImportMode, rows: readonly QuestionBankCsvRow[]) {
  if (!rows.length || rows.length > QUESTION_BANK_CSV_MAX_ROWS) {
    throw new QuestionBankCsvMutationError("invalid_input", "CSV Bank Soal harus memiliki 1 sampai 500 baris.");
  }
  if (mode !== "append" && mode !== "overwrite") {
    throw new QuestionBankCsvMutationError("invalid_input");
  }
  if (mode === "overwrite") {
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row.questionId) continue;
      if (seen.has(row.questionId)) {
        throw new QuestionBankCsvMutationError("duplicate_question_id", "ID soal overwrite tidak boleh duplikat.");
      }
      seen.add(row.questionId);
    }
  }
  for (const row of rows) {
    if (!isQuestionBankMateri(row.subjectCode, row.materi)) {
      throw new QuestionBankCsvMutationError("invalid_input", "Materi soal tidak sesuai taxonomy.");
    }
    if (row.questionId && !isUuid(row.questionId)) {
      throw new QuestionBankCsvMutationError("invalid_input");
    }
  }
}

async function applyQuestionBankCsv(input: ApplyQuestionBankCsvInput): Promise<QuestionBankCsvApplyResult> {
  validateCsvRows(input.mode, input.rows);
  if (!isUuid(input.bankId) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
    throw new QuestionBankCsvMutationError("invalid_input");
  }

  return prisma.$transaction(async (tx) => {
    await setTransactionLockTimeout(tx);
    await assertAuthoringEditLease(
      tx,
      { resourceId: input.bankId, resourceType: "question_bank" },
      input.actorId,
      input.editLease,
    );
    await tx.$queryRaw`SELECT id FROM "question_banks" WHERE id = ${input.bankId}::uuid FOR UPDATE`;
    const bank = await tx.questionBank.findUnique({
      where: { id: input.bankId },
      select: { code: true, id: true, revision: true, status: true },
    });
    if (!bank) throw new QuestionBankCsvMutationError("resource_inaccessible");
    if (bank.revision !== input.expectedRevision) {
      throw new QuestionBankCsvMutationError("stale_revision", "Bank Soal telah diperbarui. Muat ulang halaman lalu coba lagi.");
    }
    if (bank.status === ContentStatus.archived) {
      throw new QuestionBankCsvMutationError("archived_locked", "Bank Soal yang diarsipkan tidak dapat diubah.");
    }

    await lockBankQuestionTree(tx, bank.id);
    const subjectCodes = [...new Set(input.rows.map((row) => row.subjectCode))];
    const subtests = await tx.subtest.findMany({ where: { code: { in: subjectCodes } }, select: { code: true, id: true } });
    const subtestByCode = new Map(subtests.map((subtest) => [subtest.code, subtest.id]));
    for (const code of subjectCodes) {
      if (!subtestByCode.has(code)) throw new QuestionBankCsvMutationError("invalid_input");
    }

    const existing = await tx.question.findMany({
      where: { questionBankId: bank.id },
      include: questionCsvInclude,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const existingById = new Map(existing.map((question) => [question.id, question]));
    if (input.mode === "overwrite") {
      for (const row of input.rows) {
        if (!row.questionId) continue;
        const question = existingById.get(row.questionId);
        if (!question) throw new QuestionBankCsvMutationError("question_id_not_in_bank", "ID soal tidak termasuk Bank Soal ini.");
        if (question.status === ContentStatus.archived || question.currentRevision?.status === QuestionRevisionStatus.retired) {
          throw new QuestionBankCsvMutationError("question_retired", "Soal yang sudah retired tidak dapat diaktifkan kembali.");
        }
      }
    }

    try {
      await assertReadyKaptenImageAssets(tx, input.rows.flatMap(rowMediaAssetIds));
    } catch (error) {
      if (error instanceof ManagedImageAssetValidationError) {
        throw new QuestionBankCsvMutationError("invalid_media_asset");
      }
      throw error;
    }

    const retainedIds = new Set<string>(input.mode === "append" ? existing.map((question) => question.id) : []);
    const createdQuestionIds: string[] = [];
    const preservedQuestionIds: string[] = [];
    const newQuestions: NewCsvQuestion[] = [];
    const existingChanges: ExistingCsvChange[] = [];
    for (const [rowIndex, row] of input.rows.entries()) {
      const existingQuestion = input.mode === "overwrite" && row.questionId
        ? existingById.get(row.questionId)
        : undefined;
      if (!existingQuestion) {
        const questionId = randomUUID();
        const revisionId = randomUUID();
        newQuestions.push({
          code: `${bank.code}-csv-${rowIndex + 1}-${questionId.slice(0, 8)}`.slice(0, 120),
          data: questionData(row, input.actorId, subtestByCode.get(row.subjectCode)!),
          options: revisionOptionData(row),
          questionId,
          revisionId,
          row,
        });
        createdQuestionIds.push(questionId);
        retainedIds.add(questionId);
      } else {
        retainedIds.add(existingQuestion.id);
        preservedQuestionIds.push(existingQuestion.id);
        if (!sameQuestionContent(existingQuestion, row)) {
          const data = questionData(row, input.actorId, subtestByCode.get(row.subjectCode)!);
          const options = revisionOptionData(row);
          const currentRevision = existingQuestion.currentRevision;
          if (!currentRevision) throw new QuestionBankCsvMutationError("invalid_input");
          const isReady = currentRevision.status === QuestionRevisionStatus.ready;
          existingChanges.push({
            currentRevision,
            data,
            kind: isReady ? "ready" : "draft",
            nextRevisionId: isReady ? randomUUID() : null,
            nextRevisionNo: isReady ? currentRevision.revisionNo + 1 : existingQuestion.revision,
            options,
            question: existingQuestion,
            row,
          });
        }
      }
    }

    await insertNewCsvQuestions(tx, newQuestions, input.actorId, bank.id);
    await insertReadyCsvRevisions(tx, existingChanges, input.actorId);
    await updateDraftCsvRevisions(tx, existingChanges, input.actorId);
    await updateCsvQuestions(tx, existingChanges);
    await updateCsvLegacyOptions(tx, existingChanges);

    for (const [rowIndex] of input.rows.entries()) {
      if (input.failureAfterRow === rowIndex + 1) {
        throw new Error("Injected late CSV failure.");
      }
      if (input.onRowApplied) await input.onRowApplied(rowIndex + 1);
    }

    const omitted = input.mode === "overwrite"
      ? existing.filter((question) => !retainedIds.has(question.id) && question.status !== ContentStatus.archived && question.currentRevision?.status !== QuestionRevisionStatus.retired)
      : [];
    const now = new Date();
    if (omitted.length) {
      await tx.questionRevision.updateMany({
        where: { id: { in: omitted.flatMap((question) => question.currentRevision ? [question.currentRevision.id] : []) } },
        data: { retiredAt: now, status: QuestionRevisionStatus.retired, updatedByUserId: input.actorId },
      });
      await tx.question.updateMany({ where: { id: { in: omitted.map((question) => question.id) } }, data: { status: ContentStatus.archived, updatedByUserId: input.actorId } });
    }
    const revision = bank.revision + 1;
    await tx.questionBank.update({ where: { id: bank.id }, data: { revision, updatedByUserId: input.actorId } });
    return {
      bankId: bank.id,
      createdQuestionIds,
      importedCount: input.rows.length,
      mode: input.mode,
      preservedQuestionIds,
      retiredCount: omitted.length,
      revision,
    } satisfies QuestionBankCsvApplyResult;
  }, { maxWait: 5_000, timeout: 30_000 });
}

function appendQuestionBankCsv(input: Omit<ApplyQuestionBankCsvInput, "mode">) {
  return applyQuestionBankCsv({ ...input, mode: "append" });
}

function overwriteQuestionBankCsv(input: Omit<ApplyQuestionBankCsvInput, "mode">) {
  return applyQuestionBankCsv({ ...input, mode: "overwrite" });
}

function safeQuestionBankCsvFilename(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80)
    || "bank-soal";
  return `${slug}-bank-soal-v1.csv`;
}

async function exportQuestionBankCsv(actorId: string, bankId: string) {
  if (!isUuid(bankId)) return null;
  const bank = await prisma.questionBank.findFirst({
    where: { createdByUserId: actorId, id: bankId },
    select: {
      id: true,
      name: true,
      status: true,
      questions: {
        where: { currentRevision: { status: { not: QuestionRevisionStatus.retired } } },
        include: {
          currentRevision: { include: { options: true } },
          subtest: { select: { code: true } },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!bank) return null;
  const rows: QuestionBankCsvSerializableRow[] = bank.questions
    .filter((question) => question.status !== ContentStatus.archived)
    .flatMap((question) => {
      const revision = question.currentRevision;
      if (!revision || !question.subtest?.code) return [];
      return [{
        correctOptions: revision.options.filter((option) => option.isCorrect).sort((left, right) => left.sortOrder - right.sortOrder).map((option) => option.label),
        difficulty: revision.difficulty,
        explanation: revision.explanation,
        explanationMediaAssetId: revision.explanationAssetId,
        materi: revision.materi,
        options: revision.options.map((option) => ({
          assetId: option.assetId,
          content: option.content,
          isCorrect: option.isCorrect,
          label: option.label as QuestionBankCsvOption["label"],
          sortOrder: option.sortOrder,
        })),
        prompt: revision.stem,
        promptMediaAssetId: revision.promptAssetId,
        questionId: question.id,
        questionType: revision.questionType,
        subjectCode: question.subtest.code,
      } satisfies QuestionBankCsvSerializableRow];
    });
  return {
    bytes: new TextEncoder().encode(serializeQuestionBankCsv(rows)),
    filename: safeQuestionBankCsvFilename(bank.name),
    rowCount: rows.length,
  };
}

export {
  QuestionBankCsvMutationError,
  applyQuestionBankCsv,
  appendQuestionBankCsv,
  exportQuestionBankCsv,
  overwriteQuestionBankCsv,
  safeQuestionBankCsvFilename,
};

export type {
  ApplyQuestionBankCsvInput,
  QuestionBankCsvApplyResult,
  QuestionBankCsvImportMode,
  QuestionBankCsvMutationCode,
};
