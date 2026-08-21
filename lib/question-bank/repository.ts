import "server-only";

import { ContentStatus, DifficultyLevel, Prisma } from "@/generated/prisma/client";

import { prisma } from "@/lib/prisma";

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
} from "./organization";

const SUBJECT_CODES = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"] as const;

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
  choices: Array<{ id: string; mediaAssetId?: string; text: string }>;
  correctChoiceId: string;
  difficulty: "easy" | "medium" | "hard";
  explanation: string;
  explanationMediaAssetId?: string;
  id: string;
  prompt: string;
  promptMediaAssetId?: string;
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
type QuestionBankEntry = { bank: QuestionBankDto; questions: BankQuestionDto[] };
type QuestionBankCatalogEntry = { bank: QuestionBankDto };
type QuestionBankSourceEntry = { bank: QuestionBankDto };

type ListQuestionBanksOptions = {
  categoryId?: string;
  categoryIds?: string[];
  folderId?: string | null;
  search?: string;
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
  explanationAsset: true,
  options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } },
  promptAsset: true,
  subtest: { select: { code: true } },
} satisfies Prisma.QuestionInclude;

type BankQuestionRecord = Prisma.QuestionBankGetPayload<{ include: typeof bankInclude }>["questions"][number];
type BankCatalogRecord = Prisma.QuestionBankGetPayload<{ include: typeof bankCatalogInclude }>;
type SourceQuestionRecord = Prisma.QuestionGetPayload<{ include: typeof sourceQuestionInclude }>;

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

function isReadyBankQuestion(question: Pick<BankQuestionRecord, "status" | "stem" | "options" | "promptAsset" | "explanationAsset">) {
  return Boolean(question.status === ContentStatus.published
    && question.stem.trim()
    && question.options.length >= 2
    && question.options.length <= 5
    && question.options.filter((option) => option.isCorrect).length === 1
    && question.options.every((option) => option.content.trim() && isReadyAsset(option.asset))
    && isReadyAsset(question.promptAsset)
    && isReadyAsset(question.explanationAsset));
}

type BankMetrics = {
  questionCount: number;
  readyCount: number;
  subjectCoverage: string[];
};

