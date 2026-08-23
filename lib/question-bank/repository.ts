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
import { questionRevisionContentDigest } from "@/lib/question-bank/revision";
import { CANONICAL_2PL_MODEL_VERSION } from "@/lib/tryout/cat-profile";
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

const SUBJECT_CODES = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"] as const;
const TEMPORARY_QUESTION_ID_PATTERN = /^(?:pu|ppu|pbm|pk|lbi|lbe|pm)-question-\d+$/i;

type BankChoiceInput = { id: string; mediaAssetId?: string; text: string };
type BankQuestionInput = {
  choices: BankChoiceInput[];
  correctChoiceId: string;
  difficulty: "easy" | "medium" | "hard";
  explanation: string;
  explanationMediaAssetId?: string;
  id?: string;
  prompt: string;
  promptMediaAssetId?: string;
  subjectCode: string;
};
type SaveBankInput = {
  description: string;
  id?: string;
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
  subjectCoverage: string[];
};
type BankQuestionDto = {
  bankId: string;
  catReady?: boolean;
  choices: Array<{ id: string; mediaAssetId?: string; text: string }>;
  correctChoiceId: string;
  difficulty: "easy" | "medium" | "hard";
  explanation: string;
  explanationMediaAssetId?: string;
  id: string;
  prompt: string;
  promptMediaAssetId?: string;
  questionContentDigest?: string;
  questionRevisionId?: string;
  questionRevisionNo?: number;
  questionRevisionProvenance?: QuestionRevisionProvenance;
  questionRevisionStatus?: QuestionRevisionStatus;
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
  search?: string;
  sort?: QuestionBankSort;
  status?: ContentStatus;
  subjectCoverage?: string[];
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
  updatedAt: Date;
};

function toBankDifficulty(value: DifficultyLevel): "easy" | "medium" | "hard" {
  if (value === DifficultyLevel.easy) return "easy";
  if (value === DifficultyLevel.hard) return "hard";
  return "medium";
}

function isReadyAsset(asset: { state: string } | null) { return !asset || asset.state === "ready"; }

type RevisionReadinessRecord = Pick<QuestionRevisionRecord, "status" | "stem" | "options" | "promptAsset" | "explanationAsset">;

function isValidRevision(revision: Pick<RevisionReadinessRecord, "stem" | "options" | "promptAsset" | "explanationAsset"> | null) {
  return Boolean(revision
    && revision.stem.trim()
    && revision.options.length >= 2
    && revision.options.length <= 5
    && revision.options.filter((option) => option.isCorrect).length === 1
    && revision.options.every((option) => option.content.trim() && isReadyAsset(option.asset))
    && isReadyAsset(revision.promptAsset)
    && isReadyAsset(revision.explanationAsset));
}

function isReadyRevision(revision: RevisionReadinessRecord | null) {
  return Boolean(revision?.status === QuestionRevisionStatus.ready && isValidRevision(revision));
}

type BankMetrics = {
  questionCount: number;
  readyCount: number;
  subjectCoverage: string[];
};

function toBankQuestionDto(question: Pick<BankQuestionRecord, "id" | "status" | "stem" | "difficulty" | "explanation" | "explanationAssetId" | "promptAssetId" | "options" | "subtest" | "currentRevision">, bankId: string, catReady = false): BankQuestionDto {
  const revision = question.currentRevision;
  const options = revision?.options ?? question.options;
  const stem = revision?.stem ?? question.stem;
  const explanation = revision?.explanation ?? question.explanation;
  const explanationAssetId = revision?.explanationAssetId ?? question.explanationAssetId;
  const promptAssetId = revision?.promptAssetId ?? question.promptAssetId;
  const status = revision?.status === QuestionRevisionStatus.ready
    ? ContentStatus.published
    : revision?.status === QuestionRevisionStatus.retired
      ? ContentStatus.archived
      : ContentStatus.draft;
  return {
    bankId,
    catReady,
    choices: options.map((option) => ({ id: option.id, mediaAssetId: option.assetId ?? undefined, text: option.content })),
    correctChoiceId: options.find((option) => option.isCorrect)?.id ?? options[0]?.id ?? "",
    difficulty: toBankDifficulty(revision?.difficulty ?? question.difficulty),
    explanation: explanation ?? "",
    explanationMediaAssetId: explanationAssetId ?? undefined,
    id: question.id,
    prompt: stem,
    promptMediaAssetId: promptAssetId ?? undefined,
    questionContentDigest: revision?.contentDigest,
    questionRevisionId: revision?.id,
    questionRevisionNo: revision?.revisionNo,
    questionRevisionProvenance: revision?.provenance,
    questionRevisionStatus: revision?.status,
    subjectCode: question.subtest?.code ?? "",
    status,
    tags: [] as string[],
  };
}

