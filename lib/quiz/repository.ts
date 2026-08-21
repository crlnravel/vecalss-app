import "server-only";

import { ContentStatus, DifficultyLevel, Prisma, QuestionRevisionStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { KaptenQuiz } from "@/modules/mentor/mock-data";
import type {
  QuizCorrectAnswerVisibility,
  QuizFormBehavior,
  QuizQuestionSnapshot,
  QuizReviewTiming,
  QuizScorePolicy,
} from "@/modules/mentor/quiz-builder-types";

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
  attemptsAllowed?: number | null;
  closesAt: string;
  correctAnswerVisibility?: QuizCorrectAnswerVisibility;
  description: string;
  formBehavior?: QuizFormBehavior;
  id?: string;
  opensAt: string;
  questions: QuizQuestionSnapshot[];
  retryDelaySeconds?: number | null;
  reviewTiming?: QuizReviewTiming;
  scorePolicy?: QuizScorePolicy;
  sourceBankId?: string;
  status: "draft" | "published";
  subjectCode: string;
  title: string;
};
class QuizValidationError extends Error {}
const quizInclude = { items: { include: { options: { orderBy: { sortOrder: "asc" as const } } }, orderBy: { sortOrder: "asc" as const } }, sourceBank: true, subtest: true } satisfies Prisma.StandaloneQuizInclude;

const scorePolicies = ["highest", "latest", "first", "average"] as const;
const formBehaviors = ["same", "fresh_randomized"] as const;
const reviewTimings = ["immediate", "after_close", "never"] as const;
const correctAnswerVisibilities = ["show", "hide"] as const;

function isOneOf<T extends string>(value: string, values: readonly T[]): value is T {
  return values.includes(value as T);
}

function normalizeQuizPolicy(input: Pick<SaveStandaloneQuizInput, "attemptsAllowed" | "correctAnswerVisibility" | "formBehavior" | "retryDelaySeconds" | "reviewTiming" | "scorePolicy">) {
  if (input.attemptsAllowed !== undefined && input.attemptsAllowed !== null && (!Number.isInteger(input.attemptsAllowed) || input.attemptsAllowed < 1)) {
    throw new QuizValidationError("Jumlah percobaan harus bilangan bulat positif atau dikosongkan untuk tanpa batas.");
  }
  if (input.retryDelaySeconds !== undefined && input.retryDelaySeconds !== null && (!Number.isInteger(input.retryDelaySeconds) || input.retryDelaySeconds < 0)) {
    throw new QuizValidationError("Jeda percobaan tidak valid.");
  }
  if (input.scorePolicy !== undefined && !isOneOf(input.scorePolicy, scorePolicies)) throw new QuizValidationError("Kebijakan skor tidak valid.");
  if (input.formBehavior !== undefined && !isOneOf(input.formBehavior, formBehaviors)) throw new QuizValidationError("Bentuk soal percobaan tidak valid.");
  if (input.reviewTiming !== undefined && !isOneOf(input.reviewTiming, reviewTimings)) throw new QuizValidationError("Waktu review tidak valid.");
  if (input.correctAnswerVisibility !== undefined && !isOneOf(input.correctAnswerVisibility, correctAnswerVisibilities)) throw new QuizValidationError("Visibilitas jawaban benar tidak valid.");

  return {
    attemptsAllowed: input.attemptsAllowed,
    correctAnswerVisibility: input.correctAnswerVisibility,
    formBehavior: input.formBehavior,
    retryDelaySeconds: input.retryDelaySeconds,
    reviewTiming: input.reviewTiming,
    scorePolicy: input.scorePolicy,
  };
}

function getSubjectMetadata(code: string) { return subjectMetadata.find((subject) => subject.code === code) ?? null; }
function getSubjectMetadataBySlug(slug: string) { return subjectMetadata.find((subject) => subject.slug === slug) ?? null; }
function getStandaloneQuizSubjects() { return subjectMetadata; }
function parseOptionalDate(value: string, name: string) { if (!value) return null; const date = new Date(value); if (Number.isNaN(date.getTime())) throw new QuizValidationError(`${name} tidak valid.`); return date; }
function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "quiz"; }
function isReadyAsset(asset: { state: string } | null) { return !asset || asset.state === "ready"; }

const quizSourceInclude = {
  currentRevision: { include: { explanationAsset: true, options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } }, promptAsset: true } },
  explanationAsset: true,
  options: { include: { asset: true }, orderBy: { sortOrder: "asc" as const } },
  promptAsset: true,
  questionBank: { select: { status: true } },
  subtest: true,
} satisfies Prisma.QuestionInclude;

function assertReadyBankSources(
  sources: Prisma.QuestionGetPayload<{ include: typeof quizSourceInclude }>[],
  subtestCode: string,
  sourceBankId: string,
) {
  if (!sources.length || sources.some((source) => {
    const revision = source.currentRevision;
    const options = revision?.options ?? source.options;
    return source.questionBankId !== sourceBankId
      || source.questionBank?.status === ContentStatus.archived
      || source.status === ContentStatus.archived
      || revision?.status !== QuestionRevisionStatus.ready
      || source.subtest?.code !== subtestCode
      || options.length < 2
      || options.length > 5
      || options.filter((option) => option.isCorrect).length !== 1
      || options.some((option) => !option.content.trim() || !isReadyAsset(option.asset))
      || !revision?.stem.trim()
      || !isReadyAsset(revision?.promptAsset ?? null)
      || !isReadyAsset(revision?.explanationAsset ?? null);
  })) {
    throw new QuizValidationError("Quiz hanya dapat memakai soal siap dari satu Bank yang aktif, dengan media siap dan Subtest yang sama.");
  }
}

