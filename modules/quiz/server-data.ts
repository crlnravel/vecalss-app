import "server-only";

import { admitStudentToStandaloneQuiz, getAvailableStandaloneQuiz, getAvailableStandaloneQuizCatalogue } from "@/lib/quiz/repository";
import { getQuizSubjectByCode, toDatabaseQuizItem, type QuizAttempt, type QuizSubject } from "@/modules/quiz/data";

function toQuestionSnapshot(item: { id: string; prompt: string; explanation: string | null; options: { choiceKey: string; content: string; isCorrect: boolean }[]; sourceQuestionId: string | null }) {
  const options = item.options.map((choice) => ({ id: choice.choiceKey, text: choice.content }));
  if (options.length < 2) return null;
  return { choices: options, correctChoiceId: item.options.find((choice) => choice.isCorrect)?.choiceKey ?? "", explanation: item.explanation ?? "", id: item.id, origin: item.sourceQuestionId ? "bank" : "local", prompt: item.prompt, sourceQuestionId: item.sourceQuestionId };
}

async function getAvailableQuizSubjects(): Promise<QuizSubject[]> {
  const records = await getAvailableStandaloneQuizCatalogue();
  return ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"].flatMap((code) => {
    const template = getQuizSubjectByCode(code);
    if (!template) return [];
    return [{ ...template, quizzes: records.filter((record) => record.subtest.code === code).map(toDatabaseQuizItem) }];
  });
}

async function getAvailableQuizAttempt(subjectSlug: string, quizSlug: string, studentId: string) {
  const subject = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"].map(getQuizSubjectByCode).find((item) => item?.slug === subjectSlug);
  if (!subject) return null;
  const record = await admitStudentToStandaloneQuiz(subject.title, quizSlug, studentId);
  if (!record) return null;
  const question = record.items.map(toQuestionSnapshot).find(Boolean);
  if (!question) return null;
  const quiz = toDatabaseQuizItem(record);
  const attempt: QuizAttempt = {
    answeredCount: 0,
    currentNumber: 1,
    estimatedFinish: "—",
    flaggedCount: 0,
    focusLabel: `Latihan ${subject.title}`,
    markers: Array.from({ length: quiz.questionCount }, (_, index) => ({ number: index + 1, state: index === 0 ? "active" : "empty" })),
    question: { hint: question.explanation || "Pilih jawaban yang paling tepat.", options: question.choices.map((choice, index) => ({ key: String.fromCharCode(65 + index), text: choice.text })), passage: [], prompt: question.prompt, selectedOptionKey: null, supportCount: 0 },
    remainingTime: "Tanpa batas waktu",
  };
  return { attempt, quiz, subject: { ...subject, quizzes: [quiz] } };
}

async function getAvailableQuizPreview(subjectSlug: string, quizSlug: string) {
  const subject = ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"].map(getQuizSubjectByCode).find((item) => item?.slug === subjectSlug);
  if (!subject) return null;
  // Read-only fallback for the browser-local prototype route. This deliberately
  // does not create an admission/attempt when a local published draft wins on hydration.
  const record = await getAvailableStandaloneQuiz(subject.title, quizSlug);
  if (!record) return null;
  const question = record.items.map(toQuestionSnapshot).find(Boolean);
  if (!question) return null;
  const quiz = toDatabaseQuizItem(record);
  const attempt: QuizAttempt = {
    answeredCount: 0,
    currentNumber: 1,
    estimatedFinish: "—",
    flaggedCount: 0,
    focusLabel: `Latihan ${subject.title}`,
    markers: Array.from({ length: quiz.questionCount }, (_, index) => ({ number: index + 1, state: index === 0 ? "active" : "empty" })),
    question: { hint: question.explanation || "Pilih jawaban yang paling tepat.", options: question.choices.map((choice, index) => ({ key: String.fromCharCode(65 + index), text: choice.text })), passage: [], prompt: question.prompt, selectedOptionKey: null, supportCount: 0 },
    remainingTime: "Tanpa batas waktu",
  };
  return { attempt, quiz, subject: { ...subject, quizzes: [quiz] } };
}

export { getAvailableQuizAttempt, getAvailableQuizPreview, getAvailableQuizSubjects };