function toCatalogDto(bank: BankCatalogRecord, folderRows: readonly FolderRow[], metrics: BankMetrics): QuestionBankCatalogEntry {
  const folderPath = folderPathFromRows(bank.folder?.id ?? null, folderRows);
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
      href: `/mentor/quiz/question-bank/${bank.id}`,
      id: bank.id,
      primaryMetric: `${metrics.questionCount} soal`,
      progress: metrics.questionCount ? Math.round(metrics.readyCount / metrics.questionCount * 100) : 0,
      questionCount: metrics.questionCount,
      resourceType: "question-bank" as const,
      reusableIn: ["Quiz", "Tryout"],
      revision: bank.revision,
      status: bank.status,
      subjectCoverage: metrics.subjectCoverage,
      title: bank.name,
      updatedAt: bank.updatedAt.toISOString(),
    } satisfies QuestionBankDto,
  };
}

async function getBankMetrics(bankIds: readonly string[]): Promise<Map<string, BankMetrics>> {
  if (!bankIds.length) return new Map();
  const ids = Prisma.join(bankIds.map((id) => Prisma.sql`${id}::uuid`));
  const rows = await prisma.$queryRaw<Array<{ bankId: string; questionCount: number; readyCount: number; subjectCoverage: string[] | null }>>(Prisma.sql`
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
      SELECT q.id AS question_id, q.question_bank_id, q.subtest_id, r.*, option_rollup.option_count,
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
          AND active_revisions.correct_count = 1
          AND active_revisions.options_ready
          AND (pa.id IS NULL OR pa.state = 'ready')
          AND (ea.id IS NULL OR ea.state = 'ready')
      )::int AS "readyCount",
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.code) FILTER (WHERE s.code IS NOT NULL), NULL) AS "subjectCoverage"
    FROM active_revisions
    LEFT JOIN subtests s ON s.id = active_revisions.subtest_id
    LEFT JOIN assets pa ON pa.id = active_revisions.prompt_asset_id
    LEFT JOIN assets ea ON ea.id = active_revisions.explanation_asset_id
    GROUP BY active_revisions.question_bank_id
  `);
  return new Map(rows.map((row) => [row.bankId, {
    questionCount: Number(row.questionCount),
    readyCount: Number(row.readyCount),
    subjectCoverage: row.subjectCoverage ?? [],
  }]));
}

function codeFromTitle(title: string) {
  return `${title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "bank-soal"}-${Date.now()}`.slice(0, 100);
}

