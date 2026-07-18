import { notFound } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { QuizOngoingPageModule } from "@/modules/quiz/QuizOngoingPageModule";
import { getAvailableQuizAttempt } from "@/modules/quiz/server-data";

export default async function QuizOngoingPage({
  params,
}: {
  params: Promise<{ quizSlug: string; slug: string }>;
}) {
  const [{ quizSlug, slug }, session] = await Promise.all([
    params,
    requireStudentSession(),
  ]);

  const quizContext = await getAvailableQuizAttempt(slug, quizSlug, session.user.id);

  if (!quizContext) {
    notFound();
  }

  return (
    <QuizOngoingPageModule
      attempt={quizContext.attempt}
      quiz={quizContext.quiz}
      subjectSlug={quizContext.subject.slug}
      subjectTitle={quizContext.subject.title}
    />
  );
}
