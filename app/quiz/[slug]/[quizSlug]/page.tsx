import { requireStudentSession } from "@/lib/auth/access";
import { notFound } from "next/navigation";
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
  const result = await getAvailableQuizAttempt(slug, quizSlug, session.user.id);
  if (!result) notFound();
  return <QuizOngoingPageModule attempt={result.attempt} quiz={result.quiz} subjectSlug={slug} subjectTitle={result.subject.title} />;
}
