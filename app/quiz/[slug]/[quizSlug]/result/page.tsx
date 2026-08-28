import { notFound } from "next/navigation";

import { requireStudentSession } from "@/lib/auth/access";
import { getStandaloneQuizResult } from "@/lib/quiz/repository";
import { getQuizSubjectBySlug } from "@/modules/quiz/data";
import { QuizResultPageModule } from "@/modules/quiz/QuizResultPageModule";

export default async function QuizResultPage({
  params,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ quizSlug: string; slug: string }>;
  searchParams: Promise<{ attemptId?: string }>;
}) {
  const [{ quizSlug, slug }, searchParams, session] = await Promise.all([params, searchParamsPromise, requireStudentSession()]);
  const subject = getQuizSubjectBySlug(slug);
  if (!subject) notFound();
  const attemptId = searchParams.attemptId;
  if (!attemptId) notFound();
  const result = await getStandaloneQuizResult(attemptId, session.user.id, subject.title, quizSlug);
  if (!result) notFound();
  return <QuizResultPageModule quizSlug={quizSlug} result={result} subjectSlug={slug} subjectTitle={subject.title} />;
}
