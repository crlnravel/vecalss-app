import "server-only";

import { decodeLegacyAnswerSelection } from "@/lib/question-bank/answer-contract";
import { getAvailableStandaloneQuiz, getAvailableStandaloneQuizCatalogue, getStandaloneQuizAttempt, getStandaloneQuizAttemptStatuses, isReviewableStandaloneQuizAttemptStatus, isTerminalStandaloneQuizAttemptStatus } from "@/lib/quiz/repository";
import { getQuizSubjectByCode, toDatabaseQuizItem, type QuizAttempt, type QuizSubject } from "@/modules/quiz/data";
import { resolveQuizStartAvailability } from "@/modules/quiz/start-availability";

function toQuestionSnapshot(item: { id: string; prompt: string; options: { id: string; choiceKey: string; content: string; isCorrect: boolean }[]; questionType: string; sourceQuestionId: string | null }, selectedOptionIds: readonly string[]) {
  const options = item.options.map((choice) => ({ id: choice.id, key: choice.choiceKey, text: choice.content }));
  if (options.length < 2) return null;
  const multipleAnswer = item.questionType === "multiple_choice";
  return { hint: multipleAnswer ? "Pilih semua jawaban yang benar." : "Pilih jawaban yang paling tepat.", id: item.id, options, passage: [], prompt: item.prompt, questionType: multipleAnswer ? "multiple_choice" as const : "single_choice" as const, selectedOptionKey: selectedOptionIds[0] ?? null, selectedOptionKeys: [...selectedOptionIds] };
}

function answerSelectionIds(answer: { selectedOptionId: string; selectedOptionIds: unknown }) {
  const rawPlural = Array.isArray(answer.selectedOptionIds) && answer.selectedOptionIds.every((value): value is string => typeof value === "string")
    ? answer.selectedOptionIds
    : null;
  const decoded = decodeLegacyAnswerSelection({ selectedOptionId: answer.selectedOptionId, selectedOptionIds: rawPlural });
  return decoded.ok ? decoded.selectedOptionIds : [];
}

function attemptsAllowedFromParticipation(snapshot: unknown, fallback: number | null) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return fallback;
  const value = snapshot as { attemptsAllowed?: unknown };
  return value.attemptsAllowed === null || (typeof value.attemptsAllowed === "number" && Number.isInteger(value.attemptsAllowed) && value.attemptsAllowed > 0)
    ? value.attemptsAllowed as number | null
    : fallback;
}

function retryDelaySecondsFromParticipation(snapshot: unknown, fallback: number | null) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return fallback;
  const value = snapshot as { retryDelaySeconds?: unknown };
  return value.retryDelaySeconds === null || (typeof value.retryDelaySeconds === "number" && Number.isInteger(value.retryDelaySeconds) && value.retryDelaySeconds >= 0)
    ? value.retryDelaySeconds as number | null
    : fallback;
}

async function getAvailableQuizSubjects(studentId: string): Promise<QuizSubject[]> {
  const records = await getAvailableStandaloneQuizCatalogue();
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const attemptStatuses = await getStandaloneQuizAttemptStatuses(studentId, records.map((record) => record.id));
  const completedQuizIds = new Set(
    attemptStatuses.flatMap((participation) => {
        const quiz = recordsById.get(participation.quizId);
        if (!quiz) return [];
        const attemptsAllowed = attemptsAllowedFromParticipation(participation.policySnapshot, quiz.attemptsAllowed);
        if (attemptsAllowed === null) return [];
        const terminalAttempts = participation.attempts.filter((attempt) => isTerminalStandaloneQuizAttemptStatus(attempt.status));
        return terminalAttempts.length >= attemptsAllowed && !participation.attempts.some((attempt) => attempt.status === "in_progress")
          ? [participation.quizId]
          : [];
      }),
  );
  const latestAttemptIds = new Map(
    attemptStatuses.map((participation) => [
      participation.quizId,
      participation.attempts.find((attempt) => isReviewableStandaloneQuizAttemptStatus(attempt.status))?.id,
    ]),
  );
  return ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"].flatMap((code) => {
    const template = getQuizSubjectByCode(code);
    if (!template) return [];
    const quizzes = records.reduce<Array<ReturnType<typeof toDatabaseQuizItem>>>((items, record) => {
      if (record.subtest.code === code) items.push(toDatabaseQuizItem(record, completedQuizIds.has(record.id), latestAttemptIds.get(record.id)));
      return items;
    }, []);
    return [{ ...template, quizzes }];
  });
}

