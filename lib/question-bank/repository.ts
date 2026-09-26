import "server-only";

import { randomUUID } from "node:crypto";
import {
  ContentStatus,
  DifficultyLevel,
  Prisma,
  QuestionBankPurpose,
  QuestionRevisionProvenance,
  QuestionRevisionStatus,
  QuestionType,
} from "@/generated/prisma/client";

import { prisma } from "@/lib/prisma";
import {
  acquireDomainMutex,
  bankOrganizationFoldersMutexKey,
  setTransactionLockTimeout,
} from "@/lib/serialization/locks";
import { questionRevisionContentDigest } from "@/lib/question-bank/revision";
import {
  lockAndValidateKaptenBankImages,
  ManagedImageAssetConflictError,
  ManagedImageAssetValidationError,
} from "@/lib/question-bank/media-validator";
import {
  assertAuthoringEditLease,
  type AuthoringEditLease,
} from "@/lib/serialization/authoring-lease";
import {
  isQuestionBankMateri,
  normalizeQuestionBankMateri,
} from "@/lib/question-bank/materi";
import { validateAnswerKey, type QuestionAnswerMode } from "@/lib/question-bank/answer-contract";
import {
  adoptQuestionBankMediaFolderReservation,
  assertQuestionBankMediaFolderReservationForBank,
  cleanupFailedManualQuestionBankMediaFolder,
  createQuestionBankMediaFolder,
  ensureQuestionBankMediaFolder,
  finalizeQuestionBankMediaFolderReservation,
  getAdoptedQuestionBankMediaFolderReservation,
  lockQuestionBankMediaFolderForSave,
  reserveDraftQuestionBankMediaFolder,
  type MediaFolderIdentity,
  type NewKaptenRootFolderIdentity,
} from "./media-folder";
import {
  getQuestionBankReadinessFromRevisions,
  getQuestionReadinessFromRevision,
  type QuestionBankReadiness,
  type QuestionRevisionReadinessInput,
} from "@/lib/question-bank/readiness";

import {
  assignQuestionBankCategories,
  buildQuestionBankFolderTree,
  createQuestionBankCategory,
  createQuestionBankFolder,
  folderPathFromRows,
  getQuestionBankFolderPath,
  listQuestionBankCategories,
  listQuestionBankFolderTree,
  listQuestionBankFolders,
  moveQuestionBankFolder,
  moveQuestionBanksToFolder,
  QuestionBankError,
  QuestionBankOrganizationError,
  removeQuestionBankCategory,
  removeQuestionBankCategoryAssignment,
  removeQuestionBankFolder,
  renameQuestionBankCategory,
  renameQuestionBankFolder,
  setQuestionBankCategories,
  type QuestionBankErrorCode,
} from "./organization";
import { assertQuestionBankPurpose, isQuestionBankPurpose, questionBankPurposeLabel } from "./purpose";

const SUBJECT_CODES = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"] as const;
const TEMPORARY_QUESTION_ID_PATTERN = /^(?:pu|ppu|pbm|pk|lbi|lbe|pm)-question-\d+$/i;
const QUESTION_BANK_FOLDER_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type BankChoiceInput = { id: string; mediaAssetId?: string; text: string };
type BankQuestionInput = {
  choices: BankChoiceInput[];
  correctChoiceId: string;
  correctChoiceIds?: string[];
  difficulty: "easy" | "medium" | "hard";
  explanation: string;
  explanationMediaAssetId?: string;
  id?: string;
  materi?: string;
  prompt: string;
  promptMediaAssetId?: string;
  questionType?: QuestionAnswerMode;
  subjectCode: string;
};
type SaveBankInput = {
  description: string;
  editLease?: AuthoringEditLease;
  folderId?: string | null;
  id?: string;
  mediaFolderReservationId?: string;
  purpose: QuestionBankPurpose;
  questions: BankQuestionInput[];
  revision?: number;
  title: string;
};

type QuestionBankFolderPath = Array<{ id: string | null; name: string }>;
type QuestionBankOrganization = {
  categories: Array<{ id: string; name: string }>;
  folder: { id: string; name: string } | null;
  folderId: string | null;
  folderPath: QuestionBankFolderPath;
};
type QuestionBankDiscovery = {
  materiCoverage: string[];
  subjectCoverage: string[];
};
type BankQuestionDto = {
  bankId: string;
  choices: Array<{ id: string; mediaAssetId?: string; text: string }>;
  correctChoiceId: string;
  correctChoiceIds: string[];
  difficulty: "easy" | "medium" | "hard";
  explanation: string;
  explanationMediaAssetId?: string;
  id: string;
  materi?: string;
  prompt: string;
  promptMediaAssetId?: string;
  questionContentDigest?: string;
  questionRevisionId?: string;
  questionRevisionNo?: number;
  questionRevisionProvenance?: QuestionRevisionProvenance;
  questionRevisionStatus?: QuestionRevisionStatus;
  questionType: "single_choice" | "multiple_choice";
  subjectCode: string;
  status: ContentStatus;
  tags: string[];
};
type QuestionBankDto = QuestionBankOrganization & QuestionBankDiscovery & {
  categoryIds: string[];
  description: string;
  difficultyMix: string;
  href: string;
  id: string;
  primaryMetric: string;
  progress: number;
  purpose: QuestionBankPurpose;
  questionCount: number;
  resourceType: "question-bank";
  reusableIn: string[];
  revision: number;
  status: ContentStatus;
  title: string;
  updatedAt: string;
};
type QuestionBankEditDto = { bank: QuestionBankDto; questions: BankQuestionDto[]; readiness: QuestionBankReadiness };
type QuestionBankEntry = QuestionBankEditDto;
type QuestionBankCatalogEntry = { bank: QuestionBankDto };
type QuestionBankSourceEntry = { bank: QuestionBankDto };

type QuestionBankSort = "updated" | "name" | "questions";

type ListQuestionBanksOptions = {
  categoryId?: string;
  categoryIds?: string[];
  folderId?: string | null;
  purpose?: QuestionBankPurpose;
  search?: string;
  sort?: QuestionBankSort;
  status?: ContentStatus;
  subjectCoverage?: string[];
};

type ListQuestionBankSourceOptions = Omit<ListQuestionBanksOptions, "purpose"> & {
  purpose: QuestionBankPurpose;
};

type QuestionBankListPage = {
  items: QuestionBankCatalogEntry[];
  page: number;
  pageSize: number;
  total: number;
};

type QuestionBankSourceQuestionPage = {
  bank: QuestionBankDto;
  page: number;
  pageSize: number;
  questions: BankQuestionDto[];
  total: number;
};

function isTemporaryQuestionId(id: string | undefined) {
  return Boolean(id && TEMPORARY_QUESTION_ID_PATTERN.test(id));
}

type QuestionBankSourcePage = {
  items: QuestionBankSourceEntry[];
  page: number;
  pageSize: number;
  total: number;
};

const bankInclude = {
  categories: { include: { category: { select: { id: true, name: true } } } },
  folder: { select: { id: true, name: true } },
  questions: {
    include: {
      currentRevision: {
        include: {
          explanationAsset: true,
          options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } },
          promptAsset: true,
        },
      },
      explanationAsset: true,
      options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } },
      promptAsset: true,
      subtest: { select: { code: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.QuestionBankInclude;

const bankCatalogInclude = {
  categories: { include: { category: { select: { id: true, name: true } } } },
  folder: { select: { id: true, name: true } },
} satisfies Prisma.QuestionBankInclude;

const sourceQuestionInclude = {
  currentRevision: {
    include: {
      explanationAsset: true,
      options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } },
      promptAsset: true,
    },
  },
  explanationAsset: true,
  options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } },
  promptAsset: true,
  subtest: { select: { code: true } },
} satisfies Prisma.QuestionInclude;

type BankQuestionRecord = Prisma.QuestionBankGetPayload<{ include: typeof bankInclude }>["questions"][number];
type BankCatalogRecord = Prisma.QuestionBankGetPayload<{ include: typeof bankCatalogInclude }>;
type SourceQuestionRecord = Prisma.QuestionGetPayload<{ include: typeof sourceQuestionInclude }>;
type QuestionRevisionRecord = NonNullable<BankQuestionRecord["currentRevision"]>;

type FolderRow = {
  id: string;
  name: string;
  parentId: string | null;
  purpose: QuestionBankPurpose;
  updatedAt: Date;
};

function toBankDifficulty(value: DifficultyLevel): "easy" | "medium" | "hard" {
  if (value === DifficultyLevel.easy) return "easy";
  if (value === DifficultyLevel.hard) return "hard";
  return "medium";
}

function isReadyAsset(asset: { state: string } | null) { return !asset || asset.state === "ready"; }

type RevisionReadinessRecord = Pick<QuestionRevisionRecord, "status" | "stem" | "options" | "promptAsset" | "explanationAsset" | "questionType">;