function validate(input: SaveBankInput) {
  const subjectCodes = [...new Set(input.questions.map((question) => question.subjectCode))];
  const questionIds = input.questions.flatMap((question) => question.id ? [question.id] : []);
  if (!input.title.trim()) throw new QuestionBankError("Judul Bank Soal wajib diisi.");
  if (!subjectCodes.length || subjectCodes.some((subject) => !SUBJECT_CODES.includes(subject as (typeof SUBJECT_CODES)[number]))) {
    throw new QuestionBankError("Tambahkan minimal satu soal dengan subject yang valid.");
  }
  if (new Set(questionIds).size !== questionIds.length) {
    throw new QuestionBankError("Setiap soal hanya boleh muncul satu kali.", { code: "invalid_input" });
  }
  for (const question of input.questions) {
    if (question.choices.length < 2 || question.choices.length > 5) throw new QuestionBankError("Setiap soal harus memiliki 2 sampai 5 opsi.");
    if (new Set(question.choices.map((choice) => choice.id)).size !== question.choices.length || !question.choices.some((choice) => choice.id === question.correctChoiceId)) {
      throw new QuestionBankError("Opsi jawaban soal tidak valid.");
    }
  }
  return subjectCodes;
}

async function getFolderRows(client: typeof prisma | Prisma.TransactionClient = prisma): Promise<FolderRow[]> {
  return client.questionBankFolder.findMany({
    select: { id: true, name: true, parentId: true, updatedAt: true },
  });
}