async function getAvailableQuizAttempt(subjectSlug: string, quizSlug: string, studentId: string, attemptId?: string) {
  const subject = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"].map(getQuizSubjectByCode).find((item) => item?.slug === subjectSlug);
  if (!subject) return null;
  const active = await getStandaloneQuizAttempt(subject.title, quizSlug, studentId, attemptId);
  if (!active) return null;
  const selectedOptionIdsByItem = new Map(active.attempt.answers.map((answer) => [answer.quizItemId, answerSelectionIds(answer)]));
  const questions = active.quiz.items.map((item) => toQuestionSnapshot(item, selectedOptionIdsByItem.get(item.id) ?? [])).filter((question): question is NonNullable<typeof question> => question !== null);
  if (!questions.length) return null;
  const quiz = toDatabaseQuizItem(active.quiz);
  const attempt: QuizAttempt = {
    answeredCount: active.attempt.answers.length,
    currentNumber: 1,
    estimatedFinish: "—",
    flaggedCount: 0,
    focusLabel: `Latihan ${subject.title}`,
    isSubmitted: active.attempt.status !== "in_progress",
    markers: questions.map((question, index) => ({ number: index + 1, state: index === 0 ? "active" : (question.selectedOptionKeys?.length ?? (question.selectedOptionKey ? 1 : 0)) > 0 ? "answered" : "empty" })),
    questions,
    remainingTime: "Tanpa batas waktu",
  };
  return { attempt, attemptId: active.attempt.id, attemptNo: active.attempt.attemptNo, policy: active.policy, quiz, subject: { ...subject, quizzes: [quiz] } };
}

async function getAvailableQuizPreview(subjectSlug: string, quizSlug: string, studentId: string) {
  const subject = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"].map(getQuizSubjectByCode).find((item) => item?.slug === subjectSlug);
  if (!subject) return null;
  // Read-only fallback for the browser-local prototype route. This deliberately
  // does not create an admission/attempt when a local published draft wins on hydration.
  const record = await getAvailableStandaloneQuiz(subject.title, quizSlug);
  if (!record) return null;
  const participation = (await getStandaloneQuizAttemptStatuses(studentId, [record.id]))[0];
  const attempts = participation?.attempts ?? [];
  const terminalAttempts = attempts.filter((attempt) => isTerminalStandaloneQuizAttemptStatus(attempt.status));
  const activeAttempt = attempts.find((attempt) => attempt.status === "in_progress");
  const attemptsAllowed = attemptsAllowedFromParticipation(participation?.policySnapshot, record.attemptsAllowed);
  const retryDelaySeconds = retryDelaySecondsFromParticipation(participation?.policySnapshot, record.retryDelaySeconds);
  const previousAttempt = terminalAttempts[0];
  const previousAttemptAt = previousAttempt?.submittedAt ?? previousAttempt?.updatedAt ?? previousAttempt?.createdAt;
  const retryAvailableAt = previousAttemptAt && retryDelaySeconds !== null
    ? new Date(previousAttemptAt.getTime() + retryDelaySeconds * 1000)
    : null;
  const questions = record.items.map((item) => toQuestionSnapshot(item, [])).filter((question): question is NonNullable<typeof question> => question !== null);
  if (!questions.length) return null;
  const quiz = toDatabaseQuizItem(record);
  return { policy: {
    attemptsAllowed,
    correctAnswerVisibility: record.correctAnswerVisibility ?? "show",
    formBehavior: record.formBehavior ?? "same",
    retryDelaySeconds,
    reviewTiming: record.reviewTiming ?? "immediate",
    scorePolicy: record.scorePolicy ?? "latest",
  }, quiz, startAvailability: resolveQuizStartAvailability({
    activeAttemptId: activeAttempt?.id ?? null,
    attemptsAllowed,
    now: new Date(),
    retryAvailableAt,
    terminalAttemptCount: terminalAttempts.length,
  }), subject: { ...subject, quizzes: [quiz] } };
}

export { getAvailableQuizAttempt, getAvailableQuizPreview, getAvailableQuizSubjects };
