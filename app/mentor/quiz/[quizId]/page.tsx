import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
import { getMentorStandaloneQuiz } from "@/lib/quiz/repository";
import { KaptenQuizBuilderPageModule } from "@/modules/mentor/KaptenQuizBuilderPageModule";
import { PersistedQuizBuilderRoute } from "@/modules/mentor/PersistedQuizBuilderRoute";
import { getQuizById } from "@/modules/mentor/mock-data";

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
  const persistedQuiz = await getMentorStandaloneQuiz(quizId, session.user.id);
  const initialQuiz = persistedQuiz?.quiz ?? getQuizById(quizId);

  if (!initialQuiz) {
    return <PersistedQuizBuilderRoute quizId={quizId} session={session} />;
  }

  return (
    <KaptenQuizBuilderPageModule
      initialQuiz={initialQuiz}
      initialQuestions={persistedQuiz?.questions}
      mode="edit"
      quizId={quizId}
      session={session}
    />
  );
}
