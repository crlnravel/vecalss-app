import "server-only";

import { ContentStatus, Prisma } from "@/generated/prisma/client";
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

type SaveStandaloneQuizInput = {
  closesAt: string;
  description: string;
  id?: string;
  opensAt: string;
  questions: QuizQuestionSnapshot[];
  status: "draft" | "published";
  subjectCode: string;
  title: string;
};

class QuizValidationError extends Error {}

function getSubjectMetadata(code: string) {
  return subjectMetadata.find((subject) => subject.code === code) ?? null;
}

function getSubjectMetadataBySlug(slug: string) {
  return subjectMetadata.find((subject) => subject.slug === slug) ?? null;
}

function getStandaloneQuizSubjects() {
  return subjectMetadata;
}

function parseOptionalDate(value: string, fieldName: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new QuizValidationError(`${fieldName} tidak valid.`);
  return date;
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "quiz";
}

function isUuid(value: string | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toKaptenQuiz(record: {
  id: string; title: string; description: string | null; subjectCode: string; status: ContentStatus;
  opensAt: Date | null; closesAt: Date | null; updatedAt: Date; items: { id: string }[];
}): KaptenQuiz {
  const subject = getSubjectMetadata(record.subjectCode);
  return {
    closesAt: record.closesAt?.toISOString().slice(0, 16),
    description: record.description ?? "",
    href: `/mentor/quiz/${record.id}`,
    id: record.id,
    opensAt: record.opensAt?.toISOString().slice(0, 16),
    primaryMetric: `${record.items.length} soal`,
    progress: record.items.length ? 100 : 0,
    questionCount: record.items.length,
    resourceType: "quiz",
    sourceBank: "Quiz mandiri",
    status: record.status === ContentStatus.published ? "published" : "draft",
    subjectCode: record.subjectCode,
    subjectName: subject?.name ?? record.subjectCode,
    title: record.title,
    updatedAt: `Diedit ${new Intl.RelativeTimeFormat("id", { numeric: "auto" }).format(Math.round((record.updatedAt.getTime() - Date.now()) / 86_400_000), "day")}`,
  };
}

function toSnapshot(item: { id: string; prompt: string; choices: Prisma.JsonValue; correctKey: string; explanation: string | null; origin: string; sourceId: string | null }): QuizQuestionSnapshot {
  if (!Array.isArray(item.choices)) throw new QuizValidationError("Format pilihan jawaban quiz tidak valid.");
  const choices = item.choices.filter((choice): choice is { id: string; text: string } =>
    typeof choice === "object" && choice !== null && !Array.isArray(choice)
    && typeof choice.id === "string" && typeof choice.text === "string",
  );
  return { choices, correctChoiceId: item.correctKey, explanation: item.explanation ?? "", id: item.id, origin: item.origin === "local" ? "local" : "bank", prompt: item.prompt, sourceQuestionId: item.sourceId ?? undefined };
}

function validateForPublication(input: SaveStandaloneQuizInput, opensAt: Date | null, closesAt: Date | null) {
  if (!input.title.trim()) throw new QuizValidationError("Isi judul quiz sebelum menerbitkan.");
  if (!input.questions.length) throw new QuizValidationError("Tambahkan minimal satu soal sebelum menerbitkan.");
  if (input.questions.some((question) => !question.prompt.trim() || question.choices.length < 2 || question.choices.some((choice) => !choice.text.trim()) || !question.choices.some((choice) => choice.id === question.correctChoiceId))) {
    throw new QuizValidationError("Lengkapi semua soal sebelum menerbitkan.");
  }
  if (opensAt && closesAt && closesAt <= opensAt) throw new QuizValidationError("Waktu tutup harus setelah waktu buka.");
}

async function saveStandaloneQuiz(input: SaveStandaloneQuizInput, tutorId: string) {
  const subject = getSubjectMetadata(input.subjectCode);
  if (!subject) throw new QuizValidationError("Subject quiz tidak valid.");
  const opensAt = parseOptionalDate(input.opensAt, "Waktu buka");
  const closesAt = parseOptionalDate(input.closesAt, "Waktu tutup");
  if (opensAt && closesAt && closesAt <= opensAt) throw new QuizValidationError("Waktu tutup harus setelah waktu buka.");
  if (input.status === "published") validateForPublication(input, opensAt, closesAt);

  const data = {
    closesAt,
    description: input.description.trim() || null,
    opensAt,
    status: input.status === "published" ? ContentStatus.published : ContentStatus.draft,
    subjectCode: input.subjectCode,
    title: input.title.trim() || "Draft Quiz Baru",
  };
  const itemData = input.questions.map((question, index) => ({
    choices: JSON.parse(JSON.stringify(question.choices)) as Prisma.InputJsonValue,
    correctKey: question.correctChoiceId,
    explanation: question.explanation.trim() || null,
    origin: question.origin,
    prompt: question.prompt.trim(),
    sortOrder: index + 1,
    sourceId: question.sourceQuestionId ?? null,
  }));

  const record = await prisma.$transaction(async (tx) => {
    if (isUuid(input.id)) {
      const owned = await tx.standaloneQuiz.findFirst({ where: { createdByUserId: tutorId, id: input.id }, select: { id: true } });
      if (!owned) throw new QuizValidationError("Quiz tidak ditemukan atau Anda tidak memiliki akses.");
      await tx.standaloneQuizItem.deleteMany({ where: { quizId: input.id } });
      return tx.standaloneQuiz.update({ where: { id: input.id }, data: { ...data, items: { create: itemData } }, include: { items: { select: { id: true } } } });
    }
    return tx.standaloneQuiz.create({ data: { ...data, createdByUserId: tutorId, slug: `${slugify(data.title)}-${crypto.randomUUID().slice(0, 8)}`, items: { create: itemData } }, include: { items: { select: { id: true } } } });
  });
  return toKaptenQuiz(record);
}

async function getMentorStandaloneQuiz(id: string, tutorId: string) {
  // Existing prototype routes use readable IDs such as `quiz-pu-simpulan`.
  // Never send those strings to the UUID column while the old examples remain.
  if (!isUuid(id)) return null;
  const record = await prisma.standaloneQuiz.findFirst({ where: { createdByUserId: tutorId, id }, include: { items: { orderBy: { sortOrder: "asc" }, select: { id: true, prompt: true, choices: true, correctKey: true, explanation: true, origin: true, sourceId: true } } } });
  if (!record) return null;
  return { questions: record.items.map(toSnapshot), quiz: toKaptenQuiz(record) };
}

async function getMentorStandaloneQuizzes(tutorId: string) {
  const records = await prisma.standaloneQuiz.findMany({ where: { createdByUserId: tutorId }, orderBy: { updatedAt: "desc" }, include: { items: { select: { id: true } } } });
  return records.map(toKaptenQuiz);
}

async function bulkUpdateStandaloneQuizLifecycle(
  ids: string[],
  tutorId: string,
  operation: "publish" | "unpublish",
) {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length || uniqueIds.some((id) => !isUuid(id))) {
    throw new QuizValidationError("Pilih minimal satu quiz yang valid.");
  }

  const requiredStatus = operation === "publish" ? ContentStatus.draft : ContentStatus.published;
  const nextStatus = operation === "publish" ? ContentStatus.published : ContentStatus.draft;

  await prisma.$transaction(async (tx) => {
    const records = await tx.standaloneQuiz.findMany({
      where: { createdByUserId: tutorId, id: { in: uniqueIds } },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });
    if (records.length !== uniqueIds.length) {
      throw new QuizValidationError("Sebagian quiz tidak ditemukan atau bukan milik Anda. Muat ulang halaman lalu coba lagi.");
    }
    if (records.some((record) => record.status !== requiredStatus)) {
      throw new QuizValidationError(operation === "publish"
        ? "Pilih hanya quiz draf yang siap diterbitkan."
        : "Pilih hanya quiz yang sudah diterbitkan.");
    }
    if (operation === "publish") {
      for (const record of records) {
        validateForPublication({
          closesAt: record.closesAt?.toISOString() ?? "",
          description: record.description ?? "",
          opensAt: record.opensAt?.toISOString() ?? "",
          questions: record.items.map(toSnapshot),
          status: "published",
          subjectCode: record.subjectCode,
          title: record.title,
        }, record.opensAt, record.closesAt);
      }
    }
    const updated = await tx.standaloneQuiz.updateMany({
      where: { createdByUserId: tutorId, id: { in: uniqueIds }, status: requiredStatus },
      data: { status: nextStatus },
    });
    if (updated.count !== uniqueIds.length) {
      throw new QuizValidationError("Status quiz berubah. Muat ulang halaman lalu coba lagi.");
    }
  });

  return { ids: uniqueIds, status: nextStatus === ContentStatus.published ? "published" as const : "draft" as const };
}