function toDto(
  bank: Prisma.QuestionBankGetPayload<{ include: typeof bankInclude }>,
  folderRows: readonly FolderRow[],
): QuestionBankEditDto {
  // The editor and catalogue represent the active inventory. Archived rows
  // remain in the database for snapshot/history integrity but are intentionally
  // excluded from counts, readiness, and the editable question list.
  const activeQuestionRecords = bank.questions.filter((question) => question.status !== ContentStatus.archived);
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
  const catalog = toCatalogDto(bank, folderRows, {
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
  if (options.folderId !== undefined) conditions.push({ folderId: options.folderId });
  if (options.status) conditions.push({ status: options.status });
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
      { questions: { some: { status: { not: ContentStatus.archived }, subtest: { code: { contains: search, mode: "insensitive" } } } } },
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
    items: records.map((record) => toCatalogDto(record, folderRows, metrics.get(record.id) ?? { questionCount: 0, readyCount: 0, subjectCoverage: [] })),
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
        AND (SELECT COUNT(*) FROM question_revision_options rc WHERE rc.question_revision_id = ${Prisma.raw(`${revisionAlias}.id`)} AND rc.is_correct) = 1
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

function buildSourceBankWhereSql(options: ListQuestionBanksOptions = {}): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
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
      OR EXISTS (SELECT 1 FROM question_bank_folders bf WHERE bf.id = b.folder_id AND bf.name ILIKE ${needle})
      OR EXISTS (
        SELECT 1 FROM question_bank_category_assignments bs
        JOIN question_bank_categories bc ON bc.id = bs.category_id
        WHERE bs.question_bank_id = b.id AND bc.name ILIKE ${needle}
      )
      OR EXISTS (
        SELECT 1 FROM questions bq
        JOIN subtests bqs ON bqs.id = bq.subtest_id
        WHERE bq.question_bank_id = b.id AND bq.status <> ${ContentStatus.archived} AND bqs.code ILIKE ${needle}
      )
    )`);
  }
  return Prisma.join(conditions, " AND ");
}

async function listQuestionBankSourcePage(options: ListQuestionBanksOptions & { page?: number; pageSize?: number } = {}): Promise<QuestionBankSourcePage> {
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
    prisma.questionBank.findMany({ where: { id: { in: ids } }, include: bankCatalogInclude }),
    getFolderRows(),
    getBankMetrics(ids),
  ]);
  const recordById = new Map(records.map((record) => [record.id, record]));
  return {
    items: ids.flatMap((id) => {
      const record = recordById.get(id);
      if (!record) return [];
      return [toCatalogDto(record, folderRows, metrics.get(id) ?? { questionCount: 0, readyCount: 0, subjectCoverage: [] })];
    }),
    page,
    pageSize,
    total: rows[0]?.total ?? 0,
  };
}

async function listQuestionBankSourceQuestions(bankId: string, options: { page?: number; pageSize?: number; search?: string; subjectCode?: string } = {}): Promise<QuestionBankSourceQuestionPage | null> {
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 100));
  const page = Math.max(1, options.page ?? 1);
  const questionConditions: Prisma.Sql[] = [
    Prisma.sql`q.question_bank_id = ${bankId}::uuid`,
    Prisma.sql`q.status <> ${ContentStatus.archived}`,
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
  const bank = await prisma.questionBank.findUnique({ where: { id: bankId }, include: bankCatalogInclude });
  if (!bank || bank.status === ContentStatus.archived) return null;
  const [folderRows, metrics] = await Promise.all([getFolderRows(), getBankMetrics([bankId])]);
  const bankDto = toCatalogDto(bank, folderRows, metrics.get(bankId) ?? { questionCount: 0, readyCount: 0, subjectCoverage: [] }).bank;
  const ids = rows.map((row) => row.id);
  if (!ids.length) {
    const [{ total }] = await prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`SELECT COUNT(*)::int AS total FROM questions q JOIN question_revisions qr ON qr.id = q.current_revision_id WHERE ${Prisma.join(questionConditions, " AND ")}`);
    return { bank: bankDto, page, pageSize, questions: [], total: Number(total) };
  }
  const records = await prisma.question.findMany({ where: { id: { in: ids } }, include: sourceQuestionInclude });
  const revisionIds = records.flatMap((record) => record.currentRevision?.id ? [record.currentRevision.id] : []);
  const calibrations = revisionIds.length
    ? await prisma.twoPlQuestionCalibration.findMany({ where: { approvalState: "approved", modelVersion: CANONICAL_2PL_MODEL_VERSION, questionRevisionId: { in: revisionIds } }, select: { contentDigest: true, difficulty: true, discrimination: true, questionId: true, questionRevisionId: true, sourceRevisionProvenance: true } })
    : [];
  const calibrationByRevision = new Map(calibrations.map((calibration) => [calibration.questionRevisionId, calibration]));
  const recordById = new Map(records.map((record) => [record.id, record]));
  return {
    bank: bankDto,
    page,
    pageSize,
    questions: ids.flatMap((id) => {
      const record = recordById.get(id);
      const revision = record?.currentRevision;
      const calibration = revision ? calibrationByRevision.get(revision.id) : undefined;
      const catReady = Boolean(revision
        && calibration
        && calibration.questionId === record?.id
        && calibration.contentDigest === revision.contentDigest
        && Number.isFinite(Number(calibration.difficulty))
        && Number.isFinite(Number(calibration.discrimination))
        && Number(calibration.discrimination) > 0
        && calibration.sourceRevisionProvenance !== QuestionRevisionProvenance.legacy_unknown);
      return record ? [toBankQuestionDto(record as SourceQuestionRecord, bankId, catReady)] : [];
    }),
    total: rows[0]?.total ?? 0,
  };
}

async function listQuestionBankSources(options: ListQuestionBanksOptions = {}) {
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
  return input.choices.map((choice, optionIndex) => ({
    assetId: choice.mediaAssetId || null,
    content: choice.text,
    isCorrect: choice.id === input.correctChoiceId,
    label: String.fromCharCode(65 + optionIndex),
    sortOrder: optionIndex,
  }));
}

type CanonicalQuestionContent = {
  digest: string;
  questionId: string;
  subtestCode: string | null;
};

function canonicalDigestFromInput(input: BankQuestionInput, options = revisionOptionWrites(input)) {
  return questionRevisionContentDigest({
    difficulty: input.difficulty,
    explanation: input.explanation.trim() || null,
    explanationAssetId: input.explanationMediaAssetId || null,
    options,
    prompt: input.prompt,
    promptAssetId: input.promptMediaAssetId || null,
    questionType: QuestionType.single_choice,
  });
}

function canonicalDigestFromRevision(revision: {
  difficulty: DifficultyLevel;
  explanation: string | null;
  explanationAssetId: string | null;
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
    questionId: question.id,
    subtestCode,
  };
}

function canonicalQuestionFromRecord(question: {
  currentRevision: Parameters<typeof canonicalDigestFromRevision>[0] | null;
  id: string;
  subtest: { code: string } | null;
}): CanonicalQuestionContent | null {
  const revision = question.currentRevision;
  if (!revision) return null;
  return {
    digest: canonicalDigestFromRevision(revision),
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
    && left.digest === right.digest);
}

type QuestionContentRecord = Parameters<typeof canonicalQuestionFromRecord>[0] & {
  status: ContentStatus;
};

function publishedQuestionRecords(existing: readonly QuestionContentRecord[]) {
  return existing.filter((question) => (
    question.status !== ContentStatus.archived
    && question.currentRevision?.status === QuestionRevisionStatus.ready
  ));
}

function assertPublishedQuestionContentUnchanged(
  input: SaveBankInput,
  existing: readonly QuestionContentRecord[],
  subtestByCode: ReadonlyMap<string, { id: string; code: string }>,
) {
  const published = publishedQuestionRecords(existing);
  const publishedById = new Map(published.map((question) => [question.id, question]));
  const incomingById = new Map(input.questions.flatMap((question) => {
    if (!question.id) return [];
    const subtest = subtestByCode.get(question.subjectCode);
    return [[question.id, canonicalQuestionFromInput(question, subtest?.code ?? null)] as const];
  }));
  const changedQuestionIds: string[] = [];
  const addedQuestionIds: string[] = [];
  const removedQuestionIds: string[] = [];
  const incomingPublishedIds = input.questions.flatMap((question) => (
    question.id && publishedById.has(question.id) ? [question.id] : []
  ));
  const reordered = incomingPublishedIds.length === published.length
    && incomingPublishedIds.some((questionId, index) => questionId !== published[index]?.id);

  for (const question of published) {
    const incoming = incomingById.get(question.id);
    if (!incoming) {
      removedQuestionIds.push(question.id);
      continue;
    }
    if (!sameCanonicalQuestionContent(canonicalQuestionFromRecord(question), incoming)) {
      changedQuestionIds.push(question.id);
    }
  }
  for (const question of input.questions) {
    if (!question.id || !publishedById.has(question.id)) {
      addedQuestionIds.push(question.id ?? "new");
    }
  }

  if (!changedQuestionIds.length && !addedQuestionIds.length && !removedQuestionIds.length && !reordered) return;
  throw new QuestionBankError(
    "Konten soal yang sudah diterbitkan terkunci. Pilih ‘Jadikan draf’ terlebih dahulu.",
    {
      attemptedInput: input,
      code: "published_content_locked",
      details: {
        addedQuestionIds,
        changedQuestionIds,
        removedQuestionIds,
        reordered,
      },
    },
  );
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
    promptAssetId: string | null;
  },
) {
  const contentDigest = questionRevisionContentDigest({
    difficulty: input.difficulty,
    explanation: input.explanation,
    explanationAssetId: input.explanationAssetId,
    options: input.options,
    prompt: input.stem,
    promptAssetId: input.promptAssetId,
    questionType: QuestionType.single_choice,
  });
  const revision = await tx.questionRevision.create({
    data: {
      id: input.id,
      contentDigest,
      createdByUserId: input.actorId,
      difficulty: input.difficulty,
      explanation: input.explanation,
      explanationAssetId: input.explanationAssetId,
      promptAssetId: input.promptAssetId,
      provenance: QuestionRevisionProvenance.authored,
      questionId: input.questionId,
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
    promptAssetId: string | null;
  },
) {
  const contentDigest = questionRevisionContentDigest({
    difficulty: input.difficulty,
    explanation: input.explanation,
    explanationAssetId: input.explanationAssetId,
    options: input.options,
    prompt: input.stem,
    promptAssetId: input.promptAssetId,
    questionType: QuestionType.single_choice,
  });
  await tx.questionRevision.update({
    where: { id: revision.id },
    data: {
      contentDigest,
      difficulty: input.difficulty,
      explanation: input.explanation,
      explanationAssetId: input.explanationAssetId,
      promptAssetId: input.promptAssetId,
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
  await Promise.all(options.map(async (option, optionIndex) => {
    const old = existing.find((candidate) => candidate.sortOrder === optionIndex);
    if (old) {
      retained.add(old.id);
      await tx.questionOption.update({ where: { id: old.id }, data: option });
    } else {
      const created = await tx.questionOption.create({ data: { ...option, questionId } });
      retained.add(created.id);
    }
  }));
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
  return prisma.$transaction(async (tx) => {
    let bankId = input.id;
    let status: ContentStatus = ContentStatus.draft;
    if (bankId) {
      await tx.$queryRaw`SELECT id FROM question_banks WHERE id = ${bankId}::uuid FOR UPDATE`;
      const current = await tx.questionBank.findUnique({ where: { id: bankId } });
      if (!current) throw new QuestionBankError("Bank Soal tidak ditemukan.", { code: "not_found" });
      if (input.revision === undefined || current.revision !== input.revision) {
        throw new QuestionBankError("Bank Soal telah diperbarui. Muat ulang halaman lalu coba lagi.", { code: "stale_revision" });
      }
      if (current.status === ContentStatus.scheduled) {
        throw new QuestionBankError(
          "Bank Soal Terjadwal belum didukung untuk perubahan di editor ini.",
          { code: "scheduled_unsupported", details: { status: current.status } },
        );
      }
      if (current.status === ContentStatus.archived) {
        throw new QuestionBankError(
          "Bank Soal yang diarsipkan harus dipulihkan sebelum isinya dapat diubah.",
          { code: "archived_locked" },
        );
      }
      status = current.status;
    }

    const subtests = await tx.subtest.findMany({ where: { code: { in: subjectCodes } } });
    const subtestByCode = new Map(subtests.map((subtest) => [subtest.code, subtest]));
    if (!bankId) {
      const created = await tx.questionBank.create({
        data: {
          code: codeFromTitle(input.title),
          description: input.description.trim() || null,
          name: input.title.trim(),
          createdByUserId: actorId,
          updatedByUserId: actorId,
        },
      });
      bankId = created.id;
    }
    const persistedBankId = bankId;
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

    if (status === ContentStatus.published) {
      assertPublishedQuestionContentUnchanged(input, existing, subtestByCode);
    }

    if (input.id) {
      await tx.questionBank.update({
        where: { id: persistedBankId },
        data: {
          description: input.description.trim() || null,
          name: input.title.trim(),
          revision: { increment: 1 },
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
      const data = {
        difficulty: question.difficulty as DifficultyLevel,
        explanation: question.explanation.trim() || null,
        explanationAssetId: question.explanationMediaAssetId || null,
        promptAssetId: question.promptMediaAssetId || null,
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
          options,
          promptAssetId: data.promptAssetId,
          questionId: saved.id,
          revisionNo: 1,
          stem: data.stem,
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
          options,
          promptAssetId: data.promptAssetId,
          questionId: current.id,
          revisionNo: nextRevisionNo,
          stem: data.stem,
        });
        await tx.question.update({ where: { id: current.id }, data: { ...data, currentRevisionId: revision.id, revision: nextRevisionNo } });
      } else {
        await updateDraftQuestionRevision(tx, currentRevision, {
          actorId,
          difficulty: data.difficulty,
          explanation: data.explanation,
          explanationAssetId: data.explanationAssetId,
          options,
          promptAssetId: data.promptAssetId,
          stem: data.stem,
        });
        // QuestionRevision is now the content authority. Keep the legacy
        // QuestionOption projection stable so historical source-option IDs
        // cannot silently change when a draft is edited.
        await tx.question.update({ where: { id: current.id }, data: { ...data, currentRevisionId: currentRevision.id } });
      }
    }
    const removed = existing.filter((question) => !retainedIds.has(question.id));
    for (const question of removed) {
      if (question.currentRevision && question.currentRevision.status !== QuestionRevisionStatus.retired) {
        await tx.questionRevision.update({ where: { id: question.currentRevision.id }, data: { retiredAt: new Date(), status: QuestionRevisionStatus.retired, updatedByUserId: actorId } });
      }
      await tx.question.update({ where: { id: question.id }, data: { status: ContentStatus.archived, updatedByUserId: actorId } });
    }
    const saved = await tx.questionBank.findUniqueOrThrow({ where: { id: persistedBankId }, include: bankInclude });
    const folderRows = await getFolderRows(tx);
    return toDto(saved, folderRows);
  });
}

type QuestionBankLifecycleOptions = { expectedRevision: number };

async function updateQuestionBankLifecycle(id: string, operation: "publish" | "unpublish" | "archive" | "restore", actorId: string, options: QuestionBankLifecycleOptions) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM question_banks WHERE id = ${id}::uuid FOR UPDATE`;
    const bank = await tx.questionBank.findUnique({ where: { id }, include: bankInclude });
    if (!bank) throw new QuestionBankError("Bank Soal tidak ditemukan.", { code: "not_found" });
    if (bank.revision !== options.expectedRevision) {
      throw new QuestionBankError("Bank Soal telah diperbarui. Muat ulang halaman lalu coba lagi.", { code: "stale_revision" });
    }
    if (bank.status === ContentStatus.scheduled) {
      throw new QuestionBankError(
        "Bank Soal Terjadwal belum didukung untuk perubahan di editor ini.",
        { code: "scheduled_unsupported", details: { status: bank.status, operation } },
      );
    }

    const allowedOperations: Record<ContentStatus, readonly string[]> = {
      [ContentStatus.draft]: ["publish", "archive"],
      [ContentStatus.published]: ["unpublish", "archive"],
      [ContentStatus.archived]: ["restore"],
      [ContentStatus.scheduled]: [],
    };
    if (!allowedOperations[bank.status]?.includes(operation)) {
      throw new QuestionBankError(
        "Perubahan status Bank Soal tidak diizinkan dari status saat ini.",
        {
          code: "invalid_lifecycle_transition",
          details: { from: bank.status, operation },
        },
      );
    }

    const activeQuestions = bank.questions.filter((question) => question.status !== ContentStatus.archived && question.currentRevision?.status !== QuestionRevisionStatus.retired);
    const readiness = getQuestionBankReadinessFromRevisions(activeQuestions.map((question) => ({
      questionId: question.id,
      revision: question.currentRevision,
      subtestCode: question.subtest?.code,
    })));
    if (operation === "publish") {
      if (!activeQuestions.length || readiness.issues.length) {
        throw new QuestionBankError(
          "Lengkapi soal yang masih bermasalah sebelum menerbitkan Bank Soal.",
          {
            code: "readiness_failed",
            details: { activeQuestionCount: activeQuestions.length },
            readiness,
          },
        );
      }
    }
    const status = operation === "publish" ? ContentStatus.published : operation === "archive" ? ContentStatus.archived : ContentStatus.draft;
    const revision = bank.revision + 1;
    await tx.questionBank.update({ where: { id }, data: { status, revision, updatedByUserId: actorId } });
    // Bank lifecycle controls source availability. Historical questions that
    // were intentionally removed remain archived; only active rows follow a
    // publish/unpublish transition. Archiving the bank itself does not erase
    // the active-question state needed for a safe restore.
    if (operation === "publish") {
      for (const question of activeQuestions) {
        if (question.currentRevision?.status !== QuestionRevisionStatus.ready) {
          await tx.questionRevision.update({ where: { id: question.currentRevision!.id }, data: { readyAt: new Date(), status: QuestionRevisionStatus.ready, updatedByUserId: actorId } });
        }
        await tx.question.update({ where: { id: question.id }, data: { status: ContentStatus.published, updatedByUserId: actorId } });
      }
    } else if (operation === "archive") {
      for (const question of activeQuestions) {
        await tx.question.update({ where: { id: question.id }, data: { status: ContentStatus.archived, updatedByUserId: actorId } });
      }
    } else if (operation === "restore") {
      for (const question of bank.questions) {
        if (question.status === ContentStatus.archived && question.currentRevision?.status !== QuestionRevisionStatus.retired) {
          await tx.question.update({ where: { id: question.id }, data: { status: ContentStatus.draft, updatedByUserId: actorId } });
        }
      }
    }
    return { id, revision, status };
  });
}

