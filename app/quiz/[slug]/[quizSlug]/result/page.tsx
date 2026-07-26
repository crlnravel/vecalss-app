import { notFound } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { getStandaloneQuizAttemptId, getStandaloneQuizResult } from "@/lib/quiz/repository";
import { getQuizSubjectBySlug } from "@/modules/quiz/data";
import { QuizResultPageModule } from "@/modules/quiz/QuizResultPageModule";

export default async function QuizResultPage({
  params,
}: {
  params: Promise<{ quizSlug: string; slug: string }>;
}) {
  const [{ quizSlug, slug }, session] = await Promise.all([params, requireStudentSession()]);
  const subject = getQuizSubjectBySlug(slug);
  if (!subject) notFound();
  const attemptId = await getStandaloneQuizAttemptId(subject.title, quizSlug, session.user.id);
  if (!attemptId) notFound();
  const result = await getStandaloneQuizResult(attemptId, session.user.id);
  if (!result) notFound();
  return <QuizResultPageModule result={result} subjectSlug={slug} subjectTitle={subject.title} />;
}