function isValidRevision(revision: Pick<RevisionReadinessRecord, "stem" | "options" | "promptAsset" | "explanationAsset" | "questionType"> | null) {
  const answerMode = revision?.questionType === QuestionType.multiple_choice ? "multiple_choice" : "single_choice";
  const answerKey = revision ? validateAnswerKey(answerMode, revision.options.map((option) => ({ id: option.id, isCorrect: option.isCorrect }))) : null;
  return Boolean(revision
    && revision.stem.trim()
    && revision.options.length >= 2
    && revision.options.length <= 5
    && answerKey?.ok
    && revision.options.every((option) => option.content.trim() && isReadyAsset(option.asset))
    && isReadyAsset(revision.promptAsset)
    && isReadyAsset(revision.explanationAsset));
}

function isReadyRevision(revision: RevisionReadinessRecord | null) {
  return Boolean(revision?.status === QuestionRevisionStatus.ready && isValidRevision(revision));
}

type BankMetrics = {
  materiCoverage: string[];
  questionCount: number;
  readyCount: number;
  subjectCoverage: string[];
};

function toBankQuestionDto(question: Pick<BankQuestionRecord, "id" | "status" | "stem" | "difficulty" | "explanation" | "explanationAssetId" | "promptAssetId" | "questionType" | "options" | "subtest" | "materi" | "currentRevision">, bankId: string): BankQuestionDto {
  const revision = question.currentRevision;
  const options = revision?.options ?? question.options;
  const stem = revision?.stem ?? question.stem;
  const explanation = revision?.explanation ?? question.explanation;
  const explanationAssetId = revision?.explanationAssetId ?? question.explanationAssetId;
  const promptAssetId = revision?.promptAssetId ?? question.promptAssetId;
  const questionType = (revision?.questionType ?? question.questionType) === QuestionType.multiple_choice
    ? "multiple_choice"
    : "single_choice";
  const correctChoiceIds = options.filter((option) => option.isCorrect).map((option) => option.id);
  const status = revision?.status === QuestionRevisionStatus.ready
    ? ContentStatus.published
    : revision?.status === QuestionRevisionStatus.retired
      ? ContentStatus.archived
      : ContentStatus.draft;
  return {
    bankId,
    choices: options.map((option) => ({ id: option.id, mediaAssetId: option.assetId ?? undefined, text: option.content })),
    correctChoiceId: correctChoiceIds[0] ?? options[0]?.id ?? "",
    correctChoiceIds,
    difficulty: toBankDifficulty(revision?.difficulty ?? question.difficulty),
    explanation: explanation ?? "",
    explanationMediaAssetId: explanationAssetId ?? undefined,
    id: question.id,
    materi: revision?.materi ?? question.materi ?? undefined,
    prompt: stem,
    promptMediaAssetId: promptAssetId ?? undefined,
    questionContentDigest: revision?.contentDigest,
    questionRevisionId: revision?.id,
    questionRevisionNo: revision?.revisionNo,
    questionRevisionProvenance: revision?.provenance,
    questionRevisionStatus: revision?.status,
    questionType,
    subjectCode: question.subtest?.code ?? "",
    status,
    tags: [] as string[],
  };
}

function toCatalogDto(bank: BankCatalogRecord, folderRows: readonly FolderRow[], metrics: BankMetrics): QuestionBankCatalogEntry {
  const folderPath = folderPathFromRows(bank.folder?.id ?? null, folderRows, bank.purpose);
  const status = bank.status === ContentStatus.archived ? ContentStatus.archived : ContentStatus.published;
  return {
    bank: {
      categories: bank.categories
        .map(({ category }) => category)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id)),
      categoryIds: bank.categories.map(({ categoryId }) => categoryId),
      description: bank.description ?? "",
      difficultyMix: metrics.questionCount ? `${metrics.readyCount}/${metrics.questionCount} soal siap` : "Belum ada soal",
      folder: bank.folder ? { id: bank.folder.id, name: bank.folder.name } : null,
      folderId: bank.folderId,
      folderPath,
      href: `/mentor/quiz/question-bank/${bank.id}?purpose=${bank.purpose}`,
      id: bank.id,
      primaryMetric: `${metrics.questionCount} soal`,
      progress: metrics.questionCount ? Math.round(metrics.readyCount / metrics.questionCount * 100) : 0,
      questionCount: metrics.questionCount,
      resourceType: "question-bank" as const,
      purpose: bank.purpose,
      reusableIn: [questionBankPurposeLabel(bank.purpose)],
      revision: bank.revision,
      status,
      materiCoverage: metrics.materiCoverage,
      subjectCoverage: metrics.subjectCoverage,
      title: bank.name,
      updatedAt: bank.updatedAt.toISOString(),
    } satisfies QuestionBankDto,
  };
}

async function getBankMetrics(bankIds: readonly string[]): Promise<Map<string, BankMetrics>> {
  if (!bankIds.length) return new Map();
  const ids = Prisma.join(bankIds.map((id) => Prisma.sql`${id}::uuid`));
  const rows = await prisma.$queryRaw<Array<{ bankId: string; materiCoverage: string[] | null; questionCount: number; readyCount: number; subjectCoverage: string[] | null }>>(Prisma.sql`
    WITH option_rollup AS (
      SELECT r.id AS revision_id,
        COUNT(ro.id)::int AS option_count,
        COUNT(ro.id) FILTER (WHERE ro.is_correct)::int AS correct_count,
        COALESCE(BOOL_AND(BTRIM(ro.content) <> '' AND (ra.id IS NULL OR ra.state = 'ready')), TRUE) AS options_ready
      FROM question_revisions r
      LEFT JOIN question_revision_options ro ON ro.question_revision_id = r.id
      LEFT JOIN assets ra ON ra.id = ro.asset_id
      GROUP BY r.id
    ), active_revisions AS (
      SELECT q.id AS question_id, q.question_bank_id, q.subtest_id, q.materi AS question_materi, r.*, option_rollup.option_count,
        option_rollup.correct_count, option_rollup.options_ready
      FROM questions q
      JOIN question_revisions r ON r.id = q.current_revision_id
      JOIN option_rollup ON option_rollup.revision_id = r.id
      WHERE q.question_bank_id IN (${ids}) AND q.status <> ${ContentStatus.archived} AND r.status <> 'retired'
    )
    SELECT active_revisions.question_bank_id AS "bankId",
      COUNT(*)::int AS "questionCount",
      COUNT(*) FILTER (
        WHERE active_revisions.status = 'ready'
          AND BTRIM(active_revisions.stem) <> ''
          AND active_revisions.option_count BETWEEN 2 AND 5
          AND (
            (active_revisions.question_type = 'single_choice' AND active_revisions.correct_count = 1)
            OR (active_revisions.question_type = 'multiple_choice' AND active_revisions.correct_count >= 1)
          )
          AND active_revisions.options_ready
          AND (pa.id IS NULL OR pa.state = 'ready')
          AND (ea.id IS NULL OR ea.state = 'ready')
      )::int AS "readyCount",
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.code) FILTER (WHERE s.code IS NOT NULL), NULL) AS "subjectCoverage",
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(BTRIM(COALESCE(active_revisions.materi, active_revisions.question_materi)), '')) FILTER (WHERE NULLIF(BTRIM(COALESCE(active_revisions.materi, active_revisions.question_materi)), '') IS NOT NULL), NULL) AS "materiCoverage"
    FROM active_revisions
    LEFT JOIN subtests s ON s.id = active_revisions.subtest_id
    LEFT JOIN assets pa ON pa.id = active_revisions.prompt_asset_id
    LEFT JOIN assets ea ON ea.id = active_revisions.explanation_asset_id
    GROUP BY active_revisions.question_bank_id
  `);
  return new Map(rows.map((row) => [row.bankId, {
    questionCount: Number(row.questionCount),
    readyCount: Number(row.readyCount),
    materiCoverage: row.materiCoverage ?? [],
    subjectCoverage: row.subjectCoverage ?? [],
  }]));
}

function codeFromTitle(title: string) {
  return `${title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "bank-soal"}-${Date.now()}`.slice(0, 100);
}