type QuestionRevisionLifecycleStatus = "draft" | "review" | "ready" | "retired";
type QuestionRevisionLifecycleOptions = { expectedStatus: QuestionRevisionLifecycleStatus; expectedUpdatedAt: string };

async function updateQuestionRevisionLifecycle(id: string, targetStatus: QuestionRevisionLifecycleStatus, actorId: string, options: QuestionRevisionLifecycleOptions) {
  return prisma.$transaction(async (tx) => {
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
            questionBank: { select: { status: true } },
            subtest: { select: { code: true } },
          },
        },
      },
    });
    if (!revision) throw new QuestionBankError("Revisi soal tidak ditemukan.", { code: "not_found" });
    if (revision.question.questionBank?.status === ContentStatus.scheduled) {
      throw new QuestionBankError(
        "Bank Soal Terjadwal belum didukung untuk perubahan di editor ini.",
        { code: "scheduled_unsupported", details: { status: revision.question.questionBank.status } },
      );
    }
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
    const updated = await tx.questionRevision.update({
      where: { id: revision.id },
      data: {
        readyAt: target === QuestionRevisionStatus.ready ? (revision.readyAt ?? now) : revision.readyAt,
        retiredAt: target === QuestionRevisionStatus.retired ? (revision.retiredAt ?? now) : null,
        status: target,
        updatedByUserId: actorId,
      },
    });
    if (isCurrent) {
      const questionStatus = target === QuestionRevisionStatus.ready
        ? ContentStatus.published
        : target === QuestionRevisionStatus.retired
          ? ContentStatus.archived
          : ContentStatus.draft;
      await tx.question.update({ where: { id: revision.questionId }, data: { status: questionStatus, updatedByUserId: actorId } });
    }
    return { id: updated.id, questionId: revision.questionId, revisionNo: updated.revisionNo, status: updated.status };
  });
}

