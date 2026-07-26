import "server-only";

import { ContentStatus, DifficultyLevel, Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { KaptenQuiz } from "@/modules/mentor/mock-data";
import type { QuizQuestionSnapshot } from "@/modules/mentor/quiz-builder-types";

const subjectMetadata = [
  { code: "PU", description: "Penalaran umum dan logika argumen.", name: "Penalaran Umum", slug: "penalaran-umum" },
  { code: "PPU", description: "Pengetahuan dan pemahaman umum.", name: "Pengetahuan dan Pemahaman Umum", slug: "pengetahuan-pemahaman-umum" },
  { code: "PBM", description: "Pemahaman bacaan dan menulis.", name: "Pemahaman Bacaan dan Menulis", slug: "pemahaman-bacaan-menulis" },
  { code: "PK", description: "Pengetahuan kuantitatif dan numerasi.", name: "Pengetahuan Kuantitatif", slug: "pengetahuan-kuantitatif" },
  { code: "LBI", description: "Literasi dalam Bahasa Indonesia.", name: "Literasi Bahasa Indonesia", slug: "literasi-bahasa-indonesia" },
  { code: "LBE", description: "Literasi dalam Bahasa Inggris.", name: "Literasi Bahasa Inggris", slug: "literasi-bahasa-inggris" },
  { code: "PM", description: "Penalaran matematika dan pemecahan masalah.", name: "Penalaran Matematika", slug: "penalaran-matematika" },
] as const;

type SaveStandaloneQuizInput = { closesAt: string; description: string; id?: string; opensAt: string; questions: QuizQuestionSnapshot[]; sourceBankId?: string; status: "draft" | "published"; subjectCode: string; title: string };
class QuizValidationError extends Error {}
const quizInclude = { items: { include: { options: { orderBy: { sortOrder: "asc" as const } } }, orderBy: { sortOrder: "asc" as const } }, sourceBank: true, subtest: true } satisfies Prisma.StandaloneQuizInclude;

function getSubjectMetadata(code: string) { return subjectMetadata.find((subject) => subject.code === code) ?? null; }
function getSubjectMetadataBySlug(slug: string) { return subjectMetadata.find((subject) => subject.slug === slug) ?? null; }
function getStandaloneQuizSubjects() { return subjectMetadata; }
function parseOptionalDate(value: string, name: string) { if (!value) return null; const date = new Date(value); if (Number.isNaN(date.getTime())) throw new QuizValidationError(`${name} tidak valid.`); return date; }
function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "quiz"; }

function toSnapshot(item: Prisma.StandaloneQuizItemGetPayload<{ include: { options: true } }>): QuizQuestionSnapshot {
  return { choices: item.options.map((option) => ({ id: option.choiceKey, mediaAssetId: option.assetId ?? undefined, text: option.content })), correctChoiceId: item.options.find((option) => option.isCorrect)?.choiceKey ?? "", explanation: item.explanation ?? "", explanationMediaAssetId: item.explanationAssetId ?? undefined, id: item.id, origin: item.sourceQuestionId ? "bank" : "local", prompt: item.prompt, promptMediaAssetId: item.promptAssetId ?? undefined, sourceQuestionId: item.sourceQuestionId ?? undefined };
}

function toKaptenQuiz(record: Prisma.StandaloneQuizGetPayload<{ include: typeof quizInclude }>): KaptenQuiz {
  const subject = getSubjectMetadata(record.subtest.code);
  return { closesAt: record.closesAt?.toISOString().slice(0, 16), description: record.description ?? "", href: `/mentor/quiz/${record.id}`, id: record.id, opensAt: record.opensAt?.toISOString().slice(0, 16), primaryMetric: `${record.items.length} soal`, progress: record.items.length ? 100 : 0, questionCount: record.items.length, resourceType: "quiz", sourceBank: record.sourceBank?.name ?? "Soal lokal", sourceBankId: record.sourceBankId ?? undefined, status: record.status === ContentStatus.published ? "published" : record.status === ContentStatus.archived ? "archived" : "draft", subjectCode: record.subtest.code, subjectName: subject?.name ?? record.subtest.code, title: record.title, updatedAt: record.updatedAt.toISOString() };
}

function validateForPublication(input: SaveStandaloneQuizInput, opensAt: Date | null, closesAt: Date | null) {
  if (!input.title.trim()) throw new QuizValidationError("Isi judul quiz sebelum menerbitkan.");
  if (!input.questions.length) throw new QuizValidationError("Tambahkan minimal satu soal sebelum menerbitkan.");
  if (input.questions.some((question) => !question.prompt.trim() || question.choices.length < 2 || question.choices.length > 5 || question.choices.some((choice) => !choice.text.trim()) || !question.choices.some((choice) => choice.id === question.correctChoiceId))) throw new QuizValidationError("Lengkapi semua soal sebelum menerbitkan.");
  if (opensAt && closesAt && closesAt <= opensAt) throw new QuizValidationError("Waktu tutup harus setelah waktu buka.");
}

