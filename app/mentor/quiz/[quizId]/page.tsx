import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { listQuestionBankSources } from "@/lib/question-bank/repository";
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
  const [initial, sourceCatalog] = await Promise.all([getMentorStandaloneQuiz(quizId, session.user.id), listQuestionBankSources()]);
  if (!initial) notFound();

  return (
    <KaptenQuizBuilderPageModule
      initialQuiz={initial.quiz}
      initialQuestions={initial.questions}
      mode="edit"
      quizId={quizId}
      session={session}
      sourceCatalog={sourceCatalog}
    />
  );
}