function validate(input: SaveBankInput) {
  if (!isQuestionBankPurpose(input.purpose)) {
    throw new QuestionBankError("Tujuan Bank Soal wajib dipilih.", { code: "invalid_input" });
  }
  const subjectCodes = [...new Set(input.questions.map((question) => question.subjectCode))];
  const questionIds = input.questions.flatMap((question) => question.id ? [question.id] : []);
  if (!input.title.trim()) throw new QuestionBankError("Judul Bank Soal wajib diisi.");
  if (subjectCodes.some((subject) => !SUBJECT_CODES.includes(subject as (typeof SUBJECT_CODES)[number]))) {
    throw new QuestionBankError("Tambahkan soal dengan subject yang valid.");
  }
  if (new Set(questionIds).size !== questionIds.length) {
    throw new QuestionBankError("Setiap soal hanya boleh muncul satu kali.", { code: "invalid_input" });
  }
  for (const question of input.questions) {
    if (!isQuestionBankMateri(question.subjectCode, question.materi)) {
      throw new QuestionBankError("Materi harus sesuai dengan subject soal.", { code: "invalid_input" });
    }
    if (question.choices.length < 2 || question.choices.length > 5) throw new QuestionBankError("Setiap soal harus memiliki 2 sampai 5 opsi.");
    const questionType = question.questionType ?? QuestionType.single_choice;
    if (questionType !== QuestionType.single_choice && questionType !== QuestionType.multiple_choice) {
      throw new QuestionBankError("Mode jawaban soal tidak valid.", { code: "invalid_input" });
    }
    const correctChoiceIds = question.correctChoiceIds ?? [question.correctChoiceId];
    const answerKey = validateAnswerKey(questionType, question.choices.map((choice) => ({ id: choice.id, isCorrect: correctChoiceIds.includes(choice.id) })));
    if (new Set(question.choices.map((choice) => choice.id)).size !== question.choices.length || new Set(correctChoiceIds).size !== correctChoiceIds.length || !answerKey.ok) {
      throw new QuestionBankError("Opsi jawaban soal tidak valid.");
    }
  }
  return subjectCodes;
}

function normalizeQuestionBankFolderId(folderId: SaveBankInput["folderId"]) {
  if (folderId === undefined || folderId === null) return null;
  if (
    typeof folderId !== "string" ||
    !QUESTION_BANK_FOLDER_UUID_PATTERN.test(folderId)
  ) {
    throw new QuestionBankError("Folder Bank Soal tidak valid.", {
      code: "invalid_input",
    });
  }
  return folderId;
}

function normalizeMediaFolderReservationId(reservationId: SaveBankInput["mediaFolderReservationId"]) {
  if (reservationId === undefined) return undefined;
  if (typeof reservationId !== "string" || !QUESTION_BANK_FOLDER_UUID_PATTERN.test(reservationId)) {
    throw new QuestionBankError("Folder Media untuk draf tidak valid.", { code: "invalid_input" });
  }
  return reservationId;
}

async function getFolderRows(client: typeof prisma | Prisma.TransactionClient = prisma): Promise<FolderRow[]> {
  return client.questionBankFolder.findMany({
    select: { id: true, name: true, parentId: true, purpose: true, updatedAt: true },
  });
}

function toDto(
  bank: Prisma.QuestionBankGetPayload<{ include: typeof bankInclude }>,
  folderRows: readonly FolderRow[],
): QuestionBankEditDto {
  // The editor represents archived banks as a locked snapshot so they can be
  // restored without losing the questions archived as part of the bank
  // lifecycle. Intentionally retired revisions remain historical and are
  // excluded from the hydrated question list.
  const activeQuestionRecords = bank.questions.filter((question) => bank.status === ContentStatus.archived
    ? question.currentRevision?.status !== QuestionRevisionStatus.retired
    : question.status !== ContentStatus.archived);
  const questions: BankQuestionDto[] = activeQuestionRecords.map((question) => toBankQuestionDto(question, bank.id));
  const readinessInputs: QuestionRevisionReadinessInput[] = activeQuestionRecords.map((question) => ({
    questionId: question.id,
    revision: question.currentRevision,
    subtestCode: question.subtest?.code,
  }));
  const ready = activeQuestionRecords.filter((question) => isReadyRevision(question.currentRevision)).length;
  const subjectCoverage = [...new Set(
    activeQuestionRecords
      .map((question) => question.subtest?.code)
      .filter((code): code is string => Boolean(code)),
  )];
  const materiCoverage = [...new Set(
    questions
      .map((question) => question.materi?.trim())
      .filter((materi): materi is string => Boolean(materi)),
  )].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
  const catalog = toCatalogDto(bank, folderRows, {
    materiCoverage,
    questionCount: questions.length,
    readyCount: ready,
    subjectCoverage,
  });
  return {
    bank: catalog.bank,
    questions,
    readiness: getQuestionBankReadinessFromRevisions(readinessInputs),
  };
}

function buildListWhere(options: ListQuestionBanksOptions = {}): Prisma.QuestionBankWhereInput {
  const conditions: Prisma.QuestionBankWhereInput[] = [];
  const categoryIds = [...new Set(options.categoryIds ?? (options.categoryId ? [options.categoryId] : []))];
  if (options.purpose) conditions.push({ purpose: assertQuestionBankPurpose(options.purpose) });
  if (options.folderId !== undefined) conditions.push({ folderId: options.folderId });
  if (options.status) {
    conditions.push(options.status === ContentStatus.archived
      ? { status: ContentStatus.archived }
      : { status: { not: ContentStatus.archived } });
  }
  if (categoryIds.length) conditions.push({ categories: { some: { categoryId: { in: categoryIds } } } });
  if (options.subjectCoverage?.length) {
    conditions.push({ questions: {
      some: {
        status: { not: ContentStatus.archived },
        subtest: { code: { in: options.subjectCoverage } },
      },
    } });
  }
  const search = options.search?.trim();
  if (search) {
    conditions.push({ OR: [
      { code: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      { folder: { name: { contains: search, mode: "insensitive" } } },
      { categories: { some: { category: { name: { contains: search, mode: "insensitive" } } } } },
      { questions: { some: { status: { not: ContentStatus.archived }, OR: [
        { materi: { contains: search, mode: "insensitive" } },
        { currentRevision: { materi: { contains: search, mode: "insensitive" } } },
        { subtest: { code: { contains: search, mode: "insensitive" } } },
      ] } } },
    ] });
  }
  return conditions.length ? { AND: conditions } : {};
}

async function listQuestionBanks(options: ListQuestionBanksOptions = {}) {
  return (await listQuestionBankPage({ ...options, page: 1, pageSize: 25 })).items;
}

async function listQuestionBankPage(options: ListQuestionBanksOptions & { page?: number; pageSize?: number } = {}): Promise<QuestionBankListPage> {
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 25));
  const page = Math.max(1, options.page ?? 1);
  const where = buildListWhere(options);
  const orderBy = options.sort === "name"
    ? [{ name: "asc" as const }, { id: "asc" as const }]
    : options.sort === "questions"
      ? [{ questions: { _count: "desc" as const } }, { updatedAt: "desc" as const }, { id: "desc" as const }]
      : [{ updatedAt: "desc" as const }, { id: "desc" as const }];
  const [records, total, folderRows] = await Promise.all([
    prisma.questionBank.findMany({ include: bankCatalogInclude, orderBy, skip: (page - 1) * pageSize, take: pageSize, where }),
    prisma.questionBank.count({ where }),
    getFolderRows(),
  ]);
  const metrics = await getBankMetrics(records.map((record) => record.id));
  return {
    items: records.map((record) => toCatalogDto(record, folderRows, metrics.get(record.id) ?? { materiCoverage: [], questionCount: 0, readyCount: 0, subjectCoverage: [] })),
    page,
    pageSize,
    total,
  };
}

async function getQuestionBankForEdit(id: string) {
  const [bank, folderRows] = await Promise.all([
    prisma.questionBank.findUnique({ where: { id }, include: bankInclude }),
    getFolderRows(),
  ]);
  return bank ? toDto(bank, folderRows) : null;
}

function buildReadySourceQuestionCondition(questionAlias: string, bankAlias: string | null = null): Prisma.Sql {
  // react-doctor-disable-next-line raw-sql-injection-risk -- internal SQL table aliases
  const bankCondition = bankAlias ? Prisma.sql`${Prisma.raw(`${questionAlias}.question_bank_id`)} = ${Prisma.raw(`${bankAlias}.id`)} AND ${Prisma.raw(`${bankAlias}.status`)} <> ${ContentStatus.archived}` : Prisma.sql`TRUE`;
  const revisionAlias = `${questionAlias}_revision`;
  return Prisma.sql`
    EXISTS (
      SELECT 1
      FROM question_revisions ${Prisma.raw(revisionAlias)}
      WHERE ${Prisma.raw(`${revisionAlias}.id`)} = ${Prisma.raw(`${questionAlias}.current_revision_id`)}
        AND ${Prisma.raw(`${revisionAlias}.status`)} = 'ready'
        AND BTRIM(${Prisma.raw(`${revisionAlias}.stem`)}) <> ''
        AND (SELECT COUNT(*) FROM question_revision_options ro WHERE ro.question_revision_id = ${Prisma.raw(`${revisionAlias}.id`)}) BETWEEN 2 AND 5
        AND (
          (${Prisma.raw(`${revisionAlias}.question_type`)} = 'single_choice' AND (SELECT COUNT(*) FROM question_revision_options rc WHERE rc.question_revision_id = ${Prisma.raw(`${revisionAlias}.id`)} AND rc.is_correct) = 1)
          OR (${Prisma.raw(`${revisionAlias}.question_type`)} = 'multiple_choice' AND (SELECT COUNT(*) FROM question_revision_options rc WHERE rc.question_revision_id = ${Prisma.raw(`${revisionAlias}.id`)} AND rc.is_correct) >= 1)
        )
        AND NOT EXISTS (
          SELECT 1 FROM question_revision_options ri
          LEFT JOIN assets ria ON ria.id = ri.asset_id
          WHERE ri.question_revision_id = ${Prisma.raw(`${revisionAlias}.id`)}
            AND (BTRIM(ri.content) = '' OR (ria.id IS NOT NULL AND ria.state <> 'ready'))
        )
        AND (${Prisma.raw(`${revisionAlias}.prompt_asset_id`)} IS NULL OR EXISTS (SELECT 1 FROM assets rpa WHERE rpa.id = ${Prisma.raw(`${revisionAlias}.prompt_asset_id`)} AND rpa.state = 'ready'))
        AND (${Prisma.raw(`${revisionAlias}.explanation_asset_id`)} IS NULL OR EXISTS (SELECT 1 FROM assets rea WHERE rea.id = ${Prisma.raw(`${revisionAlias}.explanation_asset_id`)} AND rea.state = 'ready'))
    )
    AND ${bankCondition}
  `;
}