function toSnapshot(item: Prisma.StandaloneQuizItemGetPayload<{ include: { options: true } }>): QuizQuestionSnapshot {
  return { choices: item.options.map((option) => ({ id: option.choiceKey, mediaAssetId: option.assetId ?? undefined, text: option.content })), correctChoiceId: item.options.find((option) => option.isCorrect)?.choiceKey ?? "", explanation: item.explanation ?? "", explanationMediaAssetId: item.explanationAssetId ?? undefined, id: item.id, origin: item.sourceQuestionId ? "bank" : "local", prompt: item.prompt, promptMediaAssetId: item.promptAssetId ?? undefined, sourceContentDigest: item.sourceContentDigest ?? undefined, sourceQuestionId: item.sourceQuestionId ?? undefined, sourceQuestionRevisionId: item.sourceQuestionRevisionId ?? undefined, sourceRevisionProvenance: item.sourceRevisionProvenance ?? undefined };
}

function toKaptenQuiz(record: Prisma.StandaloneQuizGetPayload<{ include: typeof quizInclude }>): KaptenQuiz {
  const subject = getSubjectMetadata(record.subtest.code);
  return { attemptsAllowed: record.attemptsAllowed, closesAt: record.closesAt?.toISOString().slice(0, 16), correctAnswerVisibility: record.correctAnswerVisibility, description: record.description ?? "", formBehavior: record.formBehavior, href: `/mentor/quiz/${record.id}`, id: record.id, opensAt: record.opensAt?.toISOString().slice(0, 16), primaryMetric: `${record.items.length} soal`, progress: record.items.length ? 100 : 0, questionCount: record.items.length, resourceType: "quiz", retryDelaySeconds: record.retryDelaySeconds, reviewTiming: record.reviewTiming, scorePolicy: record.scorePolicy, sourceBank: record.sourceBank?.name ?? "Soal lokal", sourceBankId: record.sourceBankId ?? undefined, status: record.status === ContentStatus.published ? "published" : record.status === ContentStatus.archived ? "archived" : "draft", subjectCode: record.subtest.code, subjectName: subject?.name ?? record.subtest.code, title: record.title, updatedAt: record.updatedAt.toISOString() };
}

function validateForPublication(input: SaveStandaloneQuizInput, opensAt: Date | null, closesAt: Date | null) {
  if (!input.title.trim()) throw new QuizValidationError("Isi judul quiz sebelum menerbitkan.");
  if (!input.questions.length) throw new QuizValidationError("Tambahkan minimal satu soal sebelum menerbitkan.");
  if (input.questions.some((question) => !question.prompt.trim() || question.choices.length < 2 || question.choices.length > 5 || question.choices.some((choice) => !choice.text.trim()) || !question.choices.some((choice) => choice.id === question.correctChoiceId))) throw new QuizValidationError("Lengkapi semua soal sebelum menerbitkan.");
  if (opensAt && closesAt && closesAt <= opensAt) throw new QuizValidationError("Waktu tutup harus setelah waktu buka.");
  if (input.reviewTiming === "after_close" && !closesAt) throw new QuizValidationError("Review setelah quiz ditutup memerlukan waktu tutup.");
}

