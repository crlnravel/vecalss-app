import "server-only";

import { admitStudentToStandaloneQuiz, getAvailableStandaloneQuiz, getAvailableStandaloneQuizCatalogue, getStandaloneQuizAttemptStatuses } from "@/lib/quiz/repository";
import { getQuizSubjectByCode, toDatabaseQuizItem, type QuizAttempt, type QuizSubject } from "@/modules/quiz/data";

function toQuestionSnapshot(item: { id: string; prompt: string; explanation: string | null; options: { id: string; choiceKey: string; content: string; isCorrect: boolean }[]; sourceQuestionId: string | null }, selectedOptionId: string | null) {
  const options = item.options.map((choice) => ({ id: choice.id, key: choice.choiceKey, text: choice.content }));
  if (options.length < 2) return null;
  return { hint: item.explanation || "Pilih jawaban yang paling tepat.", id: item.id, options, passage: [], prompt: item.prompt, selectedOptionKey: selectedOptionId };
}

async function getAvailableQuizSubjects(studentId: string): Promise<QuizSubject[]> {
  const records = await getAvailableStandaloneQuizCatalogue();
  const submittedQuizIds = new Set(
    (await getStandaloneQuizAttemptStatuses(studentId, records.map((record) => record.id))).reduce<string[]>((quizIds, attempt) => {
      if (attempt.status === "submitted") quizIds.push(attempt.quizId);
      return quizIds;
    }, []),
  );
  return ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"].flatMap((code) => {
    const template = getQuizSubjectByCode(code);
    if (!template) return [];
    const quizzes = records.reduce<Array<ReturnType<typeof toDatabaseQuizItem>>>((items, record) => {
      if (record.subtest.code === code) items.push(toDatabaseQuizItem(record, submittedQuizIds.has(record.id)));
      return items;
    }, []);
    return [{ ...template, quizzes }];
  });
}

async function getAvailableQuizAttempt(subjectSlug: string, quizSlug: string, studentId: string) {
  const subject = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"].map(getQuizSubjectByCode).find((item) => item?.slug === subjectSlug);
  if (!subject) return null;
  const admission = await admitStudentToStandaloneQuiz(subject.title, quizSlug, studentId);
  if (!admission) return null;
  const selectedOptionByItem = new Map(admission.attempt.answers.map((answer) => [answer.quizItemId, answer.selectedOptionId]));
  const questions = admission.quiz.items.map((item) => toQuestionSnapshot(item, selectedOptionByItem.get(item.id) ?? null)).filter((question): question is NonNullable<typeof question> => question !== null);
  if (!questions.length) return null;
  const quiz = toDatabaseQuizItem(admission.quiz);
  const attempt: QuizAttempt = {
    answeredCount: admission.attempt.answers.length,
    currentNumber: 1,
    estimatedFinish: "—",
    flaggedCount: 0,
    focusLabel: `Latihan ${subject.title}`,
    isSubmitted: admission.attempt.status !== "in_progress",
    markers: questions.map((question, index) => ({ number: index + 1, state: index === 0 ? "active" : question.selectedOptionKey ? "answered" : "empty" })),
    questions,
    remainingTime: "Tanpa batas waktu",
  };
  return { attempt, attemptId: admission.attempt.id, quiz, subject: { ...subject, quizzes: [quiz] } };
}

async function getAvailableQuizPreview(subjectSlug: string, quizSlug: string) {
  const subject = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"].map(getQuizSubjectByCode).find((item) => item?.slug === subjectSlug);
  if (!subject) return null;
  // Read-only fallback for the browser-local prototype route. This deliberately
  // does not create an admission/attempt when a local published draft wins on hydration.
  const record = await getAvailableStandaloneQuiz(subject.title, quizSlug);
  if (!record) return null;
  const questions = record.items.map((item) => toQuestionSnapshot(item, null)).filter((question): question is NonNullable<typeof question> => question !== null);
  if (!questions.length) return null;
  const quiz = toDatabaseQuizItem(record);
  const attempt: QuizAttempt = {
    answeredCount: 0,
    currentNumber: 1,
    estimatedFinish: "—",
    flaggedCount: 0,
    focusLabel: `Latihan ${subject.title}`,
    isSubmitted: false,
    markers: questions.map((_, index) => ({ number: index + 1, state: index === 0 ? "active" : "empty" })),
    questions,
    remainingTime: "Tanpa batas waktu",
  };
  return { attempt, quiz, subject: { ...subject, quizzes: [quiz] } };
}

export { getAvailableQuizAttempt, getAvailableQuizPreview, getAvailableQuizSubjects };
