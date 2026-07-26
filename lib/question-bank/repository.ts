import "server-only";

import { ContentStatus, DifficultyLevel, Prisma } from "@/generated/prisma/client";

import { prisma } from "@/lib/prisma";

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

class QuestionBankError extends Error {}

function toBankDifficulty(value: DifficultyLevel): "easy" | "medium" | "hard" {
  if (value === DifficultyLevel.easy) return "easy";
  if (value === DifficultyLevel.hard) return "hard";
  return "medium";
}

function codeFromTitle(title: string) {
  return `${title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "bank-soal"}-${Date.now()}`.slice(0, 100);
}

function validate(input: SaveBankInput) {
  // A bank's subject tags are a discovery aid, not a separate source of
  // truth. Derive them from its questions so a tutor cannot accidentally
  // create a mismatch between a question's subtest and its Bank Soal tags.
  const tags = [...new Set(input.questions.map((question) => question.subjectCode))];
  if (!input.title.trim()) throw new QuestionBankError("Judul Bank Soal wajib diisi.");
  if (!tags.length || tags.some((tag) => !SUBJECT_CODES.includes(tag as (typeof SUBJECT_CODES)[number]))) throw new QuestionBankError("Tambahkan minimal satu soal dengan subject yang valid.");
  for (const question of input.questions) {
    if (question.choices.length < 2 || question.choices.length > 5) throw new QuestionBankError("Setiap soal harus memiliki 2 sampai 5 opsi.");
    if (new Set(question.choices.map((choice) => choice.id)).size !== question.choices.length || !question.choices.some((choice) => choice.id === question.correctChoiceId)) throw new QuestionBankError("Opsi jawaban soal tidak valid.");
  }
  return tags;
}

const bankInclude = {
  questions: { include: { options: { orderBy: { sortOrder: "asc" as const } }, subtest: true }, orderBy: { createdAt: "asc" as const } },
  tags: { include: { tag: true } },
} satisfies Prisma.QuestionBankInclude;

function toDto(bank: Prisma.QuestionBankGetPayload<{ include: typeof bankInclude }>) {
  const questions = bank.questions.map((question) => ({
    bankId: bank.id,
    choices: question.options.map((option) => ({ id: option.id, mediaAssetId: option.assetId ?? undefined, text: option.content })),
    correctChoiceId: question.options.find((option) => option.isCorrect)?.id ?? question.options[0]?.id ?? "",
    difficulty: toBankDifficulty(question.difficulty),
    explanation: question.explanation ?? "",
    explanationMediaAssetId: question.explanationAssetId ?? undefined,
    id: question.id,
    prompt: question.stem,
    promptMediaAssetId: question.promptAssetId ?? undefined,
    subjectCode: question.subtest?.code ?? "",
    tags: [] as string[],
  }));
  const ready = questions.filter((question) => question.prompt.trim() && question.choices.length >= 2 && question.choices.length <= 5 && question.choices.every((choice) => choice.text.trim()) && question.correctChoiceId).length;
  return {
    bank: {
      description: bank.description ?? "",
      difficultyMix: questions.length ? `${ready}/${questions.length} soal siap` : "Belum ada soal",
      href: `/mentor/quiz/question-bank/${bank.id}`,
      id: bank.id,
      primaryMetric: `${questions.length} soal`,
      progress: questions.length ? Math.round(ready / questions.length * 100) : 0,
      questionCount: questions.length,
      resourceType: "question-bank" as const,
      reusableIn: ["Quiz", "Tryout"],
      status: bank.status,
      tags: bank.tags.map(({ tag }) => tag.code),
      title: bank.name,
      updatedAt: bank.updatedAt.toISOString(),
      revision: bank.revision,
    },
    questions,
  };
}

async function listQuestionBanks() {
  return (await prisma.questionBank.findMany({ include: bankInclude, orderBy: { updatedAt: "desc" } })).map(toDto);
}

async function getQuestionBankForEdit(id: string) {
  const bank = await prisma.questionBank.findUnique({ where: { id }, include: bankInclude });
  return bank ? toDto(bank) : null;
}

async function listQuestionBankSources() {
  const records = await prisma.questionBank.findMany({
    where: { status: ContentStatus.published },
    include: bankInclude,
    orderBy: { updatedAt: "desc" },
  });
  return records.map(toDto).map(({ bank, questions }) => ({ bank, questions: questions.filter((question) => question.prompt.trim() && question.choices.length >= 2 && question.choices.length <= 5 && question.choices.every((choice) => choice.text.trim()) && question.correctChoiceId) })).filter(({ questions }) => questions.length);
}