async function saveStandaloneQuiz(input: SaveStandaloneQuizInput, tutorId: string) {
  const opensAt = parseOptionalDate(input.opensAt, "Waktu buka"); const closesAt = parseOptionalDate(input.closesAt, "Waktu tutup");
  if (input.status === "published") validateForPublication(input, opensAt, closesAt);
  return prisma.$transaction(async (tx) => {
    const subtest = await tx.subtest.findUnique({ where: { code: input.subjectCode } });
    if (!subtest) throw new QuizValidationError("Subject quiz tidak valid.");
    let id = input.id;
    if (id) {
      await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.standaloneQuiz.findFirst({ where: { id, createdByUserId: tutorId }, include: { attempts: { select: { id: true }, take: 1 } } });
      if (!current) throw new QuizValidationError("Quiz tidak ditemukan atau Anda tidak memiliki akses.");
      if (current.attempts.length) throw new QuizValidationError("Quiz yang sudah dikerjakan siswa tidak dapat diubah. Gunakan Duplicate.");
      await tx.standaloneQuizItem.deleteMany({ where: { quizId: id } });
      await tx.standaloneQuiz.update({ where: { id }, data: { closesAt, description: input.description.trim() || null, opensAt, sourceBankId: input.sourceBankId || null, status: input.status === "published" ? ContentStatus.published : ContentStatus.draft, subtestId: subtest.id, title: input.title.trim() || "Draft Quiz Baru", revision: { increment: 1 } } });
    } else {
      const created = await tx.standaloneQuiz.create({ data: { closesAt, createdByUserId: tutorId, description: input.description.trim() || null, opensAt, slug: `${slugify(input.title)}-${crypto.randomUUID().slice(0, 8)}`, sourceBankId: input.sourceBankId || null, status: input.status === "published" ? ContentStatus.published : ContentStatus.draft, subtestId: subtest.id, title: input.title.trim() || "Draft Quiz Baru" } }); id = created.id;
    }
    const sourceIds = input.questions.flatMap((question) => question.origin === "bank" && question.sourceQuestionId ? [question.sourceQuestionId] : []);
    const sources = sourceIds.length ? await tx.question.findMany({ where: { id: { in: sourceIds }, questionBankId: input.sourceBankId || undefined, subtestId: subtest.id, questionBank: { status: ContentStatus.published } }, include: { options: { orderBy: { sortOrder: "asc" } } } }) : [];
    if (sources.length !== new Set(sourceIds).size) throw new QuizValidationError("Sebagian soal Bank tidak lagi tersedia atau tidak cocok dengan subject Quiz.");
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    for (let index = 0; index < input.questions.length; index++) {
      const submitted = input.questions[index]!; const source = submitted.sourceQuestionId ? sourceById.get(submitted.sourceQuestionId) : null;
      const choices = source ? source.options.map((option) => ({ id: option.id, mediaAssetId: option.assetId ?? undefined, sourceId: option.id, text: option.content, correct: option.isCorrect })) : submitted.choices.map((choice) => ({ ...choice, sourceId: undefined, correct: choice.id === submitted.correctChoiceId }));
      const item = await tx.standaloneQuizItem.create({ data: { difficulty: source?.difficulty ?? DifficultyLevel.medium, explanation: (source?.explanation ?? submitted.explanation) || null, explanationAssetId: (source?.explanationAssetId ?? submitted.explanationMediaAssetId) || null, prompt: source?.stem ?? submitted.prompt, promptAssetId: (source?.promptAssetId ?? submitted.promptMediaAssetId) || null, quizId: id!, sortOrder: index + 1, sourceQuestionId: source?.id ?? null, subtestId: subtest.id } });
      await tx.standaloneQuizItemOption.createMany({ data: choices.map((choice, optionIndex) => ({ assetId: choice.mediaAssetId || null, choiceKey: String.fromCharCode(65 + optionIndex), content: choice.text, isCorrect: choice.correct, quizItemId: item.id, sortOrder: optionIndex, sourceQuestionOptionId: choice.sourceId ?? null })) });
    }
    const saved = await tx.standaloneQuiz.findUniqueOrThrow({ where: { id }, include: quizInclude });
    return toKaptenQuiz(saved);
  });
}

