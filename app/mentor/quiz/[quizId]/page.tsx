import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { listQuestionBankCategories, listQuestionBankSourcePage } from "@/lib/question-bank/repository";
import { getMentorStandaloneQuiz } from "@/lib/quiz/repository";
import { KaptenQuizBuilderPageModule } from "@/modules/mentor/KaptenQuizBuilderPageModule";

type MentorQuizBuilderPageProps = {
  params: Promise<{
    quizId: string;
  }>;
};

export const metadata: Metadata = {
  title: "Edit Quiz Kapten | Vecalss LMS",
};

export default async function MentorQuizBuilderPage({
  params,
}: MentorQuizBuilderPageProps) {
  const [{ quizId }, session] = await Promise.all([params, requireTutorSession()]);
  const initial = await getMentorStandaloneQuiz(quizId, session.user.id);
  if (!initial) notFound();
  const [sourcePage, sourceCategories] = await Promise.all([
    listQuestionBankSourcePage({ page: 1, pageSize: 20, subjectCoverage: [initial.quiz.subjectCode ?? ""] }),
    listQuestionBankCategories(),
  ]);

  return (
    <KaptenQuizBuilderPageModule
      initialQuiz={initial.quiz}
      initialQuestions={initial.questions}
      mode="edit"
      quizId={quizId}
      session={session}
      sourceCatalog={sourcePage.items.map(({ bank }) => ({ bank, questions: [] }))}
      sourceCatalogPage={sourcePage}
      sourceCategories={sourceCategories}
    />
  );
}
