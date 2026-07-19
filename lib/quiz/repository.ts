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
async function admitStudentToStandaloneQuiz(subjectCode: string, slug: string, studentId: string) { const quiz = await getAvailableStandaloneQuiz(subjectCode, slug); if (!quiz) return null; await prisma.standaloneQuizAttempt.upsert({ where: { quizId_studentId: { quizId: quiz.id, studentId } }, create: { quizId: quiz.id, studentId }, update: {} }); return quiz; }
async function getAvailableStandaloneQuizCatalogue(now = new Date()) { return prisma.standaloneQuiz.findMany({ where: studentAvailabilityWhere(now), include: quizInclude, orderBy: { updatedAt: "desc" } }); }

export { admitStudentToStandaloneQuiz, bulkPublishStandaloneQuizzes, bulkUnpublishStandaloneQuizzes, getAvailableStandaloneQuiz, getAvailableStandaloneQuizCatalogue, getMentorStandaloneQuiz, getMentorStandaloneQuizzes, getStandaloneQuizSubjects, getSubjectMetadata, getSubjectMetadataBySlug, saveStandaloneQuiz, studentAvailabilityWhere, updateStandaloneQuizLifecycle, QuizValidationError };
export type { SaveStandaloneQuizInput };
