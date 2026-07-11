import type { Metadata } from "next";

import { requireTutorSession } from "@/lib/auth/access";
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
  const initialQuiz = getQuizById(quizId);

  if (!initialQuiz) {
    return <PersistedQuizBuilderRoute quizId={quizId} session={session} />;
  }

  return (
    <KaptenQuizBuilderPageModule
      initialQuiz={initialQuiz}
      mode="edit"
      quizId={quizId}
      session={session}
    />
  );
}