async function deleteQuestionBank(id: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM question_banks WHERE id = ${id}::uuid FOR UPDATE`;
    const bank = await tx.questionBank.findUnique({ where: { id }, select: { id: true, status: true, updatedByUserId: true } });
    if (!bank) throw new QuestionBankError("Bank Soal tidak ditemukan.", { code: "not_found" });
    if (bank.status === ContentStatus.scheduled) {
      throw new QuestionBankError(
        "Bank Soal Terjadwal belum didukung untuk perubahan di editor ini.",
        { code: "scheduled_unsupported", details: { status: bank.status, operation: "delete" } },
      );
    }
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

    // Question identities and their revisions are historical authorities once
    // the physical revision boundary exists. Keep them addressable and
    // archive the bank instead of attempting a cascading delete that would
    // destroy or orphan revision/source references.
    await tx.questionRevision.updateMany({
      where: { question: { questionBankId: id }, status: { not: QuestionRevisionStatus.retired } },
      data: { retiredAt: new Date(), status: QuestionRevisionStatus.retired, updatedByUserId: modifierId },
    });
    await tx.question.updateMany({ where: { questionBankId: id }, data: { status: ContentStatus.archived, updatedByUserId: modifierId } });
    await tx.questionBank.update({ where: { id }, data: { status: ContentStatus.archived, updatedByUserId: modifierId } });
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
};
export type {
  ListQuestionBanksOptions,
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