async function bulkPublishStandaloneQuizzes(ids: string[], tutorId: string) {
  return bulkUpdateStandaloneQuizLifecycle(ids, tutorId, "publish");
}

async function bulkUnpublishStandaloneQuizzes(ids: string[], tutorId: string) {
  return bulkUpdateStandaloneQuizLifecycle(ids, tutorId, "unpublish");
}

function studentAvailabilityWhere(now = new Date()) {
  return { status: ContentStatus.published, AND: [{ OR: [{ opensAt: null }, { opensAt: { lte: now } }] }, { OR: [{ closesAt: null }, { closesAt: { gt: now } }] }] } satisfies Prisma.StandaloneQuizWhereInput;
}

async function getAvailableStandaloneQuiz(subjectCode: string, slug: string, now = new Date()) {
  return prisma.standaloneQuiz.findFirst({ where: { ...studentAvailabilityWhere(now), slug, subjectCode }, include: { items: { orderBy: { sortOrder: "asc" } } } });
}

async function admitStudentToStandaloneQuiz(subjectCode: string, slug: string, studentId: string) {
  const quiz = await getAvailableStandaloneQuiz(subjectCode, slug);
  if (!quiz) return null;
  await prisma.standaloneQuizAttempt.upsert({
    where: { quizId_studentId: { quizId: quiz.id, studentId } },
    create: { quizId: quiz.id, studentId },
    update: {},
  });
  return quiz;
}

async function getAvailableStandaloneQuizCatalogue(now = new Date()) {
  return prisma.standaloneQuiz.findMany({ where: studentAvailabilityWhere(now), orderBy: { updatedAt: "desc" }, include: { items: { select: { id: true } } } });
}

export { admitStudentToStandaloneQuiz, bulkPublishStandaloneQuizzes, bulkUnpublishStandaloneQuizzes, getAvailableStandaloneQuiz, getAvailableStandaloneQuizCatalogue, getMentorStandaloneQuiz, getMentorStandaloneQuizzes, getStandaloneQuizSubjects, getSubjectMetadata, getSubjectMetadataBySlug, saveStandaloneQuiz, studentAvailabilityWhere, QuizValidationError };
export type { SaveStandaloneQuizInput };
