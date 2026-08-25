import { notFound } from "next/navigation";

import { requireTutorSession } from "@/lib/auth/access";
import { getMentorStandaloneQuiz } from "@/lib/quiz/repository";
import { KaptenQuizEditorPageModule } from "@/modules/mentor/KaptenQuizEditorPageModule";

export default async function MentorQuizEditorPage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const [{ quizId }, session] = await Promise.all([params, requireTutorSession()]);
  const initial = await getMentorStandaloneQuiz(quizId, session.user.id);
  if (!initial) notFound();

  return <KaptenQuizEditorPageModule initialQuestions={initial.questions} initialQuiz={initial.quiz} mode="edit" quizId={quizId} session={session} />;
}