async function getMentorStandaloneQuiz(id: string, tutorId: string) { const record = await prisma.standaloneQuiz.findFirst({ where: { id, createdByUserId: tutorId }, include: quizInclude }); return record ? { questions: record.items.map(toSnapshot), quiz: toKaptenQuiz(record) } : null; }
async function getMentorStandaloneQuizzes(tutorId: string) { return (await prisma.standaloneQuiz.findMany({ where: { createdByUserId: tutorId }, include: quizInclude, orderBy: { updatedAt: "desc" } })).map(toKaptenQuiz); }
async function getMentorStandaloneQuizResults(quizId: string, tutorId: string) {
  const quiz = await prisma.standaloneQuiz.findFirst({
    where: { id: quizId, createdByUserId: tutorId },
    include: {
      attempts: {
        select: {
          correctCount: true,
          createdAt: true,
          id: true,
          score: true,
          status: true,
          student: { select: { fullName: true } },
          submittedAt: true,
        },
        orderBy: { createdAt: "desc" },
      },
      items: { select: { id: true } },
      subtest: { select: { code: true } },
    },
  });
  if (!quiz) return null;
  return {
    attempts: quiz.attempts.map((attempt) => {
      return {
        correctCount: attempt.correctCount,
        createdAt: attempt.createdAt.toISOString(),
        id: attempt.id,
        score: attempt.score,
        status: attempt.status,
        student: { name: attempt.student.fullName?.trim() || "Siswa tanpa nama" },
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
      };
    }),
    quiz: { id: quiz.id, questionCount: quiz.items.length, subject: quiz.subtest.code, title: quiz.title },
  };
}

async function getMentorStandaloneQuizSubmission(quizId: string, attemptId: string, tutorId: string) {
  const attempt = await prisma.standaloneQuizAttempt.findFirst({
    where: { id: attemptId, quizId, quiz: { createdByUserId: tutorId } },
    include: {
      answers: true,
      quiz: {
        include: {
          items: { include: { options: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } },
          subtest: { select: { code: true } },
        },
      },
      student: { select: { fullName: true } },
    },
  });
  if (!attempt) return null;
  const selectedOptionByItem = new Map(attempt.answers.map((answer) => [answer.quizItemId, answer.selectedOptionId]));
  return {
    answeredCount: attempt.answers.length,
    correctCount: attempt.correctCount,
    createdAt: attempt.createdAt.toISOString(),
    id: attempt.id,
    questions: attempt.quiz.items.map((item) => ({
      explanation: item.explanation,
      options: item.options.map((option) => ({ correct: option.isCorrect, id: option.id, key: option.choiceKey, text: option.content })),
      prompt: item.prompt,
      selectedOptionId: selectedOptionByItem.get(item.id) ?? null,
    })),
    score: attempt.score,
    status: attempt.status,
    student: { name: attempt.student.fullName?.trim() || "Siswa tanpa nama" },
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    quiz: { id: attempt.quiz.id, questionCount: attempt.quiz.items.length, subject: attempt.quiz.subtest.code, title: attempt.quiz.title },
  };
}
async function bulkUpdateStandaloneQuizLifecycle(ids: string[], tutorId: string, operation: "publish" | "unpublish") { const records = await prisma.standaloneQuiz.findMany({ where: { id: { in: ids }, createdByUserId: tutorId }, include: quizInclude }); if (records.length !== new Set(ids).size) throw new QuizValidationError("Sebagian Quiz tidak ditemukan."); if (operation === "publish") records.forEach((record) => validateForPublication({ closesAt: record.closesAt?.toISOString() ?? "", description: record.description ?? "", id: record.id, opensAt: record.opensAt?.toISOString() ?? "", questions: record.items.map(toSnapshot), sourceBankId: record.sourceBankId ?? undefined, status: "published", subjectCode: record.subtest.code, title: record.title }, record.opensAt, record.closesAt)); const status = operation === "publish" ? ContentStatus.published : ContentStatus.draft; await prisma.standaloneQuiz.updateMany({ where: { id: { in: ids }, createdByUserId: tutorId }, data: { status } }); return { ids, status: status === ContentStatus.published ? "published" as const : "draft" as const }; }
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

async function admitStudentToStandaloneQuiz(subjectCode: string, slug: string, studentId: string) {
  const quiz = await getAvailableStandaloneQuiz(subjectCode, slug);
  if (!quiz) return null;
  const attempt = await prisma.standaloneQuizAttempt.upsert({
    where: { quizId_studentId: { quizId: quiz.id, studentId } },
    create: { quizId: quiz.id, studentId },
    update: {},
    include: { answers: true },
  });
  return { attempt, quiz };
}