async function saveStandaloneQuiz(input: SaveStandaloneQuizInput, tutorId: string) {
  const opensAt = parseOptionalDate(input.opensAt, "Waktu buka"); const closesAt = parseOptionalDate(input.closesAt, "Waktu tutup");
  const policy = normalizeQuizPolicy(input);
  if (input.status === "published") validateForPublication(input, opensAt, closesAt);
  return prisma.$transaction(async (tx) => {
    const subtest = await tx.subtest.findUnique({ where: { code: input.subjectCode } });
    if (!subtest) throw new QuizValidationError("Subject quiz tidak valid.");
    let id = input.id;
    if (id) {
      await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.standaloneQuiz.findFirst({ where: { id, createdByUserId: tutorId }, include: { participations: { select: { id: true }, take: 1 } } });
      if (!current) throw new QuizValidationError("Quiz tidak ditemukan atau Anda tidak memiliki akses.");
      if (current.participations.length) throw new QuizValidationError("Quiz yang sudah dimulai siswa tidak dapat diubah. Gunakan Duplicate.");
      await tx.standaloneQuizItem.deleteMany({ where: { quizId: id } });
      await tx.standaloneQuiz.update({ where: { id }, data: { ...policy, closesAt, description: input.description.trim() || null, opensAt, sourceBankId: input.sourceBankId || null, status: input.status === "published" ? ContentStatus.published : ContentStatus.draft, subtestId: subtest.id, title: input.title.trim() || "Draft Quiz Baru", revision: { increment: 1 } } });
    } else {
      const created = await tx.standaloneQuiz.create({ data: { ...policy, closesAt, createdByUserId: tutorId, description: input.description.trim() || null, opensAt, slug: `${slugify(input.title)}-${crypto.randomUUID().slice(0, 8)}`, sourceBankId: input.sourceBankId || null, status: input.status === "published" ? ContentStatus.published : ContentStatus.draft, subtestId: subtest.id, title: input.title.trim() || "Draft Quiz Baru" } }); id = created.id;
    }
    const sourceIds = input.questions.flatMap((question) => question.origin === "bank" && question.sourceQuestionId ? [question.sourceQuestionId] : []);
    const uniqueSourceIds = new Set(sourceIds);
    if (uniqueSourceIds.size !== sourceIds.length) throw new QuizValidationError("Soal dari Bank tidak boleh dipilih lebih dari sekali.");
    if (sourceIds.length && !input.sourceBankId) throw new QuizValidationError("Pilih Bank Soal sebelum menyimpan soal sumber.");
    if (input.sourceBankId && !sourceIds.length) {
      await tx.$queryRaw`SELECT id FROM question_banks WHERE id = ${input.sourceBankId}::uuid FOR SHARE`;
      const sourceBank = await tx.questionBank.findUnique({ where: { id: input.sourceBankId }, select: { status: true } });
      if (!sourceBank || sourceBank.status === ContentStatus.archived) throw new QuizValidationError("Bank Soal sumber tidak lagi tersedia.");
    }
    const sources = sourceIds.length
      ? (await (async () => {
        // Lock the source aggregate before rereading lifecycle and media state.
        // Bank publish/archive writes take the same bank row, so a snapshot
        // cannot be built from a state that is concurrently being withdrawn.
        await tx.$queryRaw`SELECT q.id FROM questions q JOIN question_banks b ON b.id = q.question_bank_id WHERE q.id IN (${Prisma.join(sourceIds)}) AND b.id = ${input.sourceBankId}::uuid ORDER BY q.id FOR SHARE OF q, b`;
        const lockedSources = await tx.question.findMany({ where: { id: { in: sourceIds }, questionBankId: input.sourceBankId, subtestId: subtest.id, questionBank: { status: { not: ContentStatus.archived } } }, include: quizSourceInclude });
        if (lockedSources.length !== uniqueSourceIds.size) throw new QuizValidationError("Sebagian soal Bank tidak lagi tersedia atau tidak cocok dengan subject Quiz.");
        assertReadyBankSources(lockedSources, input.subjectCode, input.sourceBankId!);
        for (const submitted of input.questions) {
          if (submitted.origin !== "bank" || !submitted.sourceQuestionId || !submitted.sourceQuestionRevisionId) continue;
          const source = lockedSources.find((candidate) => candidate.id === submitted.sourceQuestionId);
          if (source?.currentRevision?.id !== submitted.sourceQuestionRevisionId) throw new QuizValidationError("Quiz harus memakai QuestionRevision Ready yang dipilih, bukan revisi lama.");
        }
        return lockedSources;
      })())
      : [];
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    await Promise.all(input.questions.map(async (submitted, index) => {
      const source = submitted.sourceQuestionId ? sourceById.get(submitted.sourceQuestionId) : null;
      const revision = source?.currentRevision;
      const sourceOptions = revision?.options ?? source?.options ?? [];
      const choices = source ? sourceOptions.map((option, optionIndex) => ({ id: option.id, mediaAssetId: option.assetId ?? undefined, sourceId: source.options[optionIndex]?.id, sourceRevisionId: revision?.options[optionIndex]?.id, text: option.content, correct: option.isCorrect })) : submitted.choices.map((choice) => ({ ...choice, sourceId: undefined, sourceRevisionId: undefined, correct: choice.id === submitted.correctChoiceId }));
      const item = await tx.standaloneQuizItem.create({ data: { difficulty: revision?.difficulty ?? source?.difficulty ?? DifficultyLevel.medium, explanation: (revision?.explanation ?? source?.explanation ?? submitted.explanation) || null, explanationAssetId: (revision?.explanationAssetId ?? source?.explanationAssetId ?? submitted.explanationMediaAssetId) || null, prompt: revision?.stem ?? source?.stem ?? submitted.prompt, promptAssetId: (revision?.promptAssetId ?? source?.promptAssetId ?? submitted.promptMediaAssetId) || null, quizId: id!, sortOrder: index + 1, sourceContentDigest: revision?.contentDigest ?? null, sourceQuestionId: source?.id ?? null, sourceQuestionRevisionId: revision?.id ?? null, sourceRevisionProvenance: revision?.provenance ?? null, subtestId: subtest.id } });
      await tx.standaloneQuizItemOption.createMany({ data: choices.map((choice, optionIndex) => ({ assetId: choice.mediaAssetId || null, choiceKey: String.fromCharCode(65 + optionIndex), content: choice.text, isCorrect: choice.correct, quizItemId: item.id, sortOrder: optionIndex, sourceQuestionOptionId: null, sourceQuestionRevisionOptionId: choice.sourceRevisionId ?? null })) });
    }));
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
      participations: {
        include: {
          attempts: {
            select: {
              attemptNo: true,
              correctCount: true,
              createdAt: true,
              id: true,
              score: true,
              status: true,
              submittedAt: true,
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
  return {
    attempts: quiz.participations.flatMap((participation) => {
      const visibleAttempts = participation.attempts.filter((attempt) => attempt.status === "in_progress" || isReviewableStandaloneQuizAttemptStatus(attempt.status));
      const participationPolicy = policyFromAttemptSnapshot(participation.policySnapshot, toQuizAttemptPolicy(quiz));
      const finalScore = aggregateStandaloneQuizScore(visibleAttempts, participationPolicy.scorePolicy);
      return visibleAttempts.map((attempt) => ({
        attemptNo: attempt.attemptNo,
        correctCount: attempt.correctCount,
        createdAt: attempt.createdAt.toISOString(),
        aggregateScore: finalScore,
        finalScore,
        id: attempt.id,
        participationId: participation.id,
        score: attempt.score,
        status: attempt.status,
        student: { name: participation.student.fullName?.trim() || "Siswa tanpa nama" },
        submittedAt: attempt.submittedAt?.toISOString() ?? null,
      }));
    }),
    quiz: {
      attemptsAllowed: quiz.attemptsAllowed,
      correctAnswerVisibility: quiz.correctAnswerVisibility,
      formBehavior: quiz.formBehavior,
      id: quiz.id,
      questionCount: quiz.items.length,
      retryDelaySeconds: quiz.retryDelaySeconds,
      reviewTiming: quiz.reviewTiming,
      scorePolicy: quiz.scorePolicy,
      subject: quiz.subtest.code,
      title: quiz.title,
    },
  };
}

async function getMentorStandaloneQuizSubmission(quizId: string, attemptId: string, tutorId: string) {
  if (!isUuid(attemptId)) return null;
  const attempt = await prisma.standaloneQuizAttempt.findFirst({
    where: { id: attemptId, participation: { quizId, quiz: { createdByUserId: tutorId } } },
    include: {
      answers: true,
      participation: {
        select: {
          policySnapshot: true,
          student: { select: { fullName: true } },
          quiz: {
            include: quizInclude,
          },
        },
      },
    },
  });
  if (!attempt) return null;
  if (attempt.status !== "in_progress" && !isReviewableStandaloneQuizAttemptStatus(attempt.status)) return null;
  const quiz = buildAttemptQuiz(attempt.participation.quiz, attempt);
  const policy = policyFromAttemptSnapshot(attempt.participation.policySnapshot, toQuizAttemptPolicy(quiz));
  const selectedOptionByItem = new Map(attempt.answers.map((answer) => [answer.quizItemId, answer.selectedOptionId]));
  return {
    attemptNo: attempt.attemptNo,
    answeredCount: attempt.answers.length,
    correctCount: attempt.correctCount,
    createdAt: attempt.createdAt.toISOString(),
    id: attempt.id,
    questions: quiz.items.map((item) => ({
      explanation: item.explanation,
      options: item.options.map((option) => ({ correct: option.isCorrect, id: option.id, key: option.choiceKey, text: option.content })),
      prompt: item.prompt,
      selectedOptionId: selectedOptionByItem.get(item.id) ?? null,
    })),
    score: attempt.score,
    status: attempt.status,
    student: { name: attempt.participation.student.fullName?.trim() || "Siswa tanpa nama" },
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

const terminalStandaloneQuizAttemptStatuses = ["submitted", "auto_submitted", "expired", "abandoned", "scored"] as const;
const reviewableStandaloneQuizAttemptStatuses = ["submitted", "auto_submitted", "scored"] as const;

function isTerminalStandaloneQuizAttemptStatus(status: string) {
  return terminalStandaloneQuizAttemptStatuses.includes(status as typeof terminalStandaloneQuizAttemptStatuses[number]);
}

function isReviewableStandaloneQuizAttemptStatus(status: string) {
  return reviewableStandaloneQuizAttemptStatuses.includes(status as typeof reviewableStandaloneQuizAttemptStatuses[number]);
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
  sortOrder: number;
};

type AttemptFormSnapshot = {
  items: AttemptFormSnapshotItem[];
  version: 1;
};

type QuizRecord = Prisma.StandaloneQuizGetPayload<{ include: typeof quizInclude }>;
type QuizItemRecord = QuizRecord["items"][number];

function toQuizAttemptPolicy(quiz: { attemptsAllowed: number | null; correctAnswerVisibility: QuizCorrectAnswerVisibility; formBehavior: QuizFormBehavior; retryDelaySeconds: number | null; reviewTiming: QuizReviewTiming; scorePolicy: QuizScorePolicy }): QuizAttemptPolicy {
  return {
    attemptsAllowed: quiz.attemptsAllowed,
    correctAnswerVisibility: quiz.correctAnswerVisibility,
    formBehavior: quiz.formBehavior,
    retryDelaySeconds: quiz.retryDelaySeconds,
    reviewTiming: quiz.reviewTiming,
    scorePolicy: quiz.scorePolicy,
  };
}

function policyFromAttemptSnapshot(snapshot: unknown, fallback: QuizAttemptPolicy): QuizAttemptPolicy {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return fallback;
  const value = snapshot as Record<string, unknown>;
  const attemptsAllowed = value.attemptsAllowed === null
    ? null
    : typeof value.attemptsAllowed === "number" && Number.isInteger(value.attemptsAllowed) && value.attemptsAllowed > 0
      ? value.attemptsAllowed
      : fallback.attemptsAllowed;
  const retryDelaySeconds = value.retryDelaySeconds === null
    ? null
    : typeof value.retryDelaySeconds === "number" && Number.isInteger(value.retryDelaySeconds) && value.retryDelaySeconds >= 0
      ? value.retryDelaySeconds
      : fallback.retryDelaySeconds;
  return {
    attemptsAllowed,
    correctAnswerVisibility: typeof value.correctAnswerVisibility === "string" && isOneOf(value.correctAnswerVisibility, correctAnswerVisibilities) ? value.correctAnswerVisibility : fallback.correctAnswerVisibility,
    formBehavior: typeof value.formBehavior === "string" && isOneOf(value.formBehavior, formBehaviors) ? value.formBehavior : fallback.formBehavior,
    retryDelaySeconds,
    reviewTiming: typeof value.reviewTiming === "string" && isOneOf(value.reviewTiming, reviewTimings) ? value.reviewTiming : fallback.reviewTiming,
    scorePolicy: typeof value.scorePolicy === "string" && isOneOf(value.scorePolicy, scorePolicies) ? value.scorePolicy : fallback.scorePolicy,
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
      sortOrder: item.sortOrder,
    })),
    version: 1,
  };
}

function parseAttemptFormSnapshot(snapshot: unknown): AttemptFormSnapshot | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const value = snapshot as Record<string, unknown>;
  if (value.version !== 1 || !Array.isArray(value.items)) return null;
  const items = value.items.flatMap((rawItem) => {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) return [];
    const item = rawItem as Record<string, unknown>;
    if (
      typeof item.id !== "string"
      || typeof item.prompt !== "string"
      || (item.explanation !== null && typeof item.explanation !== "string")
      || (item.promptAssetId !== null && typeof item.promptAssetId !== "string")
      || (item.explanationAssetId !== null && typeof item.explanationAssetId !== "string")
      || typeof item.sortOrder !== "number"
      || !Array.isArray(item.options)
    ) return [];
    const options = item.options.flatMap((rawOption) => {
      if (!rawOption || typeof rawOption !== "object" || Array.isArray(rawOption)) return [];
      const option = rawOption as Record<string, unknown>;
      if (
        typeof option.id !== "string"
        || typeof option.choiceKey !== "string"
        || typeof option.content !== "string"
        || typeof option.isCorrect !== "boolean"
        || typeof option.sortOrder !== "number"
        || (option.assetId !== null && typeof option.assetId !== "string")
      ) return [];
      return [{
        assetId: option.assetId,
        choiceKey: option.choiceKey,
        content: option.content,
        id: option.id,
        isCorrect: option.isCorrect,
        sortOrder: option.sortOrder,
      } satisfies AttemptFormSnapshotOption];
    });
    if (options.length !== item.options.length) return [];
    return [{
      explanation: item.explanation,
      explanationAssetId: item.explanationAssetId,
      id: item.id,
      options,
      prompt: item.prompt,
      promptAssetId: item.promptAssetId,
      sortOrder: item.sortOrder,
    } satisfies AttemptFormSnapshotItem];
  });
  if (items.length !== value.items.length) return null;
  return { items, version: 1 };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function attemptItemHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function orderStandaloneQuizItems<T extends { id: string }>(items: T[], attemptId: string, formBehavior: QuizFormBehavior) {
  if (formBehavior === "same") return items;
  return [...items].sort((left, right) => {
    const difference = attemptItemHash(`${attemptId}:${left.id}`) - attemptItemHash(`${attemptId}:${right.id}`);
    return difference || left.id.localeCompare(right.id);
  });
}

function orderItemsFromAttemptSnapshot<T extends { id: string }>(items: T[], attemptId: string, formBehavior: QuizFormBehavior, snapshot: unknown) {
  if (Array.isArray(snapshot) && snapshot.every((itemId): itemId is string => typeof itemId === "string")) {
    const positions = new Map(snapshot.map((itemId, index) => [itemId, index]));
    return [...items].sort((left, right) => {
      const leftPosition = positions.get(left.id) ?? items.length;
      const rightPosition = positions.get(right.id) ?? items.length;
      return leftPosition - rightPosition || left.id.localeCompare(right.id);
    });
  }
  return orderStandaloneQuizItems(items, attemptId, formBehavior);
}

function buildAttemptQuiz(quiz: QuizRecord, attempt: { formItemOrder: unknown; formSnapshot?: unknown; id: string; policySnapshot: unknown }) {
  const policy = policyFromAttemptSnapshot(attempt.policySnapshot, toQuizAttemptPolicy(quiz));
  const snapshot = parseAttemptFormSnapshot(attempt.formSnapshot);
  if (!snapshot) {
    return {
      ...quiz,
      ...policy,
      items: orderItemsFromAttemptSnapshot(quiz.items, attempt.id, policy.formBehavior, attempt.formItemOrder),
    };
  }

  const items = snapshot.items.map((snapshotItem) => {
    const liveItem = quiz.items.find((item) => item.id === snapshotItem.id);
    const base = liveItem ?? ({
      difficulty: DifficultyLevel.medium,
      explanation: snapshotItem.explanation,
      explanationAssetId: snapshotItem.explanationAssetId,
      id: snapshotItem.id,
      options: [],
      prompt: snapshotItem.prompt,
      promptAssetId: snapshotItem.promptAssetId,
      quizId: quiz.id,
      sortOrder: snapshotItem.sortOrder,
      sourceQuestionId: null,
      subtestId: quiz.subtestId,
    } as unknown as QuizItemRecord);
    const options = snapshotItem.options.map((snapshotOption) => {
      const liveOption = base.options.find((option) => option.id === snapshotOption.id);
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

function aggregateStandaloneQuizScore(attempts: Array<{ attemptNo: number; score: number | null; status: string }>, scorePolicy: QuizScorePolicy) {
  const scoredAttempts = attempts
    .filter((attempt) => isReviewableStandaloneQuizAttemptStatus(attempt.status) && attempt.score !== null)
    .sort((left, right) => left.attemptNo - right.attemptNo);
  if (!scoredAttempts.length) return null;
  if (scorePolicy === "highest") return Math.max(...scoredAttempts.map((attempt) => attempt.score ?? 0));
  if (scorePolicy === "first") return scoredAttempts[0]?.score ?? null;
  if (scorePolicy === "average") return Math.round(scoredAttempts.reduce((sum, attempt) => sum + (attempt.score ?? 0), 0) / scoredAttempts.length);
  return scoredAttempts.at(-1)?.score ?? null;
}

async function startStandaloneQuiz(subjectCode: string, slug: string, studentId: string, requestedNow?: Date, startRequestId?: string) {
  if (startRequestId !== undefined && !isUuid(startRequestId)) throw new QuizAttemptValidationError("Permintaan mulai quiz tidak valid.");
  const effectiveStartRequestId = startRequestId ?? crypto.randomUUID();
  return prisma.$transaction(async (tx) => {
    const identity = await tx.standaloneQuiz.findFirst({ where: { slug, subtest: { code: subjectCode } }, select: { id: true } });
    if (!identity) return null;

    // The quiz row is the shared content/policy boundary. Lock it before
    // creating the first participation so concurrent Start calls cannot both
    // observe the same next attempt number or stale availability policy.
    await tx.$queryRaw`SELECT id FROM standalone_quizzes WHERE id = ${identity.id}::uuid FOR UPDATE`;
    const quizRecord = await tx.standaloneQuiz.findUnique({ where: { id: identity.id }, include: quizInclude });
    if (!quizRecord) return null;

    // Replay an already accepted command before checking the current open
    // window. The request key identifies the original command, so a retry
    // after the window closes must not allocate a new attempt or lose the
    // original attempt ID.
    const existingParticipation = await tx.standaloneQuizParticipation.findUnique({
      where: { quizId_studentId: { quizId: quizRecord.id, studentId } },
      select: { id: true },
    });
    if (existingParticipation) {
      await tx.$queryRaw`SELECT id FROM standalone_quiz_participations WHERE id = ${existingParticipation.id}::uuid FOR UPDATE`;
      const replayedAttempt = await tx.standaloneQuizAttempt.findUnique({
        where: { participationId_startRequestId: { participationId: existingParticipation.id, startRequestId: effectiveStartRequestId } },
        include: { answers: true },
      });
      if (replayedAttempt) {
        const replayedQuiz = buildAttemptQuiz(quizRecord, replayedAttempt);
        return { attempt: replayedAttempt, policy: toQuizAttemptPolicy(replayedQuiz), quiz: replayedQuiz, state: "replayed" as const };
      }
    }

    const checkNow = requestedNow ?? new Date();
    const quiz = await tx.standaloneQuiz.findFirst({ where: { ...studentAvailabilityWhere(checkNow), id: identity.id }, include: quizInclude });
    if (!quiz) throw new QuizAttemptValidationError("Quiz belum tersedia atau sudah ditutup.");

    const participation = await tx.standaloneQuizParticipation.upsert({
      where: { quizId_studentId: { quizId: quiz.id, studentId } },
      create: { policySnapshot: toQuizAttemptPolicy(quiz) as unknown as Prisma.InputJsonObject, quizId: quiz.id, studentId },
      update: {},
      select: { id: true, policySnapshot: true },
    });
    await tx.$queryRaw`SELECT id FROM standalone_quiz_participations WHERE id = ${participation.id}::uuid FOR UPDATE`;
    const participationPolicy = policyFromAttemptSnapshot(participation.policySnapshot, toQuizAttemptPolicy(quiz));

    const replayedAttempt = await tx.standaloneQuizAttempt.findUnique({
      where: { participationId_startRequestId: { participationId: participation.id, startRequestId: effectiveStartRequestId } },
      include: { answers: true },
    });
    if (replayedAttempt) {
      const replayedQuiz = buildAttemptQuiz(quiz, replayedAttempt);
      return { attempt: replayedAttempt, policy: toQuizAttemptPolicy(replayedQuiz), quiz: replayedQuiz, state: "replayed" as const };
    }

    const attempts = await tx.standaloneQuizAttempt.findMany({
      where: { participationId: participation.id },
      orderBy: { attemptNo: "desc" },
      select: { attemptNo: true, createdAt: true, id: true, startRequestId: true, status: true, submittedAt: true, updatedAt: true },
    });
    const current = attempts.find((attempt) => attempt.status === "in_progress");
    if (current) {
      let attempt = await tx.standaloneQuizAttempt.findUniqueOrThrow({ where: { id: current.id }, include: { answers: true } });
      // Legacy attempts may predate explicit Start keys. Bind the first
      // accepted retry key while the attempt is still active so a client
      // retry remains tied to the same attempt instead of allocating later.
      if (!attempt.startRequestId) {
        attempt = await tx.standaloneQuizAttempt.update({
          where: { id: current.id },
          data: { startRequestId: effectiveStartRequestId },
          include: { answers: true },
        });
      }
      const resumedQuiz = buildAttemptQuiz(quiz, attempt);
      return { attempt, policy: toQuizAttemptPolicy(resumedQuiz), quiz: resumedQuiz, state: "resumed" as const };
    }

    const terminalAttempts = attempts.filter((attempt) => isTerminalStandaloneQuizAttemptStatus(attempt.status));
    if (participationPolicy.attemptsAllowed !== null && terminalAttempts.length >= participationPolicy.attemptsAllowed) {
      throw new QuizAttemptValidationError("Batas percobaan quiz ini sudah tercapai.");
    }
    const previous = terminalAttempts[0];
    if (previous && participationPolicy.retryDelaySeconds !== null) {
      const previousAt = previous.submittedAt ?? previous.updatedAt ?? previous.createdAt;
      const retryAt = previousAt.getTime() + participationPolicy.retryDelaySeconds * 1000;
      if (checkNow.getTime() < retryAt) {
        throw new QuizAttemptValidationError(`Percobaan berikutnya tersedia pada ${new Date(retryAt).toLocaleString("id-ID")}.`);
      }
    }

    const attemptId = crypto.randomUUID();
    const policy = participationPolicy;
    const orderedItems = orderStandaloneQuizItems(quiz.items, attemptId, policy.formBehavior);
    const attempt = await tx.standaloneQuizAttempt.create({
      data: {
        formItemOrder: orderedItems.map((item) => item.id) as Prisma.InputJsonArray,
        formSnapshot: toAttemptFormSnapshot(orderedItems) as unknown as Prisma.InputJsonObject,
        id: attemptId,
        attemptNo: (attempts[0]?.attemptNo ?? 0) + 1,
        participationId: participation.id,
        policySnapshot: policy as unknown as Prisma.InputJsonObject,
        startRequestId: effectiveStartRequestId,
      },
      include: { answers: true },
    });
    const startedQuiz = buildAttemptQuiz(quiz, attempt);
    return { attempt, policy: toQuizAttemptPolicy(startedQuiz), quiz: startedQuiz, state: "started" as const };
  });
}

async function getStandaloneQuizAttempt(subjectCode: string, slug: string, studentId: string, attemptId?: string, now = new Date()) {
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
  if (attempt.status !== "in_progress" && !isReviewableStandaloneQuizAttemptStatus(attempt.status)) return null;
  const quiz = buildAttemptQuiz(attempt.participation.quiz, attempt);
  const policy = policyFromAttemptSnapshot(attempt.participation.policySnapshot, toQuizAttemptPolicy(quiz));
  return { attempt, attemptId: attempt.id, attemptNo: attempt.attemptNo, policy, quiz: { ...quiz, ...policy } };
}

async function saveStandaloneQuizAnswer(attemptId: string, quizItemId: string, selectedOptionId: string, studentId: string) {
  if (!isUuid(attemptId)) throw new QuizAttemptValidationError("Sesi quiz tidak valid.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM standalone_quiz_attempts WHERE id = ${attemptId}::uuid FOR UPDATE`;
    const attempt = await tx.standaloneQuizAttempt.findFirst({
      where: { id: attemptId, participation: { studentId } },
      select: { formSnapshot: true, id: true, participation: { select: { quizId: true } }, status: true },
    });
    if (!attempt) throw new QuizAttemptValidationError("Sesi quiz tidak ditemukan atau sudah ditutup.");
    if (attempt.status !== "in_progress") throw new QuizAttemptValidationError("Quiz ini sudah dikirim dan jawabannya tidak dapat diubah.");
    const snapshot = parseAttemptFormSnapshot(attempt.formSnapshot);
    if (snapshot && !snapshot.items.some((item) => item.id === quizItemId && item.options.some((option) => option.id === selectedOptionId))) {
      throw new QuizAttemptValidationError("Pilihan jawaban tidak valid untuk bentuk soal ini.");
    }
    const option = await tx.standaloneQuizItemOption.findFirst({ where: { id: selectedOptionId, quizItemId, quizItem: { quizId: attempt.participation.quizId } }, select: { id: true } });
    if (!option) throw new QuizAttemptValidationError("Pilihan jawaban tidak valid untuk soal ini.");
    await tx.standaloneQuizAnswer.upsert({ where: { attemptId_quizItemId: { attemptId, quizItemId } }, create: { attemptId, quizItemId, selectedOptionId }, update: { selectedOptionId } });
    return { quizItemId, selectedOptionId };
  });
}

async function submitStandaloneQuiz(attemptId: string, studentId: string) {
  if (!isUuid(attemptId)) throw new QuizAttemptValidationError("Sesi quiz tidak valid.");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM standalone_quiz_attempts WHERE id = ${attemptId}::uuid FOR UPDATE`;
    const attempt = await tx.standaloneQuizAttempt.findFirst({
      where: { id: attemptId, participation: { studentId } },
      include: {
        answers: { include: { selectedOption: { select: { isCorrect: true } } } },
        participation: { include: { quiz: { include: { items: { select: { id: true } } } } } },
      },
    });
    if (!attempt) throw new QuizAttemptValidationError("Sesi quiz tidak ditemukan atau sudah ditutup.");
    if (attempt.status !== "in_progress") return { attemptId: attempt.id, state: "already_submitted" as const };
    const snapshot = parseAttemptFormSnapshot(attempt.formSnapshot);
    const correctByItem = new Map(snapshot?.items.map((item) => [item.id, new Map(item.options.map((option) => [option.id, option.isCorrect]))]) ?? []);
    const totalQuestions = snapshot?.items.length ?? attempt.participation.quiz.items.length;
    const correctCount = attempt.answers.filter((answer) => correctByItem.size
      ? correctByItem.get(answer.quizItemId)?.get(answer.selectedOptionId) === true
      : answer.selectedOption.isCorrect).length;
    const score = totalQuestions ? Math.round((correctCount / totalQuestions) * 100) : 0;
    await tx.standaloneQuizAttempt.update({ where: { id: attempt.id }, data: { correctCount, score, status: "submitted", submittedAt: new Date() } });
    return { attemptId: attempt.id, state: "submitted" as const };
  });
}

async function getStandaloneQuizResult(attemptId: string, studentId: string, subjectCode: string, slug: string, now = new Date()) {
  if (!isUuid(attemptId)) return null;
  const attempt = await prisma.standaloneQuizAttempt.findFirst({
    where: { id: attemptId, participation: { quiz: { slug, subtest: { code: subjectCode } }, studentId } },
    include: {
      answers: true,
      participation: {
        include: {
          attempts: { orderBy: { attemptNo: "asc" }, select: { attemptNo: true, score: true, status: true } },
          quiz: { include: quizInclude },
        },
      },
    },
  });
  if (!attempt) return null;
  const reviewEligible = isReviewableStandaloneQuizAttemptStatus(attempt.status);
  if (!reviewEligible) return null;
  const quiz = buildAttemptQuiz(attempt.participation.quiz, attempt);
  const totalQuestions = quiz.items.length;
  const answersByItem = new Map(attempt.answers.map((answer) => [answer.quizItemId, answer.selectedOptionId]));
  const policy = policyFromAttemptSnapshot(attempt.participation.policySnapshot, toQuizAttemptPolicy(quiz));
  const isSubmitted = true;
  const reviewAvailable = (policy.reviewTiming === "immediate"
    || (policy.reviewTiming === "after_close" && quiz.closesAt !== null && quiz.closesAt <= now));
  const correctnessAvailable = reviewAvailable && policy.correctAnswerVisibility === "show";
  return {
    answeredCount: attempt.answers.length,
    correctCount: attempt.correctCount,
    attemptId: attempt.id,
    attemptNo: attempt.attemptNo,
    attemptScore: attempt.score,
    aggregateScore: aggregateStandaloneQuizScore(attempt.participation.attempts, policy.scorePolicy),
    correctnessAvailable,
    isSubmitted,
    policy,
    questions: quiz.items.map((item) => ({ explanation: reviewAvailable ? item.explanation : null, id: item.id, options: item.options.map((option) => ({ correct: correctnessAvailable && option.isCorrect, id: option.id, key: option.choiceKey, text: option.content })), prompt: item.prompt, selectedOptionId: answersByItem.get(item.id) ?? null })),
    reviewAvailable,
    score: aggregateStandaloneQuizScore(attempt.participation.attempts, policy.scorePolicy),
    title: quiz.title,
    totalQuestions,
  };
}

async function getStandaloneQuizAttemptId(subjectCode: string, slug: string, studentId: string) {
  const attempt = await prisma.standaloneQuizAttempt.findFirst({
    where: { participation: { quiz: { slug, subtest: { code: subjectCode } }, studentId }, status: { in: [...reviewableStandaloneQuizAttemptStatuses] } },
    orderBy: [{ attemptNo: "desc" }, { submittedAt: "desc" }],
    select: { id: true },
  });
  return attempt?.id ?? null;
}

async function getStandaloneQuizAttemptStatuses(studentId: string, quizIds: string[]) {
  if (!quizIds.length) return [];
  return prisma.standaloneQuizParticipation.findMany({
    where: { quizId: { in: quizIds }, studentId },
    select: { attempts: { orderBy: { attemptNo: "desc" }, select: { attemptNo: true, id: true, status: true, submittedAt: true } }, policySnapshot: true, quizId: true },
  });
}
async function getAvailableStandaloneQuizCatalogue(now = new Date()) { return prisma.standaloneQuiz.findMany({ where: studentAvailabilityWhere(now), include: quizInclude, orderBy: { updatedAt: "desc" } }); }

export { bulkPublishStandaloneQuizzes, bulkUnpublishStandaloneQuizzes, getAvailableStandaloneQuiz, getAvailableStandaloneQuizCatalogue, getMentorStandaloneQuiz, getMentorStandaloneQuizResults, getMentorStandaloneQuizSubmission, getMentorStandaloneQuizzes, getStandaloneQuizAttempt, getStandaloneQuizAttemptId, getStandaloneQuizAttemptStatuses, getStandaloneQuizResult, getStandaloneQuizSubjects, getSubjectMetadata, getSubjectMetadataBySlug, isReviewableStandaloneQuizAttemptStatus, isTerminalStandaloneQuizAttemptStatus, saveStandaloneQuiz, saveStandaloneQuizAnswer, startStandaloneQuiz, studentAvailabilityWhere, submitStandaloneQuiz, terminalStandaloneQuizAttemptStatuses, updateStandaloneQuizLifecycle, QuizAttemptValidationError, QuizValidationError };
export type { SaveStandaloneQuizInput };
