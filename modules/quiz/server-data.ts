import "server-only";

import { admitStudentToStandaloneQuiz, getAvailableStandaloneQuizCatalogue } from "@/lib/quiz/repository";
import { getQuizSubjectByCode, toDatabaseQuizItem, type QuizAttempt, type QuizSubject } from "@/modules/quiz/data";

function toQuestionSnapshot(item: { id: string; prompt: string; choices: unknown; correctKey: string; explanation: string | null; origin: string; sourceId: string | null }) {
  if (!Array.isArray(item.choices)) return null;
  const options = item.choices.filter((choice): choice is { id: string; text: string } =>
    typeof choice === "object" && choice !== null && !Array.isArray(choice)
    && typeof choice.id === "string" && typeof choice.text === "string",
  );
  if (options.length < 2) return null;
  return { choices: options, correctChoiceId: item.correctKey, explanation: item.explanation ?? "", id: item.id, origin: item.origin, prompt: item.prompt, sourceQuestionId: item.sourceId };
}

async function getAvailableQuizSubjects(): Promise<QuizSubject[]> {
  const records = await getAvailableStandaloneQuizCatalogue();
  return ["PU", "PPU", "PBM", "PK", "LBI", "LBE", "PM"].flatMap((code) => {
    const template = getQuizSubjectByCode(code);
    if (!template) return [];
    return [{ ...template, quizzes: records.filter((record) => record.subjectCode === code).map(toDatabaseQuizItem) }];
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

export { getAvailableQuizAttempt, getAvailableQuizSubjects };