async function saveStandaloneQuizAnswer(attemptId: string, quizItemId: string, selectedOptionId: string, studentId: string) {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.standaloneQuizAttempt.findFirst({ where: { id: attemptId, studentId }, select: { id: true, quizId: true, status: true } });
    if (!attempt) throw new QuizAttemptValidationError("Sesi quiz tidak ditemukan.");
    if (attempt.status !== "in_progress") throw new QuizAttemptValidationError("Quiz ini sudah dikirim dan jawabannya tidak dapat diubah.");
    const option = await tx.standaloneQuizItemOption.findFirst({ where: { id: selectedOptionId, quizItemId, quizItem: { quizId: attempt.quizId } }, select: { id: true } });
    if (!option) throw new QuizAttemptValidationError("Pilihan jawaban tidak valid untuk soal ini.");
    await tx.standaloneQuizAnswer.upsert({ where: { attemptId_quizItemId: { attemptId, quizItemId } }, create: { attemptId, quizItemId, selectedOptionId }, update: { selectedOptionId } });
    return { quizItemId, selectedOptionId };
  });
}

async function submitStandaloneQuiz(attemptId: string, studentId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM standalone_quiz_attempts WHERE id = ${attemptId}::uuid FOR UPDATE`;
    const attempt = await tx.standaloneQuizAttempt.findFirst({ where: { id: attemptId, studentId }, include: { answers: { include: { selectedOption: { select: { isCorrect: true } } } }, quiz: { include: { items: { select: { id: true } } } } } });
    if (!attempt) throw new QuizAttemptValidationError("Sesi quiz tidak ditemukan.");
    if (attempt.status !== "in_progress") return { attemptId: attempt.id, state: "already_submitted" as const };
    const totalQuestions = attempt.quiz.items.length;
    const correctCount = attempt.answers.filter((answer) => answer.selectedOption.isCorrect).length;
    const score = totalQuestions ? Math.round((correctCount / totalQuestions) * 100) : 0;
    await tx.standaloneQuizAttempt.update({ where: { id: attempt.id }, data: { correctCount, score, status: "submitted", submittedAt: new Date() } });
    return { attemptId: attempt.id, state: "submitted" as const };
  });
}

async function getStandaloneQuizResult(attemptId: string, studentId: string) {
  const attempt = await prisma.standaloneQuizAttempt.findFirst({
    where: { id: attemptId, studentId },
    include: { answers: true, quiz: { include: { items: { include: { options: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } } } } },
  });
  if (!attempt) return null;
  const totalQuestions = attempt.quiz.items.length;
  const answersByItem = new Map(attempt.answers.map((answer) => [answer.quizItemId, answer.selectedOptionId]));
  return {
    answeredCount: attempt.answers.length,
    correctCount: attempt.correctCount,
    isSubmitted: attempt.status !== "in_progress",
    questions: attempt.quiz.items.map((item) => ({ explanation: item.explanation, options: item.options.map((option) => ({ correct: option.isCorrect, id: option.id, key: option.choiceKey, text: option.content })), prompt: item.prompt, selectedOptionId: answersByItem.get(item.id) ?? null })),
    score: attempt.score,
    title: attempt.quiz.title,
    totalQuestions,
  };
}

async function getStandaloneQuizAttemptId(subjectCode: string, slug: string, studentId: string) {
  const attempt = await prisma.standaloneQuizAttempt.findFirst({
    where: { studentId, quiz: { slug, subtest: { code: subjectCode } } },
    select: { id: true },
  });
  return attempt?.id ?? null;
}
async function getStandaloneQuizAttemptStatuses(studentId: string, quizIds: string[]) {
  if (!quizIds.length) return [];
  return prisma.standaloneQuizAttempt.findMany({
    where: { quizId: { in: quizIds }, studentId },
    select: { quizId: true, status: true },
  });
}
async function getAvailableStandaloneQuizCatalogue(now = new Date()) { return prisma.standaloneQuiz.findMany({ where: studentAvailabilityWhere(now), include: quizInclude, orderBy: { updatedAt: "desc" } }); }

export { admitStudentToStandaloneQuiz, bulkPublishStandaloneQuizzes, bulkUnpublishStandaloneQuizzes, getAvailableStandaloneQuiz, getAvailableStandaloneQuizCatalogue, getMentorStandaloneQuiz, getMentorStandaloneQuizResults, getMentorStandaloneQuizSubmission, getMentorStandaloneQuizzes, getStandaloneQuizAttemptId, getStandaloneQuizAttemptStatuses, getStandaloneQuizResult, getStandaloneQuizSubjects, getSubjectMetadata, getSubjectMetadataBySlug, saveStandaloneQuiz, saveStandaloneQuizAnswer, studentAvailabilityWhere, submitStandaloneQuiz, updateStandaloneQuizLifecycle, QuizAttemptValidationError, QuizValidationError };
export type { SaveStandaloneQuizInput };