function toBankQuestionDto(question: Pick<BankQuestionRecord, "id" | "status" | "stem" | "difficulty" | "explanation" | "explanationAssetId" | "promptAssetId" | "options" | "subtest">, bankId: string): BankQuestionDto {
  return {
    bankId,
    choices: question.options.map((option) => ({ id: option.id, mediaAssetId: option.assetId ?? undefined, text: option.content })),
    correctChoiceId: question.options.find((option) => option.isCorrect)?.id ?? question.options[0]?.id ?? "",
    difficulty: toBankDifficulty(question.difficulty),
    explanation: question.explanation ?? "",
    explanationMediaAssetId: question.explanationAssetId ?? undefined,
    id: question.id,
    prompt: question.stem,
    promptMediaAssetId: question.promptAssetId ?? undefined,
    subjectCode: question.subtest?.code ?? "",
    status: question.status,
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
      SELECT q.id AS question_id,
        COUNT(qo.id)::int AS option_count,
        COUNT(qo.id) FILTER (WHERE qo.is_correct)::int AS correct_count,
        COALESCE(BOOL_AND(BTRIM(qo.content) <> '' AND (qa.id IS NULL OR qa.state = 'ready')), TRUE) AS options_ready
      FROM questions q
      LEFT JOIN question_options qo ON qo.question_id = q.id
      LEFT JOIN assets qa ON qa.id = qo.asset_id
      WHERE q.question_bank_id IN (${ids}) AND q.status <> ${ContentStatus.archived}
      GROUP BY q.id
    )
    SELECT q.question_bank_id AS "bankId",
      COUNT(*)::int AS "questionCount",
      COUNT(*) FILTER (
        WHERE q.status = ${ContentStatus.published}
          AND BTRIM(q.stem) <> ''
          AND option_rollup.option_count BETWEEN 2 AND 5
          AND option_rollup.correct_count = 1
          AND option_rollup.options_ready
          AND (pa.id IS NULL OR pa.state = 'ready')
          AND (ea.id IS NULL OR ea.state = 'ready')
      )::int AS "readyCount",
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.code) FILTER (WHERE s.code IS NOT NULL), NULL) AS "subjectCoverage"
    FROM questions q
    JOIN option_rollup ON option_rollup.question_id = q.id
    LEFT JOIN subtests s ON s.id = q.subtest_id
    LEFT JOIN assets pa ON pa.id = q.prompt_asset_id
    LEFT JOIN assets ea ON ea.id = q.explanation_asset_id
    WHERE q.question_bank_id IN (${ids}) AND q.status <> ${ContentStatus.archived}
    GROUP BY q.question_bank_id
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
  if (!input.title.trim()) throw new QuestionBankError("Judul Bank Soal wajib diisi.");
  if (!subjectCodes.length || subjectCodes.some((subject) => !SUBJECT_CODES.includes(subject as (typeof SUBJECT_CODES)[number]))) {
    throw new QuestionBankError("Tambahkan minimal satu soal dengan subject yang valid.");
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
): QuestionBankEntry {
  // The editor and catalogue represent the active inventory. Archived rows
  // remain in the database for snapshot/history integrity but are intentionally
  // excluded from counts, readiness, and the editable question list.
  const activeQuestionRecords = bank.questions.filter((question) => question.status !== ContentStatus.archived);
  const questions: BankQuestionDto[] = activeQuestionRecords.map((question) => toBankQuestionDto(question, bank.id));
  const ready = activeQuestionRecords.filter(isReadyBankQuestion).length;
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
  const [records, total, folderRows] = await Promise.all([
    prisma.questionBank.findMany({ include: bankCatalogInclude, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize, where }),
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
  const bankCondition = bankAlias ? Prisma.sql`${Prisma.raw(`${questionAlias}.question_bank_id`)} = ${Prisma.raw(`${bankAlias}.id`)}` : Prisma.sql`TRUE`;
  return Prisma.sql`
    ${Prisma.raw(`${questionAlias}.status`)} = ${ContentStatus.published}
    AND ${bankCondition}
    AND BTRIM(${Prisma.raw(`${questionAlias}.stem`)}) <> ''
    AND (SELECT COUNT(*) FROM question_options ro WHERE ro.question_id = ${Prisma.raw(`${questionAlias}.id`)}) BETWEEN 2 AND 5
    AND (SELECT COUNT(*) FROM question_options rc WHERE rc.question_id = ${Prisma.raw(`${questionAlias}.id`)} AND rc.is_correct) = 1
    AND NOT EXISTS (
      SELECT 1 FROM question_options ri
      LEFT JOIN assets ria ON ria.id = ri.asset_id
      WHERE ri.question_id = ${Prisma.raw(`${questionAlias}.id`)}
        AND (BTRIM(ri.content) = '' OR (ria.id IS NOT NULL AND ria.state <> 'ready'))
    )
    AND (${Prisma.raw(`${questionAlias}.prompt_asset_id`)} IS NULL OR EXISTS (SELECT 1 FROM assets rpa WHERE rpa.id = ${Prisma.raw(`${questionAlias}.prompt_asset_id`)} AND rpa.state = 'ready'))
    AND (${Prisma.raw(`${questionAlias}.explanation_asset_id`)} IS NULL OR EXISTS (SELECT 1 FROM assets rea WHERE rea.id = ${Prisma.raw(`${questionAlias}.explanation_asset_id`)} AND rea.state = 'ready'))
  `;
}

function buildSourceBankWhereSql(options: ListQuestionBanksOptions = {}): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`b.status = ${ContentStatus.published}`,
    Prisma.sql`EXISTS (SELECT 1 FROM questions rq WHERE rq.question_bank_id = b.id AND ${buildReadySourceQuestionCondition("rq", "b")})`,
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
    buildReadySourceQuestionCondition("q"),
  ];
  if (options.subjectCode) {
    questionConditions.push(Prisma.sql`EXISTS (SELECT 1 FROM subtests qs WHERE qs.id = q.subtest_id AND qs.code = ${options.subjectCode})`);
  }
  const search = options.search?.trim();
  if (search) {
    const needle = `%${search}%`;
    questionConditions.push(Prisma.sql`(
      q.stem ILIKE ${needle}
      OR COALESCE(q.explanation, '') ILIKE ${needle}
      OR EXISTS (SELECT 1 FROM question_options qso WHERE qso.question_id = q.id AND qso.content ILIKE ${needle})
    )`);
  }
  const rows = await prisma.$queryRaw<Array<{ id: string; total: number }>>(Prisma.sql`
    SELECT q.id, COUNT(*) OVER()::int AS total
    FROM questions q
    WHERE ${Prisma.join(questionConditions, " AND ")}
    ORDER BY q.created_at ASC, q.id ASC
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
  `);
  const bank = await prisma.questionBank.findUnique({ where: { id: bankId }, include: bankCatalogInclude });
  if (!bank || bank.status !== ContentStatus.published) return null;
  const [folderRows, metrics] = await Promise.all([getFolderRows(), getBankMetrics([bankId])]);
  const bankDto = toCatalogDto(bank, folderRows, metrics.get(bankId) ?? { questionCount: 0, readyCount: 0, subjectCoverage: [] }).bank;
  const ids = rows.map((row) => row.id);
  if (!ids.length) {
    const [{ total }] = await prisma.$queryRaw<Array<{ total: number }>>(Prisma.sql`SELECT COUNT(*)::int AS total FROM questions q WHERE ${Prisma.join(questionConditions, " AND ")}`);
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

async function listQuestionBankSources(options: ListQuestionBanksOptions = {}) {
  return (await listQuestionBankSourcePage({ ...options, page: 1, pageSize: 20 })).items;
}

async function saveQuestionBank(input: SaveBankInput, actorId: string) {
  const subjectCodes = validate(input);
  return prisma.$transaction(async (tx) => {
    let bankId = input.id;
    let status: ContentStatus = ContentStatus.draft;
    if (bankId) {
      await tx.$queryRaw`SELECT id FROM question_banks WHERE id = ${bankId}::uuid FOR UPDATE`;
      const current = await tx.questionBank.findUnique({ where: { id: bankId } });
      if (!current) throw new QuestionBankError("Bank Soal tidak ditemukan.");
      if (input.revision && current.revision !== input.revision) throw new QuestionBankError("Bank Soal telah diperbarui. Muat ulang halaman lalu coba lagi.");
      if (current.status === ContentStatus.archived) throw new QuestionBankError("Bank Soal yang diarsipkan harus dipulihkan sebelum isinya dapat diubah.");
      status = current.status;
      await tx.questionBank.update({ where: { id: bankId }, data: { description: input.description.trim() || null, name: input.title.trim(), revision: { increment: 1 }, updatedByUserId: actorId } });
    } else {
      const created = await tx.questionBank.create({ data: { code: codeFromTitle(input.title), description: input.description.trim() || null, name: input.title.trim(), createdByUserId: actorId, updatedByUserId: actorId } });
      bankId = created.id;
    }

    const subtests = await tx.subtest.findMany({ where: { code: { in: subjectCodes } } });
    const subtestByCode = new Map(subtests.map((subtest) => [subtest.code, subtest]));
    const existing = await tx.question.findMany({ where: { questionBankId: bankId }, include: { options: true } });
    const existingById = new Map(existing.map((question) => [question.id, question]));
    const retainedIds = new Set(
      await Promise.all(input.questions.map(async (question, questionIndex) => {
        const subtest = subtestByCode.get(question.subjectCode);
        if (!subtest) throw new QuestionBankError(`Subtest ${question.subjectCode} tidak ditemukan.`);
        const current = question.id ? existingById.get(question.id) : undefined;
        const data = { difficulty: question.difficulty as DifficultyLevel, explanation: question.explanation.trim() || null, explanationAssetId: question.explanationMediaAssetId || null, promptAssetId: question.promptMediaAssetId || null, stem: question.prompt, subtestId: subtest.id, topicId: null, status, updatedByUserId: actorId };
        const saved = current
          ? await tx.question.update({ where: { id: current.id }, data: { ...data, revision: { increment: 1 } } })
          : await tx.question.create({ data: { ...data, code: `${codeFromTitle(input.title)}-q${questionIndex + 1}`, createdByUserId: actorId, questionBankId: bankId } });

        await Promise.all(question.choices.map(async (choice, optionIndex) => {
          const old = current?.options.find((option) => option.id === choice.id) ?? current?.options.find((option) => option.sortOrder === optionIndex);
          const optionData = { assetId: choice.mediaAssetId || null, content: choice.text, isCorrect: choice.id === question.correctChoiceId || old?.id === question.correctChoiceId, label: String.fromCharCode(65 + optionIndex), sortOrder: optionIndex };
          if (old) await tx.questionOption.update({ where: { id: old.id }, data: optionData });
          else await tx.questionOption.create({ data: { ...optionData, questionId: saved.id } });
        }));
        const extras = current?.options.filter((option) => option.sortOrder >= question.choices.length) ?? [];
        if (extras.length) await tx.questionOption.deleteMany({ where: { id: { in: extras.map((option) => option.id) }, standaloneQuizItemOptions: { none: {} }, tryoutItemOptions: { none: {} } } });
        return saved.id;
      })),
    );
    await tx.question.updateMany({ where: { questionBankId: bankId, id: { notIn: [...retainedIds] } }, data: { status: ContentStatus.archived, updatedByUserId: actorId } });
    const saved = await tx.questionBank.findUniqueOrThrow({ where: { id: bankId }, include: bankInclude });
    const folderRows = await getFolderRows(tx);
    return toDto(saved, folderRows);
  });
}

async function updateQuestionBankLifecycle(id: string, operation: "publish" | "unpublish" | "archive" | "restore", actorId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM question_banks WHERE id = ${id}::uuid FOR UPDATE`;
    const bank = await tx.questionBank.findUnique({ where: { id }, include: bankInclude });
    if (!bank) throw new QuestionBankError("Bank Soal tidak ditemukan.");
    const activeQuestions = bank.questions.filter((question) => question.status !== ContentStatus.archived);
    if (operation === "publish") {
      if (!activeQuestions.length || activeQuestions.some((question) => !question.stem.trim() || question.options.length < 2 || question.options.length > 5 || question.options.some((option) => !option.content.trim()) || question.options.filter((option) => option.isCorrect).length !== 1 || !question.subtestId)) throw new QuestionBankError("Lengkapi minimal satu soal di setiap bank sebelum menerbitkannya.");
    }
    const status = operation === "publish" ? ContentStatus.published : operation === "archive" ? ContentStatus.archived : ContentStatus.draft;
    const revision = bank.revision + 1;
    await tx.questionBank.update({ where: { id }, data: { status, revision, updatedByUserId: actorId } });
    // Bank lifecycle controls source availability. Historical questions that
    // were intentionally removed remain archived; only active rows follow a
    // publish/unpublish transition. Archiving the bank itself does not erase
    // the active-question state needed for a safe restore.
    if (operation !== "archive") {
      await tx.question.updateMany({ where: { questionBankId: id, status: { not: ContentStatus.archived } }, data: { status, updatedByUserId: actorId } });
    }
    return { id, revision, status };
  });
}

async function deleteQuestionBank(id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM question_banks WHERE id = ${id}::uuid FOR UPDATE`;
    const bank = await tx.questionBank.findUnique({ where: { id }, select: { id: true } });
    if (!bank) throw new QuestionBankError("Bank Soal tidak ditemukan.");

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

    await tx.questionOption.deleteMany({ where: { question: { questionBankId: id } } });
    await tx.question.deleteMany({ where: { questionBankId: id } });
    await tx.questionBank.delete({ where: { id } });
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
  updateQuestionBankLifecycle,
};
export type {
  ListQuestionBanksOptions,
  BankQuestionDto,
  QuestionBankDiscovery,
  QuestionBankDto,
  QuestionBankEntry,
  QuestionBankFolderPath,
  QuestionBankListPage,
  QuestionBankOrganization,
  QuestionBankSourceEntry,
  QuestionBankSourcePage,
  QuestionBankSourceQuestionPage,
  SaveBankInput,
};