async function saveQuestionBank(input: SaveBankInput, actorId: string) {
  const tags = validate(input);
  return prisma.$transaction(async (tx) => {
    let bankId = input.id;
    let status: ContentStatus = ContentStatus.draft;
    if (bankId) {
      await tx.$queryRaw`SELECT id FROM question_banks WHERE id = ${bankId}::uuid FOR UPDATE`;
      const current = await tx.questionBank.findUnique({ where: { id: bankId } });
      if (!current) throw new QuestionBankError("Bank Soal tidak ditemukan.");
      if (input.revision && current.revision !== input.revision) throw new QuestionBankError("Bank Soal telah diperbarui. Muat ulang halaman lalu coba lagi.");
      status = current.status;
      await tx.questionBank.update({ where: { id: bankId }, data: { description: input.description.trim() || null, name: input.title.trim(), revision: { increment: 1 }, updatedByUserId: actorId } });
    } else {
      const created = await tx.questionBank.create({ data: { code: codeFromTitle(input.title), description: input.description.trim() || null, name: input.title.trim(), createdByUserId: actorId, updatedByUserId: actorId } });
      bankId = created.id;
    }

    const tagRows = await tx.tag.findMany({ where: { code: { in: tags } } });
    if (tagRows.length !== tags.length) throw new QuestionBankError("Tag subject belum tersedia di database.");
    await tx.questionBankTag.deleteMany({ where: { questionBankId: bankId } });
    await tx.questionBankTag.createMany({ data: tagRows.map((tag) => ({ questionBankId: bankId!, tagId: tag.id })) });

    const subtests = await tx.subtest.findMany({ where: { code: { in: tags } } });
    const subtestByCode = new Map(subtests.map((subtest) => [subtest.code, subtest]));
    const existing = await tx.question.findMany({ where: { questionBankId: bankId }, include: { options: true } });
    const retainedIds = new Set<string>();
    for (let questionIndex = 0; questionIndex < input.questions.length; questionIndex++) {
      const question = input.questions[questionIndex]!;
      const subtest = subtestByCode.get(question.subjectCode);
      if (!subtest) throw new QuestionBankError(`Subtest ${question.subjectCode} tidak ditemukan.`);
      const current = existing.find((item) => item.id === question.id);
      const data = { difficulty: question.difficulty as DifficultyLevel, explanation: question.explanation.trim() || null, explanationAssetId: question.explanationMediaAssetId || null, promptAssetId: question.promptMediaAssetId || null, stem: question.prompt, subtestId: subtest.id, topicId: null, status, updatedByUserId: actorId };
      const saved = current
        ? await tx.question.update({ where: { id: current.id }, data: { ...data, revision: { increment: 1 } } })
        : await tx.question.create({ data: { ...data, code: `${codeFromTitle(input.title)}-q${questionIndex + 1}`, createdByUserId: actorId, questionBankId: bankId } });
      retainedIds.add(saved.id);

      for (let optionIndex = 0; optionIndex < question.choices.length; optionIndex++) {
        const choice = question.choices[optionIndex]!;
        const old = current?.options.find((option) => option.id === choice.id) ?? current?.options.find((option) => option.sortOrder === optionIndex);
        const optionData = { assetId: choice.mediaAssetId || null, content: choice.text, isCorrect: choice.id === question.correctChoiceId || old?.id === question.correctChoiceId, label: String.fromCharCode(65 + optionIndex), sortOrder: optionIndex };
        if (old) await tx.questionOption.update({ where: { id: old.id }, data: optionData });
        else await tx.questionOption.create({ data: { ...optionData, questionId: saved.id } });
      }
      const extras = current?.options.filter((option) => option.sortOrder >= question.choices.length) ?? [];
      if (extras.length) await tx.questionOption.deleteMany({ where: { id: { in: extras.map((option) => option.id) }, standaloneQuizItemOptions: { none: {} }, tryoutItemOptions: { none: {} } } });
    }
    await tx.question.updateMany({ where: { questionBankId: bankId, id: { notIn: [...retainedIds] } }, data: { status: ContentStatus.archived, updatedByUserId: actorId } });
    const saved = await tx.questionBank.findUniqueOrThrow({ where: { id: bankId }, include: bankInclude });
    return toDto(saved);
  });
}

async function updateQuestionBankLifecycle(id: string, operation: "publish" | "unpublish" | "archive" | "restore", actorId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM question_banks WHERE id = ${id}::uuid FOR UPDATE`;
    const bank = await tx.questionBank.findUnique({ where: { id }, include: bankInclude });
    if (!bank) throw new QuestionBankError("Bank Soal tidak ditemukan.");
    if (operation === "publish") {
      if (!bank.questions.length || bank.questions.some((question) => !question.stem.trim() || question.options.length < 2 || question.options.length > 5 || question.options.some((option) => !option.content.trim()) || question.options.filter((option) => option.isCorrect).length !== 1 || !question.subtestId)) throw new QuestionBankError("Lengkapi minimal satu soal di setiap bank sebelum menerbitkannya.");
    }
    const status = operation === "publish" ? ContentStatus.published : operation === "archive" ? ContentStatus.archived : ContentStatus.draft;
    await tx.questionBank.update({ where: { id }, data: { status, revision: { increment: 1 }, updatedByUserId: actorId } });
    await tx.question.updateMany({ where: { questionBankId: id, status: { not: ContentStatus.archived } }, data: { status, updatedByUserId: actorId } });
    return { id, status };
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
    await tx.questionBankTag.deleteMany({ where: { questionBankId: id } });
    await tx.questionBank.delete({ where: { id } });
    return { id };
  });
}

export { deleteQuestionBank, getQuestionBankForEdit, listQuestionBanks, listQuestionBankSources, QuestionBankError, saveQuestionBank, updateQuestionBankLifecycle };
export type { SaveBankInput };