function buildSourceBankWhereSql(options: ListQuestionBankSourceOptions): Prisma.Sql {
  const purpose = assertQuestionBankPurpose(options.purpose);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`b.purpose = ${purpose}`,
    Prisma.sql`b.status <> ${ContentStatus.archived}`,
    Prisma.sql`EXISTS (SELECT 1 FROM questions rq WHERE rq.question_bank_id = b.id AND rq.status <> ${ContentStatus.archived} AND ${buildReadySourceQuestionCondition("rq", "b")})`,
  ];
  const categoryIds = [...new Set(options.categoryIds ?? (options.categoryId ? [options.categoryId] : []))];
  if (options.folderId !== undefined) {
    conditions.push(options.folderId === null ? Prisma.sql`b.folder_id IS NULL` : Prisma.sql`b.folder_id = ${options.folderId}::uuid`);
  }
  if (categoryIds.length) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM question_bank_category_assignments bca
      WHERE bca.question_bank_id = b.id
        AND bca.category_id IN (${Prisma.join(categoryIds.map((id) => Prisma.sql`${id}::uuid`))})
    )`);
  }
  if (options.subjectCoverage?.length) {
    conditions.push(Prisma.sql`EXISTS (
      SELECT 1 FROM questions sq
      JOIN subtests ss ON ss.id = sq.subtest_id
      WHERE sq.question_bank_id = b.id
        AND sq.status <> ${ContentStatus.archived}
        AND ${buildReadySourceQuestionCondition("sq", "b")}
        AND ss.code IN (${Prisma.join(options.subjectCoverage.map((code) => Prisma.sql`${code}`))})
    )`);
  }
  const search = options.search?.trim();
  if (search) {
    const needle = `%${search}%`;
    conditions.push(Prisma.sql`(
      b.code ILIKE ${needle}
      OR b.name ILIKE ${needle}
      OR COALESCE(b.description, '') ILIKE ${needle}
      OR EXISTS (SELECT 1 FROM question_bank_folders bf WHERE bf.id = b.folder_id AND bf.purpose = b.purpose AND bf.name ILIKE ${needle})
      OR EXISTS (
        SELECT 1 FROM question_bank_category_assignments bs
        JOIN question_bank_categories bc ON bc.id = bs.category_id
        WHERE bs.question_bank_id = b.id AND bc.name ILIKE ${needle}
      )
      OR EXISTS (
        SELECT 1 FROM questions bq
        JOIN subtests bqs ON bqs.id = bq.subtest_id
        JOIN question_revisions bqr ON bqr.id = bq.current_revision_id
        WHERE bq.question_bank_id = b.id
          AND bq.status <> ${ContentStatus.archived}
          AND (bqs.code ILIKE ${needle} OR COALESCE(bqr.materi, bq.materi, '') ILIKE ${needle})
      )
    )`);
  }
  return Prisma.join(conditions, " AND ");
}

async function listQuestionBankSourcePage(options: ListQuestionBankSourceOptions & { page?: number; pageSize?: number }): Promise<QuestionBankSourcePage> {
  const purpose = assertQuestionBankPurpose(options.purpose);
  const pageSize = Math.min(25, Math.max(1, options.pageSize ?? 20));
  const page = Math.max(1, options.page ?? 1);
  const rows = await prisma.$queryRaw<Array<{ id: string; total: number }>>(Prisma.sql`
    SELECT b.id, COUNT(*) OVER()::int AS total
    FROM question_banks b
    WHERE ${buildSourceBankWhereSql(options)}
    ORDER BY b.updated_at DESC, b.id DESC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `);
  const ids = rows.map((row) => row.id);
  if (!ids.length) {
    const [{ total }] = await prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`SELECT COUNT(*)::int AS total FROM question_banks b WHERE ${buildSourceBankWhereSql(options)}`);
    return { items: [], page, pageSize, total: Number(total) };
  }
  const [records, folderRows, metrics] = await Promise.all([
    prisma.questionBank.findMany({ where: { id: { in: ids }, purpose }, include: bankCatalogInclude }),
    getFolderRows(),
    getBankMetrics(ids),
  ]);
  const recordById = new Map(records.map((record) => [record.id, record]));
  return {
    items: ids.flatMap((id) => {
      const record = recordById.get(id);
      if (!record) return [];
      return [toCatalogDto(record, folderRows, metrics.get(id) ?? { materiCoverage: [], questionCount: 0, readyCount: 0, subjectCoverage: [] })];
    }),
    page,
    pageSize,
    total: rows[0]?.total ?? 0,
  };
}

type ListQuestionBankSourceQuestionsOptions = {
  page?: number;
  pageSize?: number;
  purpose: QuestionBankPurpose;
  search?: string;
  subjectCode?: string;
};

async function listQuestionBankSourceQuestions(bankId: string, options: ListQuestionBankSourceQuestionsOptions): Promise<QuestionBankSourceQuestionPage | null> {
  const purpose = assertQuestionBankPurpose(options.purpose);
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 100));
  const page = Math.max(1, options.page ?? 1);
  const bank = await prisma.questionBank.findUnique({ where: { id: bankId, purpose }, include: bankCatalogInclude });
  if (!bank || bank.status === ContentStatus.archived) return null;
  const questionConditions: Prisma.Sql[] = [
    Prisma.sql`q.question_bank_id = ${bankId}::uuid`,
    Prisma.sql`q.status <> ${ContentStatus.archived}`,
    Prisma.sql`EXISTS (SELECT 1 FROM question_banks qb WHERE qb.id = q.question_bank_id AND qb.purpose = ${purpose} AND qb.status <> ${ContentStatus.archived})`,
    buildReadySourceQuestionCondition("q"),
  ];
  if (options.subjectCode) {
    questionConditions.push(Prisma.sql`EXISTS (SELECT 1 FROM subtests qs WHERE qs.id = q.subtest_id AND qs.code = ${options.subjectCode})`);
  }
  const search = options.search?.trim();
  if (search) {
    const needle = `%${search}%`;
    questionConditions.push(Prisma.sql`(
      qr.stem ILIKE ${needle}
      OR COALESCE(qr.explanation, '') ILIKE ${needle}
      OR EXISTS (SELECT 1 FROM question_revision_options qso WHERE qso.question_revision_id = q.current_revision_id AND qso.content ILIKE ${needle})
    )`);
  }
  const rows = await prisma.$queryRaw<Array<{ id: string; total: number }>>(Prisma.sql`
    SELECT q.id, COUNT(*) OVER()::int AS total
    FROM questions q
    JOIN question_revisions qr ON qr.id = q.current_revision_id
    WHERE ${Prisma.join(questionConditions, " AND ")}
    ORDER BY q.created_at ASC, q.id ASC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `);
  const [folderRows, metrics] = await Promise.all([getFolderRows(), getBankMetrics([bankId])]);
  const bankDto = toCatalogDto(bank, folderRows, metrics.get(bankId) ?? { materiCoverage: [], questionCount: 0, readyCount: 0, subjectCoverage: [] }).bank;
  const ids = rows.map((row) => row.id);
  if (!ids.length) {
    const [{ total }] = await prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`SELECT COUNT(*)::int AS total FROM questions q JOIN question_revisions qr ON qr.id = q.current_revision_id WHERE ${Prisma.join(questionConditions, " AND ")}`);
    return { bank: bankDto, page, pageSize, questions: [], total: Number(total) };
  }
  const records = await prisma.question.findMany({ where: { id: { in: ids } }, include: sourceQuestionInclude });
  const recordById = new Map(records.map((record) => [record.id, record]));
  return {
    bank: bankDto,
    page,
    pageSize,
    questions: ids.flatMap((id) => {
      const record = recordById.get(id);
      return record ? [toBankQuestionDto(record as SourceQuestionRecord, bankId)] : [];
    }),
    total: rows[0]?.total ?? 0,
  };
}

async function listQuestionBankSources(options: ListQuestionBankSourceOptions) {
  return (await listQuestionBankSourcePage({ ...options, page: 1, pageSize: 20 })).items;
}

type RevisionOptionWrite = {
  assetId: string | null;
  content: string;
  isCorrect: boolean;
  label: string;
  sortOrder: number;
};

function revisionOptionWrites(input: BankQuestionInput): RevisionOptionWrite[] {
  const correctChoiceIds = new Set(input.correctChoiceIds ?? [input.correctChoiceId]);
  return input.choices.map((choice, optionIndex) => ({
    assetId: choice.mediaAssetId || null,
    content: choice.text,
    isCorrect: correctChoiceIds.has(choice.id),
    label: String.fromCharCode(65 + optionIndex),
    sortOrder: optionIndex,
  }));
}

function questionMediaAssetIds(questions: readonly BankQuestionInput[]) {
  return questions.flatMap((question) => [
    question.promptMediaAssetId,
    question.explanationMediaAssetId,
    ...question.choices.map((choice) => choice.mediaAssetId),
  ]);
}

type CanonicalQuestionContent = {
  digest: string;
  materi: string | null;
  questionId: string;
  subtestCode: string | null;
};

function canonicalDigestFromInput(input: BankQuestionInput, options = revisionOptionWrites(input)) {
  return questionRevisionContentDigest({
    difficulty: input.difficulty,
    explanation: input.explanation.trim() || null,
    explanationAssetId: input.explanationMediaAssetId || null,
    materi: normalizeQuestionBankMateri(input.subjectCode, input.materi),
    options,
    prompt: input.prompt,
    promptAssetId: input.promptMediaAssetId || null,
    questionType: input.questionType ?? QuestionType.single_choice,
  });
}

function canonicalDigestFromRevision(revision: {
  difficulty: DifficultyLevel;
  explanation: string | null;
  explanationAssetId: string | null;
  materi: string | null;
  options: readonly {
    assetId: string | null;
    content: string;
    id: string;
    isCorrect: boolean;
    sortOrder: number;
  }[];
  promptAssetId: string | null;
  status: QuestionRevisionStatus;
  questionType: QuestionType;
  stem: string;
}) {
  const options: RevisionOptionWrite[] = revision.options
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
    .map((option, optionIndex) => ({
      assetId: option.assetId,
      content: option.content,
      isCorrect: option.isCorrect,
      label: String.fromCharCode(65 + optionIndex),
      sortOrder: optionIndex,
    }));
  return questionRevisionContentDigest({
    difficulty: revision.difficulty,
    explanation: revision.explanation,
    explanationAssetId: revision.explanationAssetId,
    materi: revision.materi,
    options,
    prompt: revision.stem,
    promptAssetId: revision.promptAssetId,
    questionType: revision.questionType,
  });
}

function canonicalQuestionFromInput(
  question: BankQuestionInput,
  subtestCode: string | null,
): CanonicalQuestionContent | null {
  if (!question.id) return null;
  return {
    digest: canonicalDigestFromInput(question),
    materi: normalizeQuestionBankMateri(question.subjectCode, question.materi),
    questionId: question.id,
    subtestCode,
  };
}

function canonicalQuestionFromRecord(question: {
  currentRevision: Parameters<typeof canonicalDigestFromRevision>[0] | null;
  id: string;
  materi: string | null;
  subtest: { code: string } | null;
}): CanonicalQuestionContent | null {
  const revision = question.currentRevision;
  if (!revision) return null;
  return {
    digest: canonicalDigestFromRevision(revision),
    materi: revision.materi ?? question.materi ?? null,
    questionId: question.id,
    subtestCode: question.subtest?.code ?? null,
  };
}

function sameCanonicalQuestionContent(
  left: CanonicalQuestionContent | null,
  right: CanonicalQuestionContent | null,
) {
  return Boolean(left
    && right
    && left.questionId === right.questionId
    && left.subtestCode === right.subtestCode
    && left.materi === right.materi
    && left.digest === right.digest);
}

async function createQuestionRevision(
  tx: Prisma.TransactionClient,
  input: {
    actorId: string;
    id?: string;
    options: RevisionOptionWrite[];
    questionId: string;
    revisionNo: number;
    status?: QuestionRevisionStatus;
    stem: string;
    difficulty: DifficultyLevel;
    explanation: string | null;
    explanationAssetId: string | null;
    materi: string | null;
    promptAssetId: string | null;
    questionType: QuestionAnswerMode;
  },
) {
  const contentDigest = questionRevisionContentDigest({
    difficulty: input.difficulty,
    explanation: input.explanation,
    explanationAssetId: input.explanationAssetId,
    materi: input.materi,
    options: input.options,
    prompt: input.stem,
    promptAssetId: input.promptAssetId,
    questionType: input.questionType,
  });
  const revision = await tx.questionRevision.create({
    data: {
      id: input.id,
      contentDigest,
      createdByUserId: input.actorId,
      difficulty: input.difficulty,
      explanation: input.explanation,
      explanationAssetId: input.explanationAssetId,
      materi: input.materi,
      promptAssetId: input.promptAssetId,
      provenance: QuestionRevisionProvenance.authored,
      questionId: input.questionId,
      questionType: input.questionType,
      revisionNo: input.revisionNo,
      status: input.status ?? QuestionRevisionStatus.draft,
      stem: input.stem,
      updatedByUserId: input.actorId,
    },
  });
  if (input.options.length) {
    await tx.questionRevisionOption.createMany({
      data: input.options.map((option) => ({ ...option, questionRevisionId: revision.id })),
    });
  }
  return revision;
}

async function updateDraftQuestionRevision(
  tx: Prisma.TransactionClient,
  revision: QuestionRevisionRecord,
  input: {
    actorId: string;
    options: RevisionOptionWrite[];
    stem: string;
    difficulty: DifficultyLevel;
    explanation: string | null;
    explanationAssetId: string | null;
    materi: string | null;
    promptAssetId: string | null;
    questionType: QuestionAnswerMode;
  },
) {
  const contentDigest = questionRevisionContentDigest({
    difficulty: input.difficulty,
    explanation: input.explanation,
    explanationAssetId: input.explanationAssetId,
    materi: input.materi,
    options: input.options,
    prompt: input.stem,
    promptAssetId: input.promptAssetId,
    questionType: input.questionType,
  });
  await tx.questionRevision.update({
    where: { id: revision.id },
    data: {
      contentDigest,
      difficulty: input.difficulty,
      explanation: input.explanation,
      explanationAssetId: input.explanationAssetId,
      materi: input.materi,
      promptAssetId: input.promptAssetId,
      questionType: input.questionType,
      stem: input.stem,
      updatedByUserId: input.actorId,
    },
  });
  await tx.questionRevisionOption.deleteMany({ where: { questionRevisionId: revision.id } });
  if (input.options.length) {
    await tx.questionRevisionOption.createMany({
      data: input.options.map((option) => ({ ...option, questionRevisionId: revision.id })),
    });
  }
  return { ...revision, contentDigest };
}

async function syncLegacyQuestionOptions(tx: Prisma.TransactionClient, questionId: string, existing: Array<{ id: string; sortOrder: number }>, options: RevisionOptionWrite[]) {
  const retained = new Set<string>();
  for (const [optionIndex, option] of options.entries()) {
    const old = existing.find((candidate) => candidate.sortOrder === optionIndex);
    if (old) {
      retained.add(old.id);
      await tx.questionOption.update({ where: { id: old.id }, data: option });
    } else {
      const created = await tx.questionOption.create({ data: { ...option, questionId } });
      retained.add(created.id);
    }
  }
  const extras = existing.filter((option) => !retained.has(option.id));
  if (extras.length) {
    await tx.questionOption.deleteMany({
      where: {
        id: { in: extras.map((option) => option.id) },
        standaloneQuizItemOptions: { none: {} },
        tryoutItemOptions: { none: {} },
        reusablePackageVersionOptions: { none: {} },
      },
    });
  }
}

async function saveQuestionBank(input: SaveBankInput, actorId: string) {
  const subjectCodes = validate(input);
  const folderId = normalizeQuestionBankFolderId(input.folderId);
  const mediaFolderReservationId = normalizeMediaFolderReservationId(input.mediaFolderReservationId);
  let newBankId: string | undefined;
  let newBankCode: string | undefined;
  let newBankMediaFolder: MediaFolderIdentity | null = null;
  let manualBankMediaFolderCleanupCandidate: NewKaptenRootFolderIdentity | null = null;

  if (input.id && mediaFolderReservationId) {
    await assertQuestionBankMediaFolderReservationForBank(
      actorId,
      mediaFolderReservationId,
      input.id,
    );
  } else if (!input.id) {
    if (mediaFolderReservationId) {
      const adoptedBankId = await getAdoptedQuestionBankMediaFolderReservation(
        actorId,
        mediaFolderReservationId,
      );
      if (adoptedBankId) {
        const savedBank = await prisma.questionBank.findUnique({
          include: bankInclude,
          where: { id: adoptedBankId },
        });
        if (!savedBank) {
          throw new QuestionBankError("Bank Soal yang memakai folder Media ini tidak ditemukan.", {
            code: "not_found",
          });
        }
        const savedDto = toDto(savedBank, await getFolderRows());
        try {
          await finalizeQuestionBankMediaFolderReservation(savedBank.id, actorId);
        } catch (error) {
          console.error("Could not finalize the adopted Bank Media folder rename.", error);
        }
        return savedDto;
      }

      newBankId = randomUUID();
      newBankCode = codeFromTitle(input.title);
      const reservation = await reserveDraftQuestionBankMediaFolder(actorId, mediaFolderReservationId);
      newBankMediaFolder = { id: reservation.mediaFolderId, name: reservation.provisionalName };
    } else {
      newBankId = randomUUID();
      newBankCode = codeFromTitle(input.title);
      const createdMediaFolder = await createQuestionBankMediaFolder(
        actorId,
        input.title,
        newBankCode,
        newBankId,
      );
      newBankMediaFolder = createdMediaFolder;
      manualBankMediaFolderCleanupCandidate = createdMediaFolder;
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    await setTransactionLockTimeout(tx);
    if (folderId !== undefined) {
      await acquireDomainMutex(tx, bankOrganizationFoldersMutexKey(input.purpose));
    }
    let bankId = input.id;
    const status: ContentStatus = ContentStatus.published;
    if (bankId) {
      const accessibleBank = await tx.questionBank.findUnique({
        where: { id: bankId },
        select: { id: true },
      });
      if (!accessibleBank)
        throw new QuestionBankError("Bank Soal tidak ditemukan.", { code: "not_found" });
      await assertAuthoringEditLease(
        tx,
        { resourceId: bankId, resourceType: "question_bank" },
        actorId,
        input.editLease,
      );
      await tx.$queryRaw`SELECT id FROM question_banks WHERE id = ${bankId}::uuid FOR UPDATE`;
      const current = await tx.questionBank.findUnique({ where: { id: bankId } });
      if (!current) throw new QuestionBankError("Bank Soal tidak ditemukan.", { code: "not_found" });
      if (input.revision === undefined || current.revision !== input.revision) {
        throw new QuestionBankError("Bank Soal telah diperbarui. Muat ulang halaman lalu coba lagi.", { code: "stale_revision" });
      }
      if (current.status === ContentStatus.archived) {
        throw new QuestionBankError(
          "Bank Soal yang diarsipkan harus dipulihkan sebelum isinya dapat diubah.",
          { code: "archived_locked" },
        );
      }
      if (current.purpose !== input.purpose) {
        throw new QuestionBankError("Tujuan Bank Soal tidak dapat diubah.", {
          code: "invalid_input",
          details: { currentPurpose: current.purpose, requestedPurpose: input.purpose },
        });
      }
    }

    const subtests = await tx.subtest.findMany({ where: { code: { in: subjectCodes } } });
    const subtestByCode = new Map(subtests.map((subtest) => [subtest.code, subtest]));
    if (!bankId) {
      if (folderId) {
        const folder = await tx.questionBankFolder.findUnique({
          where: { id: folderId },
          select: { purpose: true },
        });
        if (!folder || folder.purpose !== input.purpose) {
          throw new QuestionBankError(
            "Folder Bank Soal tidak ditemukan untuk tujuan yang dipilih.",
            {
              code: "invalid_input",
              details: { folderId, purpose: input.purpose },
            },
          );
        }
      }
      if (!newBankId || !newBankCode || !newBankMediaFolder) {
        throw new QuestionBankError("Folder Media Bank Soal belum tersedia. Coba simpan lagi.", {
          code: "invalid_input",
        });
      }
      await lockQuestionBankMediaFolderForSave(tx, newBankMediaFolder.id);
      const created = await tx.questionBank.create({
        data: {
          id: newBankId,
          code: newBankCode,
          description: input.description.trim() || null,
          folderId,
          mediaFolderId: newBankMediaFolder.id,
          name: input.title.trim(),
          purpose: input.purpose,
          createdByUserId: actorId,
          status,
          updatedByUserId: actorId,
        },
      });
      bankId = created.id;
      if (mediaFolderReservationId) {
        await adoptQuestionBankMediaFolderReservation(tx, {
          bankId: created.id,
          mediaFolderId: newBankMediaFolder.id,
          ownerUserId: actorId,
          reservationId: mediaFolderReservationId,
        });
      }
    }
    const persistedBankId = bankId;
    try {
      await lockAndValidateKaptenBankImages(tx, {
        assetIds: questionMediaAssetIds(input.questions),
      });
    } catch (error) {
      if (error instanceof ManagedImageAssetValidationError) {
        throw new QuestionBankError(error.message, {
          code: "invalid_input",
          details: { assetIds: [...error.assetIds] },
        });
      }
      if (error instanceof ManagedImageAssetConflictError) {
        throw new QuestionBankError(error.message, {
          code: "stale_revision",
          details: { assetIds: [...error.assetIds] },
        });
      }
      throw error;
    }
    const existing = await tx.question.findMany({
      where: { questionBankId: persistedBankId },
      include: {
        currentRevision: {
          include: {
            explanationAsset: true,
            options: { include: { asset: true }, orderBy: { sortOrder: "asc" } },
            promptAsset: true,
          },
        },
        options: true,
        subtest: { select: { code: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    if (input.id) {
      await tx.questionBank.update({
        where: { id: persistedBankId },
        data: {
          description: input.description.trim() || null,
          name: input.title.trim(),
          revision: { increment: 1 },
          status,
          updatedByUserId: actorId,
        },
      });
    }

    const existingById = new Map(existing.map((question) => [question.id, question]));
    const retainedIds = new Set<string>();
    for (const [questionIndex, question] of input.questions.entries()) {
        const subtest = subtestByCode.get(question.subjectCode);
        if (!subtest) throw new QuestionBankError(`Subtest ${question.subjectCode} tidak ditemukan.`, { code: "invalid_input" });
        const isTemporary = isTemporaryQuestionId(question.id);
        const current = question.id && !isTemporary ? existingById.get(question.id) : undefined;
        if (question.id && !isTemporary && !current) {
          throw new QuestionBankError("Soal tidak ditemukan di Bank Soal ini.", { code: "invalid_input", details: { questionId: question.id } });
        }
        if (current?.currentRevision?.status === QuestionRevisionStatus.retired) {
          throw new QuestionBankError(
            "Soal yang sudah retired tidak dapat diaktifkan kembali.",
            { code: "question_retired", details: { questionId: current.id } },
          );
        }

        const options = revisionOptionWrites(question);
        const questionType = question.questionType ?? QuestionType.single_choice;
        const data = {
          difficulty: question.difficulty as DifficultyLevel,
          explanation: question.explanation.trim() || null,
          explanationAssetId: question.explanationMediaAssetId || null,
          materi: normalizeQuestionBankMateri(question.subjectCode, question.materi),
          promptAssetId: question.promptMediaAssetId || null,
          questionType,
          stem: question.prompt,
          subtestId: subtest.id,
          topicId: null,
          status,
          updatedByUserId: actorId,
        };

        if (!current) {
          const revisionId = randomUUID();
          const saved = await tx.question.create({
            data: {
              ...data,
              code: `${codeFromTitle(input.title)}-q${questionIndex + 1}`,
              createdByUserId: actorId,
              currentRevisionId: revisionId,
              questionBankId: persistedBankId,
            },
          });
          const revision = await createQuestionRevision(tx, {
            actorId,
            difficulty: data.difficulty,
            explanation: data.explanation,
            explanationAssetId: data.explanationAssetId,
            id: revisionId,
            materi: data.materi,
            options,
            promptAssetId: data.promptAssetId,
            questionId: saved.id,
            revisionNo: 1,
            stem: data.stem,
            questionType,
          });
          await syncLegacyQuestionOptions(tx, saved.id, [], options);
          await tx.question.update({ where: { id: saved.id }, data: { currentRevisionId: revision.id, revision: revision.revisionNo } });
          retainedIds.add(saved.id);
          continue;
        }

        retainedIds.add(current.id);
        const currentRevision = current.currentRevision;
        const incomingCanonical = canonicalQuestionFromInput(question, subtest.code);
        if (sameCanonicalQuestionContent(canonicalQuestionFromRecord(current), incomingCanonical)) {
          continue;
        }
        if (!currentRevision) {
          throw new QuestionBankError("Revisi aktif soal tidak ditemukan.", { code: "invalid_input", details: { questionId: current.id } });
        }

        const requiresNewRevision = currentRevision.status === QuestionRevisionStatus.ready;
        if (requiresNewRevision) {
          const nextRevisionNo = currentRevision.revisionNo + 1;
          const revision = await createQuestionRevision(tx, {
            actorId,
            difficulty: data.difficulty,
            explanation: data.explanation,
            explanationAssetId: data.explanationAssetId,
            materi: data.materi,
            options,
            promptAssetId: data.promptAssetId,
            questionId: current.id,
            revisionNo: nextRevisionNo,
            stem: data.stem,
            questionType,
          });
          await tx.question.update({ where: { id: current.id }, data: { ...data, currentRevisionId: revision.id, revision: nextRevisionNo } });
        } else {
          await updateDraftQuestionRevision(tx, currentRevision, {
            actorId,
            difficulty: data.difficulty,
            explanation: data.explanation,
            explanationAssetId: data.explanationAssetId,
            materi: data.materi,
            options,
            promptAssetId: data.promptAssetId,
            stem: data.stem,
            questionType,
          });
          // QuestionRevision is now the content authority. Keep the legacy
          // QuestionOption projection stable so historical source-option IDs
          // cannot silently change when a draft is edited.
          await tx.question.update({ where: { id: current.id }, data: { ...data, currentRevisionId: currentRevision.id } });
        }
        await syncLegacyQuestionOptions(tx, current.id, current.options, options);
    }
    const removed = existing.filter((question) => !retainedIds.has(question.id));
    for (const question of removed) {
      if (question.currentRevision && question.currentRevision.status !== QuestionRevisionStatus.retired) {
        await tx.questionRevision.update({
          where: { id: question.currentRevision.id },
          data: {
            retiredAt: new Date(),
            status: QuestionRevisionStatus.retired,
            updatedByUserId: actorId,
          },
        });
      }
      await tx.question.update({
        where: { id: question.id },
        data: { status: ContentStatus.archived, updatedByUserId: actorId },
      });
    }
    const [saved, folderRows] = await Promise.all([
      tx.questionBank.findUniqueOrThrow({ where: { id: persistedBankId }, include: bankInclude }),
      getFolderRows(tx),
    ]);
    return toDto(saved, folderRows);
  }).catch(async (saveError: unknown) => {
    if (manualBankMediaFolderCleanupCandidate) {
      try {
        await cleanupFailedManualQuestionBankMediaFolder(manualBankMediaFolderCleanupCandidate);
      } catch {
        // Preserve the original Bank-save error if best-effort cleanup fails.
      }
    }
    throw saveError;
  });
  if (mediaFolderReservationId || input.id) {
    try {
      await finalizeQuestionBankMediaFolderReservation(result.bank.id, actorId);
    } catch (error) {
      // The Bank is already committed. Leave the reservation and provisional
      // folder intact so a later save can safely retry the conditional rename.
      console.error("Could not finalize the adopted Bank Media folder rename.", error);
    }
  }
  return result;
}

type QuestionBankLifecycleOptions = {
  editLease?: AuthoringEditLease;
  expectedRevision: number;
};

async function updateQuestionBankLifecycle(id: string, operation: "archive" | "restore", actorId: string, options: QuestionBankLifecycleOptions) {
  const requestedOperation = String(operation);
  if (requestedOperation !== "archive" && requestedOperation !== "restore") {
    throw new QuestionBankError("Operasi status Bank Soal tidak valid.", {
      code: "invalid_input",
      details: { operation: requestedOperation },
    });
  }
  const isArchive = requestedOperation === "archive";
  return prisma.$transaction(async (tx) => {
    await assertAuthoringEditLease(
      tx,
      { resourceId: id, resourceType: "question_bank" },
      actorId,
      options.editLease,
    );
    await tx.$queryRaw`SELECT id FROM question_banks WHERE id = ${id}::uuid FOR UPDATE`;
    const bank = await tx.questionBank.findUnique({ where: { id }, include: bankInclude });
    if (!bank) throw new QuestionBankError("Bank Soal tidak ditemukan.", { code: "not_found" });
    if (bank.revision !== options.expectedRevision) {
      throw new QuestionBankError("Bank Soal telah diperbarui. Muat ulang halaman lalu coba lagi.", { code: "stale_revision" });
    }
    const operationAllowed = isArchive
      ? bank.status !== ContentStatus.archived
      : bank.status === ContentStatus.archived;
    if (!operationAllowed) {
      throw new QuestionBankError(
        "Perubahan status Bank Soal tidak diizinkan dari status saat ini.",
        {
          code: "invalid_lifecycle_transition",
          details: { from: bank.status, operation: requestedOperation },
        },
      );
    }

    const activeQuestions = bank.questions.filter((question) => question.status !== ContentStatus.archived && question.currentRevision?.status !== QuestionRevisionStatus.retired);
    const status = isArchive ? ContentStatus.archived : ContentStatus.published;
    const revision = bank.revision + 1;
    await tx.questionBank.update({ where: { id }, data: { status, revision, updatedByUserId: actorId } });
    // Archiving the bank makes all active question identities unavailable as
    // sources while preserving their current revisions for a safe restore.
    if (isArchive) {
      for (const question of activeQuestions) {
        await tx.question.update({
          where: { id: question.id },
          data: { status: ContentStatus.archived, updatedByUserId: actorId },
        });
      }
    } else {
      const restoreQuestions = bank.questions.filter((question) => question.status === ContentStatus.archived && question.currentRevision?.status !== QuestionRevisionStatus.retired);
      for (const question of restoreQuestions) {
        await tx.question.update({
          where: { id: question.id },
          data: {
            status: question.currentRevision?.status === QuestionRevisionStatus.ready
              ? ContentStatus.published
              : ContentStatus.draft,
            updatedByUserId: actorId,
          },
        });
      }
    }
    return { id, revision, status };
  });
}

type QuestionRevisionLifecycleStatus = "draft" | "review" | "ready" | "retired";
type QuestionRevisionLifecycleOptions = {
  editLease?: AuthoringEditLease;
  expectedStatus: QuestionRevisionLifecycleStatus;
  expectedUpdatedAt: string;
};

async function updateQuestionRevisionLifecycle(id: string, targetStatus: QuestionRevisionLifecycleStatus, actorId: string, options: QuestionRevisionLifecycleOptions) {
  return prisma.$transaction(async (tx) => {
    const identity = await tx.questionRevision.findUnique({
      where: { id },
      select: { question: { select: { questionBankId: true } } },
    });
    const questionBankId = identity?.question.questionBankId;
    if (!questionBankId) {
      throw new QuestionBankError("Revisi soal tidak terikat ke Bank Soal.", { code: "not_found" });
    }
    await assertAuthoringEditLease(
      tx,
      { resourceId: questionBankId, resourceType: "question_bank" },
      actorId,
      options.editLease,
    );
    // Take the parent bank lock first, matching saveQuestionBank and bank
    // lifecycle operations. Standalone questions have no bank row, so their
    // question/revision lock below remains the serialization boundary.
    await tx.$queryRaw`
      SELECT qb.id
      FROM question_banks qb
      JOIN questions q ON q.question_bank_id = qb.id
      JOIN question_revisions r ON r.question_id = q.id
      WHERE r.id = ${id}::uuid
      FOR UPDATE OF qb
    `;
    await tx.$queryRaw`
      SELECT q.id
      FROM questions q
      JOIN question_revisions r ON r.question_id = q.id
      WHERE r.id = ${id}::uuid
      FOR UPDATE OF q, r
    `;
    const revision = await tx.questionRevision.findFirst({
      where: {
        id,
        question: {
          OR: [
            { questionBankId: { not: null } },
            { questionBankId: null, createdByUserId: actorId },
          ],
        },
      },
      include: {
        options: { include: { asset: true }, orderBy: { sortOrder: "asc" } },
        promptAsset: true,
        explanationAsset: true,
        question: {
          include: {
            questionBank: { select: { id: true, revision: true, status: true } },
            subtest: { select: { code: true } },
          },
        },
      },
    });
    if (!revision) throw new QuestionBankError("Revisi soal tidak ditemukan.", { code: "not_found" });
    if (revision.question.questionBank?.status === ContentStatus.archived) {
      throw new QuestionBankError(
        "Bank Soal yang diarsipkan harus dipulihkan sebelum revisinya dapat diubah.",
        { code: "archived_locked", details: { status: revision.question.questionBank.status } },
      );
    }
    if (revision.status !== options.expectedStatus || revision.updatedAt.getTime() !== new Date(options.expectedUpdatedAt).getTime()) {
      throw new QuestionBankError("Revisi soal telah diperbarui. Muat ulang halaman lalu coba lagi.", { code: "stale_revision" });
    }

    const target = targetStatus as QuestionRevisionStatus;
    const current = revision.status;
    const isCurrent = revision.question.currentRevisionId === revision.id;
    if (current === QuestionRevisionStatus.retired && target !== QuestionRevisionStatus.retired) {
      throw new QuestionBankError("Revisi yang sudah retired tidak dapat diaktifkan kembali.", { code: "question_retired" });
    }
    if (current === QuestionRevisionStatus.ready && target !== QuestionRevisionStatus.ready && target !== QuestionRevisionStatus.retired) {
      throw new QuestionBankError("Revisi Ready tidak dapat diturunkan statusnya. Buat revisi baru untuk perubahan.", { code: "invalid_lifecycle_transition" });
    }
    if (target === QuestionRevisionStatus.ready) {
      if (!isCurrent) throw new QuestionBankError("Hanya revisi aktif yang dapat dipindahkan ke Ready.", { code: "invalid_lifecycle_transition" });
      if (!revision.question.questionBank) {
        // Standalone revisions predate the Bank Soal readiness contract and
        // intentionally have no Subtest requirement. Preserve that structural
        // predicate while keeping the typed failure used by the action.
        if (!isValidRevision(revision)) {
          throw new QuestionBankError("Revisi belum memenuhi syarat untuk Ready.", { code: "readiness_failed" });
        }
      } else {
        const issues = getQuestionReadinessFromRevision({
          questionId: revision.questionId,
          revision,
          subtestCode: revision.question.subtest?.code,
        });
        if (issues.length) {
          throw new QuestionBankError("Revisi belum memenuhi syarat untuk Ready.", {
            code: "readiness_failed",
            details: { questionId: revision.questionId },
            readiness: {
              incompleteCount: 1,
              issues,
              readyCount: 0,
              totalCount: 1,
            },
          });
        }
      }
    }
    if (target === QuestionRevisionStatus.draft && current !== QuestionRevisionStatus.draft && current !== QuestionRevisionStatus.review) {
      throw new QuestionBankError("Hanya revisi Draft atau Review yang dapat masuk ke Draft.", { code: "invalid_lifecycle_transition" });
    }
    if (target === QuestionRevisionStatus.review && current !== QuestionRevisionStatus.draft && current !== QuestionRevisionStatus.review) {
      throw new QuestionBankError("Hanya revisi Draft yang dapat masuk ke Review.", { code: "invalid_lifecycle_transition" });
    }

    const now = new Date();
    const readyAt = target === QuestionRevisionStatus.ready ? (revision.readyAt ?? now) : revision.readyAt;
    const retiredAt = target === QuestionRevisionStatus.retired ? (revision.retiredAt ?? now) : null;
    const questionStatus = target === QuestionRevisionStatus.ready
      ? ContentStatus.published
      : target === QuestionRevisionStatus.retired
        ? ContentStatus.archived
        : ContentStatus.draft;
    const changesCurrentLifecycle = isCurrent && (
      current !== target
      || (revision.readyAt?.getTime() ?? null) !== (readyAt?.getTime() ?? null)
      || (revision.retiredAt?.getTime() ?? null) !== (retiredAt?.getTime() ?? null)
      || revision.question.status !== questionStatus
    );
    const updated = await tx.questionRevision.update({
      where: { id: revision.id },
      data: {
        readyAt,
        retiredAt,
        status: target,
        updatedByUserId: actorId,
      },
    });
    if (isCurrent) {
      await tx.question.update({ where: { id: revision.questionId }, data: { status: questionStatus, updatedByUserId: actorId } });
    }
    const questionBank = revision.question.questionBank;
    const currentBankRevision = questionBank
      ? questionBank.revision + (changesCurrentLifecycle ? 1 : 0)
      : null;
    if (questionBank && changesCurrentLifecycle) {
      // Overwrite previews use this optimistic Bank version to detect changes
      // to current-question lifecycle state between preview and confirmation.
      await tx.questionBank.update({
        where: { id: questionBank.id },
        data: { revision: questionBank.revision + 1, updatedByUserId: actorId },
      });
    }
    return {
      id: updated.id,
      questionId: revision.questionId,
      revisionNo: updated.revisionNo,
      status: updated.status,
      ...(currentBankRevision === null ? {} : { bankRevision: currentBankRevision }),
    };
  });
}

async function deleteQuestionBank(
  id: string,
  actorId: string,
  editLease?: AuthoringEditLease,
) {
  return prisma.$transaction(async (tx) => {
    await assertAuthoringEditLease(
      tx,
      { resourceId: id, resourceType: "question_bank" },
      actorId,
      editLease,
    );
    await tx.$queryRaw`SELECT id FROM question_banks WHERE id = ${id}::uuid FOR UPDATE`;
    const bank = await tx.questionBank.findUnique({ where: { id }, select: { id: true, revision: true, status: true, updatedByUserId: true } });
    if (!bank) throw new QuestionBankError("Bank Soal tidak ditemukan.", { code: "not_found" });
    const modifierId = actorId;

    const [sourceQuizCount, adaptiveSessionCount, referencedQuestionCount, referencedOptionCount] = await Promise.all([
      tx.standaloneQuiz.count({ where: { sourceBankId: id } }),
      tx.adaptivePracticeSession.count({ where: { fallbackQuestionBankId: id } }),
      tx.question.count({
        where: {
          questionBankId: id,
          OR: [
            { quizItems: { some: {} } },
            { standaloneQuizItems: { some: {} } },
            { tryoutItems: { some: {} } },
            { quizAnswers: { some: {} } },
            { dailyMissionQuestion: { some: {} } },
            { adaptivePracticeAnswers: { some: {} } },
          ],
        },
      }),
      tx.questionOption.count({
        where: {
          question: { questionBankId: id },
          OR: [
            { quizAnswers: { some: {} } },
            { standaloneQuizItemOptions: { some: {} } },
            { tryoutItemOptions: { some: {} } },
          ],
        },
      }),
    ]);

    if (sourceQuizCount || adaptiveSessionCount || referencedQuestionCount || referencedOptionCount) {
      throw new QuestionBankError("Bank Soal tidak dapat dihapus karena sudah digunakan oleh Quiz, Tryout, atau sesi belajar.");
    }

    const currentQuestions = await tx.question.findMany({
      where: { questionBankId: id },
      select: { currentRevision: { select: { status: true } }, status: true },
    });
    const changesCurrentBankState = bank.status !== ContentStatus.archived
      || currentQuestions.some((question) =>
        question.status !== ContentStatus.archived
        || question.currentRevision.status !== QuestionRevisionStatus.retired,
      );

    // Question identities and their revisions are historical authorities once
    // the physical revision boundary exists. Keep them addressable and
    // archive the bank instead of attempting a cascading delete that would
    // destroy or orphan revision/source references.
    await tx.questionRevision.updateMany({
      where: { question: { questionBankId: id }, status: { not: QuestionRevisionStatus.retired } },
      data: { retiredAt: new Date(), status: QuestionRevisionStatus.retired, updatedByUserId: modifierId },
    });
    await tx.question.updateMany({ where: { questionBankId: id }, data: { status: ContentStatus.archived, updatedByUserId: modifierId } });
    await tx.questionBank.update({
      where: { id },
      data: {
        revision: bank.revision + (changesCurrentBankState ? 1 : 0),
        status: ContentStatus.archived,
        updatedByUserId: modifierId,
      },
    });
    return { id };
  });
}

export {
  assignQuestionBankCategories,
  buildQuestionBankFolderTree,
  createQuestionBankCategory,
  createQuestionBankFolder,
  deleteQuestionBank,
  getQuestionBankForEdit,
  getQuestionBankFolderPath,
  listQuestionBankCategories,
  listQuestionBankFolderTree,
  listQuestionBankFolders,
  listQuestionBankPage,
  listQuestionBankSourcePage,
  listQuestionBankSourceQuestions,
  listQuestionBankSources,
  listQuestionBanks,
  moveQuestionBankFolder,
  moveQuestionBanksToFolder,
  QuestionBankError,
  QuestionBankOrganizationError,
  removeQuestionBankCategory,
  removeQuestionBankCategoryAssignment,
  removeQuestionBankFolder,
  renameQuestionBankCategory,
  renameQuestionBankFolder,
  saveQuestionBank,
  setQuestionBankCategories,
  updateQuestionRevisionLifecycle,
  updateQuestionBankLifecycle,
  ensureQuestionBankMediaFolder,
  reserveDraftQuestionBankMediaFolder,
};
export type {
  ListQuestionBanksOptions,
  ListQuestionBankSourceOptions,
  ListQuestionBankSourceQuestionsOptions,
  QuestionBankSort,
  BankQuestionDto,
  QuestionBankDiscovery,
  QuestionBankDto,
  QuestionBankEditDto,
  QuestionBankEntry,
  QuestionBankFolderPath,
  QuestionBankListPage,
  QuestionBankOrganization,
  QuestionBankSourceEntry,
  QuestionBankSourcePage,
  QuestionBankSourceQuestionPage,
  QuestionBankErrorCode,
  QuestionRevisionLifecycleStatus,
  QuestionRevisionLifecycleOptions,
  QuestionBankLifecycleOptions,
  SaveBankInput,
};
